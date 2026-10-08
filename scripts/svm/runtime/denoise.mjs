import { restoreExcluded } from './anomalies.mjs';
import { fmtNits, fmtSvm } from './grid.mjs';
export const DENOISE_KINDS = [
    'blackLevel',
    'duplicateColumn',
    'duplicateRow',
    'readingNotUpdated',
    'levelShifted',
    'svmSpike',
    'lumNotUpdated',
    'lumOffPattern'
];
export const DENOISE_ACTIONS = [
    'interpolated',
    'noData',
    'lumEstimated'
];
const DARK_MAX_GRAY = 2;
const DIM_LEVEL_MAX = 100;
const MIN_DIM_COLS = 3;
const MIN_DARK = 6;
const DARK_TRIM = 0.1;
const BLACK_K = 3;
const FIT_SCALES = 10;
const CHECK_SCALES = 20;
const LUM_TOL = Math.log(1.2);
const LUM_HARD = Math.log(1.35);
const COPY_TOL = 0.025;
const COPY_LOCAL_TOL = Math.log(1.15);
const FROZEN_SVM_TOL = Math.log(1.01);
const FROZEN_LUM_TOL = Math.log(1.15);
const FROZEN_TREND = Math.log(1.1);
const SPIKE_RATIO = Math.log(3);
const SPIKE_ABS = 1.0;
const SPIKE_EXTREME = Math.log(10);
const LEVEL_MATCH_TOL = 0.005;
const SOURCE_SCALES = 3;
export const MAX_GAP = 2;
const median = (v)=>{
    const s = [
        ...v
    ].sort((a, b)=>a - b);
    const n = s.length;
    return n % 2 ? s[n - 1 >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const cellOf = (m, r, c)=>{
    const p = m.grid[r]?.[c];
    return p && Number.isFinite(p.nits) && Number.isFinite(p.svm) ? p : null;
};
const levelX = (nits)=>Math.log10(Math.max(0, nits) + 1);
function readingStep(m) {
    const vals = new Set();
    for (const row of m.grid)for (const p of row)if (p && Number.isFinite(p.nits) && Math.abs(p.nits) < 1) vals.add(Math.round(p.nits * 1e6) / 1e6);
    const s = [
        ...vals
    ].sort((a, b)=>a - b);
    let step = Infinity;
    for(let i = 1; i < s.length; i++)step = Math.min(step, s[i] - s[i - 1]);
    return Number.isFinite(step) ? step : 0;
}
export function blackLevel(m) {
    const step = readingStep(m);
    const cols = m.headerNits.map((n, c)=>({
            n,
            c
        })).filter(({ n })=>Number.isFinite(n) && n > 0);
    let dim = cols.filter(({ n })=>n <= DIM_LEVEL_MAX);
    if (dim.length < MIN_DIM_COLS) dim = [
        ...cols
    ].sort((a, b)=>a.n - b.n).slice(0, MIN_DIM_COLS);
    const dark = [];
    m.rows.forEach((g, r)=>{
        if (!(g <= DARK_MAX_GRAY)) return;
        for (const { c } of dim){
            const p = cellOf(m, r, c);
            if (p) dark.push(p.nits);
        }
    });
    if (dark.length < MIN_DARK) return {
        count: dark.length,
        median: null,
        spread: null,
        ceiling: 0,
        step
    };
    const md = median(dark);
    const byDist = [
        ...dark
    ].sort((a, b)=>Math.abs(a - md) - Math.abs(b - md));
    const keep = byDist.slice(0, byDist.length - Math.floor(byDist.length * DARK_TRIM));
    const spread = Math.sqrt(keep.reduce((a, v)=>a + (v - md) ** 2, 0) / keep.length);
    return {
        count: dark.length,
        median: md,
        spread,
        ceiling: Math.max(0, md + BLACK_K * spread),
        step
    };
}
export function medianPolishFit(table, iterations = 10) {
    const res = table.map((row)=>[
            ...row
        ]);
    const R = res.length;
    const C = R ? res[0].length : 0;
    const row = new Array(R).fill(null);
    const col = new Array(C).fill(null);
    let overall = 0;
    for(let r = 0; r < R; r++)if (res[r].some((x)=>x !== null)) row[r] = 0;
    for(let c = 0; c < C; c++)if (res.some((x)=>x[c] !== null)) col[c] = 0;
    const centre = (eff)=>{
        const v = eff.filter((x)=>x !== null);
        if (!v.length) return;
        const md = median(v);
        for(let i = 0; i < eff.length; i++)if (eff[i] !== null) eff[i] -= md;
        overall += md;
    };
    for(let it = 0; it < iterations; it++){
        for(let r = 0; r < R; r++){
            const v = res[r].filter((x)=>x !== null);
            if (!v.length) continue;
            const md = median(v);
            for(let c = 0; c < C; c++)if (res[r][c] !== null) res[r][c] -= md;
            row[r] += md;
        }
        centre(col);
        for(let c = 0; c < C; c++){
            const v = [];
            for(let r = 0; r < R; r++)if (res[r][c] !== null) v.push(res[r][c]);
            if (!v.length) continue;
            const md = median(v);
            for(let r = 0; r < R; r++)if (res[r][c] !== null) res[r][c] -= md;
            col[c] += md;
        }
        centre(row);
    }
    return {
        overall,
        row,
        col
    };
}
const fitted = (f, r, c)=>f.row[r] === null || f.col[c] === null ? null : f.overall + f.row[r] + f.col[c];
const analysisCache = new WeakMap();
export function analyseMatrix(m) {
    const hit = analysisCache.get(m);
    if (hit) return hit;
    const a = analyse(m);
    analysisCache.set(m, a);
    return a;
}
function orders(m) {
    const R = m.rows.length;
    const C = m.cols.length;
    const rowOrd = [
        ...Array(R).keys()
    ].sort((a, b)=>m.rows[a] - m.rows[b]);
    const colOrd = [
        ...Array(C).keys()
    ].sort((a, b)=>m.cols[a] - m.cols[b] || m.headerNits[a] - m.headerNits[b]);
    const rpos = new Array(R);
    const cpos = new Array(C);
    rowOrd.forEach((r, i)=>rpos[r] = i);
    colOrd.forEach((c, i)=>cpos[c] = i);
    return {
        R,
        C,
        rowOrd,
        colOrd,
        rpos,
        cpos
    };
}
const samePoint = (a, b)=>!!a && !!b && a.nits === b.nits && a.svm === b.svm;
function analyse(m) {
    const { R, C, rowOrd, colOrd, rpos, cpos } = orders(m);
    const bl = blackLevel(m);
    const flags = Array.from({
        length: R
    }, ()=>new Array(C).fill(null));
    const setSvm = (r, c, f)=>{
        if (!cellOf(m, r, c) || flags[r][c]?.svm) return;
        flags[r][c] = {
            ...flags[r][c] ?? {},
            svm: f
        };
    };
    for(let i = 0; i + 1 < C; i++){
        const a = colOrd[i];
        const b = colOrd[i + 1];
        let both = 0;
        let same = true;
        for(let r = 0; r < R && same; r++){
            const p = cellOf(m, r, a);
            const q = cellOf(m, r, b);
            if (!p || !q) continue;
            both++;
            same = samePoint(p, q);
        }
        if (both >= 3 && same) for(let r = 0; r < R; r++)setSvm(r, a, {
            kind: 'duplicateColumn',
            twin: [
                r,
                b
            ]
        });
    }
    for(let i = 0; i + 1 < R; i++){
        const a = rowOrd[i];
        const b = rowOrd[i + 1];
        let both = 0;
        let same = true;
        for(let c = 0; c < C && same; c++){
            const p = cellOf(m, a, c);
            const q = cellOf(m, b, c);
            if (!p || !q) continue;
            both++;
            same = samePoint(p, q);
        }
        if (both >= 3 && same) for(let c = 0; c < C; c++)setSvm(a, c, {
            kind: 'duplicateRow',
            twin: [
                b,
                c
            ]
        });
    }
    for(let r = 0; r < R; r++)for(let c = 0; c < C; c++){
        const p = cellOf(m, r, c);
        if (p && p.nits <= bl.ceiling) setSvm(r, c, {
            kind: 'blackLevel'
        });
    }
    const scale = Math.max(bl.step, bl.spread ?? 0);
    const fitMin = bl.ceiling + FIT_SCALES * scale;
    const chkMin = bl.ceiling + CHECK_SCALES * scale;
    const lumOk = (r, c)=>{
        const p = cellOf(m, r, c);
        const f = flags[r]?.[c];
        return !!p && p.nits > 0 && !f?.lum && f?.svm?.kind !== 'blackLevel' && f?.svm?.kind !== 'duplicateColumn' && f?.svm?.kind !== 'duplicateRow';
    };
    let fit = {
        overall: 0,
        row: new Array(R).fill(null),
        col: new Array(C).fill(null)
    };
    const shifted = new Map();
    for(let pass = 0; pass < 6; pass++){
        fit = medianPolishFit(Array.from({
            length: R
        }, (_, r)=>Array.from({
                length: C
            }, (_, c)=>{
                const p = cellOf(m, r, c);
                return p && lumOk(r, c) && p.nits > fitMin ? Math.log(p.nits) : null;
            })));
        const found = [];
        for(let r = 0; r < R; r++)for(let c = 0; c < C; c++){
            const p = cellOf(m, r, c);
            if (!p || !lumOk(r, c) || p.nits <= chkMin) continue;
            const f = fitted(fit, r, c);
            if (f === null) continue;
            const e = Math.log(p.nits) - f;
            const dev = Math.abs(e);
            if (dev <= LUM_TOL) continue;
            const local = columnLum(m, r, c, rowOrd, rpos, lumOk);
            const localDev = local === null ? null : Math.abs(Math.log(p.nits / local));
            const twin = copiedFrom(m, r, c, rowOrd, colOrd, rpos, cpos);
            let kind = null;
            if (twin && (localDev === null || localDev > COPY_LOCAL_TOL)) kind = 'lumNotUpdated';
            else if (dev > LUM_HARD && (localDev !== null && localDev > LUM_HARD || columnOrderBroken(m, r, c, rowOrd, rpos, lumOk, bl.step))) kind = 'lumOffPattern';
            if (kind) found.push([
                r,
                c,
                {
                    kind,
                    expected: Math.exp(f),
                    deviation: Math.exp(e) - 1,
                    ...kind === 'lumNotUpdated' && twin ? {
                        twin
                    } : {}
                }
            ]);
        }
        for(let c = 0; c < C; c++){
            const e = rowOrd.map((r)=>{
                const p = cellOf(m, r, c);
                const k = flags[r][c]?.svm?.kind;
                if (!p || !(p.nits > chkMin) || k === 'blackLevel' || k === 'duplicateColumn' || k === 'duplicateRow') return null;
                const f = fitted(fit, r, c);
                return f === null ? null : Math.log(p.nits) - f;
            });
            const off = (i)=>e[i] !== null && Math.abs(e[i]) > LUM_HARD;
            for(let i = 0; i < R;){
                if (!off(i)) {
                    i++;
                    continue;
                }
                const s = Math.sign(e[i]);
                let j = i;
                let lo = e[i];
                let hi = e[i];
                while(j + 1 < R && off(j + 1) && Math.sign(e[j + 1]) === s && Math.max(hi, e[j + 1]) - Math.min(lo, e[j + 1]) <= LUM_TOL){
                    j++;
                    lo = Math.min(lo, e[j]);
                    hi = Math.max(hi, e[j]);
                }
                const edge = s < 0 ? i : j;
                const nb = s < 0 ? i - 1 : j + 1;
                const re = rowOrd[edge];
                const rn = rowOrd[nb];
                const broken = rn !== undefined && e[nb] !== null && Math.abs(e[nb]) <= LUM_TOL && lumOk(rn, c) && (s < 0 ? cellOf(m, re, c).nits < cellOf(m, rn, c).nits - bl.step : cellOf(m, re, c).nits > cellOf(m, rn, c).nits + bl.step);
                if (j > i && broken) for(let k = i; k <= j; k++){
                    const r = rowOrd[k];
                    shifted.set(r * C + c, j - i + 1);
                    if (!flags[r][c]?.lum && !found.some(([fr, fc])=>fr === r && fc === c)) {
                        const f = fitted(fit, r, c);
                        found.push([
                            r,
                            c,
                            {
                                kind: 'lumOffPattern',
                                expected: Math.exp(f),
                                deviation: Math.exp(e[k]) - 1
                            }
                        ]);
                    }
                }
                i = j + 1;
            }
        }
        for (const [r, c, lum] of found)flags[r][c] = {
            ...flags[r][c] ?? {},
            lum
        };
        if (!found.length) break;
    }
    for (const [rc, run] of shifted)setSvm(Math.floor(rc / C), rc % C, {
        kind: 'levelShifted',
        run
    });
    const clean = (r, c)=>{
        const p = cellOf(m, r, c);
        return !!p && p.svm > 0 && !flags[r][c]?.svm && !flags[r][c]?.lum;
    };
    const frozen = [];
    const frozenNeighbours = (r, c)=>[
            [
                rowOrd[rpos[r] + 1],
                c
            ],
            [
                rowOrd[rpos[r] - 1],
                c
            ],
            [
                r,
                colOrd[cpos[c] + 1]
            ],
            [
                r,
                colOrd[cpos[c] - 1]
            ]
        ].filter((x)=>x[0] !== undefined && x[1] !== undefined).map(([rr, cc])=>[
                rr,
                cc,
                [
                    r,
                    c
                ]
            ]);
    for(let r = 0; r < R; r++)for(let c = 0; c < C; c++){
        const f = flags[r][c];
        const p = cellOf(m, r, c);
        if (!p || !f?.lum || f.svm || !(p.svm > 0)) continue;
        const twin = repeatedFrom(m, r, c, rowOrd, colOrd, rpos, cpos);
        if (!twin) continue;
        let lo = rpos[r] - 1;
        while(lo >= 0 && !clean(rowOrd[lo], c))lo--;
        let hi = rpos[r] + 1;
        while(hi < R && !clean(rowOrd[hi], c))hi++;
        if (lo < 0 || hi >= R) continue;
        const r0 = rowOrd[lo];
        const r1 = rowOrd[hi];
        const t = (m.rows[r] - m.rows[r0]) / (m.rows[r1] - m.rows[r0]);
        const s0 = Math.log(cellOf(m, r0, c).svm);
        const s1 = Math.log(cellOf(m, r1, c).svm);
        if (Math.abs(Math.log(p.svm) - (s0 + (s1 - s0) * t)) > FROZEN_TREND) frozen.push([
            r,
            c,
            twin
        ]);
    }
    for (const [r, c, twin] of frozen)setSvm(r, c, {
        kind: 'readingNotUpdated',
        twin
    });
    for(let queue = frozen.flatMap(([r, c])=>frozenNeighbours(r, c)); queue.length;){
        const next = [];
        for (const [r, c, twin] of queue){
            const f = flags[r][c];
            if (!f?.lum || f.svm) continue;
            if (!repeatedFrom(m, r, c, rowOrd, colOrd, rpos, cpos, twin)) continue;
            setSvm(r, c, {
                kind: 'readingNotUpdated',
                twin
            });
            next.push(...frozenNeighbours(r, c));
        }
        queue = next;
    }
    const svmUsable = (r, c)=>{
        const p = cellOf(m, r, c);
        return !!p && p.svm > 0 && !flags[r][c]?.svm;
    };
    const spikes = [];
    for(let r = 0; r < R; r++)for(let c = 0; c < C; c++){
        if (!svmUsable(r, c)) continue;
        const nb = [];
        for(let dr = -1; dr <= 1; dr++)for(let dc = -1; dc <= 1; dc++){
            if (!dr && !dc) continue;
            const rr = rowOrd[rpos[r] + dr];
            const cc = colOrd[cpos[c] + dc];
            if (rr === undefined || cc === undefined || !svmUsable(rr, cc)) continue;
            nb.push(Math.log(cellOf(m, rr, cc).svm));
        }
        if (nb.length < 2) continue;
        const med = median(nb);
        const s = cellOf(m, r, c).svm;
        const d = Math.abs(Math.log(s) - med);
        if (d > SPIKE_RATIO && (Math.abs(s - Math.exp(med)) > SPIKE_ABS || d > SPIKE_EXTREME)) spikes.push([
            r,
            c,
            Math.exp(med)
        ]);
    }
    for(let r = 0; r < R; r++)for(let c = 0; c < C; c++){
        const p = cellOf(m, r, c);
        if (p && !(p.svm > 0) && !flags[r][c]?.svm) spikes.push([
            r,
            c,
            NaN
        ]);
    }
    for (const [r, c, typical] of spikes)setSvm(r, c, {
        kind: 'svmSpike',
        ...Number.isFinite(typical) ? {
            typical
        } : {}
    });
    const maxRow = rowOrd.length ? rowOrd[rowOrd.length - 1] : -1;
    const levels = m.headerNits.map((raw, c)=>{
        const top = maxRow >= 0 ? cellOf(m, maxRow, c) : null;
        const fromTop = !!top && Math.abs(top.nits - raw) <= LEVEL_MATCH_TOL * Math.max(0.01, Math.abs(raw));
        const f = maxRow >= 0 ? flags[maxRow][c] : null;
        const topBad = fromTop && (!!f?.lum || f?.svm?.kind === 'blackLevel');
        const bad = !(Number.isFinite(raw) && raw > 0) || topBad;
        const est = bad && maxRow >= 0 ? fitted(fit, maxRow, c) : null;
        const hasData = rowOrd.some((r)=>lumOk(r, c));
        return est !== null && hasData ? {
            raw,
            value: Math.exp(est),
            estimated: true
        } : {
            raw,
            value: raw,
            estimated: false
        };
    });
    const lumEstimate = Array.from({
        length: R
    }, ()=>new Array(C).fill(null));
    for(let r = 0; r < R; r++)for(let c = 0; c < C; c++){
        if (!flags[r][c]?.lum) continue;
        if (r === maxRow && levels[c].estimated) {
            lumEstimate[r][c] = levels[c].value;
            continue;
        }
        const local = columnLum(m, r, c, rowOrd, rpos, lumOk);
        const f = fitted(fit, r, c);
        lumEstimate[r][c] = local ?? (f === null ? null : Math.exp(f));
    }
    const byKind = {};
    for (const row of flags)for (const f of row){
        if (f?.svm) byKind[f.svm.kind] = (byKind[f.svm.kind] ?? 0) + 1;
        if (f?.lum) byKind[f.lum.kind] = (byKind[f.lum.kind] ?? 0) + 1;
    }
    return {
        blackLevel: bl,
        flags,
        levels,
        lumEstimate,
        byKind
    };
}
function repeatedFrom(m, r, c, rowOrd, colOrd, rpos, cpos, only) {
    const p = cellOf(m, r, c);
    const around = only ? [
        only
    ] : [
        [
            rowOrd[rpos[r] + 1],
            c
        ],
        [
            rowOrd[rpos[r] - 1],
            c
        ],
        [
            r,
            colOrd[cpos[c] + 1]
        ],
        [
            r,
            colOrd[cpos[c] - 1]
        ]
    ];
    for (const [rr, cc] of around){
        if (rr === undefined || cc === undefined) continue;
        const q = cellOf(m, rr, cc);
        if (q && q.svm > 0 && q.nits > 0 && p.nits > 0 && Math.abs(Math.log(p.svm / q.svm)) < FROZEN_SVM_TOL && Math.abs(Math.log(p.nits / q.nits)) < FROZEN_LUM_TOL) return [
            rr,
            cc
        ];
    }
    return null;
}
function copiedFrom(m, r, c, rowOrd, colOrd, rpos, cpos) {
    const v = cellOf(m, r, c).nits;
    const cand = [
        [
            rowOrd[rpos[r] + 1],
            c
        ],
        [
            rowOrd[rpos[r] - 1],
            c
        ],
        [
            r,
            colOrd[cpos[c] + 1]
        ],
        [
            r,
            colOrd[cpos[c] - 1]
        ]
    ];
    let best = null;
    let bestD = Infinity;
    for (const [rr, cc] of cand){
        if (rr === undefined || cc === undefined) continue;
        const q = cellOf(m, rr, cc);
        if (!q) continue;
        const d = Math.abs(q.nits - v) / Math.abs(v);
        if (d < COPY_TOL && d < bestD) {
            best = [
                rr,
                cc
            ];
            bestD = d;
        }
    }
    return best;
}
function columnOrderBroken(m, r, c, rowOrd, rpos, ok, step) {
    const v = cellOf(m, r, c).nits;
    const up = rowOrd[rpos[r] + 1];
    const down = rowOrd[rpos[r] - 1];
    if (up !== undefined && ok(up, c) && v > cellOf(m, up, c).nits + step) return true;
    if (down !== undefined && ok(down, c) && v < cellOf(m, down, c).nits - step) return true;
    return false;
}
function columnLum(m, r, c, rowOrd, rpos, ok) {
    const run = gapRun(rpos[r], rowOrd.length, (i)=>ok(rowOrd[i], c) && rowOrd[i] !== r);
    if (!run) return null;
    const lo = rowOrd[run[0]];
    const hi = rowOrd[run[1]];
    const g = m.rows[r];
    const g0 = m.rows[lo];
    const g1 = m.rows[hi];
    if (!(g0 < g && g < g1)) return null;
    const useLog = g0 > 0;
    const t = useLog ? (Math.log(g) - Math.log(g0)) / (Math.log(g1) - Math.log(g0)) : (g - g0) / (g1 - g0);
    const n0 = cellOf(m, lo, c).nits;
    const n1 = cellOf(m, hi, c).nits;
    return Math.exp(Math.log(n0) + (Math.log(n1) - Math.log(n0)) * t);
}
function gapRun(pos, n, usable) {
    let lo = pos - 1;
    while(lo >= 0 && !usable(lo))lo--;
    let hi = pos + 1;
    while(hi < n && !usable(hi))hi++;
    if (lo < 0 || hi >= n) return null;
    return hi - lo - 1 <= MAX_GAP ? [
        lo,
        hi
    ] : null;
}
const builtCache = new WeakMap();
const refOf = (m, r, c)=>({
        gray: m.rows[r],
        brightnessPercent: m.cols[c]
    });
function build(m, a) {
    const hit = builtCache.get(m);
    if (hit) return hit;
    const { R, C, rowOrd, colOrd, rpos, cpos } = orders(m);
    const headerNits = a.levels.map((l)=>l.value);
    const grid = m.grid.map((row)=>[
            ...row
        ]);
    const noteGrid = Array.from({
        length: R
    }, ()=>new Array(C).fill(null));
    const notes = [];
    const sourceMin = a.blackLevel.ceiling + SOURCE_SCALES * (a.blackLevel.spread ?? 0);
    const nitsOf = (r, c)=>a.lumEstimate[r][c] ?? cellOf(m, r, c).nits;
    const source = (r, c)=>{
        const p = cellOf(m, r, c);
        return !!p && p.svm > 0 && !a.flags[r][c]?.svm && nitsOf(r, c) > sourceMin;
    };
    const levelX_ = (c)=>levelX(headerNits[c]);
    for(let r = 0; r < R; r++)for(let c = 0; c < C; c++){
        const f = a.flags[r][c];
        const p = cellOf(m, r, c);
        if (!f || !p) continue;
        const base = {
            r,
            c,
            ...refOf(m, r, c),
            kind: 'blackLevel',
            action: 'noData',
            reason: 'blackLevel',
            raw: p,
            value: null
        };
        let note;
        if (f.svm) {
            const k = f.svm.kind;
            note = {
                ...base,
                kind: k,
                reason: k === 'blackLevel' && p.nits <= 0 ? 'nonPositive' : k === 'svmSpike' && !(p.svm > 0) ? 'svmInvalid' : k
            };
            if (f.lum && k !== 'levelShifted') note.also = f.lum.kind;
            if (k === 'levelShifted' && f.lum) {
                note.expected = f.lum.expected;
                note.deviation = f.lum.deviation;
                note.run = f.svm.run;
            }
            if (k === 'blackLevel') note.floor = a.blackLevel.ceiling;
            if (k === 'svmSpike' && f.svm.typical !== undefined) note.typical = f.svm.typical;
            if (f.svm.twin) note.twin = refOf(m, f.svm.twin[0], f.svm.twin[1]);
            if (k === 'blackLevel' || k === 'svmSpike' || k === 'readingNotUpdated' || k === 'levelShifted') {
                const v = interpolate(m, r, c, rowOrd, colOrd, rpos, cpos, source, nitsOf, levelX_);
                if (v) {
                    const keepLum = k === 'svmSpike' || k === 'levelShifted';
                    const nits = keepLum ? nitsOf(r, c) : v.nits;
                    note = {
                        ...note,
                        action: 'interpolated',
                        value: {
                            gray: p.gray,
                            brightnessPercent: p.brightnessPercent,
                            nits,
                            svm: v.svm
                        },
                        from: v.from,
                        via: v.via
                    };
                    if (keepLum && a.lumEstimate[r][c] !== null) note.lumVia = lumVia(m, a, r, c, rowOrd, rpos);
                }
            }
        } else if (f.lum && a.lumEstimate[r][c] !== null) {
            note = {
                ...base,
                kind: f.lum.kind,
                reason: f.lum.kind,
                action: 'lumEstimated',
                value: {
                    gray: p.gray,
                    brightnessPercent: p.brightnessPercent,
                    nits: a.lumEstimate[r][c],
                    svm: p.svm
                },
                lumVia: lumVia(m, a, r, c, rowOrd, rpos),
                expected: f.lum.expected,
                deviation: f.lum.deviation
            };
            if (f.lum.twin) note.twin = refOf(m, f.lum.twin[0], f.lum.twin[1]);
        } else continue;
        if (note.also && f.lum) {
            note.expected = f.lum.expected;
            note.deviation = f.lum.deviation;
        }
        grid[r][c] = note.value;
        noteGrid[r][c] = note;
        notes.push(note);
    }
    const maxRow = rowOrd.length ? rowOrd[rowOrd.length - 1] : -1;
    const levelNotes = [];
    a.levels.forEach((l, c)=>{
        if (!l.estimated) return;
        const f = maxRow >= 0 ? a.flags[maxRow][c] : null;
        levelNotes.push({
            c,
            brightnessPercent: m.cols[c],
            raw: l.raw,
            value: l.value,
            cellKind: f?.lum?.kind ?? (Number.isFinite(l.raw) && l.raw > 0 ? f?.svm?.kind ?? null : null)
        });
    });
    const data = [];
    for (const row of grid)for (const p of row)if (p) data.push(p);
    const byKind = {};
    for (const n of notes)byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
    const count = (act)=>notes.filter((n)=>n.action === act).length;
    const summary = {
        touched: notes.length,
        interpolated: count('interpolated'),
        noData: count('noData'),
        lumEstimated: count('lumEstimated'),
        levelsEstimated: levelNotes.length,
        byKind,
        nominal: R * C,
        valid: data.length
    };
    const untouched = !notes.length && !levelNotes.length;
    const out = {
        matrix: untouched ? m : {
            ...m,
            headerNits,
            grid
        },
        data,
        notes,
        noteGrid,
        levelNotes,
        summary
    };
    builtCache.set(m, out);
    if (!untouched) {
        const byRef = new Map(notes.map((n)=>[
                refKey(n.gray, n.brightnessPercent),
                n
            ]));
        const byCol = new Map(levelNotes.map((l)=>[
                l.brightnessPercent,
                l
            ]));
        displayRegistry.set(out.matrix, {
            notes,
            noteGrid,
            levelNotes,
            summary,
            blackLevel: a.blackLevel,
            noteAt: (gray, pct)=>byRef.get(refKey(gray, pct)) ?? null,
            levelNoteAt: (pct)=>byCol.get(pct) ?? null
        });
    }
    return out;
}
const refKey = (gray, pct)=>`${gray}|${pct}`;
const displayRegistry = new WeakMap();
export function displayNotes(ds) {
    return ds ? displayRegistry.get(ds.matrix) ?? null : null;
}
function lumVia(m, a, r, c, rowOrd, rpos) {
    const maxRow = rowOrd[rowOrd.length - 1];
    if (r === maxRow && a.levels[c].estimated) return 'pattern';
    const lumOk = (rr, cc)=>{
        const p = cellOf(m, rr, cc);
        const f = a.flags[rr]?.[cc];
        return !!p && p.nits > 0 && !f?.lum && f?.svm?.kind !== 'blackLevel' && f?.svm?.kind !== 'duplicateColumn' && f?.svm?.kind !== 'duplicateRow';
    };
    return columnLum(m, r, c, rowOrd, rpos, lumOk) !== null ? 'column' : 'pattern';
}
function interpolate(m, r, c, rowOrd, colOrd, rpos, cpos, source, nitsOf, xOf) {
    const mix = (r0, c0, r1, c1, t)=>{
        const s0 = cellOf(m, r0, c0).svm;
        const s1 = cellOf(m, r1, c1).svm;
        const n0 = nitsOf(r0, c0);
        const n1 = nitsOf(r1, c1);
        const svm = Math.exp(Math.log(s0) + (Math.log(s1) - Math.log(s0)) * t);
        const nits = n0 > 0 && n1 > 0 ? Math.exp(Math.log(n0) + (Math.log(n1) - Math.log(n0)) * t) : n0 + (n1 - n0) * t;
        return {
            svm,
            nits
        };
    };
    const col = gapRun(rpos[r], rowOrd.length, (i)=>source(rowOrd[i], c));
    if (col) {
        const r0 = rowOrd[col[0]];
        const r1 = rowOrd[col[1]];
        const g = m.rows[r];
        const g0 = m.rows[r0];
        const g1 = m.rows[r1];
        if (g0 < g && g < g1) return {
            ...mix(r0, c, r1, c, (g - g0) / (g1 - g0)),
            from: [
                refOf(m, r0, c),
                refOf(m, r1, c)
            ],
            via: 'gray'
        };
    }
    const row = gapRun(cpos[c], colOrd.length, (i)=>source(r, colOrd[i]));
    if (row) {
        const c0 = colOrd[row[0]];
        const c1 = colOrd[row[1]];
        const x = xOf(c);
        const x0 = xOf(c0);
        const x1 = xOf(c1);
        if (x0 < x && x < x1) return {
            ...mix(r, c0, r, c1, (x - x0) / (x1 - x0)),
            from: [
                refOf(m, r, c0),
                refOf(m, r, c1)
            ],
            via: 'level'
        };
    }
    return null;
}
const rawCache = new WeakMap();
export function rawDataset(ds) {
    if (ds.excluded === undefined) return ds;
    const hit = rawCache.get(ds);
    if (hit) return hit;
    const restored = restoreExcluded(ds);
    const { excluded: _e, ...rest } = restored;
    const out = rest;
    rawCache.set(ds, out);
    return out;
}
const processedCache = new WeakMap();
const EMPTY_SUMMARY = (m, valid)=>({
        touched: 0,
        interpolated: 0,
        noData: 0,
        lumEstimated: 0,
        levelsEstimated: 0,
        byKind: {},
        nominal: m.rows.length * m.cols.length,
        valid
    });
export function processRecord(record, opts) {
    const key = opts.denoise ? 'on' : 'off';
    let per = processedCache.get(record);
    if (!per) {
        per = new Map();
        processedCache.set(record, per);
    }
    const hit = per.get(key);
    if (hit) return hit;
    const raw = rawDataset(record);
    const analysis = analyseMatrix(raw.matrix);
    let out;
    if (!opts.denoise) {
        const noteGrid = raw.matrix.grid.map((row)=>row.map(()=>null));
        const valid = raw.matrix.grid.reduce((n, row)=>n + row.filter((p)=>!!p).length, 0);
        out = {
            record: raw,
            raw,
            denoise: false,
            analysis,
            notes: [],
            noteGrid,
            levelNotes: [],
            summary: EMPTY_SUMMARY(raw.matrix, valid),
            noteAt: ()=>null
        };
    } else {
        const b = build(raw.matrix, analysis);
        const byRef = new Map(b.notes.map((n)=>[
                refKey(n.gray, n.brightnessPercent),
                n
            ]));
        out = {
            record: b.matrix === raw.matrix ? raw : {
                ...raw,
                matrix: b.matrix,
                data: b.data
            },
            raw,
            denoise: true,
            analysis,
            notes: b.notes,
            noteGrid: b.noteGrid,
            levelNotes: b.levelNotes,
            summary: b.summary,
            noteAt: (gray, pct)=>byRef.get(refKey(gray, pct)) ?? null
        };
    }
    per.set(key, out);
    return out;
}
export function displayRecord(record, opts) {
    return processRecord(record, opts).record;
}
export function denoiseSummary(record) {
    return processRecord(record, {
        denoise: true
    }).summary;
}
export function noteParams(n) {
    const p = {
        gray: String(n.gray),
        pct: String(n.brightnessPercent),
        nits: fmtNits(n.raw.nits),
        svm: fmtSvm(n.raw.svm)
    };
    if (n.floor !== undefined) p.floor = fmtNits(n.floor);
    if (n.typical !== undefined) {
        p.typical = fmtSvm(n.typical);
        p.ratio = String(Math.max(3, Math.floor(Math.max(n.raw.svm / n.typical, n.typical / n.raw.svm))));
    }
    if (n.expected !== undefined) p.expected = fmtNits(n.expected);
    if (n.deviation !== undefined) p.dev = `${n.deviation > 0 ? '+' : ''}${Math.round(n.deviation * 100)}%`;
    if (n.run !== undefined) p.run = String(n.run);
    if (n.twin) {
        p.twinGray = String(n.twin.gray);
        p.twinPct = String(n.twin.brightnessPercent);
    }
    if (n.value) {
        p.valueNits = fmtNits(n.value.nits);
        p.valueSvm = fmtSvm(n.value.svm);
    }
    if (n.from) {
        p.from0 = n.via === 'gray' ? `G${n.from[0].gray}` : `${n.from[0].brightnessPercent}%`;
        p.from1 = n.via === 'gray' ? `G${n.from[1].gray}` : `${n.from[1].brightnessPercent}%`;
    }
    return p;
}
