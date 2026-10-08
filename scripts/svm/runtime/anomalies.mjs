const BLACK_MAX_GRAY = 2;
const NITS_SHIFT_TOL = Math.log(1.2);
const NITS_SHIFT_HARD = Math.log(1.35);
const NITS_COPY_TOL = 0.025;
const SPIKE_RATIO = Math.log(3);
const SPIKE_ABS = 1.0;
export function noiseFloor(ds) {
    const m = ds.excluded?.length ? restoreExcluded(ds).matrix : ds.matrix;
    const black = [];
    m.rows.forEach((g, r)=>{
        if (g <= BLACK_MAX_GRAY) {
            for (const p of m.grid[r])if (p && Number.isFinite(p.nits)) black.push(p.nits);
        }
    });
    if (black.length < 6) return {
        mean: null,
        sd: null,
        ceiling: 0
    };
    const mean = black.reduce((a, b)=>a + b, 0) / black.length;
    const sd = Math.sqrt(black.reduce((a, b)=>a + (b - mean) ** 2, 0) / black.length);
    return {
        mean,
        sd,
        ceiling: Math.max(0, mean + 3 * sd)
    };
}
const median = (v)=>{
    const s = [
        ...v
    ].sort((a, b)=>a - b);
    const n = s.length;
    return n % 2 ? s[n - 1 >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
export function medianPolish(table, iterations = 10) {
    const res = table.map((row)=>[
            ...row
        ]);
    const R = res.length;
    const C = R ? res[0].length : 0;
    for(let it = 0; it < iterations; it++){
        for(let r = 0; r < R; r++){
            const v = res[r].filter((x)=>x !== null);
            if (!v.length) continue;
            const md = median(v);
            for(let c = 0; c < C; c++)if (res[r][c] !== null) res[r][c] -= md;
        }
        for(let c = 0; c < C; c++){
            const v = [];
            for(let r = 0; r < R; r++)if (res[r][c] !== null) v.push(res[r][c]);
            if (!v.length) continue;
            const md = median(v);
            for(let r = 0; r < R; r++)if (res[r][c] !== null) res[r][c] -= md;
        }
    }
    return res;
}
const same = (a, b)=>!!a && !!b && a.nits === b.nits && a.svm === b.svm;
const fmt = (v)=>Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
export function detectAnomalies(ds) {
    const m = ds.matrix;
    const R = m.rows.length;
    const C = m.cols.length;
    const floor = noiseFloor(ds);
    const flagged = new Map();
    const key = (r, c)=>`${r},${c}`;
    const flag = (r, c, kind, detail)=>{
        const p = m.grid[r][c];
        if (!p || flagged.has(key(r, c))) return;
        flagged.set(key(r, c), {
            r,
            c,
            point: p,
            kind,
            detail
        });
    };
    for(let r = 0; r < R; r++)for(let c = 0; c < C; c++){
        const p = m.grid[r][c];
        if (p && p.nits <= floor.ceiling) flag(r, c, 'belowNoise', p.nits <= 0 ? `亮度 ${fmt(p.nits)} nits ≤ 0` : `亮度 ${fmt(p.nits)} nits 低于噪声底 ${fmt(floor.ceiling)} nits`);
    }
    for(let c = 0; c + 1 < C; c++){
        const rowsBoth = m.grid.filter((row)=>row[c] && row[c + 1]);
        if (rowsBoth.length >= 3 && rowsBoth.every((row)=>same(row[c], row[c + 1]))) {
            const dim = m.cols[c] <= m.cols[c + 1] ? c : c + 1;
            const twin = dim === c ? c + 1 : c;
            for(let r = 0; r < R; r++)flag(r, dim, 'duplicateColumn', `${m.cols[dim]}% 列与 ${m.cols[twin]}% 列完全相同`);
        }
    }
    for(let r = 0; r + 1 < R; r++){
        const both = m.grid[r].map((p, c)=>[
                p,
                m.grid[r + 1][c]
            ]).filter(([a, b])=>a && b);
        if (both.length >= 3 && both.every(([a, b])=>same(a, b))) {
            const dim = m.rows[r] <= m.rows[r + 1] ? r : r + 1;
            const twin = dim === r ? r + 1 : r;
            for(let c = 0; c < C; c++)flag(dim, c, 'duplicateRow', `G${m.rows[dim]} 行与 G${m.rows[twin]} 行完全相同`);
        }
    }
    const fitMin = Math.max(0.3, floor.ceiling * 3);
    const chkMin = Math.max(1, floor.ceiling * 10);
    const copied = (r, c)=>{
        const v = m.grid[r][c].nits;
        for (const [rr, cc] of [
            [
                r - 1,
                c
            ],
            [
                r + 1,
                c
            ],
            [
                r,
                c - 1
            ],
            [
                r,
                c + 1
            ]
        ]){
            const q = m.grid[rr]?.[cc];
            if (q && Math.abs(q.nits - v) / v < NITS_COPY_TOL) return true;
        }
        return false;
    };
    for(let pass = 0; pass < 5; pass++){
        const res = medianPolish(m.grid.map((row, r)=>row.map((p, c)=>p && p.nits > fitMin && !flagged.has(key(r, c)) ? Math.log(p.nits) : null)));
        let added = 0;
        for(let r = 0; r < R; r++)for(let c = 0; c < C; c++){
            const p = m.grid[r][c];
            const e = res[r][c];
            if (!p || e === null || p.nits <= chkMin || flagged.has(key(r, c))) continue;
            const dev = Math.abs(e);
            const isCopy = copied(r, c);
            if (dev > NITS_SHIFT_HARD || dev > NITS_SHIFT_TOL && isCopy) {
                const expected = p.nits / Math.exp(e);
                flag(r, c, 'nitsShift', `亮度 ${fmt(p.nits)} nits 与整表亮度规律推算的约 ${fmt(expected)} nits 相差 ${e > 0 ? '+' : ''}${Math.round((Math.exp(e) - 1) * 100)}%${isCopy ? '，且与相邻格读数几乎相同（疑似画面未切换时的陈旧读数）' : '，疑似错行或错列'}`);
                added++;
            }
        }
        if (!added) break;
    }
    const valid = (r, c)=>{
        const p = m.grid[r]?.[c];
        return !!p && p.nits > floor.ceiling && p.svm > 0 && !flagged.has(key(r, c));
    };
    const spikes = [];
    for(let r = 0; r < R; r++)for(let c = 0; c < C; c++){
        if (!valid(r, c)) continue;
        const nb = [];
        for(let dr = -1; dr <= 1; dr++)for(let dc = -1; dc <= 1; dc++)if ((dr || dc) && valid(r + dr, c + dc)) nb.push(Math.log(m.grid[r + dr][c + dc].svm));
        if (nb.length < 3) continue;
        const med = median(nb);
        const s = m.grid[r][c].svm;
        if (Math.abs(Math.log(s) - med) > SPIKE_RATIO && Math.abs(s - Math.exp(med)) > SPIKE_ABS) spikes.push([
            r,
            c,
            Math.exp(med)
        ]);
    }
    for (const [r, c, e] of spikes)flag(r, c, 'svmSpike', `SVM ${fmt(m.grid[r][c].svm)} 与周围单元格中位数 ${fmt(e)} 相差超过 3 倍`);
    return [
        ...flagged.values()
    ].sort((a, b)=>a.r - b.r || a.c - b.c);
}
export function excludeAnomalies(ds, anomalies, kinds) {
    const take = anomalies.filter((a)=>!kinds || kinds.includes(a.kind));
    const grid = ds.matrix.grid.map((row)=>[
            ...row
        ]);
    const excluded = [
        ...ds.excluded ?? []
    ];
    for (const a of take){
        if (!grid[a.r][a.c]) continue;
        grid[a.r][a.c] = null;
        excluded.push({
            ...a.point,
            reason: a.kind,
            detail: a.detail
        });
    }
    const data = [];
    for (const row of grid)for (const p of row)if (p) data.push(p);
    return {
        ...ds,
        data,
        matrix: {
            ...ds.matrix,
            grid
        },
        excluded
    };
}
export function restoreExcluded(ds) {
    if (!ds.excluded?.length) return ds;
    const grid = ds.matrix.grid.map((row)=>[
            ...row
        ]);
    for (const x of ds.excluded){
        const r = ds.matrix.rows.indexOf(x.gray);
        const c = ds.matrix.cols.indexOf(x.brightnessPercent);
        if (r >= 0 && c >= 0 && !grid[r][c]) grid[r][c] = {
            gray: x.gray,
            brightnessPercent: x.brightnessPercent,
            nits: x.nits,
            svm: x.svm
        };
    }
    const data = [];
    for (const row of grid)for (const p of row)if (p) data.push(p);
    const { excluded: _e, ...rest } = ds;
    return {
        ...rest,
        data,
        matrix: {
            ...ds.matrix,
            grid
        }
    };
}
export function exclusionSummary(ds) {
    const ex = ds.excluded ?? [];
    if (!ex.length) return null;
    const byReason = {};
    for (const x of ex)byReason[x.reason] = (byReason[x.reason] ?? 0) + 1;
    return {
        total: ex.length,
        byReason,
        nominal: ds.matrix.rows.length * ds.matrix.cols.length,
        valid: ds.data.length
    };
}
export const ANOMALY_KINDS = [
    'belowNoise',
    'duplicateColumn',
    'duplicateRow',
    'nitsShift',
    'svmSpike'
];
