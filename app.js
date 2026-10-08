const PHONES=[
  {id:'xiaomi-18-pro-max',name:'小米 18 Pro Max',angleDevice:'小米 18 Pro Max'},
  {id:'iphone-18-pro-max',name:'iPhone 18 Pro Max',panel:'GH3',angleDevice:'iPhone 18 Pro Max GH3'},
  {id:'iphone-17-pro-max',name:'iPhone 17 Pro Max'},
  {id:'xiaomi-17-ultra',name:'小米 17 Ultra 徕卡'},
  {id:'huawei-mate-80-rs',name:'华为 Mate 80 RS'},
  {id:'huawei-mate-70-air',name:'华为 Mate 70 Air'},
];
const defaults=()=>({phone:PHONES[0].id,compare:'',tab:'overview',theta:45,psi:0,pattern:'ui',modes:{},privacy:{},terrainView:'top'});
const state=defaults();
const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let records=[],urlTimer,toastTimer;
const narrow=matchMedia('(max-width:700px)');
const selected=()=>[state.phone,state.compare].filter(Boolean).map((id,slot)=>({phone:PHONES.find(p=>p.id===id),slot}));
const optionsFor=phone=>records.filter(r=>r.device===phone.name);
const currentRecord=phone=>optionsFor(phone).find(r=>r.file===state.modes[phone.id])||optionsFor(phone)[0];
const angleEntries=()=>selected().filter(({phone})=>phone.angleDevice).map(entry=>({...entry,profile:ANG_DATA.profiles.find(p=>p.device===entry.phone.angleDevice&&p.privacy===!!state.privacy[entry.phone.id])}));
const privacyName=(phone,on)=>phone.id==='iphone-18-pro-max'?(on?'防窥膜':'默认'):(on?'防窥模式':'默认');
function readUrl(){
  Object.assign(state,defaults());const q=new URLSearchParams(location.search);
  if(PHONES.some(p=>p.id===q.get('phone')))state.phone=q.get('phone');
  if(PHONES.some(p=>p.id===q.get('compare'))&&q.get('compare')!==state.phone)state.compare=q.get('compare');
  if(['overview','flicker','angle'].includes(q.get('view')))state.tab=q.get('view');
  if(q.has('angle')&&Number.isFinite(+q.get('angle')))state.theta=Math.min(70,Math.max(0,+q.get('angle')));
  if(q.has('direction')&&Number.isFinite(+q.get('direction')))state.psi=((+q.get('direction')%360)+360)%360;
  if(q.get('pattern')==='dark')state.pattern='dark';
  if(['perspective','top','front','side'].includes(q.get('terrain')))state.terrainView=q.get('terrain');
  for(const phone of PHONES){const mode=q.get(`mode-${phone.id}`);if(optionsFor(phone).some(r=>r.file===mode))state.modes[phone.id]=mode;state.privacy[phone.id]=q.get(`privacy-${phone.id}`)==='1';}
}
function writeUrl(){
  const q=new URLSearchParams({phone:state.phone,view:state.tab});
  if(state.compare)q.set('compare',state.compare);
  if(state.theta!==45)q.set('angle',Number(state.theta.toFixed(1)));
  if(state.psi!==0)q.set('direction',Number(state.psi.toFixed(1)));
  if(state.pattern!=='ui')q.set('pattern',state.pattern);
  if(state.terrainView!=='top')q.set('terrain',state.terrainView);
  for(const {phone}of selected()){
    if(state.modes[phone.id]&&state.modes[phone.id]!==optionsFor(phone)[0].file)q.set(`mode-${phone.id}`,state.modes[phone.id]);
    if(state.privacy[phone.id])q.set(`privacy-${phone.id}`,'1');
  }
  history.replaceState(null,'',`${location.pathname}?${q}`);
}
function renderSelection(){
  $('selection').classList.toggle('comparing',!!state.compare);
  $('selection').innerHTML=selected().map(({phone,slot},i)=>`${i?'<span class="vs">VS</span>':''}<div class="phone-select ${slot?'secondary':''}"><label class="select-label" for="phone-${slot}">${slot?'对比手机':'查看手机'}${phone.panel?`<span class="panel-label">${phone.panel}</span>`:''}</label><select id="phone-${slot}" data-phone="${slot}" aria-label="${slot?'对比手机':'查看手机'}">${PHONES.map(p=>`<option value="${p.id}" ${p.id===phone.id?'selected':''} ${p.id===(slot?state.phone:state.compare)?'disabled':''}>${esc(p.name)}</option>`).join('')}</select><div class="availability"><span>频闪</span><span class="${phone.angleDevice?'':'missing'}">${phone.angleDevice?'可视角':'可视角待测'}</span></div></div>`).join('')+(state.compare?'<button class="remove-compare" data-action="remove-compare" aria-label="移除对比手机">移除 ×</button>':'<button class="compare-button" data-action="add-compare">＋ 添加对比</button>');
}
function legend(entries=selected()){return `<div class="mini-legend">${entries.map(({phone,slot})=>`<span class="legend-item"><i class="legend-key" style="background:${slot?'var(--orange)':'var(--blue)'}"></i>${esc(phone.name)}</span>`).join('')}</div>`;}
function modeButtons(){return selected().map(({phone,slot})=>`<div class="mode-buttons ${slot?'secondary':''}"><span class="mode-phone">${esc(phone.name)}</span><div class="segmented" aria-label="${esc(phone.name)}频闪模式">${optionsFor(phone).map(r=>`<button data-mode-phone="${phone.id}" data-mode-file="${r.file}" class="${r.file===currentRecord(phone).file?'active':''}" aria-pressed="${r.file===currentRecord(phone).file}">${esc(r.mode)}</button>`).join('')}</div></div>`).join('');}
function privacyButtons(){return angleEntries().map(({phone,slot})=>`<div class="mode-buttons ${slot?'secondary':''}"><span class="mode-phone">${esc(phone.name)}</span><div class="segmented" aria-label="${esc(phone.name)}防窥状态">${[false,true].map(on=>`<button data-privacy-phone="${phone.id}" data-privacy="${+on}" class="${!!state.privacy[phone.id]===on?'active':''}" aria-pressed="${!!state.privacy[phone.id]===on}">${privacyName(phone,on)}</button>`).join('')}</div></div>`).join('');}
function svmFrame(){
  if(narrow.matches&&state.compare)return `<div class="svm-frames split">${selected().map(({phone,slot})=>`<section class="svm-single"><h3>${esc(phone.name)}</h3><iframe data-svm-frame data-slot="${slot}" src="vendor/svm/embed.html" title="${esc(phone.name)} 原版 SVM 热力图"></iframe></section>`).join('')}</div>`;
  return '<div class="svm-frames"><iframe id="svmFrame" data-svm-frame data-slot="all" src="vendor/svm/embed.html" title="原版 SVM 彩色热力图与频闪可视化"></iframe></div>';
}
function angleFrame(){return '<iframe id="angleFrame" src="vendor/angle/embed.html" title="原版可视角仿真，可拖动旋转"></iframe>';}
function emptyAngle(){return '<div class="empty"><h3>暂无可视角数据</h3><button data-action="choose-angle-phone">查看已测机型</button></div>';}
function renderOverview(){
  const entries=angleEntries();
  return `<div class="overview-grid"><article class="result-card"><div class="card-head"><div class="card-title"><h2>频闪</h2><span>SVM</span></div><div class="segmented compact"><button data-terrain="top" class="${state.terrainView==='top'?'active':''}" aria-pressed="${state.terrainView==='top'}">热力图</button><button data-terrain="perspective" class="${state.terrainView==='perspective'?'active':''}" aria-pressed="${state.terrainView==='perspective'}">立体</button></div></div><div class="card-modes">${modeButtons()}</div><div class="card-stage ${narrow.matches&&state.compare?'split-stage':''}">${svmFrame()}</div><div class="card-bottom">${legend()}<button class="card-link" data-tab="flicker">展开 ↗</button></div></article><article class="result-card"><div class="card-head"><div class="card-title"><h2>可视角</h2></div><button class="text-button" data-action="angle-reset" title="回到正视">回正 ↺</button></div>${entries.length?`<div class="card-modes">${privacyButtons()}</div><div class="card-stage angle-preview">${angleFrame()}<div class="stage-caption" id="previewAngle">${Math.round(state.theta)}°</div></div>`:emptyAngle()}<div class="card-bottom">${legend(entries)}<button class="card-link" data-tab="angle">展开 ↗</button></div></article></div>`;
}
function renderFlicker(){
  return `<div class="detail"><div class="detail-toolbar"><div class="segmented" aria-label="频闪视图">${[['top','热力图'],['perspective','立体']].map(([view,label])=>`<button data-terrain="${view}" class="${state.terrainView===view?'active':''}" aria-pressed="${state.terrainView===view}">${label}</button>`).join('')}</div><span class="quiet-label" title="固定显示白场档位亮度小于等于500 nits的部分">≤ 500 nits</span></div><div class="detail-modes">${modeButtons()}</div><div class="svm-stage ${narrow.matches&&state.compare?'split-stage':''}">${svmFrame()}</div></div>`;
}
function angleControls(){return `<div class="angle-control"><div class="range-label"><label for="angleSlider">观看角度</label><b id="angleValue">${Math.round(state.theta)}°</b></div><input id="angleSlider" type="range" min="0" max="70" step="1" value="${state.theta}" aria-label="观看角度"><div class="quick-angles">${[0,30,45,60,70].map(t=>`<button data-theta="${t}" class="${Math.abs(state.theta-t)<.5?'active':''}">${t}°</button>`).join('')}</div><div class="segmented" aria-label="观看方向">${[[180,'左侧'],[0,'右侧'],[90,'上方'],[270,'下方']].map(([psi,name])=>`<button data-psi="${psi}" class="${Math.abs(state.psi-psi)<.5?'active':''}" aria-pressed="${Math.abs(state.psi-psi)<.5}">${name}</button>`).join('')}</div></div>`;}
function renderAngle(){
  const entries=angleEntries(),missing=selected().filter(e=>!e.phone.angleDevice);
  if(!entries.length)return emptyAngle();
  return `<div class="detail"><div class="detail-toolbar"><div class="segmented" aria-label="屏幕内容"><button data-pattern="ui" class="${state.pattern==='ui'?'active':''}" aria-pressed="${state.pattern==='ui'}">浅色画面</button><button data-pattern="dark" class="${state.pattern==='dark'?'active':''}" aria-pressed="${state.pattern==='dark'}">深色画面</button></div><button class="text-button" data-action="angle-reset" title="回到正视">回正 ↺</button></div>${missing.length?`<div class="missing-note">${missing.map(e=>esc(e.phone.name)).join('、')} · 可视角待测</div>`:''}<div class="detail-modes">${privacyButtons()}</div><div class="angle-body"><div class="angle-stage">${angleFrame()}</div><aside class="angle-side" aria-label="观看控制">${angleControls()}</aside></div></div>`;
}
function render(){
  renderSelection();document.querySelectorAll('.tabs [data-tab]').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===state.tab?'page':'false'));
  $('results').innerHTML=state.tab==='overview'?renderOverview():state.tab==='flicker'?renderFlicker():renderAngle();
  $('angleFrame')?.addEventListener('load',sendAngleState);document.querySelectorAll('[data-svm-frame]').forEach(frame=>frame.addEventListener('load',()=>sendSvmState(frame)));writeUrl();
}
function sendAngleState(){$('angleFrame')?.contentWindow?.postMessage({type:'atlas-angle-set',profiles:angleEntries().map(e=>e.profile.id),theta:state.theta,psi:state.psi,pattern:state.pattern},location.origin);}
function sendSvmState(target){
  for(const frame of target?[target]:document.querySelectorAll('[data-svm-frame]')){
    const phones=frame.dataset.slot==='all'?selected():selected().filter(e=>e.slot===+frame.dataset.slot);
    frame.contentWindow?.postMessage({type:'atlas-svm-set',files:phones.map(({phone})=>currentRecord(phone).file),view:'scene3d',terrainView:state.terrainView,layout:phones.length>1?'sideBySide':'single',denoise:true},location.origin);
  }
}
function updateAngle(send=true){
  if($('angleValue'))$('angleValue').textContent=`${Math.round(state.theta)}°`;
  if($('previewAngle'))$('previewAngle').textContent=`${Math.round(state.theta)}°`;
  if($('angleSlider'))$('angleSlider').value=state.theta;
  document.querySelectorAll('[data-theta]').forEach(b=>b.classList.toggle('active',Math.abs(+b.dataset.theta-state.theta)<.5));
  document.querySelectorAll('[data-psi]').forEach(b=>{const on=Math.abs(+b.dataset.psi-state.psi)<.5;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});
  if(send)sendAngleState();clearTimeout(urlTimer);urlTimer=setTimeout(writeUrl,250);
}
function updateButtons(selector,key,value){document.querySelectorAll(selector).forEach(b=>{const on=b.dataset[key]===String(value);b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2200);}
document.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.action==='info'){$('infoDialog').showModal();return;}
  if(b.dataset.action==='close-info'){$('infoDialog').close();return;}
  if(b.dataset.action==='share'){writeUrl();try{await navigator.clipboard.writeText(location.href);toast('链接已复制');}catch{toast('复制地址栏即可分享');}return;}
  if(b.dataset.tab){state.tab=b.dataset.tab;render();}
  else if(b.dataset.action==='add-compare'){state.compare=PHONES.find(p=>p.id!==state.phone&&p.angleDevice)?.id||PHONES.find(p=>p.id!==state.phone).id;render();}
  else if(b.dataset.action==='remove-compare'){state.compare='';render();}
  else if(b.dataset.action==='choose-angle-phone'){state.phone=PHONES[0].id;if(state.compare===state.phone)state.compare='';render();}
  else if(b.dataset.action==='angle-reset'){state.theta=0;updateAngle();}
  else if(b.dataset.modeFile){state.modes[b.dataset.modePhone]=b.dataset.modeFile;updateButtons(`[data-mode-phone="${b.dataset.modePhone}"]`,'modeFile',b.dataset.modeFile);sendSvmState();writeUrl();}
  else if(b.dataset.privacyPhone){state.privacy[b.dataset.privacyPhone]=b.dataset.privacy==='1';updateButtons(`[data-privacy-phone="${b.dataset.privacyPhone}"]`,'privacy',b.dataset.privacy);sendAngleState();writeUrl();}
  else if(b.dataset.terrain){state.terrainView=b.dataset.terrain;updateButtons('[data-terrain]','terrain',state.terrainView);sendSvmState();writeUrl();}
  else if(b.dataset.theta!==undefined){state.theta=+b.dataset.theta;updateAngle();}
  else if(b.dataset.psi!==undefined){state.psi=+b.dataset.psi;updateAngle();}
  else if(b.dataset.pattern){state.pattern=b.dataset.pattern;updateButtons('[data-pattern]','pattern',state.pattern);sendAngleState();writeUrl();}
});
document.addEventListener('change',event=>{if(event.target.dataset.phone!==undefined){state[event.target.dataset.phone==='0'?'phone':'compare']=event.target.value;render();}});
document.addEventListener('input',event=>{if(event.target.id==='angleSlider'){state.theta=+event.target.value;updateAngle();}});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin)return;
  if(event.source===$('angleFrame')?.contentWindow){if(event.data?.type==='atlas-angle-ready')sendAngleState();if(event.data?.type==='atlas-angle-change'&&Number.isFinite(event.data.theta)&&Number.isFinite(event.data.psi)){state.theta=Math.min(70,Math.max(0,event.data.theta));state.psi=((event.data.psi%360)+360)%360;updateAngle(false);}}
  const svmFrame=[...document.querySelectorAll('[data-svm-frame]')].find(frame=>frame.contentWindow===event.source);
  if(svmFrame&&event.data?.type==='atlas-svm-ready')sendSvmState(svmFrame);
});
window.addEventListener('popstate',()=>{readUrl();render();});
narrow.addEventListener('change',()=>{if(records.length)render();});
$('infoDialog').addEventListener('click',event=>{if(event.target===$('infoDialog'))$('infoDialog').close();});
async function init(){try{const response=await fetch('data/svm/index.json');if(!response.ok)throw new Error('数据索引读取失败');records=(await response.json()).records;readUrl();render();}catch(error){console.error(error);$('results').innerHTML='<div class="error">数据载入失败，请刷新页面。</div>';}}
init();
