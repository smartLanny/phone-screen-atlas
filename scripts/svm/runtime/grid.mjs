import { DEFAULT_MAX_NITS, LOW_GRAY_CLIP } from './types.mjs';
export const logNits = (nits)=>Math.log10(Math.max(0, nits) + 1);
export const fromLogNits = (x)=>Math.pow(10, x) - 1;
const viewCache = new WeakMap();
export function gridView(ds, opts = {}) {
    const clip = !!opts.clipLowGray;
    const threshold = opts.lowGrayThreshold ?? LOW_GRAY_CLIP;
    const maxNits = opts.maxNits ?? null;
    const key = `${clip ? threshold : -1}|${maxNits ?? 'all'}`;
    let perMatrix = viewCache.get(ds.matrix);
    if (!perMatrix) {
        perMatrix = new Map();
        viewCache.set(ds.matrix, perMatrix);
    }
    const hit = perMatrix.get(key);
    if (hit) return hit;
    const m = ds.matrix;
    const rowIndex = m.rows.map((g, i)=>({
            g,
            i
        })).filter(({ g })=>Number.isFinite(g) && (!clip || g >= threshold)).sort((a, b)=>a.g - b.g).map(({ i })=>i);
    const colIndex = m.headerNits.map((n, i)=>({
            n,
            i
        })).filter(({ n })=>Number.isFinite(n) && n > 0 && (maxNits === null || n <= maxNits)).sort((a, b)=>a.n - b.n).map(({ i })=>i);
    const keepRows = rowIndex.filter((r)=>colIndex.some((c)=>m.grid[r]?.[c]));
    const keepCols = colIndex.filter((c)=>keepRows.some((r)=>m.grid[r]?.[c]));
    rowIndex.splice(0, rowIndex.length, ...keepRows);
    colIndex.splice(0, colIndex.length, ...keepCols);
    const view = {
        grays: rowIndex.map((i)=>m.rows[i]),
        levelNits: colIndex.map((i)=>m.headerNits[i]),
        x: colIndex.map((i)=>logNits(m.headerNits[i])),
        percents: colIndex.map((i)=>m.cols[i]),
        rowIndex,
        colIndex,
        points: rowIndex.map((r)=>colIndex.map((c)=>m.grid[r]?.[c] ?? null))
    };
    perMatrix.set(key, view);
    return view;
}
export function cellEdges(values, min = -Infinity, max = Infinity) {
    const n = values.length;
    if (n === 0) return [];
    if (n === 1) return [
        Math.max(min, values[0] - 0.5),
        Math.min(max, values[0] + 0.5)
    ];
    const e = new Array(n + 1);
    for(let i = 1; i < n; i++)e[i] = (values[i - 1] + values[i]) / 2;
    e[0] = values[0] - (values[1] - values[0]) / 2;
    e[n] = values[n - 1] + (values[n - 1] - values[n - 2]) / 2;
    e[0] = Math.max(min, e[0]);
    e[n] = Math.min(max, e[n]);
    return e;
}
export function bracket(arr, v) {
    const n = arr.length;
    if (n === 0 || v < arr[0] || v > arr[n - 1]) return -1;
    if (n === 1) return 0;
    let lo = 0;
    let hi = n - 1;
    while(hi - lo > 1){
        const mid = lo + hi >> 1;
        if (arr[mid] <= v) lo = mid;
        else hi = mid;
    }
    return lo;
}
const EPS = 1e-9;
export function sampleView(view, x, gray) {
    const c = bracket(view.x, x);
    const r = bracket(view.grays, gray);
    if (c < 0 || r < 0) return null;
    const c1 = Math.min(c + 1, view.x.length - 1);
    const r1 = Math.min(r + 1, view.grays.length - 1);
    const tx = c1 === c ? 0 : (x - view.x[c]) / (view.x[c1] - view.x[c]);
    const tz = r1 === r ? 0 : (gray - view.grays[r]) / (view.grays[r1] - view.grays[r]);
    const corners = [
        [
            r,
            c,
            (1 - tx) * (1 - tz)
        ],
        [
            r,
            c1,
            tx * (1 - tz)
        ],
        [
            r1,
            c,
            (1 - tx) * tz
        ],
        [
            r1,
            c1,
            tx * tz
        ]
    ];
    let svm = 0;
    let nits = 0;
    let wsum = 0;
    for (const [ri, ci, w] of corners){
        if (w <= EPS) continue;
        const p = view.points[ri][ci];
        if (!p) return null;
        svm += p.svm * w;
        nits += p.nits * w;
        wsum += w;
    }
    if (wsum <= EPS) return null;
    return {
        svm: svm / wsum,
        nits: nits / wsum
    };
}
function lerpNits(a, b, t) {
    if (a > 0 && b > 0) return Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);
    return a + (b - a) * t;
}
export function sliceAtGray(ds, gray) {
    const view = gridView(ds);
    const grays = view.grays;
    if (grays.length === 0) return [];
    const g = Math.min(grays[grays.length - 1], Math.max(grays[0], gray));
    const r = Math.max(0, bracket(grays, g));
    const r1 = Math.min(r + 1, grays.length - 1);
    const t = r1 === r ? 0 : (g - grays[r]) / (grays[r1] - grays[r]);
    const out = [];
    for(let c = 0; c < view.x.length; c++){
        const p0 = view.points[r][c];
        const p1 = view.points[r1][c];
        let nits;
        let svm;
        if (p0 && p1) {
            nits = lerpNits(p0.nits, p1.nits, t);
            svm = p0.svm + (p1.svm - p0.svm) * t;
        } else if (p0 && t < 1e-6) {
            nits = p0.nits;
            svm = p0.svm;
        } else if (p1 && t > 1 - 1e-6) {
            nits = p1.nits;
            svm = p1.svm;
        } else continue;
        if (!(nits > 0) || !Number.isFinite(svm)) continue;
        out.push({
            x: nits,
            svm,
            nits,
            gray: g
        });
    }
    out.sort((a, b)=>a.x - b.x);
    return out;
}
export function sliceAtLevel(ds, levelNits, opts = {}) {
    const view = gridView(ds, {
        clipLowGray: opts.clipLowGray,
        lowGrayThreshold: opts.lowGrayThreshold
    });
    const xq = logNits(levelNits);
    const c = bracket(view.x, xq);
    if (c < 0) return [];
    const c1 = Math.min(c + 1, view.x.length - 1);
    const t = c1 === c ? 0 : (xq - view.x[c]) / (view.x[c1] - view.x[c]);
    const out = [];
    for(let r = 0; r < view.grays.length; r++){
        const p0 = view.points[r][c];
        const p1 = view.points[r][c1];
        let svm;
        let nits;
        if (p0 && p1) {
            svm = p0.svm + (p1.svm - p0.svm) * t;
            nits = lerpNits(p0.nits, p1.nits, t);
        } else if (p0 && t < 1e-6) {
            svm = p0.svm;
            nits = p0.nits;
        } else if (p1 && t > 1 - 1e-6) {
            svm = p1.svm;
            nits = p1.nits;
        } else continue;
        if (!Number.isFinite(svm)) continue;
        out.push({
            x: view.grays[r],
            svm,
            nits,
            gray: view.grays[r]
        });
    }
    return out;
}
export function levelRange(ds) {
    const v = gridView(ds);
    if (v.levelNits.length === 0) return null;
    return [
        v.levelNits[0],
        v.levelNits[v.levelNits.length - 1]
    ];
}
export function diffRecords(a, b, opts = {}) {
    const view = gridView(a, opts);
    const bView = gridView(b);
    let maxAbs = 0;
    let count = 0;
    const values = view.points.map((row, r)=>row.map((p, c)=>{
            if (!p) return null;
            const s = sampleView(bView, view.x[c], view.grays[r]);
            if (!s) return null;
            const d = p.svm - s.svm;
            maxAbs = Math.max(maxAbs, Math.abs(d));
            count++;
            return d;
        }));
    return {
        view,
        values,
        maxAbs,
        count
    };
}
export function logTicks(min, max) {
    const out = [];
    if (!(min > 0) || !(max > min)) return out;
    const e0 = Math.floor(Math.log10(min));
    const e1 = Math.ceil(Math.log10(max));
    for(let e = e0; e <= e1; e++){
        for (const m of [
            1,
            2,
            5
        ]){
            const v = m * Math.pow(10, e);
            if (v >= min * (1 - 1e-9) && v <= max * (1 + 1e-9)) out.push(Number(v.toPrecision(6)));
        }
    }
    return out;
}
export function terrainNitsTicks(maxNits = DEFAULT_MAX_NITS) {
    return [
        0,
        ...logTicks(1, maxNits)
    ];
}
export function fmtSvm(v, digits = 2) {
    if (!Number.isFinite(v)) return '—';
    return v.toFixed(digits);
}
export function fmtNits(v) {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    if (a >= 1) return v.toFixed(2);
    if (a >= 0.1) return v.toFixed(2);
    return v.toFixed(3);
}
