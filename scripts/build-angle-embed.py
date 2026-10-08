from pathlib import Path


root = Path(__file__).resolve().parents[1] / 'vendor' / 'angle'
s = (root / 'app.js').read_text()


def replace_once(source, old, new):
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'expected one occurrence, found {count}: {old[:90]!r}')
    return source.replace(old, new, 1)


s = replace_once(
    s,
    "  'use strict';",
    "  'use strict';\n  let atlasConnected = false;\n  let atlasPhoneSlots = [];",
)
s = replace_once(
    s,
    "/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)",
    "e.target.closest('input,select,textarea,button,a[href],[role=button],[role=slider],[contenteditable=true]')",
)
s = replace_once(
    s,
    "  canvas.addEventListener('wheel', (e) => {\n    e.preventDefault();",
    "  canvas.addEventListener('wheel', (e) => {\n    if (window.ATLAS_EMBED) return;\n    e.preventDefault();",
)
s = replace_once(
    s,
    'function stageRect() {',
    '''function stageRect() {
    if (window.ATLAS_EMBED) {
      const stage = $('atlasGroups').getBoundingClientRect();
      return { x0: stage.left, x1: stage.right, top: stage.top, bottom: stage.bottom };
    }''',
)
s = replace_once(
    s,
    'function applyLayout() {',
    '''function applyLayout() {
    if (window.ATLAS_EMBED) {
      document.body.dataset.layout = 'embed';
      const controls = $('atlasControls');
      const section = $('secPad');
      if (section.parentElement !== controls) controls.appendChild(section);
      const shell = section.querySelector('.atlas-embed-shell');
      const heading = section.querySelector('.sec-head');
      const shared = shell.querySelector('.pad-side');
      const groups = $('atlasGroups');
      let toolbar = shell.querySelector('.atlas-shared-toolbar');
      if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.className = 'atlas-shared-toolbar';
      }
      toolbar.append(heading, shared);
      shell.append(groups, toolbar);
      if (padRead.parentElement !== $('atlasPadCard0')) $('atlasPadCard0').appendChild(padRead);
      atlasUpdateIdentity(activeIds());
      atlasReportHeight();
      return;
    }''',
)
s = replace_once(
    s,
    "const capH = (capEl.offsetHeight || (S.stereo ? 86 : sheet ? 64 : 76)) + 14;",
    "const capH = window.ATLAS_EMBED ? 0 : (capEl.offsetHeight || (S.stereo ? 86 : sheet ? 64 : 76)) + 14;",
)
s = replace_once(
    s,
    "const halfW = colMax / 2 - (S.stereo ? 10 : 16), halfH = avail / 2;",
    '''const embedRects = window.ATLAS_EMBED
      ? devs.map((_, i) => $('atlasPhoneView' + i).getBoundingClientRect()) : null;
    const halfW = embedRects
      ? Math.min(...embedRects.map((r) => r.width / 2)) - 7
      : colMax / 2 - (S.stereo ? 10 : 16);
    const halfH = embedRects
      ? Math.min(...embedRects.map((r) => r.height / 2)) - 6
      : avail / 2;''',
)
s = replace_once(
    s,
    '    for (let mag = 10; mag <= MAX_TILT; mag += 5) {',
    '    if (!window.ATLAS_EMBED) for (let mag = 10; mag <= MAX_TILT; mag += 5) {',
)
s = replace_once(
    s,
    '    let f = Math.max(fEnv, extent(flat) * 0.75);',
    '    let f = window.ATLAS_EMBED ? Math.min(extent(flat), extent(modelMatrix())) : Math.max(fEnv, extent(flat) * 0.75);',
)
s = replace_once(
    s,
    '    const centers = S.stereo\n      ? [areaX0 + areaW / 2 - (colW + gap) / 2, areaX0 + areaW / 2 + (colW + gap) / 2]\n      : devs.map((_, i) => areaX0 + (i + 0.5) * colW);',
    '''    const centers = embedRects
      ? embedRects.map((r) => r.left + r.width / 2)
      : S.stereo
        ? [areaX0 + areaW / 2 - (colW + gap) / 2, areaX0 + areaW / 2 + (colW + gap) / 2]
        : devs.map((_, i) => areaX0 + (i + 0.5) * colW);''',
)
s = replace_once(
    s,
    '''    views = devs.map((d, i) => ({
      dev: d, W, H, f, D, w: colW, x0: centers[i] - colW / 2, x1: centers[i] + colW / 2,
      cx: centers[i], cy, top: frameTop, bottomY,
      eye: eyePos(sides[i]), side: sides[i],
    }));''',
    '''    views = devs.map((d, i) => {
      const rect = embedRects?.[i];
      return {
        dev: d, W, H, f, D, w: rect?.width ?? colW,
        x0: rect?.left ?? centers[i] - colW / 2,
        x1: rect?.right ?? centers[i] + colW / 2,
        cx: centers[i], cy: rect ? rect.top + rect.height / 2 : cy,
        top: rect?.top ?? frameTop, bottomY: rect?.bottom ?? bottomY,
        eye: eyePos(sides[i]), side: sides[i],
      };
    });''',
)
s = replace_once(
    s,
    "    document.documentElement.style.setProperty('--sx', ((areaX0 + areaW / 2) / W * 100).toFixed(1) + '%');\n    $('hint').style.left = areaX0 + areaW / 2 + 'px';",
    "    const stageCenter = embedRects ? embedRects.reduce((n, r) => n + r.left + r.width / 2, 0) / embedRects.length : areaX0 + areaW / 2;\n    document.documentElement.style.setProperty('--sx', (stageCenter / W * 100).toFixed(1) + '%');\n    $('hint').style.left = stageCenter + 'px';",
)
s = replace_once(
    s,
    '''  const pad = Viz.createPad($('pad'), {
    maxTheta: MAX_TILT,
    onInput(theta, psi) { stopSweep(); setView(theta, psi); },
    onHover(h) { padHover = h; updatePadRead(); },
  });
  let padHover = null;''',
    '''  let padHover = null;
  const pad = Viz.createPad($('pad'), {
    maxTheta: MAX_TILT,
    onInput(theta, psi) { stopSweep(); setView(theta, psi); },
    onHover(h) { padHover = h; updatePadRead(); },
  });
  const atlasPad1 = Viz.createPad($('atlasPad1'), {
    maxTheta: MAX_TILT,
    onInput(theta, psi) { stopSweep(); setView(theta, psi); },
    onHover(h) { padHover = h; updatePadRead(); },
  });''',
)
read_start = s.index('  function updatePadRead() {')
read_end = s.index('\n  function updatePad(M)', read_start)
s = s[:read_start] + '''  function updatePadRead() {
    const h = padHover || { theta: S.theta, psi: S.psi };
    const where = h.theta < 0.5 ? '正对' : `${Math.round(h.theta)}° ${Viz.dirName(h.psi)}`;
    activeIds().forEach((id, i) => {
      const g = getGrid(id), mf = metricFmt[S.padMetric];
      const v = g[S.padMetric](h.theta, h.psi + S.rot);
      const slot = atlasPhoneSlots[i] ?? i;
      const key = S.compare ? `<span class="key" data-slot="${slot}"></span>` : '';
      const readout = i === 0 ? padRead : $('atlasPadRead1');
      readout.innerHTML = `${key}<span class="dim">${padHover ? '指针处' : '当前'}</span> ${where} · <b>${mf.fmt(v)}</b>`;
    });
  }
''' + s[read_end:]
pad_start = s.index('  function updatePad(M) {')
pad_end = s.index('\n  // ---------- 曲线', pad_start)
s = s[:pad_start] + '''  function updatePad(M) {
    activeIds().forEach((id, i) => {
      const directionPad = i === 0 ? pad : atlasPad1;
      const m = getModel(id), g = getGrid(id), mf = metricFmt[S.padMetric];
      directionPad.setField(`${id}|${S.padMetric}|${S.pal}`, (th, psi) => mf.t(g[S.padMetric](th, psi)), { pal: S.pal, levels: mf.levels });
      const spokes = m.lines.filter((l) => !l.virtual).map((l) => l.psi);
      const hatch = [];
      m.lines.forEach((l, j) => {
        const n = m.lines[(j + 1) % m.lines.length];
        if (l.virtual || n.virtual) hatch.push([l.psi, l.psi + (AngleModel.norm360(n.psi - l.psi) || 360)]);
      });
      let eyes = null;
      if (S.stereo) {
        eyes = [-1, 1].map((side) => {
          const a = anglesOf(applyT(M, eyePos(side)));
          return [a.theta, a.psi - S.rot];
        });
      }
      directionPad.update({ theta: S.theta, psi: S.psi, rot: S.rot, spokes, hatch, eyes });
    });
    $('padRamp').style.background = Viz.paletteCSS(S.pal, metricFmt[S.padMetric].levels, false);
    $('padTicks').innerHTML = metricFmt[S.padMetric].ticks.map((t) => `<span>${t}</span>`).join('');
    updatePadRead();
  }
''' + s[pad_end:]
s = s.replace('pad.draw(); charts.render();', 'pad.draw(); atlasPad1.draw(); charts.render();')
s = replace_once(s, "ro.observe($('pad'));", "ro.observe($('pad')); ro.observe($('atlasPad1'));")
s = replace_once(
    s,
    '    computeViews(ids.map((id) => dev(byId(id).device)));',
    '    if (window.ATLAS_EMBED) atlasUpdateIdentity(ids);\n    computeViews(ids.map((id) => dev(byId(id).device)));',
)
s = s.replace(
    "    syncThetaChips();\n    requestRender();",
    "    syncThetaChips();\n    requestRender();\n    atlasNotify();",
)
s = replace_once(
    s,
    "if (appMode === 'scene') return;",
    "if (appMode === 'scene' || (window.ATLAS_EMBED && /^[pPhH]$/.test(e.key))) return;",
)

bridge = '''
  function atlasNotify() {
    if (atlasConnected) parent.postMessage({ type: 'atlas-angle-change', theta: S.theta, psi: S.psi, padMetric: S.padMetric, pal: S.pal }, location.origin);
  }
  function atlasUpdateIdentity(ids) {
    if (!window.ATLAS_EMBED) return;
    document.body.dataset.count = String(ids.length);
    document.body.dataset.compare = String(ids.length > 1);
    ids.forEach((id, i) => {
      const profile = byId(id), slot = atlasPhoneSlots[i] ?? i;
      const group = $('atlasGroup' + i), toggle = $('atlasPrivacy' + i);
      group.hidden = false;
      group.dataset.slot = String(slot);
      const displayDevice = profile.device.replace(/ GH3$/, '');
      toggle.setAttribute('aria-label', `${displayDevice}防窥状态`);
      $(i === 0 ? 'pad' : 'atlasPad1').setAttribute('aria-label', `${displayDevice}观看方向：拖动设置眼睛相对屏幕的位置`);
      const off = variant(profile.device, false), on = variant(profile.device, true);
      toggle.hidden = !off || !on;
      if (off && on) {
        const onLabel = on.privacyKind === 'film' ? '防窥膜' : '防窥模式';
        toggle.querySelector('[data-atlas-privacy="0"]').textContent = '默认';
        toggle.querySelector('[data-atlas-privacy="1"]').textContent = onLabel;
        toggle.querySelectorAll('[data-atlas-privacy]').forEach((button) => {
          const selected = button.dataset.atlasPrivacy === String(+profile.privacy);
          button.classList.toggle('on', selected);
          button.setAttribute('aria-pressed', String(selected));
        });
      }
    });
    for (let i = ids.length; i < 2; i++) $('atlasGroup' + i).hidden = true;
    atlasReportHeight();
  }
  function atlasReportHeight() {
    if (!window.ATLAS_EMBED) return;
    requestAnimationFrame(() => {
      const controls = $('atlasControls');
      const height = Math.ceil(controls.getBoundingClientRect().bottom + window.scrollY + 8);
      if (height > 0 && height !== atlasLastHeight) {
        atlasLastHeight = height;
        parent.postMessage({ type: 'atlas-angle-height', height }, location.origin);
      }
    });
  }
  let atlasLastHeight = 0;
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-atlas-privacy]');
    if (!button || !atlasConnected) return;
    const index = Number(button.dataset.atlasSlot), id = activeIds()[index], profile = byId(id);
    if (!profile || !hasPrivacy(profile.device)) return;
    parent.postMessage({
      type: 'atlas-angle-privacy', device: profile.device,
      privacy: button.dataset.atlasPrivacy === '1',
    }, location.origin);
  });
  S.clean = true;
  document.body.classList.add('clean');
  $('padMetric').addEventListener('click', atlasNotify);
  $('palette').addEventListener('change', atlasNotify);
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== parent) return;
    if (event.data?.type === 'atlas-angle-pause') { stopSweep(); cancelAnimationFrame(anim); anim = null; return; }
    if (event.data?.type !== 'atlas-angle-set') return;
    const data = event.data;
    if (!Array.isArray(data.profiles) || !Number.isFinite(data.theta) || !Number.isFinite(data.psi)) return;
    const ids = data.profiles.filter((id) => typeof id === 'string' && byId(id)).slice(0, 2);
    if (!ids.length) return;
    stopSweep(); cancelAnimationFrame(anim); anim = null;
    atlasConnected = true;
    atlasPhoneSlots = Array.isArray(data.phoneSlots)
      ? ids.map((_, i) => data.phoneSlots[i] === 1 ? 1 : 0)
      : ids.map((_, i) => i);
    S.device = byId(ids[0]).device;
    S.privacy = byId(ids[0]).privacy;
    S.compare = ids.length === 2;
    S.slots = ids.length === 2 ? ids : [ids[0], ids[0]];
    S.stereo = false;
    S.dist = 300;
    S.colors['小米 18 Pro Max'] = 'blue';
    S.colors['iPhone 18 Pro Max GH3'] = 'silver';
    if (data.padMetric === 'lum' || data.padMetric === 'jncd') S.padMetric = data.padMetric;
    if (typeof data.pal === 'string' && Object.hasOwn(Viz.PALETTES, data.pal)) S.pal = data.pal;
    syncSeg('padMetric', S.padMetric);
    syncProfileUI();
    loadPattern(data.pattern === 'dark' ? 'dark' : 'ui');
    setView(data.theta, data.psi);
    resize();
    atlasReportHeight();
  });
  window.addEventListener('resize', atlasReportHeight);
  if ('ResizeObserver' in window) {
    const atlasObserver = new ResizeObserver(atlasReportHeight);
    atlasObserver.observe($('atlasControls'));
  }
  window.addEventListener('wheel', (event) => event.stopImmediatePropagation(), { capture: true });
  parent.postMessage({ type: 'atlas-angle-ready' }, location.origin);
  atlasReportHeight();
'''
s = s.rsplit('})();', 1)[0] + bridge + '})();\n'
(root / 'embed-app.js').write_text(s)

html = (root / 'index.html').read_text()
pad_start = html.index('      <div class="pad-grid">')
pad_end = html.index('      </div>\n    </section>', pad_start) + len('      </div>')
side_start = html.index('        <div class="pad-side">', pad_start)
side_end = html.index('        </div>\n      </div>\n    </section>', side_start) + len('        </div>')
side = html[side_start:side_end]
embed_layout = f'''      <div class="atlas-embed-shell">
{side}
        <div class="atlas-groups" id="atlasGroups">
          <div class="atlas-device-group" id="atlasGroup0">
            <div class="atlas-phone-slot" id="atlasPhoneSlot0">
              <div class="atlas-phone-view" id="atlasPhoneView0"></div>
              <div class="seg atlas-privacy-toggle" id="atlasPrivacy0" role="group" aria-label="防窥状态">
                <button type="button" data-atlas-slot="0" data-atlas-privacy="0" aria-pressed="true">默认</button>
                <button type="button" data-atlas-slot="0" data-atlas-privacy="1" aria-pressed="false">防窥模式</button>
              </div>
            </div>
            <div class="pad-wrap atlas-pad-card" id="atlasPadCard0">
              <canvas id="pad" aria-label="观看方向：拖动设置眼睛相对屏幕的位置"></canvas>
            </div>
          </div>
          <div class="atlas-device-group" id="atlasGroup1">
            <div class="atlas-phone-slot" id="atlasPhoneSlot1">
              <div class="atlas-phone-view" id="atlasPhoneView1"></div>
              <div class="seg atlas-privacy-toggle" id="atlasPrivacy1" role="group" aria-label="防窥状态">
                <button type="button" data-atlas-slot="1" data-atlas-privacy="0" aria-pressed="true">默认</button>
                <button type="button" data-atlas-slot="1" data-atlas-privacy="1" aria-pressed="false">防窥模式</button>
              </div>
            </div>
            <div class="pad-wrap atlas-pad-card" id="atlasPadCard1">
              <canvas id="atlasPad1" aria-label="观看方向：拖动设置眼睛相对屏幕的位置"></canvas>
              <div class="pad-read" id="atlasPadRead1"></div>
            </div>
          </div>
        </div>
      </div>'''
html = html[:pad_start] + embed_layout + html[pad_end:]
html = replace_once(
    html,
    '<link rel="stylesheet" href="style.css?v=15">',
    '<link rel="stylesheet" href="style.css?v=15">\n<link rel="stylesheet" href="embed-style.css?v=20261008-angle5">\n<script>window.ATLAS_EMBED=true;</script>',
)
html = replace_once(
    html,
    '<script src="app.js?v=16"></script>',
    '<aside id="atlasControls" aria-label="可视角度与观看方向"></aside><script src="embed-app.js?v=20261008-angle5"></script>',
)
(root / 'embed.html').write_text(html)
