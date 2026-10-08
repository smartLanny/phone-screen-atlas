from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'vendor' / 'angle'
s = (root / 'app.js').read_text()
s = s.replace("  'use strict';", "  'use strict';\n  let atlasConnected = false;", 1)
s = s.replace('function stageRect() {', '''function stageRect() {
    if (window.ATLAS_EMBED) {
      const controls = $('atlasControls').getBoundingClientRect();
      return controls.top > 0
        ? {x0:8, x1:canvas.clientWidth-8, top:12, bottom:controls.top-48}
        : {x0:8, x1:controls.left-12, top:12, bottom:canvas.clientHeight-48};
    }''')
s = s.replace('function applyLayout() {', '''function applyLayout() {
    if (window.ATLAS_EMBED) {
      document.body.dataset.layout = 'embed';
      const controls = $('atlasControls');
      if ($('secPad').parentElement !== controls) controls.appendChild($('secPad'));
      return;
    }''')
s = s.replace("const capH = (capEl.offsetHeight || (S.stereo ? 86 : sheet ? 64 : 76)) + 14;", "const capH = window.ATLAS_EMBED ? 0 : (capEl.offsetHeight || (S.stereo ? 86 : sheet ? 64 : 76)) + 14;")
s = s.replace('    syncThetaChips();\n    requestRender();', "    syncThetaChips();\n    requestRender();\n    atlasNotify();")
s = s.replace("if (appMode === 'scene') return;", "if (appMode === 'scene' || (window.ATLAS_EMBED && /^[pPhH]$/.test(e.key))) return;")
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
css = '''<style>
html,body {background:radial-gradient(ellipse at 35% 45%,#1d222c 0%,#101319 70%) !important;}
body > *:not(#gl):not(#atlasControls):not(#atlasWatermark):not(script):not(style) {display:none !important;}
#gl {outline:none;}
#atlasControls {position:absolute;right:0;top:0;bottom:0;width:320px;z-index:2;background:#11151c;border-left:1px solid #272d39;overflow:auto;}
#atlasControls #secPad {display:block !important;padding:20px 18px;border:0;}
#atlasControls #pad {max-width:280px;}
#atlasControls .pad-read {font-size:11px;}
#atlasControls .mini-select {font-size:10px;}
#atlasControls .angle-row .chips button {font-size:10px;padding:5px 7px;}
#atlasWatermark {position:absolute;left:20px;bottom:16px;z-index:1;color:#9aa6ba;opacity:.25;font-size:18px;letter-spacing:2px;pointer-events:none;user-select:none;}
@media(max-width:700px){
 #atlasControls {left:0;right:0;top:360px;bottom:0;width:auto;border-left:0;border-top:1px solid #272d39;}
 #atlasControls #secPad {padding:16px 18px;max-width:380px;margin:auto;}
 #atlasControls #pad {max-width:270px;}
 #atlasWatermark {top:329px;bottom:auto;left:17px;font-size:15px;}
}
</style><script>window.ATLAS_EMBED=true;</script></head>'''
html = html.replace('</head>', css)
html = html.replace('<script src="app.js?v=15"></script>', '<aside id="atlasControls" aria-label="原版观看方向"></aside><div id="atlasWatermark" aria-hidden="true">野生的装机宅</div><script src="embed-app.js?v=20261008-pad"></script>')
assert 'id="atlasControls"' in html
(root / 'embed.html').write_text(html)
