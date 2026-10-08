import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(here, '../../data/svm');
const checkOnly = process.argv.includes('--check');
const ABS_TOLERANCE = 1e-11;
const REL_TOLERANCE = 1e-11;

function compareSnapshot(actual, expected, at, derived = new Set()) {
  if (actual === expected) return;
  if (typeof actual === 'number' && typeof expected === 'number' && derived.has(at) &&
      Number.isFinite(actual) && Number.isFinite(expected) &&
      Math.abs(actual - expected) <= ABS_TOLERANCE + REL_TOLERANCE * Math.max(Math.abs(actual), Math.abs(expected))) return;
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) throw new Error(`${at}.length: saved=${actual.length}, rebuilt=${expected.length}`);
    for (let i = 0; i < expected.length; i++) compareSnapshot(actual[i], expected[i], `${at}[${i}]`, derived);
    return;
  }
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object' && !Array.isArray(actual) && !Array.isArray(expected)) {
    const a = Object.keys(actual).sort(), b = Object.keys(expected).sort();
    if (a.length !== b.length || a.some((key, i) => key !== b[i])) {
      const key = [...new Set([...a, ...b])].find(key => !Object.hasOwn(actual, key) || !Object.hasOwn(expected, key));
      throw new Error(`${at}.${key}: ${Object.hasOwn(actual, key) ? 'unexpected saved key' : 'missing saved key'}`);
    }
    for (const key of b) compareSnapshot(actual[key], expected[key], `${at}.${key}`, derived);
    return;
  }
  const show = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : (Array.isArray(value) ? '[array]' : '{object}');
  throw new Error(`${at}: saved=${show(actual)}, rebuilt=${show(expected)}${typeof actual === 'number' && typeof expected === 'number' ? `, delta=${Math.abs(actual - expected)}, derived=${derived.has(at)}` : ''}`);
}

function derivedFloatPaths(data, root) {
  const paths = new Set();
  const add = (base, object, keys) => {
    for (const key of keys) if (typeof object?.[key] === 'number') paths.add(`${base}.${key}`);
  };
  const notePaths = (note, at, status) => {
    if (!note) return;
    add(at, note, ['floor', 'typical', 'expected', 'deviation']);
    if (status.interpolated) add(`${at}.value`, note.value, ['svm']);
    if (status.luminanceEstimated) add(`${at}.value`, note.value, ['nits']);
  };
  add(`${root}.analysis.blackLevel`, data.analysis.blackLevel, ['median', 'spread', 'ceiling', 'step']);
  data.analysis.levels.forEach((level, c) => {
    if (level.estimated) {
      paths.add(`${root}.analysis.levels[${c}].value`);
      paths.add(`${root}.record.matrix.headerNits[${c}]`);
    }
  });
  data.levelNotes.forEach((note, i) => paths.add(`${root}.levelNotes[${i}].value`));
  data.record.matrix.grid.forEach((row, r) => row.forEach((point, c) => {
    const status = data.cellStatus[r][c];
    if (status.interpolated) add(`${root}.record.matrix.grid[${r}][${c}]`, point, ['svm']);
    if (status.luminanceEstimated) add(`${root}.record.matrix.grid[${r}][${c}]`, point, ['nits']);
    const flag = data.analysis.flags[r][c];
    add(`${root}.analysis.flags[${r}][${c}].lum`, flag?.lum, ['expected', 'deviation']);
    add(`${root}.analysis.flags[${r}][${c}].svm`, flag?.svm, ['typical']);
    if (typeof data.analysis.lumEstimate[r][c] === 'number') paths.add(`${root}.analysis.lumEstimate[${r}][${c}]`);
    notePaths(data.noteGrid[r][c], `${root}.noteGrid[${r}][${c}]`, status);
  }));
  data.record.data.forEach((point, i) => {
    const r = data.record.matrix.rows.indexOf(point.gray), c = data.record.matrix.cols.indexOf(point.brightnessPercent);
    const status = data.cellStatus[r][c];
    if (status.interpolated) add(`${root}.record.data[${i}]`, point, ['svm']);
    if (status.luminanceEstimated) add(`${root}.record.data[${i}]`, point, ['nits']);
  });
  data.notes.forEach((note, i) => notePaths(note, `${root}.notes[${i}]`, data.cellStatus[note.r][note.c]));
  for (const [gray, slice] of Object.entries(data.fixedGraySlices)) slice.points.forEach((point, i) => {
    const at = `${root}.fixedGraySlices.${gray}.points[${i}]`;
    if (point.levelEstimated) add(at, point, ['x', 'headerNits']);
    if (point.interpolated) add(at, point, ['svm']);
    if (point.luminanceEstimated) add(at, point, ['nits']);
    notePaths(point.note, `${at}.note`, point);
  });
  return paths;
}

const writeJson = async (file, data, pretty = false) => {
  const text = JSON.stringify(data, null, pretty ? 2 : undefined);
  if (checkOnly) {
    const saved = JSON.parse(await fs.readFile(file, 'utf8'));
    const at = path.relative(output, file);
    const derived = data.schemaVersion === 1 && data.record ? derivedFloatPaths(data, at) : new Set();
    compareSnapshot(saved, data, at, derived);
  }
  else await fs.writeFile(file, text);
};
const sha = '48bf54c6d52a20179e5471d63e18717d8602c934';
const repository = 'https://github.com/smartLanny/svm-full-range-visualizer';
const branch = 'claude/brave-archimedes-bd546k';
const modules = ['types', 'grid', 'anomalies', 'denoise'];
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(path.join(here, 'runtime'), { recursive: true });
const moduleSources = [];
for (const name of modules) {
  const source = await fs.readFile(path.join(here, 'source', `${name}.ts`), 'utf8');
  const code = stripTypeScriptTypes(source, { mode: 'transform' })
    .replaceAll("'../types'", "'./types.mjs'")
    .replaceAll("'./anomalies'", "'./anomalies.mjs'")
    .replaceAll("'./grid'", "'./grid.mjs'");
  await fs.writeFile(path.join(here, 'runtime', `${name}.mjs`), code);
  moduleSources.push({ path: name === 'types' ? 'src/types.ts' : `src/data/${name}.ts`, sha256: digest(source) });
}
const { processRecord } = await import('./runtime/denoise.mjs');
const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.original.json')));
const grays = [34, 124, 255];
const source = {
  repository, branch, commit: sha,
  commitUrl: `${repository}/commit/${sha}`,
  manifestUrl: `${repository}/blob/${sha}/public/datasets/manifest.json`,
  license: 'MIT', copyright: 'Copyright (c) 2026 smartLanny and contributors',
  licenseFile: 'LICENSE', licenseUrl: `${repository}/blob/${sha}/LICENSE`,
  processing: {
    module: 'src/data/denoise.ts', call: 'processRecord(raw, { denoise: true })',
    defaultEvidence: 'src/store/appStore.ts:99 (DEFAULT_SETTINGS.denoise = true)',
    sourceModules: moduleSources,
    runtime: `Node ${process.version}; node:module stripTypeScriptTypes(mode: transform)`,
    adaptation: 'Only TypeScript transpilation and relative runtime import extensions changed; processing algorithm unchanged.',
    fixedGrays: grays,
    graySelection: 'Nearest rows shared by all 17 source matrices to G32/G128/G255; no added gray interpolation.',
    axis: 'x = processed matrix.headerNits (G255 white-field level luminance), y = svm',
  },
  dataImports: [{
    provider: 'Feishu spreadsheet CSV export',
    workbookTitle: '华为 Mate 90 Pro Max 典藏版 测试图表',
    sheetTitle: '华为 Mate 90 Pro Max 典藏版 全灰阶 SVM',
    sheetId: 'ZqTkQh',
    exportRange: 'A1:AK54',
    exportSha256: '2781b243035bf9280ccc3739ae92422f8b0704b69626491d6d11d9e9ef502c1f',
    matrixRange: 'A4:AK27',
    device: '华为 Mate 90 Pro Max 典藏版',
    mode: '默认',
    measuredCells: 72,
    missingCells: 360,
    zeroNitsCellsPreserved: 3,
    cellNitsAtOrBelow500: 62,
    g255HeaderNitsMeasured: [923.08, 714.9, 590.98],
    displayedDataPointsAtMaxNits500: 0,
    unusedTemplate: {
      range: 'A28:AK54',
      matrixRange: 'A31:AK54',
      residualTitle: '华为 Mate 90 Pro Max 典藏版 屏幕低频闪',
      comparedMatrixPairs: 432,
      measuredCells: 0,
      disposition: 'Unused blank template; user confirmed the phone has no separate low-flicker mode.',
    },
  }],
};
if (checkOnly) {
  const savedSource = JSON.parse(await fs.readFile(path.join(output, 'source.json'), 'utf8'));
  assert.equal(typeof savedSource.processing.runtime, 'string', 'source.json.processing.runtime must describe the snapshot environment');
  source.processing.runtime = savedSource.processing.runtime;
}
const records = [];
if (!checkOnly) await fs.mkdir(path.join(output, 'processed'), { recursive: true });
for (const entry of manifest) {
  const bytes = await fs.readFile(path.join(output, 'raw', entry.file));
  const raw = JSON.parse(bytes);
  const before = JSON.stringify(raw);
  const processed = processRecord(raw, { denoise: true });
  assert.equal(JSON.stringify(raw), before, 'source object must not be mutated');
  const { record, noteGrid, levelNotes, analysis, notes, summary } = processed;
  const excludedKeys = new Set((raw.excluded ?? []).map((p) => `${p.gray}:${p.brightnessPercent}`));
  const cellStatus = record.matrix.grid.map((row, r) => row.map((point, c) => {
    const note = noteGrid[r][c];
    const status = note?.action ?? (point ? 'measured' : 'missing');
    if (!note) assert.deepEqual(point, processed.raw.matrix.grid[r][c]);
    return {
      status,
      interpolated: status === 'interpolated',
      luminanceEstimated: status === 'lumEstimated' || !!note?.lumVia ||
        (status === 'interpolated' && (note.kind === 'blackLevel' || note.kind === 'readingNotUpdated')),
      restoredFromExcluded: excludedKeys.has(`${record.matrix.rows[r]}:${record.matrix.cols[c]}`),
    };
  }));
  const fixedGraySlices = {};
  for (const gray of grays) {
    const r = record.matrix.rows.indexOf(gray);
    assert.ok(r >= 0, `G${gray} must be an original measured row`);
    const points = record.matrix.cols.map((brightnessPercent, c) => {
      const p = record.matrix.grid[r][c];
      return {
        gray,
        brightnessPercent,
        x: record.matrix.headerNits[c],
        headerNits: record.matrix.headerNits[c],
        rawHeaderNits: processed.raw.matrix.headerNits[c],
        levelEstimated: analysis.levels[c].estimated,
        svm: p?.svm ?? null,
        nits: p?.nits ?? null,
        rawSvm: processed.raw.matrix.grid[r][c]?.svm ?? null,
        rawNits: processed.raw.matrix.grid[r][c]?.nits ?? null,
        ...cellStatus[r][c],
        note: noteGrid[r][c],
      };
    }).sort((a, b) => a.x - b.x);
    fixedGraySlices[gray] = { gray, points };
  }
  const file = {
    schemaVersion: 1,
    source: { repository, branch, commit: sha, file: `public/datasets/${entry.file}`, sha256: digest(bytes) },
    identity: { ...entry, id: raw.id },
    denoise: true,
    record,
    cellStatus, noteGrid, levelNotes, analysis, notes, summary,
    fixedGraySlices,
  };
  await writeJson(path.join(output, 'processed', entry.file), file);
  const valid = record.matrix.grid.flat().filter(Boolean).length;
  assert.equal(valid, summary.valid);
  assert.equal(noteGrid.flat().filter(Boolean).length, summary.touched);
  for (const slice of Object.values(fixedGraySlices)) {
    assert.equal(slice.points.length, record.matrix.cols.length);
    assert.ok(slice.points.every((p, i, a) => i === 0 || a[i - 1].x <= p.x));
    for (const p of slice.points) {
      if (p.status === 'missing' || p.status === 'noData') assert.equal(p.svm, null);
      else assert.ok(Number.isFinite(p.svm));
    }
  }
  const indexEntry = {
    ...entry, id: raw.id,
    rawFile: `raw/${entry.file}`, processedFile: `processed/${entry.file}`,
    grayKeys: grays.map(String),
    rows: raw.matrix.rows.length, columns: raw.matrix.cols.length,
    originalDataPoints: raw.data.length, storedExcludedPoints: raw.excluded?.length ?? 0,
    displayedDataPoints: record.matrix.grid.reduce((sum, row, r) => sum + row.reduce((count, point, c) => {
      const nits = record.matrix.headerNits[c];
      return record.matrix.rows[r] >= 15 && Number.isFinite(nits) && nits > 0 && nits <= 500 && point ? count + 1 : count;
    }, 0), 0),
    sourceSha256: digest(bytes),
  };
  records.push(indexEntry);
}
await writeJson(path.join(output, 'source.json'), source, true);
await writeJson(path.join(output, 'index.json'), { schemaVersion: 1, fixedGrayKeys: grays.map(String), sourceFile: 'source.json', records }, true);
console.log(`${checkOnly ? 'Verified' : 'Rebuilt'} ${records.length} records offline; fixed gray rows: ${grays.join(', ')}; denoise enabled.`);
