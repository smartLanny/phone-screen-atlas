import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(here, '../../data/svm');
const checkOnly = process.argv.includes('--check');
const writeJson = async (file, data, pretty = false) => {
  const text = JSON.stringify(data, null, pretty ? 2 : undefined);
  if (checkOnly) assert.equal(await fs.readFile(file, 'utf8'), text, `${path.basename(file)} differs from offline rebuild`);
  else await fs.writeFile(file, text);
};
const sha = '4189c501004904a494a35ae438dda761cff2be0c';
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
    graySelection: 'Nearest rows shared by all 16 source matrices to G32/G128/G255; no added gray interpolation.',
    axis: 'x = processed matrix.headerNits (G255 white-field level luminance), y = svm',
  },
};
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
    sourceSha256: digest(bytes),
  };
  records.push(indexEntry);
}
await writeJson(path.join(output, 'source.json'), source, true);
await writeJson(path.join(output, 'index.json'), { schemaVersion: 1, fixedGrayKeys: grays.map(String), sourceFile: 'source.json', records }, true);
console.log(`${checkOnly ? 'Verified' : 'Rebuilt'} ${records.length} records offline; fixed gray rows: ${grays.join(', ')}; denoise enabled.`);
