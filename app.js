const PHONES=[
  {id:'xiaomi-18-pro-max',name:'小米 18 Pro Max',angleDevice:'小米 18 Pro Max'},
  {id:'iphone-18-pro-max',name:'iPhone 18 Pro Max',panel:'GH3',angleDevice:'iPhone 18 Pro Max GH3'},
  {id:'iphone-17-pro-max',name:'iPhone 17 Pro Max'},
  {id:'xiaomi-17-ultra',name:'小米 17 Ultra 徕卡'},
  {id:'huawei-mate-90-pro-max',name:'华为 Mate 90 Pro Max 典藏版',angleDevice:'华为 Mate 90 Pro Max 典藏版'},
  {id:'huawei-mate-80-rs',name:'华为 Mate 80 RS'},
  {id:'huawei-mate-70-air',name:'华为 Mate 70 Air'},
];
const defaults=()=>({phone:PHONES[0].id,compare:'',theta:45,psi:0,pattern:'ui',modes:{},privacy:{},terrainView:'top',svmTab:'scene3d',sliceGray:255,padMetric:'lum',pal:'jet'});
const state=defaults();
const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const narrow=matchMedia('(max-width:700px)');
let records=[],urlTimer,toastTimer;
const selected=()=>[state.phone,state.compare].filter(Boolean).map((id,slot)=>({phone:PHONES.find(p=>p.id===id),slot}));
const optionsFor=phone=>records.filter(r=>r.device===phone.name);
const svmEntries=()=>selected().filter(({phone})=>optionsFor(phone).length);
const hasPrivacy=phone=>ANG_DATA.profiles.some(p=>p.device===phone.angleDevice&&p.privacy);
const currentRecord=phone=>optionsFor(phone).find(r=>r.file===state.modes[phone.id])||optionsFor(phone)[0];
const angleEntries=()=>selected().filter(({phone})=>phone.angleDevice).map(entry=>({...entry,profile:ANG_DATA.profiles.find(p=>p.device===entry.phone.angleDevice&&p.privacy===!!state.privacy[entry.phone.id])}));
const privacyName=(phone,on)=>phone.id==='iphone-18-pro-max'?(on?'防窥膜':'默认'):(on?'防窥模式':'默认');
const splitSvm=()=>narrow.matches&&svmEntries().length>1&&state.svmTab==='scene3d';
function readUrl(){
  Object.assign(state,defaults());const q=new URLSearchParams(location.search);
  if(PHONES.some(p=>p.id===q.get('phone')))state.phone=q.get('phone');
  if(PHONES.some(p=>p.id===q.get('compare'))&&q.get('compare')!==state.phone)state.compare=q.get('compare');
  if(q.has('angle')&&Number.isFinite(+q.get('angle')))state.theta=Math.min(70,Math.max(0,+q.get('angle')));
  if(q.has('direction')&&Number.isFinite(+q.get('direction')))state.psi=((+q.get('direction')%360)+360)%360;
  if(q.get('pattern')==='dark')state.pattern='dark';
  if(['perspective','top'].includes(q.get('terrain')))state.terrainView=q.get('terrain');
  if(q.get('svm')==='chart2d')state.svmTab='chart2d';
  if(q.has('gray')&&Number.isFinite(+q.get('gray')))state.sliceGray=Math.min(255,Math.max(0,+q.get('gray')));
  if(q.get('metric')==='jncd')state.padMetric='jncd';
  if(['jet','band','turbo','mono'].includes(q.get('pal')))state.pal=q.get('pal');
  for(const phone of PHONES){const mode=q.get(`mode-${phone.id}`);if(optionsFor(phone).some(r=>r.file===mode))state.modes[phone.id]=mode;state.privacy[phone.id]=q.get(`privacy-${phone.id}`)==='1'&&hasPrivacy(phone);}
}
function writeUrl(){
  const q=new URLSearchParams({phone:state.phone});
  if(state.compare)q.set('compare',state.compare);
  if(state.theta!==45)q.set('angle',Number(state.theta.toFixed(1)));
  if(state.psi!==0)q.set('direction',Number(state.psi.toFixed(1)));
  if(state.pattern!=='ui')q.set('pattern',state.pattern);
  if(state.terrainView!=='top')q.set('terrain',state.terrainView);
  if(state.svmTab!=='scene3d')q.set('svm',state.svmTab);
  if(state.sliceGray!==255)q.set('gray',state.sliceGray);
  if(state.padMetric!=='lum')q.set('metric',state.padMetric);
  if(state.pal!=='jet')q.set('pal',state.pal);
  for(const {phone}of selected()){
    if(state.modes[phone.id]&&state.modes[phone.id]!==optionsFor(phone)[0].file)q.set(`mode-${phone.id}`,state.modes[phone.id]);
    if(state.privacy[phone.id])q.set(`privacy-${phone.id}`,'1');
  }
  history.replaceState(null,'',`${location.pathname}?${q}${location.hash}`);
}
function renderSelection(){
  $('selection').classList.toggle('comparing',!!state.compare);
  $('selection').innerHTML=selected().map(({phone,slot},i)=>`${i?'<span class="vs">VS</span>':''}<div class="phone-select ${slot?'secondary':''}"><label class="select-label" for="phone-${slot}">${slot?'对比手机':'查看手机'}${phone.panel?`<span class="panel-label">${phone.panel}</span>`:''}</label><select id="phone-${slot}" data-phone="${slot}" aria-label="${slot?'对比手机':'查看手机'}">${PHONES.map(p=>`<option value="${p.id}" ${p.id===phone.id?'selected':''} ${p.id===(slot?state.phone:state.compare)?'disabled':''}>${esc(p.name)}</option>`).join('')}</select><div class="availability"><span class="${optionsFor(phone).length?'':'missing'}">${optionsFor(phone).length?'频闪':'频闪待补充'}</span><span class="${phone.angleDevice?'':'missing'}">${phone.angleDevice?'可视角':'可视角待测'}</span></div></div>`).join('')+(state.compare?'<button class="remove-compare" data-action="remove-compare" aria-label="移除对比手机">移除 ×</button>':'<button class="compare-button" data-action="add-compare">＋ 添加对比</button>');
}
function modeButtons(){return svmEntries().map(({phone,slot})=>`<div class="mode-buttons ${slot?'secondary':''}"><span class="mode-phone">${esc(phone.name)}</span><div class="segmented" aria-label="${esc(phone.name)}频闪模式">${optionsFor(phone).map(r=>`<button data-mode-phone="${phone.id}" data-mode-file="${r.file}" class="${r.file===currentRecord(phone).file?'active':''}" aria-pressed="${r.file===currentRecord(phone).file}">${esc(r.mode)}</button>`).join('')}</div></div>`).join('');}
function privacyButtons(){return angleEntries().filter(({phone})=>hasPrivacy(phone)).map(({phone,slot})=>`<div class="mode-buttons ${slot?'secondary':''}"><span class="mode-phone">${esc(phone.name)}</span><div class="segmented" aria-label="${esc(phone.name)}防窥状态">${[false,true].map(on=>`<button data-privacy-phone="${phone.id}" data-privacy="${+on}" class="${!!state.privacy[phone.id]===on?'active':''}" aria-pressed="${!!state.privacy[phone.id]===on}">${privacyName(phone,on)}</button>`).join('')}</div></div>`).join('');}
function svmFrame(){
  if(splitSvm())return `<div class="svm-frames split">${svmEntries().map(({phone,slot})=>`<section class="svm-single"><h3>${esc(phone.name)}</h3><iframe data-svm-frame data-slot="${slot}" src="vendor/svm/embed.html?v=20261008-mate90" title="${esc(phone.name)} 原版 SVM 热力图"></iframe></section>`).join('')}</div>`;
  return '<div class="svm-frames"><iframe id="svmFrame" data-svm-frame data-slot="all" src="vendor/svm/embed.html?v=20261008-mate90" title="原版 SVM 可视化"></iframe></div>';
}
function renderAngle(){
  const entries=angleEntries(),missing=selected().filter(e=>!e.phone.angleDevice);
  return `<section class="section-block" id="viewing-angle" aria-labelledby="angleTitle"><div class="section-heading"><h2 id="angleTitle">可视角</h2><div class="heading-actions">${entries.length?`<div class="segmented" aria-label="屏幕内容"><button data-pattern="ui" class="${state.pattern==='ui'?'active':''}" aria-pressed="${state.pattern==='ui'}">浅色画面</button><button data-pattern="dark" class="${state.pattern==='dark'?'active':''}" aria-pressed="${state.pattern==='dark'}">深色画面</button></div><button class="text-button" data-action="angle-reset" title="回到正视">回正 ↺</button>`:''}</div></div>${entries.length?`<div class="section-modes">${privacyButtons()}</div>${missing.length?`<div class="missing-note">${missing.map(e=>esc(e.phone.name)).join('、')} · 可视角待测</div>`:''}<div class="angle-stage ${entries.length===2?'comparing':''}"><iframe id="angleFrame" src="vendor/angle/embed.html?v=20261008-mate90" title="原版可视角仿真与观看方向热力图"></iframe></div>`:'<div class="empty"><h3>暂无可视角数据</h3><button data-action="choose-angle-phone">查看已测机型</button></div>'}</section>`;
}
function renderFlicker(){
  const entries=svmEntries(),missing=selected().filter(({phone})=>!optionsFor(phone).length);
  return `<section class="section-block" id="flicker" aria-labelledby="flickerTitle"><div class="section-heading"><h2 id="flickerTitle">频闪</h2><div class="heading-actions">${entries.length?`<div class="segmented" aria-label="频闪视图">${[['top','热力图'],['perspective','立体'],['chart2d','二维曲线']].map(([view,label])=>`<button data-svm-view="${view}" class="${(view==='chart2d'?state.svmTab==='chart2d':state.svmTab==='scene3d'&&state.terrainView===view)?'active':''}" aria-pressed="${view==='chart2d'?state.svmTab==='chart2d':state.svmTab==='scene3d'&&state.terrainView===view}">${label}</button>`).join('')}</div><span class="quiet-label" title="固定显示≤500 nits部分">≤ 500 nits</span>`:''}</div></div>${entries.length?`<div class="section-modes">${modeButtons()}</div>${missing.length?`<div class="missing-note">${missing.map(({phone})=>esc(phone.name)).join('、')} · 频闪待补充</div>`:''}<div id="svmHost" class="svm-stage ${splitSvm()?'split-stage':''}">${svmFrame()}</div>`:'<div class="empty"><h3>暂无频闪数据</h3></div>'}</section>`;
}
function wireSvmFrames(){document.querySelectorAll('[data-svm-frame]').forEach(frame=>frame.addEventListener('load',()=>sendSvmState(frame)));}
function render(){
  renderSelection();$('results').innerHTML=renderAngle()+renderFlicker();
  $('angleFrame')?.addEventListener('load',sendAngleState);wireSvmFrames();writeUrl();
}
function sendAngleState(){$('angleFrame')?.contentWindow?.postMessage({type:'atlas-angle-set',profiles:angleEntries().map(e=>e.profile.id),theta:state.theta,psi:state.psi,pattern:state.pattern,padMetric:state.padMetric,pal:state.pal},location.origin);}
function sendSvmState(target){
  for(const frame of target?[target]:document.querySelectorAll('[data-svm-frame]')){
    const phones=frame.dataset.slot==='all'?svmEntries():svmEntries().filter(e=>e.slot===+frame.dataset.slot);
    frame.contentWindow?.postMessage({type:'atlas-svm-set',files:phones.map(({phone})=>currentRecord(phone).file),view:state.svmTab,terrainView:state.terrainView,sliceMode:'gray',sliceGray:state.sliceGray,layout:phones.length>1?'sideBySide':'single',denoise:true},location.origin);
  }
}
function updateButtons(selector,key,value){document.querySelectorAll(selector).forEach(b=>{const on=b.dataset[key]===String(value);b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2200);}
document.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.action==='info'){$('infoDialog').showModal();return;}
  if(b.dataset.action==='close-info'){$('infoDialog').close();return;}
  if(b.dataset.action==='share'){writeUrl();try{await navigator.clipboard.writeText(location.href);toast('链接已复制');}catch{toast('复制地址栏即可分享');}return;}
  if(b.dataset.action==='add-compare'){state.compare=PHONES.find(p=>p.id!==state.phone&&p.angleDevice)?.id||PHONES.find(p=>p.id!==state.phone).id;render();}
  else if(b.dataset.action==='remove-compare'){state.compare='';render();}
  else if(b.dataset.action==='choose-angle-phone'){state.phone=PHONES[0].id;if(state.compare===state.phone)state.compare='';render();}
  else if(b.dataset.action==='angle-reset'){state.theta=0;sendAngleState();writeUrl();}
  else if(b.dataset.modeFile){state.modes[b.dataset.modePhone]=b.dataset.modeFile;updateButtons(`[data-mode-phone="${b.dataset.modePhone}"]`,'modeFile',b.dataset.modeFile);sendSvmState();writeUrl();}
  else if(b.dataset.privacyPhone){state.privacy[b.dataset.privacyPhone]=b.dataset.privacy==='1';updateButtons(`[data-privacy-phone="${b.dataset.privacyPhone}"]`,'privacy',b.dataset.privacy);sendAngleState();writeUrl();}
  else if(b.dataset.svmView){
    const wasSplit=splitSvm();state.svmTab=b.dataset.svmView==='chart2d'?'chart2d':'scene3d';if(state.svmTab==='scene3d')state.terrainView=b.dataset.svmView;
    document.querySelectorAll('[data-svm-view]').forEach(button=>{const active=button.dataset.svmView===(state.svmTab==='chart2d'?'chart2d':state.terrainView);button.classList.toggle('active',active);button.setAttribute('aria-pressed',active);});
    if(wasSplit!==splitSvm()){$('svmHost').classList.toggle('split-stage',splitSvm());$('svmHost').innerHTML=svmFrame();wireSvmFrames();}else sendSvmState();writeUrl();
  }
  else if(b.dataset.pattern){state.pattern=b.dataset.pattern;updateButtons('[data-pattern]','pattern',state.pattern);sendAngleState();writeUrl();}
});
document.addEventListener('change',event=>{if(event.target.dataset.phone!==undefined){state[event.target.dataset.phone==='0'?'phone':'compare']=event.target.value;render();}});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin)return;
  if(event.source===$('angleFrame')?.contentWindow){
    if(event.data?.type==='atlas-angle-ready')sendAngleState();
    if(event.data?.type==='atlas-angle-change'&&Number.isFinite(event.data.theta)&&Number.isFinite(event.data.psi)){
      state.theta=Math.min(70,Math.max(0,event.data.theta));state.psi=((event.data.psi%360)+360)%360;
      if(['lum','jncd'].includes(event.data.padMetric))state.padMetric=event.data.padMetric;
      if(typeof event.data.pal==='string')state.pal=event.data.pal;
      clearTimeout(urlTimer);urlTimer=setTimeout(writeUrl,250);
    }
  }
  const frame=[...document.querySelectorAll('[data-svm-frame]')].find(f=>f.contentWindow===event.source);
  if(frame&&event.data?.type==='atlas-svm-ready')sendSvmState(frame);
  if(frame&&event.data?.type==='atlas-svm-change'&&Number.isFinite(event.data.sliceGray)){state.sliceGray=Math.min(255,Math.max(0,event.data.sliceGray));clearTimeout(urlTimer);urlTimer=setTimeout(writeUrl,250);}
});
window.addEventListener('popstate',()=>{readUrl();render();});
narrow.addEventListener('change',()=>{if(records.length)render();});
$('infoDialog').addEventListener('click',event=>{if(event.target===$('infoDialog'))$('infoDialog').close();});
async function init(){try{const response=await fetch('data/svm/index.json');if(!response.ok)throw new Error('数据索引读取失败');records=(await response.json()).records;readUrl();render();}catch(error){console.error(error);$('results').innerHTML='<div class="error">数据载入失败，请刷新页面。</div>';}}
init();
