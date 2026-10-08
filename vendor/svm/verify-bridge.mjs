import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = await fs.readFile(new URL('./bridge.js', import.meta.url), 'utf8');
const files = ['iPhone17ProMax.json', 'huawei_mate80rs.json'];
const otherFiles = ['xiaomi18promax_adaptive_pro_off.json', 'huawei_mate70air.json'];
const allFiles = [...files, ...otherFiles];
const messages = [], listeners = {}, listenerOptions = {}, subscribers = [];
let timer, writes = 0;
let state = { ready: false, records: allFiles.map(file => ({ id: `bundled:${file}` })), tab: 'scene3d' };
const store = {
  getState: () => state,
  subscribe: callback => subscribers.push(callback),
  setState: patch => { const previous = state; writes++; state = { ...state, ...patch }; subscribers.forEach(callback => callback(state, previous)); },
};
const parent = { postMessage: (data, origin) => messages.push({ data: JSON.parse(JSON.stringify(data)), origin }) };
const window = { addEventListener: (type, callback, options) => { listeners[type] = callback; listenerOptions[type] = options; } };
new vm.Script(source.replace('__ATLAS_SVM_FILES__', JSON.stringify(allFiles))).runInNewContext({
  window, parent, location: { origin: 'http://localhost:8080' },
  setInterval: callback => { timer = callback; return 1; }, clearInterval: () => {},
});
assert.equal(listenerOptions.keydown, true); assert.equal(listenerOptions.keyup, true);
const keyboard = (type, key, options = {}) => {
  let prevented = false, stopped = false;
  listeners[type]({key, code:key === ' ' ? 'Space' : '', target:{closest:() => options.control ? {} : null},
    preventDefault:() => {prevented=true;}, stopImmediatePropagation:() => {stopped=true;}, ...options});
  return {prevented,stopped};
};
for (const key of ['1','2','3','t','T','f','h','r',' ']) assert.deepEqual(keyboard('keydown',key),{prevented:true,stopped:true});
for (const key of ['r','1',' ']) assert.deepEqual(keyboard('keydown',key,{control:true}),{prevented:false,stopped:true});
assert.deepEqual(keyboard('keyup',' ',{control:true}),{prevented:false,stopped:true});
for (const key of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown','Enter']) {
  assert.deepEqual(keyboard('keydown',key,{control:true}),{prevented:false,stopped:false});
}
for (const modifier of ['ctrlKey','metaKey','altKey','isComposing']) assert.deepEqual(keyboard('keydown','r',{[modifier]:true}),{prevented:false,stopped:false});
assert.deepEqual(keyboard('keydown','R',{shiftKey:true}),{prevented:false,stopped:false});
assert.deepEqual(keyboard('keyup','r'),{prevented:false,stopped:false});
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
assert.equal(state.clipLowGray, true);
assert.equal(state.overlays.title, false); assert.equal(state.overlays.values, false);
assert.equal(state.overlays.axes, true); assert.equal(state.overlays.colorbar, true); assert.equal(state.overlays.contours, true);
assert.equal(messages.at(-1).data.type, 'atlas-svm-ready');
assert.equal(state.records.length, 2);
send({ ...input, files: otherFiles });
assert.deepEqual(Array.from(state.records, record => record.id), otherFiles.map(file => `bundled:${file}`));
send(input);
assert.deepEqual(Array.from(state.records, record => record.id), files.map(file => `bundled:${file}`));
for (const bad of [
  { ...input, files: ['../attack.json'] }, { ...input, files: [files[0], files[0]] },
  { ...input, files: [] }, { ...input, files: [...files, files[0]] },
  { ...input, view: 'invalid' }, { ...input, terrainView: 'invalid' },
  { ...input, sliceGray: NaN }, { ...input, sliceGray: 256 }, { ...input, sliceGray: 14 }, { ...input, sliceGray: 0 },
  { ...input, sliceNits: 0 }, { ...input, sliceNits: 501 }, { ...input, sliceNits: Infinity },
  { ...input, denoise: 1 }, { ...input, layout: 'invalid' },
  { ...input, sliceMode: 'invalid' }, { ...input, hiddenIds: [] },
]) send(bad);
assert.equal(writes, 4);
const before = messages.length;
send(input, {}, 'http://localhost:8080');
send(input, parent, 'https://untrusted.example');
assert.equal(writes, 4); assert.equal(messages.length, before);
send({ type: 'atlas-svm-set', files: [files[1]], view: 'stats', denoise: false });
assert.equal(writes, 5); assert.equal(state.tab, 'stats'); assert.equal(state.layout, 'single');
assert.equal(state.compareId, null); assert.equal(state.denoise, false);
assert.equal(state.hiddenIds.length, 0); assert.equal(state.records.length, 1);
assert.ok(!messages.some(message => message.data.type === 'atlas-svm-change'));
store.setState({ tab: 'chart2d', sliceMode: 'gray', sliceGray: 127 });
assert.equal(messages.at(-1).data.type, 'atlas-svm-change');
assert.equal(messages.at(-1).data.sliceGray, 127);
store.setState({ sliceGray: 32 });
assert.equal(messages.at(-1).data.sliceGray, 32);
assert.ok(messages.every(message => message.origin === 'http://localhost:8080'));
assert.equal(window.indexedDB, undefined);
window.localStorage.setItem('probe', 'value'); assert.equal(window.localStorage.getItem('probe'), null);
const frames = [], uiListeners = {}, uiSubscribers = [];
let mounted = false, expanded = 0, marked = false, observer;
let uiState = { ready: true, records: allFiles.map(file => ({id:`bundled:${file}`})), tab:'scene3d' };
const uiStore = {
  getState: () => uiState, subscribe: callback => uiSubscribers.push(callback),
  setState: patch => { const previous = uiState; uiState = {...uiState, ...patch}; uiSubscribers.forEach(callback => callback(uiState, previous)); },
};
const body = {querySelector: () => ({parentElement:{setAttribute: name => {assert.equal(name,'data-atlas-gray-control');marked=true;}}})};
const doc = {
  documentElement:{dataset:{}}, getElementById: () => ({}),
  querySelector: selector => selector === '[data-testid="inspector-chart2d"]' ? (mounted ? body : null) : {click: () => {expanded++;mounted=true;observer();}},
};
new vm.Script(source.replace('__ATLAS_SVM_FILES__', JSON.stringify(allFiles))).runInNewContext({
  window:{__svm:{store:uiStore},addEventListener:(type,callback)=>{uiListeners[type]=callback;}}, parent,
  location:{origin:'http://localhost:8080'}, document:doc,
  requestAnimationFrame:callback=>frames.push(callback),
  MutationObserver:class {constructor(callback){observer=callback;}observe(){}},
});
uiListeners.message({source:parent,origin:'http://localhost:8080',data:{...input,view:'chart2d',sliceMode:'gray',sliceGray:127}});
while (frames.length) frames.shift()();
assert.equal(expanded,1); assert.equal(marked,true);
assert.equal(doc.documentElement.dataset.atlasSvmView,'chart2d'); assert.equal(uiState.sliceGray,127);
console.log('Bridge verified: shell shortcuts blocked, native control defaults/modifier keys retained, record switching, selected-only legends, origin/storage isolation, native gray changes without echoes.');
