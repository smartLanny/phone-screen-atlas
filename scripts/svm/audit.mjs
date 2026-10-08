import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '../../data/svm');
const read = async (name) => JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const near = (a, b, at) => assert.ok(Number.isFinite(a) && Number.isFinite(b) &&
  Math.abs(a - b) <= 1e-11 + 1e-11 * Math.max(Math.abs(a), Math.abs(b)),
  `${at}: saved=${a}, recomputed=${b}, delta=${Math.abs(a - b)}`);
const index = await read('index.json');
const manifest = await read('manifest.original.json');
const provenance = await read('source.json');
assert.equal(index.records.length, 17);
assert.deepEqual(index.fixedGrayKeys, ['34', '124', '255']);
assert.equal(provenance.commit, '48bf54c6d52a20179e5471d63e18717d8602c934');
assert.deepEqual(provenance.dataImports, [{
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
}]);
for (const module of provenance.processing.sourceModules) {
  assert.equal(digest(await fs.readFile(path.join(here, 'source', path.basename(module.path)))), module.sha256);
}
const totals = { records: 0, matrixCells: 0, displayedCells: 0, restoredExcluded: 0, fixedSlicePoints: 0,
  displayedDataPoints: 0, statuses: {}, estimatedLevels: 0, estimatedCellLuminances: 0, sliceEstimatedLevels: 0,
  sliceEstimatedCellLuminances: 0, sliceInterpolatedSvm: 0 };
for (let i = 0; i < index.records.length; i++) {
  const entry = index.records[i];
  assert.equal(entry.file, manifest[i].file);
  const bytes = await fs.readFile(path.join(dir, entry.rawFile));
  const raw = JSON.parse(bytes);
  const d = await read(entry.processedFile);
  assert.equal(digest(bytes), entry.sourceSha256);
  assert.equal(d.source.sha256, entry.sourceSha256);
  assert.equal(d.source.commit, provenance.commit);
  assert.equal(d.denoise, true);
  const m = d.record.matrix;
  assert.deepEqual(m.rows, raw.matrix.rows);
  assert.deepEqual(m.cols, raw.matrix.cols);
  const displayedDataPoints = m.grid.reduce((sum, row, r) => sum + row.reduce((count, point, c) => {
    const nits = m.headerNits[c];
    return m.rows[r] >= 15 && Number.isFinite(nits) && nits > 0 && nits <= 500 && point ? count + 1 : count;
  }, 0), 0);
  assert.equal(entry.displayedDataPoints, displayedDataPoints, `${entry.file}: displayedDataPoints`);
  totals.displayedDataPoints += displayedDataPoints;
  if (entry.file === 'huawei_mate90promax.json') {
    assert.equal(entry.device, '华为 Mate 90 Pro Max 典藏版');
    assert.equal(entry.mode, '默认');
    assert.equal(entry.displayedDataPoints, 0, 'Mate 90 has no measured points under the G255 500 nits axis cap');
    assert.equal(raw.data.length, 72);
    assert.equal(raw.matrix.grid.flat().filter(Boolean).length, 72);
    assert.equal(raw.matrix.grid.flat().filter(point => point === null).length, 360);
  }
  const restored = raw.matrix.grid.map(row => [...row]);
  const excludedKeys = new Set();
  for (const p of raw.excluded ?? []) {
    const r = m.rows.indexOf(p.gray), c = m.cols.indexOf(p.brightnessPercent);
    excludedKeys.add(`${p.gray}:${p.brightnessPercent}`);
    if (r >= 0 && c >= 0 && !restored[r][c]) {
      restored[r][c] = {gray: p.gray, brightnessPercent: p.brightnessPercent, nits: p.nits, svm: p.svm};
      totals.restoredExcluded++;
    }
  }
  const at = (ref) => [m.rows.indexOf(ref.gray), m.cols.indexOf(ref.brightnessPercent)];
  const nitsAt = (r, c) => d.analysis.lumEstimate[r][c] ?? restored[r][c].nits;
  for (let c = 0; c < m.cols.length; c++) {
    const estimate = d.analysis.levels[c];
    assert.equal(estimate.raw, raw.matrix.headerNits[c]);
    assert.equal(estimate.value, m.headerNits[c]);
    const note = d.levelNotes.find(n => n.c === c);
    assert.equal(!!note, estimate.estimated);
    if (estimate.estimated) {
      totals.estimatedLevels++;
      assert.equal(note.raw, estimate.raw);
      assert.equal(note.value, estimate.value);
    } else assert.equal(estimate.value, estimate.raw);
  }
  for (let r = 0; r < m.rows.length; r++) for (let c = 0; c < m.cols.length; c++) {
    totals.matrixCells++;
    const p = m.grid[r][c], original = restored[r][c], note = d.noteGrid[r][c], s = d.cellStatus[r][c];
    totals.statuses[s.status] = (totals.statuses[s.status] ?? 0) + 1;
    if (p) {
      totals.displayedCells++;
      assert.equal(p.gray, m.rows[r]);
      assert.equal(p.brightnessPercent, m.cols[c]);
    }
    assert.equal(s.status, note?.action ?? (p ? 'measured' : 'missing'));
    assert.equal(s.interpolated, note?.action === 'interpolated');
    assert.equal(s.restoredFromExcluded, excludedKeys.has(`${m.rows[r]}:${m.cols[c]}`));
    if (!note) assert.deepEqual(p, original);
    else {
      assert.equal(note.r, r); assert.equal(note.c, c);
      assert.deepEqual(note.raw, original);
      assert.deepEqual(note.value, p);
      if (note.action === 'noData') assert.equal(p, null);
      else if (note.action === 'lumEstimated') {
        assert.equal(p.svm, original.svm);
        assert.equal(p.nits, d.analysis.lumEstimate[r][c]);
      } else if (note.action === 'interpolated') {
        const [r0, c0] = at(note.from[0]), [r1, c1] = at(note.from[1]);
        for (const [ri, ci] of [[r0, c0], [r1, c1]]) {
          assert.ok(restored[ri][ci].svm > 0 && !d.analysis.flags[ri][ci]?.svm);
          assert.ok(nitsAt(ri, ci) > d.analysis.blackLevel.ceiling + 3 * (d.analysis.blackLevel.spread ?? 0));
        }
        const coord = note.via === 'gray' ? (ri) => m.rows[ri] : (_, ci) => Math.log10(Math.max(0, m.headerNits[ci]) + 1);
        const t = (coord(r,c) - coord(r0,c0)) / (coord(r1,c1) - coord(r0,c0));
        assert.ok(t > 0 && t < 1);
        near(p.svm, Math.exp(Math.log(restored[r0][c0].svm) * (1 - t) + Math.log(restored[r1][c1].svm) * t), `${entry.processedFile}.record.matrix.grid[${r}][${c}].svm`);
        if (note.kind === 'svmSpike' || note.kind === 'levelShifted') assert.equal(p.nits, nitsAt(r, c));
        else near(p.nits, Math.exp(Math.log(nitsAt(r0,c0)) * (1 - t) + Math.log(nitsAt(r1,c1)) * t), `${entry.processedFile}.record.matrix.grid[${r}][${c}].nits`);
      } else assert.fail(`Unknown action ${note.action}`);
    }
    const expectedEstimate = note?.action === 'lumEstimated' || !!note?.lumVia ||
      (note?.action === 'interpolated' && ['blackLevel', 'readingNotUpdated'].includes(note.kind));
    assert.equal(s.luminanceEstimated, expectedEstimate);
    if (p && original && p.nits !== original.nits) assert.equal(s.luminanceEstimated, true);
    if (s.luminanceEstimated) totals.estimatedCellLuminances++;
  }
  assert.deepEqual(d.record.data, m.grid.flat().filter(Boolean));
  assert.equal(d.summary.valid, m.grid.flat().filter(Boolean).length);
  assert.deepEqual(d.notes, d.noteGrid.flat().filter(Boolean));
  for (const key of index.fixedGrayKeys) {
    const slice = d.fixedGraySlices[key], r = m.rows.indexOf(Number(key));
    assert.equal(slice.gray, Number(key));
    assert.equal(slice.points.length, m.cols.length);
    const seen = new Set();
    for (let j = 0; j < slice.points.length; j++) {
      totals.fixedSlicePoints++;
      const p = slice.points[j], c = m.cols.indexOf(p.brightnessPercent), value = m.grid[r][c];
      assert.ok(c >= 0 && !seen.has(c)); seen.add(c);
      assert.equal(p.gray, Number(key));
      assert.equal(p.x, m.headerNits[c]); assert.equal(p.headerNits, p.x);
      assert.equal(p.rawHeaderNits, raw.matrix.headerNits[c]);
      assert.equal(p.levelEstimated, d.analysis.levels[c].estimated);
      if (p.x !== p.rawHeaderNits) assert.equal(p.levelEstimated, true);
      assert.equal(p.svm, value?.svm ?? null); assert.equal(p.nits, value?.nits ?? null);
      assert.equal(p.rawSvm, restored[r][c]?.svm ?? null); assert.equal(p.rawNits, restored[r][c]?.nits ?? null);
      for (const field of ['status','interpolated','luminanceEstimated','restoredFromExcluded']) assert.equal(p[field], d.cellStatus[r][c][field]);
      assert.deepEqual(p.note, d.noteGrid[r][c]);
      if (j) assert.ok(slice.points[j-1].x <= p.x);
      if (p.levelEstimated) totals.sliceEstimatedLevels++;
      if (p.luminanceEstimated) totals.sliceEstimatedCellLuminances++;
      if (p.interpolated) totals.sliceInterpolatedSvm++;
      if (p.status === 'noData' || p.status === 'missing') assert.equal(p.svm, null);
    }
  }
  totals.records++;
}
console.log(JSON.stringify({passed: true, commit: provenance.commit, totals}, null, 2));
