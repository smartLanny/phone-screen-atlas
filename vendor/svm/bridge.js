(() => {
  'use strict';
  const files = new Set(__ATLAS_SVM_FILES__);
  const views = ['scene3d', 'chart2d', 'stats'];
  const keys = new Set(['type', 'files', 'view', 'sliceGray', 'sliceNits', 'sliceMode', 'terrainView', 'layout', 'denoise']);
  let store;
  let pending;
  let announced = false;
  const send = (data) => parent.postMessage(data, location.origin);
  const fail = (message) => send({ type: 'atlas-svm-error', message });
  const inRange = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  function valid(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.type !== 'atlas-svm-set') return false;
    if (Object.keys(data).some(key => !keys.has(key))) return false;
    if (!Array.isArray(data.files) || data.files.length < 1 || data.files.length > 2) return false;
    if (data.files.some(file => typeof file !== 'string' || !files.has(file)) || new Set(data.files).size !== data.files.length) return false;
    for (const [key, values] of [
      ['view', views], ['sliceMode', ['gray', 'brightness']],
      ['terrainView', ['perspective', 'top', 'front', 'side']], ['layout', ['single', 'sideBySide', 'diff']],
    ]) if (key in data && !values.includes(data[key])) return false;
    if ('sliceGray' in data && !inRange(data.sliceGray, 0, 255)) return false;
    if ('sliceNits' in data && !inRange(data.sliceNits, 0.01, 100000)) return false;
    if ('denoise' in data && typeof data.denoise !== 'boolean') return false;
    return true;
  }
  function apply(data) {
    const state = store.getState();
    const ids = data.files.map(file => `bundled:${file}`);
    if (ids.some(id => !state.records.some(record => record.id === id))) {
      fail('Requested bundled record is unavailable.');
      return;
    }
    const next = {
      activeId: ids[0], compareId: ids[1] ?? null, compareExtraIds: [],
      hiddenIds: state.records.filter(record => !ids.includes(record.id)).map(record => record.id),
      layout: ids.length === 1 ? 'single' : (data.layout ?? 'sideBySide'),
      presenting: false,
      maxNits: 500,
      overlays: { ...state.overlays, values: false, title: false, axes: true, colorbar: true, contours: true },
    };
    if ('view' in data) next.tab = data.view;
    if ('terrainView' in data) next.view = data.terrainView;
    for (const key of ['sliceGray', 'sliceNits', 'sliceMode', 'denoise']) if (key in data) next[key] = data[key];
    store.setState(next);
    send({ type: 'atlas-svm-applied', files: data.files, view: store.getState().tab });
  }
  function ready() {
    if (!store.getState().ready || announced) return;
    announced = true;
    store.setState({
      tab: 'scene3d', view: 'top', maxNits: 500,
      overlays: { ...store.getState().overlays, values: false, title: false, axes: true, colorbar: true, contours: true },
    });
    if (pending) { const data = pending; pending = undefined; apply(data); }
    send({ type: 'atlas-svm-ready', files: [...files], views });
  }
  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== location.origin) return;
    if (!event.data || event.data.type !== 'atlas-svm-set') return;
    if (!valid(event.data)) { fail('Invalid atlas-svm-set payload.'); return; }
    if (!store || !store.getState().ready) pending = event.data;
    else apply(event.data);
  });
  let attempts = 0;
  function connect() {
    const candidate = window.__svm?.store;
    if (!candidate) return false;
    store = candidate;
    store.subscribe(ready);
    ready();
    return true;
  }
  if (!connect()) {
    const timer = setInterval(() => {
      if (connect()) clearInterval(timer);
      else if (++attempts >= 1500) { clearInterval(timer); fail('Original SVM store did not initialize.'); }
    }, 20);
  }
})();
