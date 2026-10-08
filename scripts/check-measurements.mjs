import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const json=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function unique(items,key){assert.equal(new Set(items.map(key)).size,items.length,'Duplicate measurement identity');}

const uniformity=json('data/uniformity/index.json');
unique(uniformity.phones,p=>p.id);
let mapCount=0;
for(const phone of uniformity.phones){
  assert.ok(phone.name&&phone.conditions.length);
  unique(phone.conditions,c=>c.id);
  for(const condition of phone.conditions){
    assert.ok(condition.maps.luminance);
    for(const [kind,map] of Object.entries(condition.maps)){
      const bytes=readFileSync(new URL(`data/uniformity/${map.asset}`,root));
      assert.equal(hash(bytes),map.assetSha256,`${phone.id}/${condition.id}/${kind} map changed`);
      assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
      assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],map.displayResolution);
      assert.ok(map.sourceMaskCoverage>0&&map.sourceMaskCoverage<=1);
      mapCount++;
    }
  }
}
for(const phone of [...uniformity.metricsOnly,...uniformity.notRecorded])assert.equal(phone.conditions.length,0);

const reflectance=json('data/reflectance/index.json');
const sources=json('data/reflectance/source-manifest.json');
assert.deepEqual(reflectance.units,{wavelength:'nm',reflectance:'%'});
if(reflectance.sourceKinds?.includes('instrument-xml')){
  assert.equal(reflectance.digitization,undefined);
  assert.equal(reflectance.sampling.sourceKind,'instrument-xml');
  assert.equal(reflectance.sampling.gridIsInstrumentSampling,true);
  assert.deepEqual(reflectance.sampling.sampleStepsNm,[10]);
  assert.deepEqual(reflectance.sampling.methods,['SCI','SCE']);
  assert.equal(reflectance.sampling.interpolatedPointsAdded,false);
  assert.equal(reflectance.sampling.traceErrorNm,undefined);
  assert.equal(reflectance.sampling.traceErrorPercentagePoints,undefined);
  assert.equal(reflectance.corroboration.pngDigitization.gridIsInstrumentSampling,false);
}else assert.equal(reflectance.digitization.gridIsInstrumentSampling,false);
unique(reflectance.phones,p=>p.id);
unique(sources.sources,s=>s.id);
const sourceIds=new Set(sources.sources.map(s=>s.id));
let rawSamples;
if(sources.rawSource){
  const rawBytes=readFileSync(new URL(`data/reflectance/${sources.rawSource.exportFile}`,root));
  assert.equal(hash(rawBytes),sources.rawSource.exportSha256);
  rawSamples=JSON.parse(rawBytes);
  assert.equal(rawSamples.sourceSha256,sources.rawSource.sourceSha256);
  assert.equal(rawSamples.units.reflectance,'fraction');
  assert.equal(rawSamples.percentConversionFactor,100);
  unique(rawSamples.samples,s=>`${s.recordTag}/${s.recordId}`);
  sourceIds.add(sources.rawSource.id);
}
for(const source of sources.sources){
  const bytes=readFileSync(new URL(`data/reflectance/source/${source.copyFile}`,root));
  assert.equal(bytes.length,source.copyBytes);
  assert.equal(hash(bytes),source.copySha256);
  assert.equal(source.copySha256,source.sourceSha256);
}
let curveCount=0;
for(const phone of reflectance.phones){
  assert.ok(phone.name&&phone.conditions.length);
  if(rawSamples){assert.equal(phone.deviceType,'phone');assert.notEqual(phone.id,'ipad-pro-11-m4');}
  unique(phone.conditions,c=>c.id);
  for(const condition of phone.conditions)for(const [kind,curve] of Object.entries(condition.curves)){
    assert.ok(['total','diffuse'].includes(kind));
    assert.equal(curve.kind,kind);
    assert.equal(curve.digitized,curve.sourceKind==='instrument-xml'?false:true);
    assert.ok(sourceIds.has(curve.sourceId));
    assert.ok(curve.samples.length>1);
    let previous=-Infinity;
    for(const [wavelength,value] of curve.samples){
      assert.ok(Number.isFinite(wavelength)&&wavelength>previous);
      assert.ok(wavelength>=reflectance.wavelengthRangeNm[0]&&wavelength<=reflectance.wavelengthRangeNm[1]);
      assert.ok(Number.isFinite(value)&&value>=0&&value<=reflectance.reflectanceRangePercent[1]);
      assert.ok(curve.coverageSpansNm.some(([a,b])=>wavelength>=a&&wavelength<=b));
      previous=wavelength;
    }
    assert.deepEqual(curve.rangeNm,[curve.samples[0][0],curve.samples.at(-1)[0]]);
    if(curve.sourceKind==='instrument-xml'){
      assert.ok(rawSamples);
      assert.ok(['SCI','SCE'].includes(curve.method));
      assert.equal(curve.method,kind==='total'?'SCI':'SCE');
      const sample=rawSamples.samples.find(s=>s.recordId===curve.rawSampleId&&s.phoneId===phone.id&&s.conditionId===condition.id);
      assert.ok(sample,'Raw sample identity missing');
      const spectrum=sample.spectra[curve.method];
      assert.equal(curve.sampleStepNm,spectrum.sampleStepNm);
      assert.equal(curve.percentConversionFactor,100);
      assert.deepEqual(curve.samples,spectrum.reflectanceFractions.map((v,i)=>[spectrum.rangeNm[0]+i*spectrum.sampleStepNm,v*100]));
      assert.equal(curve.traceErrorNm,undefined);
      assert.equal(curve.traceErrorPercentagePoints,undefined);
    }else{
      assert.ok(curve.traceErrorNm>0&&curve.traceErrorPercentagePoints>0);
      assert.ok(!curve.sourceKind||curve.sourceKind==='png-digitized');
    }
    curveCount++;
  }
}
console.log(`Uniformity: ${uniformity.phones.length} models/${mapCount} intact masked maps; reflectance: ${reflectance.phones.length} models/${curveCount} source-traced curves, units and gaps verified.`);
