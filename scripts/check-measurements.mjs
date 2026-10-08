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
assert.equal(reflectance.digitization.gridIsInstrumentSampling,false);
unique(reflectance.phones,p=>p.id);
unique(sources.sources,s=>s.id);
const sourceIds=new Set(sources.sources.map(s=>s.id));
for(const source of sources.sources){
  const bytes=readFileSync(new URL(`data/reflectance/source/${source.copyFile}`,root));
  assert.equal(bytes.length,source.copyBytes);
  assert.equal(hash(bytes),source.copySha256);
  assert.equal(source.copySha256,source.sourceSha256);
}
let curveCount=0;
for(const phone of reflectance.phones){
  assert.ok(phone.name&&phone.conditions.length);
  unique(phone.conditions,c=>c.id);
  for(const condition of phone.conditions)for(const [kind,curve] of Object.entries(condition.curves)){
    assert.ok(['total','diffuse'].includes(kind));
    assert.equal(curve.kind,kind);
    assert.equal(curve.digitized,true);
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
    assert.ok(curve.traceErrorNm>0&&curve.traceErrorPercentagePoints>0);
    curveCount++;
  }
}
console.log(`Uniformity: ${uniformity.phones.length} models/${mapCount} intact masked maps; reflectance: ${reflectance.phones.length} models/${curveCount} source-traced curves, units and gaps verified.`);
