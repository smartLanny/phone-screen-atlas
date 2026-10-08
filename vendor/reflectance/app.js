const DATA_URL='../../data/reflectance/index.json?v=20261008-xml';
const PHONE_COLORS=['#86a2ff','#f0aa70'];
const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const state={phones:['xiaomi-18-pro-max'],names:['小米 18 Pro Max'],kind:'total',conditions:{}};
let indexData=null,pendingSet=null,parentSetReceived=false,chartSize={width:0,height:0},pointerLocked=false,lastHeight=0;
let chartBounds=null;

function sendParent(message){
  if(window.parent!==window)window.parent.postMessage(message,location.origin);
}

function findPhone(id){return indexData?.phones.find(phone=>phone.id===id)||null;}
function conditionLabel(condition){
  if(!condition)return '测量状态未记录';
  if(condition.id==='as-measured')return '原始样品';
  if(condition.label&&condition.label!=='原图状态')return condition.label;
  return ({'screen-protector':'贴膜','inner-display':'内屏','outer-display':'外屏'}[condition.id]||condition.id);
}
function defaultCondition(phone){return phone?.conditions.find(condition=>condition.id==='as-measured')||phone?.conditions[0]||null;}
function conditionFor(phoneId){
  const phone=findPhone(phoneId);
  return phone?.conditions.find(condition=>condition.id===state.conditions[phoneId])||defaultCondition(phone);
}
function selectedPhones(){
  return state.phones.slice(0,2).map((id,index)=>({
    id,
    name:state.names[index]||findPhone(id)?.name||id,
    record:findPhone(id),
    slot:index,
  }));
}
function normalizeSet(payload){
  const phones=Array.isArray(payload.phones)?payload.phones.filter(id=>typeof id==='string').slice(0,2):[];
  const uniquePhones=[...new Set(phones)];
  const incomingConditions=payload.conditions&&typeof payload.conditions==='object'?payload.conditions:{};
  const conditions={};
  let didFallback=false;
  for(const id of uniquePhones){
    const record=findPhone(id);
    const preferred=incomingConditions[id];
    const matched=record?.conditions.find(condition=>condition.id===preferred);
    const fallback=defaultCondition(record);
    if(matched)conditions[id]=matched.id;
    else if(fallback){
      conditions[id]=fallback.id;
      if(Object.hasOwn(incomingConditions,id)&&incomingConditions[id]!==fallback.id)didFallback=true;
    }
  }
  state.phones=uniquePhones;
  state.names=uniquePhones.map((id,index)=>Array.isArray(payload.names)&&typeof payload.names[index]==='string'?payload.names[index]:findPhone(id)?.name||id);
  state.conditions=conditions;
  state.kind=payload.kind==='diffuse'?'diffuse':'total';
  render();
  if(didFallback)sendChange();
}
function sendChange(){sendParent({type:'atlas-reflectance-change',kind:state.kind,conditions:{...state.conditions}});}

function renderConditions(){
  const host=$('conditions');
  host.innerHTML=selectedPhones().map(({id,name,record})=>{
    const condition=conditionFor(id);
    if(!record||record.conditions.length<2)return '';
    return `<div class="condition-group"><span class="condition-phone">${esc(name)}</span><div class="condition-buttons" role="group" aria-label="${esc(name)}测量状态">${record.conditions.map(item=>`<button type="button" data-condition-phone="${esc(id)}" data-condition="${esc(item.id)}" class="${item.id===condition?.id?'active':''}" aria-pressed="${item.id===condition?.id}">${esc(conditionLabel(item))}</button>`).join('')}</div></div>`;
  }).join('');
}
function renderKinds(){
  $('kinds').innerHTML=[['total','全反射'],['diffuse','漫反射']].map(([kind,label])=>`<button type="button" data-kind="${kind}" class="${state.kind===kind?'active':''}" aria-pressed="${state.kind===kind}">${label}</button>`).join('');
}
function curveFor(selection){return conditionFor(selection.id)?.curves?.[state.kind]||null;}
function curveSegments(curve){
  const samples=curve.samples||[];
  const spans=Array.isArray(curve.coverageSpansNm)&&curve.coverageSpansNm.length?curve.coverageSpansNm:[curve.rangeNm];
  const segments=[];
  for(const span of spans){
    let segment=[];
    const flush=()=>{if(segment.length)segments.push(segment);segment=[];};
    for(const sample of samples){
      if(sample[0]<span[0]||sample[0]>span[1])continue;
      if(segment.length&&sample[0]-segment.at(-1)[0]>curve.sampleStepNm+0.01)flush();
      segment.push(sample);
    }
    flush();
  }
  return segments;
}
function pathForCurve(segments,bounds,scale){
  const [waveMin,waveMax]=indexData.wavelengthRangeNm;
  const {minimum:percentMin,maximum:percentMax}=scale;
  const x=nm=>bounds.left+(nm-waveMin)/(waveMax-waveMin)*bounds.width;
  const y=percent=>bounds.top+(percentMax-percent)/(percentMax-percentMin)*bounds.height;
  const commands=[];
  for(const segment of segments)if(segment.length>1)commands.push(`M${x(segment[0][0]).toFixed(2)},${y(segment[0][1]).toFixed(2)}${segment.slice(1).map(([nm,value])=>`L${x(nm).toFixed(2)},${y(value).toFixed(2)}`).join('')}`);
  return commands.join('');
}
function colorFor(selection){return PHONE_COLORS[selection.slot]||PHONE_COLORS[0];}
function displayScale(){
  const step=state.kind==='total'?1:0.5;
  const values=indexData.phones.flatMap(phone=>phone.conditions.flatMap(condition=>condition.curves?.[state.kind]?.samples?.map(sample=>sample[1])||[]));
  const maximum=values.length?Math.ceil(Math.max(...values)*1.1/step)*step:indexData.reflectanceRangePercent[1];
  return {minimum:0,maximum,step};
}
function renderLegend(){
  const host=$('legend');
  const selections=selectedPhones();
  const curves=selections.map(selection=>({selection,condition:conditionFor(selection.id),curve:curveFor(selection)}));
  host.innerHTML=curves.map(({selection,condition,curve})=>{
    const color=colorFor(selection);
    const conditionText=condition?`<span class="legend-meta">${esc(conditionLabel(condition))}</span>`:'';
    if(!curve)return `<div class="legend-item"><span class="legend-swatch ${selection.slot?'dashed':''}" style="color:${color}"></span><span class="legend-name">${esc(selection.name)}</span>${conditionText}<span class="legend-missing">${selection.record?`无${state.kind==='total'?'全反射':'漫反射'}曲线`:'反射率待测'}</span></div>`;
    return `<div class="legend-item"><span class="legend-swatch ${selection.slot?'dashed':''}" style="color:${color}"></span><span class="legend-name">${esc(selection.name)}</span>${conditionText}</div>`;
  }).join('');
}
function svgEl(name,attrs={},content=''){
  const element=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [key,value]of Object.entries(attrs))element.setAttribute(key,String(value));
  if(content)element.textContent=content;
  return element;
}
function renderChart(){
  const svg=$('chart'),{width,height}=chartSize;
  if(!indexData||width<80||height<80)return;
  while(svg.firstChild)svg.removeChild(svg.firstChild);
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const scale=displayScale();
  svg.setAttribute('aria-label',`${state.kind==='total'?'全反射':'漫反射'}，波长 ${indexData.wavelengthRangeNm[0]} 至 ${indexData.wavelengthRangeNm[1]} 纳米，反射率 ${scale.minimum} 至 ${scale.maximum}%`);
  const margin={left:54,right:17,top:25,bottom:64};
  const plot={left:margin.left,top:margin.top,width:width-margin.left-margin.right,height:height-margin.top-margin.bottom};
  const [waveMin,waveMax]=indexData.wavelengthRangeNm;
  const {minimum:percentMin,maximum:percentMax,step:percentStep}=scale;
  const x=nm=>plot.left+(nm-waveMin)/(waveMax-waveMin)*plot.width;
  const y=percent=>plot.top+(percentMax-percent)/(percentMax-percentMin)*plot.height;
  chartBounds={...plot,x,y};
  const grid=svgEl('g',{'aria-hidden':'true'});
  for(let percent=percentMin;percent<=percentMax;percent+=percentStep){
    const yy=y(percent);
    grid.append(svgEl('line',{x1:plot.left,y1:yy,x2:plot.left+plot.width,y2:yy,class:'grid-line'}));
    const label=Number.isInteger(percent)?`${percent}`:percent.toFixed(1);
    grid.append(svgEl('text',{x:plot.left-9,y:yy+3.5,'text-anchor':'end',class:'tick-text'},label));
  }
  for(let nm=waveMin;nm<=waveMax;nm+=50){
    const xx=x(nm);
    grid.append(svgEl('line',{x1:xx,y1:plot.top,x2:xx,y2:plot.top+plot.height,class:'grid-line'}));
    grid.append(svgEl('text',{x:xx,y:plot.top+plot.height+19,'text-anchor':'middle',class:'tick-text'},`${nm}`));
  }
  svg.append(grid);
  svg.append(svgEl('line',{x1:plot.left,y1:plot.top,x2:plot.left,y2:plot.top+plot.height,class:'axis-line'}));
  svg.append(svgEl('line',{x1:plot.left,y1:plot.top+plot.height,x2:plot.left+plot.width,y2:plot.top+plot.height,class:'axis-line'}));
  svg.append(svgEl('text',{x:plot.left+plot.width/2,y:height-7,'text-anchor':'middle',class:'axis-title'},'波长 (nm)'));
  const yTitle=svgEl('text',{x:14,y:plot.top+plot.height/2,'text-anchor':'middle',class:'axis-title',transform:`rotate(-90 14 ${plot.top+plot.height/2})`},'反射率 (%)');
  svg.append(yTitle);
  const gradient=svgEl('defs');
  const spectrum=svgEl('linearGradient',{id:'spectrum',x1:'0%',x2:'100%',y1:'0%',y2:'0%'});
  [['0%','#7e4dff'],['18%','#2868ff'],['38%','#16b9d3'],['55%','#47bc70'],['73%','#e4d844'],['86%','#f28a30'],['100%','#e54848']].forEach(([offset,color])=>spectrum.append(svgEl('stop',{offset,'stop-color':color})));
  gradient.append(spectrum);svg.append(gradient);
  svg.append(svgEl('rect',{x:plot.left,y:plot.top+plot.height+29,width:plot.width,height:7,rx:3.5,fill:'url(#spectrum)',opacity:'.8','aria-hidden':'true'}));
  const curves=selectedPhones().map(selection=>({selection,curve:curveFor(selection)})).filter(entry=>entry.curve);
  for(const {selection,curve}of curves){
    const segments=curveSegments(curve);
    svg.append(svgEl('path',{d:pathForCurve(segments,plot,scale),class:`curve ${selection.slot?'secondary':''}`,stroke:colorFor(selection)}));
    for(const [[nm,value]]of segments.filter(segment=>segment.length===1))svg.append(svgEl('circle',{cx:x(nm),cy:y(value),r:2.1,fill:colorFor(selection)}));
  }
  svg.append(svgEl('line',{id:'crosshair',x1:0,y1:plot.top,x2:0,y2:plot.top+plot.height,class:'crosshair',visibility:'hidden'}));
  svg.append(svgEl('g',{id:'focusDots',visibility:'hidden'}));
}
function valueAt(curve,nm){
  if(!curve)return null;
  const spans=curve.coverageSpansNm||[];
  if(!spans.some(([start,end])=>nm>=start&&nm<=end))return null;
  const samples=curve.samples||[];
  let before=null;
  for(const sample of samples){
    if(sample[0]===nm)return sample[1];
    if(sample[0]>nm){
      if(!before||sample[0]-before[0]>curve.sampleStepNm+0.01)return null;
      const ratio=(nm-before[0])/(sample[0]-before[0]);
      return before[1]+(sample[1]-before[1])*ratio;
    }
    before=sample;
  }
  return null;
}
function updateReadout(nm,pinned=false){
  const bounded=Math.max(indexData.wavelengthRangeNm[0],Math.min(indexData.wavelengthRangeNm[1],nm));
  const step=selectedPhones().map(curveFor).find(Boolean)?.sampleStepNm||10;
  const wavelength=Math.round(bounded/step)*step;
  const crosshair=$('chart').querySelector('#crosshair');
  const dots=$('chart').querySelector('#focusDots');
  if(!crosshair||!dots||!chartBounds)return;
  const xx=chartBounds.x(wavelength);
  crosshair.setAttribute('x1',xx);crosshair.setAttribute('x2',xx);crosshair.setAttribute('visibility','visible');
  while(dots.firstChild)dots.removeChild(dots.firstChild);
  const values=selectedPhones().map(selection=>{
    const curve=curveFor(selection),value=valueAt(curve,wavelength);
    if(curve&&value!==null){
      dots.append(svgEl('circle',{cx:xx,cy:chartBounds.y(value),r:4.4,fill:colorFor(selection),class:'focus-dot'}));
      return `<span class="readout-value" title="${esc(selection.name)}" style="--swatch:${colorFor(selection)}">${value.toFixed(2)}%</span>`;
    }
    return `<span class="readout-value" title="${esc(selection.name)}" style="--swatch:${colorFor(selection)}">缺测</span>`;
  });
  dots.setAttribute('visibility','visible');
  $('readoutText').innerHTML=`<strong>${wavelength} nm</strong><span class="readout-values">${values.join('')}</span>`;
  $('readout').classList.add('show');
  $('readout').classList.toggle('pinned',pinned);
  $('readout').setAttribute('aria-live',pinned?'polite':'off');
  pointerLocked=pinned;
}
function clearReadout(force=false){
  if(pointerLocked&&!force)return;
  pointerLocked=false;
  $('readout').classList.remove('show','pinned');
  $('readout').setAttribute('aria-live','off');
  $('readoutText').textContent='';
  $('chart').querySelector('#crosshair')?.setAttribute('visibility','hidden');
  $('chart').querySelector('#focusDots')?.setAttribute('visibility','hidden');
}
function wavelengthAtPointer(event){
  if(!chartBounds)return null;
  const rect=$('chart').getBoundingClientRect();
  const viewX=(event.clientX-rect.left)*chartSize.width/rect.width;
  const {left,width}=chartBounds;
  if(viewX<left||viewX>left+width)return null;
  const [waveMin,waveMax]=indexData.wavelengthRangeNm;
  return waveMin+(viewX-left)/width*(waveMax-waveMin);
}
function renderDetails(){
  const rows=selectedPhones().map(selection=>{
    const condition=conditionFor(selection.id),curve=curveFor(selection);
    if(!selection.record)return `<section class="curve-detail"><h3>${esc(selection.name)}</h3><p>当前没有反射率测量数据。</p></section>`;
    if(!curve)return `<section class="curve-detail"><h3>${esc(selection.name)} · ${esc(conditionLabel(condition))} · ${state.kind==='total'?'全反射':'漫反射'}</h3><p>没有这一状态和类型的测量数据。</p></section>`;
    const sourcePath=typeof curve.sourceFile==='string'?`../../data/reflectance/${curve.sourceFile}`:'';
    const source=sourcePath?`<a class="source-link" href="${esc(sourcePath)}" target="_blank" rel="noopener">查看原始光谱数据</a>`:'';
    return `<section class="curve-detail"><h3>${esc(selection.name)} · ${esc(condition.label||conditionLabel(condition))} · ${state.kind==='total'?'全反射':'漫反射'}</h3><p>仪器原始光谱 · ${esc(curve.method)} · ${curve.sampleStepNm} nm 采样。</p><p class="detail-muted">实际覆盖：${(curve.coverageSpansNm||[]).map(span=>`${span[0]}–${span[1]} nm`).join('、')||'未记录'}。悬浮或点按显示原始采样点。</p>${source}</section>`;
  });
  $('curveDetails').innerHTML=rows.join('');
}
function render(){
  renderConditions();renderKinds();renderLegend();renderChart();renderDetails();
  clearReadout(true);
  scheduleHeight();
}
function measureHeight(){
  const app=$('app');
  const bodyStyle=getComputedStyle(document.body);
  const verticalPadding=(Number.parseFloat(bodyStyle.paddingTop)||0)+(Number.parseFloat(bodyStyle.paddingBottom)||0);
  const verticalBorder=(Number.parseFloat(bodyStyle.borderTopWidth)||0)+(Number.parseFloat(bodyStyle.borderBottomWidth)||0);
  return Math.ceil(app.getBoundingClientRect().height+verticalPadding+verticalBorder);
}
function scheduleHeight(){requestAnimationFrame(()=>{
  const height=measureHeight();
  if(height>=200&&height<=3000&&height!==lastHeight){lastHeight=height;sendParent({type:'atlas-reflectance-height',height});}
});}
function bindEvents(){
  $('conditions').addEventListener('click',event=>{
    const button=event.target.closest('[data-condition-phone]');
    if(!button)return;
    state.conditions[button.dataset.conditionPhone]=button.dataset.condition;
    render();sendChange();
  });
  $('kinds').addEventListener('click',event=>{
    const button=event.target.closest('[data-kind]');
    if(!button||button.dataset.kind===state.kind)return;
    state.kind=button.dataset.kind;
    render();sendChange();
  });
  $('measureInfo').addEventListener('click',()=>{$('infoDialog').showModal();scheduleHeight();});
  $('closeInfo').addEventListener('click',()=>$('infoDialog').close());
  $('infoDialog').addEventListener('click',event=>{if(event.target===$('infoDialog'))$('infoDialog').close();});
  $('clearReadout').addEventListener('click',()=>{
    pointerLocked=false;$('readout').classList.remove('show','pinned');$('readout').setAttribute('aria-live','off');
    $('chart').querySelector('#crosshair')?.setAttribute('visibility','hidden');$('chart').querySelector('#focusDots')?.setAttribute('visibility','hidden');
  });
  const chart=$('chart');
  chart.addEventListener('pointermove',event=>{
    if(event.pointerType==='touch'||pointerLocked)return;
    const wavelength=wavelengthAtPointer(event);
    if(wavelength===null)return clearReadout();
    updateReadout(wavelength,false);
  });
  chart.addEventListener('pointerleave',()=>{if(!pointerLocked)clearReadout();});
  chart.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='touch')return;
    const wavelength=wavelengthAtPointer(event);
    if(wavelength!==null)updateReadout(wavelength,true);
  });
  chart.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();
    const current=Number($('readoutText').querySelector('strong')?.textContent.match(/\d+/)?.[0]||550);
    updateReadout(current+(event.key==='ArrowRight'?10:-10),true);
  });
  const observer=new ResizeObserver(entries=>{
    const rect=entries.at(-1)?.contentRect;
    if(!rect||rect.width===chartSize.width&&rect.height===chartSize.height)return;
    chartSize={width:Math.round(rect.width),height:Math.round(rect.height)};
    renderChart();
    if(pointerLocked)clearReadout(true);
  });
  observer.observe(chart);
  const heightObserver=new ResizeObserver(scheduleHeight);
  heightObserver.observe(document.documentElement);heightObserver.observe($('app'));
  window.addEventListener('resize',scheduleHeight);
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='atlas-reflectance-set')return;
  parentSetReceived=true;pendingSet=event.data;
  if(indexData)normalizeSet(pendingSet);
});

async function init(){
  bindEvents();
  sendParent({type:'atlas-reflectance-ready'});
  try{
    const response=await fetch(DATA_URL);
    if(!response.ok)throw new Error(`索引读取失败 (${response.status})`);
    indexData=await response.json();
    if(parentSetReceived&&pendingSet)normalizeSet(pendingSet);
    else{
      const defaultPhone=findPhone('xiaomi-18-pro-max');
      state.names=[defaultPhone?.name||'小米 18 Pro Max'];
      if(defaultPhone){const condition=defaultCondition(defaultPhone);if(condition)state.conditions[defaultPhone.id]=condition.id;}
      render();
    }
    scheduleHeight();
  }catch(error){
    console.error(error);
    $('chartWrap').hidden=true;$('legend').innerHTML='<div class="error">反射率数据载入失败，请刷新页面。</div>';
    scheduleHeight();
  }
}
init();
