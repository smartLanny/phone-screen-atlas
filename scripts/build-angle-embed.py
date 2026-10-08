from pathlib import Path
root=Path(__file__).resolve().parents[1]/'vendor'/'angle'
s=(root/'app.js').read_text()
s=s.replace("  'use strict';", "  'use strict';\n  let atlasConnected = false;",1)
s=s.replace('function stageRect() {','function stageRect() {\n    if (window.ATLAS_EMBED) return { x0: 8, x1: canvas.clientWidth - 8, top: 12, bottom: canvas.clientHeight - 12 };')
s=s.replace("const capH = (capEl.offsetHeight || (S.stereo ? 86 : sheet ? 64 : 76)) + 14;", "const capH = window.ATLAS_EMBED ? 0 : (capEl.offsetHeight || (S.stereo ? 86 : sheet ? 64 : 76)) + 14;")
s=s.replace('    syncThetaChips();\n    requestRender();', "    syncThetaChips();\n    requestRender();\n    if (window.ATLAS_EMBED && atlasConnected) parent.postMessage({type:'atlas-angle-change',theta:S.theta,psi:S.psi},location.origin);")
bridge='''
  // Bridge added by Screen Atlas. Original optical model and WebGL shaders are retained.
  S.clean = true;
  document.body.classList.add('clean');
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'atlas-angle-set') return;
    const data = event.data;
    atlasConnected = true;
    const ids = data.profiles.filter((id) => byId(id)).slice(0, 2);
    if (!ids.length) return;
    S.device = byId(ids[0]).device;
    S.privacy = byId(ids[0]).privacy;
    S.compare = ids.length === 2;
    S.slots = ids.length === 2 ? ids : [ids[0], ids[0]];
    S.stereo = false;
    S.dist = 300;
    S.colors['小米 18 Pro Max'] = 'blue';
    S.colors['iPhone 18 Pro Max GH3'] = 'silver';
    syncProfileUI();
    loadPattern(data.pattern || 'ui');
    setView(data.theta, data.psi);
    resize();
  });
  window.addEventListener('wheel', (e) => e.stopImmediatePropagation(), {capture:true});
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') return;
    e.stopImmediatePropagation();
  }, {capture:true});
  parent.postMessage({type:'atlas-angle-ready'}, location.origin);
'''
s=s.rsplit('})();',1)[0]+bridge+'})();\n'
(root/'embed-app.js').write_text(s)
html=(root/'index.html').read_text().replace('<meta name="color-scheme" content="dark">','<meta name="color-scheme" content="light">')
html=html.replace('</head>','''<style>
html,body { background:radial-gradient(ellipse at 50% 45%,#1d222c 0%,#101319 70%) !important; }
body > *:not(#gl):not(script):not(style) { display:none !important; }
#gl { outline:none; }
</style><script>window.ATLAS_EMBED=true;</script></head>''')
html=html.replace('src="app.js?v=15"','src="embed-app.js"')
(root/'embed.html').write_text(html)
