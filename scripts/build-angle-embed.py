from pathlib import Path
import re

root = Path(__file__).resolve().parents[1] / 'vendor' / 'angle'
s = (root / 'app.js').read_text()
s = s.replace("  'use strict';", "  'use strict';\n  let atlasConnected = false;", 1)
s = s.replace('function stageRect() {', '''function stageRect() {
    if (window.ATLAS_EMBED) {
      const controls = $('atlasControls').getBoundingClientRect();
      return controls.top > 0
        ? {x0:8, x1:canvas.clientWidth-8, top:42, bottom:controls.top-30}
        : {x0:8, x1:controls.left-12, top:42, bottom:canvas.clientHeight-30};
    }''')
s = s.replace('function applyLayout() {', '''function applyLayout() {
    if (window.ATLAS_EMBED) {
      document.body.dataset.layout = 'embed';
      const controls = $('atlasControls');
      if ($('secPad').parentElement !== controls) controls.appendChild($('secPad'));
      document.body.dataset.compare = String(S.compare);
      if (padRead.parentElement !== $('atlasPadCard0')) $('atlasPadCard0').appendChild(padRead);
      return;
    }''')
s = s.replace("const capH = (capEl.offsetHeight || (S.stereo ? 86 : sheet ? 64 : 76)) + 14;", "const capH = window.ATLAS_EMBED ? 0 : (capEl.offsetHeight || (S.stereo ? 86 : sheet ? 64 : 76)) + 14;")
s = s.replace("const halfW = colMax / 2 - (S.stereo ? 10 : 16), halfH = avail / 2;", "const halfW = colMax / 2 - (S.stereo ? 10 : (window.ATLAS_EMBED ? 8 : 16)), halfH = avail / 2;")
s = s.replace("let f = Math.max(fEnv, extent(flat) * 0.75);", "let f = window.ATLAS_EMBED ? Math.min(extent(flat), extent(modelMatrix())) : Math.max(fEnv, extent(flat) * 0.75);")
s = s.replace('    const envH = myE * f;', '    const envH = (window.ATLAS_EMBED ? span(modelMatrix())[1] : myE) * f;')
s = s.replace('    syncThetaChips();\n    requestRender();', "    syncThetaChips();\n    requestRender();\n    atlasNotify();")
s = s.replace("if (appMode === 'scene') return;", "if (appMode === 'scene' || (window.ATLAS_EMBED && /^[pPhH]$/.test(e.key))) return;")
s = s.replace('  let padHover = null;', """  let padHover = null;
  const atlasPad1 = Viz.createPad($('atlasPad1'), {
    maxTheta: MAX_TILT,
    onInput(theta, psi) { stopSweep(); setView(theta, psi); },
    onHover(h) { padHover = h; updatePadRead(); },
  });""")
start = s.index('  function updatePadRead() {')
end = s.index('\n  function updatePad(M)', start)
read = s[start:end]
read = read.replace('    const id = activeIds()[0],', '    activeIds().forEach((id, i) => {\n    const')
read = read.replace('SERIES[0]', 'SERIES[i]')
read = read.replace('padRead.innerHTML =', "(i === 0 ? padRead : $('atlasPadRead1')).innerHTML =")
read = read.rsplit('\n  }', 1)[0] + '\n    });\n  }\n'
s = s[:start] + read + s[end:]
start = s.index('  function updatePad(M) {')
end = s.index('\n  // ---------- 曲线', start)
update = s[start:end]
update = update.replace('    const id = activeIds()[0],', '    activeIds().forEach((id, i) => {\n    const directionPad = i === 0 ? pad : atlasPad1;\n    const profile = byId(id);\n    const mode = profile.privacy ? (profile.device.startsWith(\'iPhone\') ? \'防窥膜\' : \'防窥模式\') : \'默认\';\n    $(\'atlasPadLabel\' + i).textContent = profile.device.replace(\' GH3\', \'\') + \' · \' + mode;\n    $(i === 0 ? \'pad\' : \'atlasPad1\').setAttribute(\'aria-label\', profile.device + \'观看方向：拖动设置眼睛相对屏幕的位置\');\n    const')
update = update.replace('pad.setField(', 'directionPad.setField(').replace('pad.update(', 'directionPad.update(')
update = update.replace('    updatePadRead();', '    });\n    updatePadRead();')
s = s[:start] + update + s[end:]
s = s.replace('pad.draw(); charts.render();', 'pad.draw(); atlasPad1.draw(); charts.render();')
s = s.replace("ro.observe($('pad'));", "ro.observe($('pad')); ro.observe($('atlasPad1'));")
labels = '''  function updateAtlasPhoneLabels(ids, M) {
    const root = $('atlasPhoneLabels');
    while (root.children.length < ids.length) {
      const label = document.createElement('div');
      label.className = 'atlas-phone-label';
      root.appendChild(label);
    }
    while (root.children.length > ids.length) root.lastElementChild.remove();
    ids.forEach((id, i) => {
      const profile = byId(id), view = views[i], label = root.children[i];
      const mode = profile.privacy ? (profile.privacyKind === 'film' ? '贴防窥膜' : '防窥开启') : '默认';
      label.dataset.slot = String(i);
      label.textContent = `${profile.device.replace(' GH3', '')} · ${mode}`;
      label.style.left = `${view.cx}px`;
      const top = Math.min(...view.dev.corners.map(c => {
        const w = apply(M, c);
        return view.cy - view.f * w[1] / (view.D - w[2]);
      }));
      label.style.top = `${Math.max(label.getBoundingClientRect().height + 8, top - 8)}px`;
    });
  }
'''
s = s.replace('  function render() {', labels + '  function render() {', 1)
s = s.replace('    computeViews(ids.map((id) => dev(byId(id).device)));', '    computeViews(ids.map((id) => dev(byId(id).device)));\n    if (window.ATLAS_EMBED) updateAtlasPhoneLabels(ids, M);')
bridge = '''
  // Embed the original direction pad and its existing input handlers.
  function atlasNotify() {
    if (atlasConnected) parent.postMessage({type:'atlas-angle-change',theta:S.theta,psi:S.psi,padMetric:S.padMetric,pal:S.pal},location.origin);
  }
  S.clean = true;
  document.body.classList.add('clean');
  $('padMetric').addEventListener('click', atlasNotify);
  $('palette').addEventListener('change', atlasNotify);
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'atlas-angle-set') return;
    const data = event.data;
    if (!Array.isArray(data.profiles) || !Number.isFinite(data.theta) || !Number.isFinite(data.psi)) return;
    const ids = data.profiles.filter(id => typeof id === 'string' && byId(id)).slice(0,2);
    if (!ids.length) return;
    atlasConnected = true;
    S.device = byId(ids[0]).device;
    S.privacy = byId(ids[0]).privacy;
    S.compare = ids.length === 2;
    S.slots = ids.length === 2 ? ids : [ids[0],ids[0]];
    S.stereo = false;
    S.dist = 300;
    S.colors['小米 18 Pro Max'] = 'blue';
    S.colors['iPhone 18 Pro Max GH3'] = 'silver';
    if (data.padMetric === 'lum' || data.padMetric === 'jncd') S.padMetric = data.padMetric;
    if (typeof data.pal === 'string' && Object.hasOwn(Viz.PALETTES,data.pal)) S.pal = data.pal;
    syncSeg('padMetric', S.padMetric);
    syncProfileUI();
    loadPattern(data.pattern === 'dark' ? 'dark' : 'ui');
    setView(data.theta,data.psi);
    resize();
  });
  window.addEventListener('wheel', e => e.stopImmediatePropagation(), {capture:true});
  parent.postMessage({type:'atlas-angle-ready'},location.origin);
'''
s = s.rsplit('})();', 1)[0] + bridge + '})();\n'
(root / 'embed-app.js').write_text(s)
html = (root / 'index.html').read_text()
html = html.replace('<div class="pad-wrap">', '<div class="pad-wrap" id="atlasPadCard0"><h3 class="atlas-pad-label" id="atlasPadLabel0"></h3>', 1)
html = html.replace('<div class="pad-side">', '<div class="pad-wrap atlas-second" id="atlasPadCard1"><h3 class="atlas-pad-label" id="atlasPadLabel1"></h3><canvas id="atlasPad1"></canvas><div class="pad-read" id="atlasPadRead1"></div></div><div class="pad-side">', 1)
html = html.replace('<canvas id="gl" aria-label="手机屏幕可视角仿真画面"></canvas>', '<canvas id="gl" aria-label="手机屏幕可视角仿真画面"></canvas><div id="atlasPhoneLabels" aria-hidden="true"></div>')
css = '''<style>
html {background:#101319 !important;}
body {background:url(../../assets/watermark.svg) no-repeat left 20px bottom -102px / 400px 240px,radial-gradient(ellipse at 35% 45%,#1d222c 0%,#101319 70%) !important;}
body > *:not(#gl):not(#atlasControls):not(#atlasPhoneLabels):not(script):not(style) {display:none !important;}
#gl {outline:none;}
#atlasControls {position:absolute;right:0;top:0;bottom:0;width:320px;z-index:2;background:#11151c;border-left:1px solid #272d39;overflow:auto;}
#atlasPhoneLabels {position:fixed;inset:0;z-index:1;pointer-events:none;}
.atlas-phone-label {position:fixed;transform:translate(-50%,-100%);width:max-content;max-width:calc(100vw - 24px);padding:4px 8px;border:1px solid #343d4d;border-radius:6px;background:#171d27e8;color:#dce5f5;text-align:center;white-space:normal;font-size:11px;line-height:1.25;font-weight:550;box-shadow:0 2px 10px #0005;}
.atlas-phone-label[data-slot="1"] {border-color:#79583f;color:#f0c39e;}
body[data-compare="true"] .atlas-phone-label {max-width:calc(50vw - 16px);}
#atlasControls #secPad {display:block !important;padding:20px 18px;border:0;}
#atlasControls .pad-wrap {flex-direction:column;align-items:center;}
#atlasControls #pad,#atlasPad1 {display:block;width:100%;max-width:280px;aspect-ratio:1;touch-action:none;cursor:crosshair;}
.atlas-pad-label {margin:0 0 8px;font-size:12px;font-weight:500;color:#a8b3c5;}
#atlasPadCard1 {display:none;}
body[data-compare="true"] #atlasControls {width:560px;}
body[data-compare="true"] .pad-grid {display:grid;grid-template-columns:1fr 1fr;gap:0 12px;}
body[data-compare="true"] #atlasPadCard1 {display:flex;}
body[data-compare="true"] .pad-side {grid-column:1/-1;}
body[data-compare="true"] #atlasControls #pad,body[data-compare="true"] #atlasPad1 {max-width:260px;}
body[data-compare="true"] #atlasPadLabel1 {color:#d9a57e;}
body[data-compare="true"] #atlasPadLabel0 {color:#9aaeff;}
#atlasControls .pad-read {font-size:11px;}
#atlasControls .mini-select {font-size:10px;}
#atlasControls .angle-row .chips button {font-size:10px;padding:5px 7px;}
@media(min-width:701px) and (max-width:1100px){
 body[data-compare="true"] {background-position:0 222px,center !important;}
 #atlasControls {left:0;right:0;top:420px;width:auto;border-left:0;border-top:1px solid #272d39;}
}
@media(max-width:700px){
 body {background-position:0 222px,center !important;}
 #atlasControls {left:0;right:0;top:420px;bottom:0;width:auto;border-left:0;border-top:1px solid #272d39;}
 #atlasControls #secPad {padding:10px 12px;max-width:420px;margin:auto;}
 #atlasControls #pad {max-width:220px;}
 body[data-compare="true"] #atlasControls {width:auto;}
 body[data-compare="true"] .pad-grid {grid-template-columns:1fr;}
 body[data-compare="true"] #atlasControls #pad,body[data-compare="true"] #atlasPad1 {max-width:190px;}
 body[data-compare="true"] #atlasPadCard1 {margin-top:10px;}
}
</style><script>window.ATLAS_EMBED=true;</script></head>'''
html = html.replace('</head>', css)
html = re.sub(r'<script src="app\.js(?:\?[^" ]*)?">\s*</script>', '<aside id="atlasControls" aria-label="原版观看方向"></aside><script src="embed-app.js?v=20261008-mate90-layout2"></script>', html)
assert 'id="atlasControls"' in html
(root / 'embed.html').write_text(html)
