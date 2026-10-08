const PHONES=[
  {id:'xiaomi-18-pro-max',name:'小米 18 Pro Max',angleDevice:'小米 18 Pro Max'},
  {id:'iphone-18-pro-max',name:'iPhone 18 Pro Max',panel:'GH3',angleDevice:'iPhone 18 Pro Max GH3'},
  {id:'iphone-17-pro-max',name:'iPhone 17 Pro Max'},
  {id:'xiaomi-17-ultra',name:'小米 17 Ultra 徕卡'},
  {id:'huawei-mate-90-pro-max',name:'华为 Mate 90 Pro Max 典藏版',angleDevice:'华为 Mate 90 Pro Max 典藏版'},
  {id:'huawei-mate-80-rs',name:'华为 Mate 80 RS'},
  {id:'huawei-mate-70-air',name:'华为 Mate 70 Air'},
];
const defaults=()=>({phone:PHONES[0].id,compare:'',theta:0,psi:0,pattern:'ui',modes:{},privacy:{},terrainView:'top',svmTab:'scene3d',sliceGray:255,padMetric:'lum',pal:'jet',uniformityCondition:'300',uniformityMap:'luminance',reflectanceConditions:{}});
const state=defaults();
const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let records=[],uniformityPhones=[],reflectancePhones=[],urlTimer,toastTimer,urlPending=false,lastSearch=location.search;
const selected=()=>[state.phone,state.compare].filter(Boolean).map((id,slot)=>({phone:PHONES.find(p=>p.id===id),slot}));
const optionsFor=phone=>records.filter(r=>r.device===phone.name);
const svmEntries=()=>selected().filter(({phone})=>optionsFor(phone).length);
const hasUniformity=phone=>uniformityPhones.some(p=>p.id===phone.id);
const hasReflectance=phone=>reflectancePhones.some(p=>p.id===phone.id);
const hasPrivacy=phone=>ANG_DATA.profiles.some(p=>p.device===phone.angleDevice&&p.privacy);
const currentRecord=phone=>optionsFor(phone).find(r=>r.file===state.modes[phone.id])||optionsFor(phone)[0];
const angleEntries=()=>selected().filter(({phone})=>phone.angleDevice).map(entry=>({...entry,profile:ANG_DATA.profiles.find(p=>p.device===entry.phone.angleDevice&&p.privacy===!!state.privacy[entry.phone.id])}));
function readUrl(){
  Object.assign(state,defaults());const q=new URLSearchParams(location.search);
  if(PHONES.some(p=>p.id===q.get('phone')))state.phone=q.get('phone');
  if(PHONES.some(p=>p.id===q.get('compare'))&&q.get('compare')!==state.phone)state.compare=q.get('compare');
  if(q.has('angle')&&Number.isFinite(+q.get('angle')))state.theta=Math.min(70,Math.max(0,+q.get('angle')));
  if(q.has('direction')&&Number.isFinite(+q.get('direction')))state.psi=((+q.get('direction')%360)+360)%360;
  if(q.get('pattern')==='dark')state.pattern='dark';
  if(['perspective','top'].includes(q.get('terrain')))state.terrainView=q.get('terrain');
  if(q.get('svm')==='chart2d')state.svmTab='chart2d';
  if(q.has('gray')&&Number.isFinite(+q.get('gray')))state.sliceGray=Math.min(255,Math.max(15,+q.get('gray')));
  if(q.get('metric')==='jncd')state.padMetric='jncd';
  if(['jet','band','turbo','mono'].includes(q.get('pal')))state.pal=q.get('pal');
  if(uniformityPhones.some(p=>p.conditions.some(c=>c.id===q.get('uniformity'))))state.uniformityCondition=q.get('uniformity');
  if(q.get('uniformity-map')==='colorTemperature')state.uniformityMap='colorTemperature';
  for(const phone of reflectancePhones){const condition=q.get(`reflectance-${phone.id}`);if(phone.conditions.some(c=>c.id===condition))state.reflectanceConditions[phone.id]=condition;}
  for(const phone of PHONES){const mode=q.get(`mode-${phone.id}`);if(optionsFor(phone).some(r=>r.file===mode))state.modes[phone.id]=mode;state.privacy[phone.id]=q.get(`privacy-${phone.id}`)==='1'&&hasPrivacy(phone);}
}
function writeUrl(){
  clearTimeout(urlTimer);urlPending=false;
  const q=new URLSearchParams({phone:state.phone});
  if(state.compare)q.set('compare',state.compare);
  if(state.theta!==0)q.set('angle',Number(state.theta.toFixed(1)));
  if(state.psi!==0)q.set('direction',Number(state.psi.toFixed(1)));
  if(state.pattern!=='ui')q.set('pattern',state.pattern);
  if(state.terrainView!=='top')q.set('terrain',state.terrainView);
  if(state.svmTab!=='scene3d')q.set('svm',state.svmTab);
  if(state.sliceGray!==255)q.set('gray',state.sliceGray);
  if(state.padMetric!=='lum')q.set('metric',state.padMetric);
  if(state.pal!=='jet')q.set('pal',state.pal);
  if(state.uniformityCondition!=='300')q.set('uniformity',state.uniformityCondition);
  if(state.uniformityMap!=='luminance')q.set('uniformity-map',state.uniformityMap);
  for(const {phone}of selected()){
    if(state.modes[phone.id]&&state.modes[phone.id]!==optionsFor(phone)[0]?.file)q.set(`mode-${phone.id}`,state.modes[phone.id]);
    if(state.privacy[phone.id])q.set(`privacy-${phone.id}`,'1');
    const condition=state.reflectanceConditions[phone.id],source=reflectancePhones.find(p=>p.id===phone.id);
    if(condition&&condition!==source?.conditions[0]?.id)q.set(`reflectance-${phone.id}`,condition);
  }
  history.replaceState(null,'',`${location.pathname}?${q}${location.hash}`);lastSearch=location.search;
}
function renderSelection(){
  $('selection').classList.toggle('comparing',!!state.compare);
  $('selection').innerHTML=selected().map(({phone,slot})=>`<div class="phone-select ${slot?'secondary':''}"><label class="select-label" for="phone-${slot}">${slot?'对比机型':'查看机型'}${phone.panel?`<span class="panel-label">${phone.panel}</span>`:''}</label><select id="phone-${slot}" data-phone="${slot}" aria-label="${slot?'对比机型':'查看机型'}" title="${esc(phone.name)}">${PHONES.map(p=>`<option value="${p.id}" ${p.id===phone.id?'selected':''} ${p.id===(slot?state.phone:state.compare)?'disabled':''}>${esc(p.name)}</option>`).join('')}</select><div class="availability">${[['可视角',!!phone.angleDevice],['频闪',!!optionsFor(phone).length],['均匀度',hasUniformity(phone)],['反射率',hasReflectance(phone)]].map(([label,available])=>`<span class="${available?'':'missing'}" title="${label}${available?'已有数据':'待补充'}">${label}${available?'':'待测'}</span>`).join('')}</div>${slot?'<button class="remove-compare" data-action="remove-compare" aria-label="移除对比机型" title="移除对比">移除</button>':''}</div>`).join('')+(state.compare?'':'<button class="compare-button" data-action="add-compare">添加对比</button>');
}
function svmModeButtons(phone){
  return `<div class="segmented" aria-label="${esc(phone.name)}频闪模式">${optionsFor(phone).map(r=>`<button data-mode-phone="${phone.id}" data-mode-file="${r.file}" class="${r.file===currentRecord(phone).file?'active':''}" aria-pressed="${r.file===currentRecord(phone).file}">${esc(r.mode||'原始测量')}</button>`).join('')}</div>`;
}
function mountResults(){
  $('results').innerHTML=`<section class="section-block" id="viewing-angle" aria-labelledby="angleTitle"><div class="section-heading"><h2 id="angleTitle">可视角</h2><div class="heading-actions" id="angleToolbar"><div class="segmented" aria-label="屏幕内容"><button data-pattern="ui">浅色画面</button><button data-pattern="dark">深色画面</button></div><button class="text-button" data-action="angle-reset" title="回到正视">回正</button></div></div><div class="missing-note" id="angleMissing" hidden></div><div class="angle-stage" id="angleHost" hidden></div><div class="empty" id="angleEmpty" hidden><h3>暂无可视角数据</h3><button data-action="choose-angle-phone">查看已测机型</button></div></section>
<section class="section-block" id="flicker" aria-labelledby="flickerTitle"><div class="section-heading"><h2 id="flickerTitle">频闪</h2><div class="heading-actions" id="flickerToolbar"><div class="segmented" aria-label="频闪视图">${[['top','热力图'],['perspective','立体'],['chart2d','二维曲线']].map(([view,label])=>`<button data-svm-view="${view}">${label}</button>`).join('')}</div><span class="quiet-label" title="固定显示≤500 nits部分">≤ 500 nits</span></div></div><div class="svm-combined-modes" id="svmCombinedModes" hidden></div><div class="missing-note" id="svmMissing" hidden></div><div class="missing-note" id="svmCoverage" hidden></div><div class="svm-frames" id="svmHost" hidden>${[0,1].map(slot=>`<section class="svm-single ${slot?'secondary':''}" data-svm-panel="${slot}" hidden><div class="svm-panel-head"><h3></h3><div class="svm-mode-controls"></div></div><div class="svm-plot"></div><div class="svm-missing" hidden>频闪数据待补充</div></section>`).join('')}</div><div class="empty" id="flickerEmpty" hidden><h3>暂无频闪数据</h3></div></section>
${[['uniformity','均匀度'],['reflectance','反射率']].map(([kind,title])=>`<section class="section-block" id="${kind}" aria-labelledby="${kind}Title"><div class="section-heading"><h2 id="${kind}Title">${title}</h2></div><div class="measurement-host" id="${kind}Host" hidden></div><div class="empty" id="${kind}Empty" hidden><h3>暂无${title}数据</h3></div></section>`).join('')}`;
}
function mountFrame(host,attributes,source,title,onLoad){
  let frame=host.querySelector('iframe');
  if(!frame){
    frame=document.createElement('iframe');
    for(const [key,value]of Object.entries(attributes))frame.setAttribute(key,value);
    frame.loading=attributes.id==='angleFrame'?'eager':'lazy';
    frame.title=title;frame.src=source;
    frame.addEventListener('load',()=>onLoad(frame));host.appendChild(frame);
  }
  frame.title=title;
  return frame;
}
function syncAngle(){
  const entries=angleEntries(),missing=selected().filter(({phone})=>!phone.angleDevice);
  const available=entries.length>0;
  $('viewing-angle').classList.toggle('compact-empty',!available);
  if(!available)$('angleFrame')?.contentWindow?.postMessage({type:'atlas-angle-pause'},location.origin);
  $('angleToolbar').hidden=!available;$('angleHost').hidden=!available;$('angleEmpty').hidden=available;
  $('angleHost').classList.toggle('comparing',entries.length===2);
  $('angleMissing').hidden=!available||!missing.length;
  $('angleMissing').textContent=missing.map(({phone})=>`${phone.name} · 可视角待测`).join('、');
  if(available){
    mountFrame($('angleHost'),{id:'angleFrame'},'vendor/angle/embed.html?v=20261009-combined','原版可视角仿真与观看方向热力图',sendAngleState);
    sendAngleState();
  }
}
function svmFrameEntries(frame){
  const entries=svmEntries();
  if(state.svmTab==='chart2d')return +frame.dataset.slot===entries[0]?.slot?entries:[];
  return entries.filter(e=>e.slot===+frame.dataset.slot);
}
function syncSvmCoverage(){
  const missing=svmEntries().filter(({phone})=>currentRecord(phone).displayedDataPoints===0);
  $('svmCoverage').hidden=!missing.length;
  $('svmCoverage').textContent=missing.map(({phone})=>`${phone.name} · ≤500 nits 档位待测`).join('、');
}
function syncFlicker(){
  const entries=svmEntries(),available=entries.length>0,combined=available&&state.svmTab==='chart2d';
  syncSvmCoverage();
  $('flicker').classList.toggle('compact-empty',!available);
  $('flickerToolbar').hidden=!available;$('svmHost').hidden=!available;$('flickerEmpty').hidden=available;
  $('svmHost').classList.toggle('split',!!state.compare&&!combined);
  $('svmHost').classList.toggle('overlay',combined);
  $('svmCombinedModes').hidden=!combined;
  $('svmCombinedModes').innerHTML=combined?entries.map(({phone,slot})=>`<div class="svm-combined-mode ${slot?'secondary':''}"><h3>${esc(phone.name)}</h3>${svmModeButtons(phone)}</div>`).join(''):'';
  const missing=selected().filter(({phone})=>!currentRecord(phone));
  $('svmMissing').hidden=!combined||!missing.length;
  $('svmMissing').textContent=missing.map(({phone})=>`${phone.name} · 频闪待补充`).join('、');
  for(const panel of document.querySelectorAll('[data-svm-panel]')){
    const entry=selected().find(e=>e.slot===+panel.dataset.svmPanel);
    const wasHidden=panel.hidden||panel.querySelector('.svm-plot').hidden;
    panel.hidden=!available||!entry||(combined&&entry.slot!==entries[0].slot);
    if(!entry)continue;
    const {phone,slot}=entry,record=currentRecord(phone),plot=panel.querySelector('.svm-plot');
    panel.querySelector('.svm-panel-head').hidden=combined;
    panel.querySelector('h3').textContent=phone.name;
    panel.querySelector('.svm-mode-controls').innerHTML=record?svmModeButtons(phone):'';
    plot.hidden=!record;panel.querySelector('.svm-missing').hidden=!!record;
    if(record&&available&&!panel.hidden){
      const frame=mountFrame(plot,{'data-svm-frame':'','data-slot':String(slot)},'vendor/svm/embed.html?v=20261009-combined',combined?'同灰阶频闪曲线对比':`${phone.name} 原版频闪图`,f=>sendSvmState(f));
      const signature=svmFrameEntries(frame).map(({phone})=>currentRecord(phone).file).join('|');
      if(frame.dataset.records!==signature||wasHidden){frame.dataset.records=signature;sendSvmState(frame);}
    }
  }
}
function syncMeasurement(kind,available){
  const hasData=selected().some(({phone})=>available.some(p=>p.id===phone.id));
  $(kind).classList.toggle('compact-empty',!hasData);
  $(`${kind}Host`).hidden=!hasData;$(`${kind}Empty`).hidden=hasData;
  if(hasData){
    const frame=mountFrame($(`${kind}Host`),{'data-measurement':kind,class:`measurement-frame ${kind}-frame`},`vendor/${kind}/index.html?v=20261009-combined`,`${kind==='uniformity'?'均匀度':'反射率'}实测对比`,sendMeasurementState);
    sendMeasurementState(frame);
  }
}
function render(){
  renderSelection();syncAngle();syncFlicker();syncMeasurement('uniformity',uniformityPhones);syncMeasurement('reflectance',reflectancePhones);
  syncButtons();writeUrl();updateNavigation();
}
function sendAngleState(){
  const entries=angleEntries();if(!entries.length)return;
  $('angleFrame')?.contentWindow?.postMessage({type:'atlas-angle-set',profiles:entries.map(e=>e.profile.id),phoneSlots:entries.map(e=>e.slot),theta:state.theta,psi:state.psi,pattern:state.pattern,padMetric:state.padMetric,pal:state.pal},location.origin);
}
function sendSvmState(target,skipFrame,changes){
  for(const frame of target?[target]:document.querySelectorAll('[data-svm-frame]')){
    if(frame===skipFrame)continue;
    const entries=svmFrameEntries(frame);if(!entries.length)continue;
    const fields=changes??{view:state.svmTab,terrainView:state.terrainView,sliceMode:'gray',sliceGray:state.sliceGray,layout:'single',denoise:true};
    frame.contentWindow?.postMessage({type:'atlas-svm-set',files:entries.map(({phone})=>currentRecord(phone).file),...fields},location.origin);
  }
}
function sendMeasurementState(frame){
  const kind=frame.dataset.measurement;
  const mode=kind==='uniformity'?{condition:state.uniformityCondition,map:state.uniformityMap}:{conditions:state.reflectanceConditions};
  frame.contentWindow?.postMessage({type:`atlas-${kind}-set`,phones:selected().map(({phone})=>phone.id),names:selected().map(({phone})=>phone.name),...mode},location.origin);
}
function updateButtons(selector,key,value){document.querySelectorAll(selector).forEach(b=>{const on=b.dataset[key]===String(value);b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});}
function syncButtons(){updateButtons('[data-pattern]','pattern',state.pattern);updateButtons('[data-svm-view]','svmView',state.svmTab==='chart2d'?'chart2d':state.terrainView);}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2200);}
function setFrameHeight(frame,height){
  if(Number.isFinite(height)&&height>=200&&height<=3000){const size=`${Math.ceil(height)}px`;if(frame.style.height!==size)frame.style.height=size;}
}
function scheduleUrl(){clearTimeout(urlTimer);urlPending=true;urlTimer=setTimeout(writeUrl,250);}
document.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.action==='info'){$('infoDialog').showModal();return;}
  if(b.dataset.action==='close-info'){$('infoDialog').close();return;}
  if(b.dataset.action==='share'){writeUrl();try{await navigator.clipboard.writeText(location.href);toast('链接已复制');}catch{toast('复制地址栏即可分享');}return;}
  if(b.dataset.action==='add-compare'){state.compare=PHONES.find(p=>p.id!==state.phone&&p.angleDevice)?.id||PHONES.find(p=>p.id!==state.phone).id;render();$('phone-1').focus({preventScroll:true});}
  else if(b.dataset.action==='remove-compare'){state.compare='';render();document.querySelector('[data-action="add-compare"]').focus({preventScroll:true});}
  else if(b.dataset.action==='choose-angle-phone'){state.phone=PHONES[0].id;if(state.compare===state.phone)state.compare='';render();}
  else if(b.dataset.action==='angle-reset'){state.theta=0;sendAngleState();writeUrl();}
  else if(b.dataset.modeFile){
    state.modes[b.dataset.modePhone]=b.dataset.modeFile;updateButtons(`[data-mode-phone="${b.dataset.modePhone}"]`,'modeFile',b.dataset.modeFile);
    const slot=state.svmTab==='chart2d'?svmEntries()[0]?.slot:selected().find(({phone})=>phone.id===b.dataset.modePhone)?.slot;
    const frame=document.querySelector(`[data-svm-frame][data-slot="${slot}"]`);
    if(frame){frame.dataset.records=svmFrameEntries(frame).map(({phone})=>currentRecord(phone).file).join('|');sendSvmState(frame,null,{});}syncSvmCoverage();writeUrl();
  }
  else if(b.dataset.svmView){state.svmTab=b.dataset.svmView==='chart2d'?'chart2d':'scene3d';if(state.svmTab==='scene3d')state.terrainView=b.dataset.svmView;syncFlicker();syncButtons();sendSvmState(null,null,{view:state.svmTab,terrainView:state.terrainView});writeUrl();}
  else if(b.dataset.pattern){state.pattern=b.dataset.pattern;syncButtons();sendAngleState();writeUrl();}
});
document.addEventListener('change',event=>{
  if(event.target.dataset.phone!==undefined){const slot=event.target.dataset.phone;state[slot==='0'?'phone':'compare']=event.target.value;render();$(`phone-${slot}`).focus({preventScroll:true});}
});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin)return;
  const data=event.data;
  if(event.source===$('angleFrame')?.contentWindow){
    if(data?.type==='atlas-angle-ready')sendAngleState();
    if(data?.type==='atlas-angle-height')setFrameHeight($('angleFrame'),data.height);
    if(data?.type==='atlas-angle-privacy'&&typeof data.privacy==='boolean'){
      const phone=selected().find(({phone})=>phone.angleDevice===data.device)?.phone;
      if(phone&&hasPrivacy(phone)){state.privacy[phone.id]=data.privacy;sendAngleState();writeUrl();}
    }
    if(data?.type==='atlas-angle-change'&&angleEntries().length&&Number.isFinite(data.theta)&&Number.isFinite(data.psi)){
      state.theta=Math.min(70,Math.max(0,data.theta));state.psi=((data.psi%360)+360)%360;
      if(['lum','jncd'].includes(data.padMetric))state.padMetric=data.padMetric;
      if(['jet','band','turbo','mono'].includes(data.pal))state.pal=data.pal;
      scheduleUrl();
    }
  }
  const frame=[...document.querySelectorAll('[data-svm-frame]')].find(f=>f.contentWindow===event.source);
  if(frame&&data?.type==='atlas-svm-ready')sendSvmState(frame);
  if(frame&&data?.type==='atlas-svm-change'&&Number.isFinite(data.sliceGray)){
    state.sliceGray=Math.min(255,Math.max(15,data.sliceGray));sendSvmState(null,frame,{sliceMode:'gray',sliceGray:state.sliceGray});scheduleUrl();
  }
  const measurement=[...document.querySelectorAll('[data-measurement]')].find(f=>f.contentWindow===event.source);
  if(measurement){
    const kind=measurement.dataset.measurement,type=`atlas-${kind}`;
    if(data?.type===`${type}-ready`)sendMeasurementState(measurement);
    if(data?.type===`${type}-change`){
      if(kind==='uniformity'){
        if(uniformityPhones.some(p=>p.conditions.some(c=>c.id===data.condition)))state.uniformityCondition=data.condition;
        if(['luminance','colorTemperature'].includes(data.map))state.uniformityMap=data.map;
      }else{
        if(data.conditions&&typeof data.conditions==='object'&&!Array.isArray(data.conditions))for(const [id,condition]of Object.entries(data.conditions))if(reflectancePhones.some(p=>p.id===id&&p.conditions.some(c=>c.id===condition)))state.reflectanceConditions[id]=condition;
      }
      scheduleUrl();
    }
    if(data?.type===`${type}-height`)setFrameHeight(measurement,data.height);
  }
});
function updateNavigation(){
  const boundary=$('selectionShell').getBoundingClientRect().bottom+36;
  let active='viewing-angle';
  for(const section of document.querySelectorAll('.section-block'))if(section.getBoundingClientRect().top<=boundary)active=section.id;
  document.querySelectorAll('.metric-nav a').forEach(a=>{const on=a.hash===`#${active}`;a.classList.toggle('active',on);if(on)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
}
let scrollScheduled=false;
window.addEventListener('scroll',()=>{if(!scrollScheduled){scrollScheduled=true;requestAnimationFrame(()=>{scrollScheduled=false;updateNavigation();});}},{passive:true});
window.addEventListener('popstate',()=>{if(location.search!==lastSearch||urlPending){clearTimeout(urlTimer);urlPending=false;readUrl();render();sendSvmState();}});
$('infoDialog').addEventListener('click',event=>{if(event.target===$('infoDialog'))$('infoDialog').close();});
async function init(){try{
  const [svm,uniformity,reflectance]=await Promise.all(['svm','uniformity','reflectance'].map(async kind=>{const response=await fetch(`data/${kind}/index.json?v=20261009-combined`);if(!response.ok)throw new Error('数据索引读取失败');return response.json();}));
  records=svm.records;uniformityPhones=uniformity.phones;reflectancePhones=reflectance.phones;
  for(const phone of [...uniformityPhones,...reflectancePhones])if(!PHONES.some(p=>p.id===phone.id))PHONES.push({id:phone.id,name:phone.name});
  readUrl();mountResults();render();
  if(location.hash)$(location.hash.slice(1))?.scrollIntoView();
}catch(error){console.error(error);$('results').innerHTML='<div class="error">数据载入失败，请刷新页面。</div>';}}
init();
