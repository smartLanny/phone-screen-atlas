(() => {
  'use strict';
  // The original module is deferred; keep this iframe ephemeral before its bootstrap reads storage.
  Object.defineProperties(window, {
    indexedDB: { value: undefined, configurable: true },
    localStorage: { value: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, configurable: true },
  });
  const shellKeys = new Set(['1', '2', '3', 't', 'f', 'h', 'r']);
  function blockShellShortcut(event, keyup = false) {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    const space = event.code === 'Space' || event.key === ' ';
    if (keyup ? !space : (!space && (event.shiftKey || !shellKeys.has(event.key.toLowerCase())))) return;
    const control = event.target?.closest?.('input, textarea, select, button, a[href], [role="slider"], [role="button"], [contenteditable]:not([contenteditable="false"])');
    // Native controls keep their default key behavior; the original shell must not also receive Space keyup.
    if (!control) event.preventDefault();
    event.stopImmediatePropagation();
  }
  window.addEventListener('keydown', event => blockShellShortcut(event), true);
  window.addEventListener('keyup', event => blockShellShortcut(event, true), true);
  const files = new Set(__ATLAS_SVM_FILES__);
  const views = ['scene3d', 'chart2d', 'stats'];
  const keys = new Set(['type', 'files', 'view', 'sliceGray', 'sliceNits', 'sliceMode', 'terrainView', 'layout', 'denoise']);
  let store;
  let originalRecords;
  let pending;
  let announced = false;
  let applying = false;
  let domScheduled = false;
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
    if ('sliceNits' in data && !inRange(data.sliceNits, 0.01, 500)) return false;
    if ('denoise' in data && typeof data.denoise !== 'boolean') return false;
    return true;
  }
  function apply(data) {
    const state = store.getState();
    const ids = data.files.map(file => `bundled:${file}`);
    if (ids.some(id => !originalRecords.has(id))) {
      fail('Requested bundled record is unavailable.');
      return;
    }
    const next = {
      activeId: ids[0], compareId: ids[1] ?? null, compareExtraIds: [],
      records: ids.map(id => originalRecords.get(id)), hiddenIds: [],
      layout: ids.length === 1 ? 'single' : (data.layout ?? 'sideBySide'),
      presenting: false,
      maxNits: 500,
      overlays: { ...state.overlays, values: false, title: false, axes: true, colorbar: true, contours: true },
    };
    if ('view' in data) next.tab = data.view;
    if ('terrainView' in data) next.view = data.terrainView;
    for (const key of ['sliceGray', 'sliceNits', 'sliceMode', 'denoise']) if (key in data) next[key] = data[key];
    applying = true;
    try { store.setState(next); } finally { applying = false; }
    scheduleDOM();
    send({ type: 'atlas-svm-applied', files: data.files, view: store.getState().tab });
  }
  function ready() {
    if (!store.getState().ready || announced) return;
    announced = true;
    originalRecords = new Map(store.getState().records.map(record => [record.id, record]));
    applying = true;
    try {
      store.setState({
        tab: 'scene3d', view: 'top', maxNits: 500,
        overlays: { ...store.getState().overlays, values: false, title: false, axes: true, colorbar: true, contours: true },
      });
    } finally { applying = false; }
    if (pending) { const data = pending; pending = undefined; apply(data); }
    send({ type: 'atlas-svm-ready', files: [...files], views });
  }
  function scheduleDOM() {
    if (domScheduled || typeof document === 'undefined') return;
    domScheduled = true;
    requestAnimationFrame(() => {
      domScheduled = false;
      const state = store?.getState();
      if (!state) return;
      document.documentElement.dataset.atlasSvmView = state.tab;
      if (state.tab !== 'chart2d') return;
      const body = document.querySelector('[data-testid="inspector-chart2d"]');
      if (!body) {
        document.querySelector('[data-testid="inspector-toggle"], [data-testid="inspector-expand"]')?.click();
        return;
      }
      const control = body.querySelector('section:first-child input[type="range"]')?.parentElement;
      if (control) control.setAttribute('data-atlas-gray-control', '');
    });
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
    store.subscribe((state, previous) => {
      ready();
      scheduleDOM();
      if (announced && !applying && previous && ['tab', 'sliceMode', 'sliceGray', 'sliceNits'].some(key => state[key] !== previous[key])) {
        send({ type: 'atlas-svm-change', view: state.tab, sliceMode: state.sliceMode, sliceGray: state.sliceGray, sliceNits: state.sliceNits });
      }
    });
    if (typeof document !== 'undefined') {
      new MutationObserver(scheduleDOM).observe(document.getElementById('root'), { childList: true, subtree: true });
    }
    ready();
    scheduleDOM();
    return true;
  }
  if (!connect()) {
    const timer = setInterval(() => {
      if (connect()) clearInterval(timer);
      else if (++attempts >= 1500) { clearInterval(timer); fail('Original SVM store did not initialize.'); }
    }, 20);
  }
})();
