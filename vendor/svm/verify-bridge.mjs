import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = await fs.readFile(new URL('./bridge.js', import.meta.url), 'utf8');
const files = ['iPhone17ProMax.json', 'huawei_mate80rs.json'];
const messages = [], listeners = {}, subscribers = [];
let timer, writes = 0;
let state = { ready: false, records: files.map(file => ({ id: `bundled:${file}` })), tab: 'scene3d' };
const store = {
  getState: () => state,
  subscribe: callback => subscribers.push(callback),
  setState: patch => { writes++; state = { ...state, ...patch }; subscribers.forEach(callback => callback()); },
};
const parent = { postMessage: (data, origin) => messages.push({ data: JSON.parse(JSON.stringify(data)), origin }) };
const window = { addEventListener: (type, callback) => { listeners[type] = callback; } };
new vm.Script(source.replace('__ATLAS_SVM_FILES__', JSON.stringify(files))).runInNewContext({
  window, parent, location: { origin: 'http://localhost:8080' },
  setInterval: callback => { timer = callback; return 1; }, clearInterval: () => {},
});
const send = (data, source = parent, origin = 'http://localhost:8080') => listeners.message({ source, origin, data });
const input = { type: 'atlas-svm-set', files, view: 'chart2d', sliceGray: 34, sliceNits: 100,
  sliceMode: 'gray', terrainView: 'top', layout: 'sideBySide', denoise: true };
send(input);
assert.equal(writes, 0);
window.__svm = { store }; timer();
assert.equal(messages.length, 0);
state.ready = true; subscribers.forEach(callback => callback());
assert.equal(writes, 2);
assert.equal(state.tab, 'chart2d'); assert.equal(state.view, 'top');
assert.equal(state.activeId, `bundled:${files[0]}`); assert.equal(state.compareId, `bundled:${files[1]}`);
assert.equal(state.hiddenIds.length, 0); assert.equal(state.compareExtraIds.length, 0);
assert.equal(state.maxNits, 500);
assert.equal(state.overlays.title, false); assert.equal(state.overlays.values, false);
assert.equal(state.overlays.axes, true); assert.equal(state.overlays.colorbar, true); assert.equal(state.overlays.contours, true);
assert.equal(messages.at(-1).data.type, 'atlas-svm-ready');
for (const bad of [
  { ...input, files: ['../attack.json'] }, { ...input, files: [files[0], files[0]] },
  { ...input, files: [] }, { ...input, files: [...files, files[0]] },
  { ...input, view: 'invalid' }, { ...input, terrainView: 'invalid' },
  { ...input, sliceGray: NaN }, { ...input, sliceGray: 256 },
  { ...input, sliceNits: 0 }, { ...input, sliceNits: Infinity },
  { ...input, denoise: 1 }, { ...input, layout: 'invalid' },
  { ...input, sliceMode: 'invalid' }, { ...input, hiddenIds: [] },
]) send(bad);
assert.equal(writes, 2);
const before = messages.length;
send(input, {}, 'http://localhost:8080');
send(input, parent, 'https://untrusted.example');
assert.equal(writes, 2); assert.equal(messages.length, before);
send({ type: 'atlas-svm-set', files: [files[1]], view: 'stats', denoise: false });
assert.equal(writes, 3); assert.equal(state.tab, 'stats'); assert.equal(state.layout, 'single');
assert.equal(state.compareId, null); assert.equal(state.denoise, false);
assert.equal(state.hiddenIds[0], `bundled:${files[0]}`);
assert.ok(messages.every(message => message.origin === 'http://localhost:8080'));
console.log('Bridge verified: pending/ready, two-device/single-device state changes, invalid payload rejection, parent/origin isolation.');
