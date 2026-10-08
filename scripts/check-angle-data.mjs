import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const context={window:{}};
for(const file of ['data.js','model.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'vendor/angle',file),'utf8'),context);
const data=context.window.ANG_DATA,{createModel,norm360}=context.window.AngleModel;
assert.equal(data.profiles.length,5);
assert.deepEqual(Array.from(data.profiles,p=>[p.id,p.device,p.privacy]),[
 ['p0','iPhone 18 Pro Max GH3',false],['p1','iPhone 18 Pro Max GH3',true],
 ['p2','小米 18 Pro Max',false],['p3','小米 18 Pro Max',true],
 ['p4','华为 Mate 90 Pro Max 典藏版',false],
]);
for(const profile of data.profiles){
 assert.deepEqual(Array.from(profile.sets,s=>s.phi),[0,30,60,90,120,150]);
 const model=createModel({angles:data.angles,sets:profile.sets},{fill:'vmirror'});
 assert.equal(model.lines.length,12);assert.ok(model.lines.every(l=>!l.virtual));
 for(const set of profile.sets)for(const sign of [-1,1])for(const angle of [0,30,60,70]){
  const e=model.evalAt(angle,norm360(set.phi+(sign<0?180:0)));
  const ratio=set.data.W[data.angles.indexOf(sign*angle)][1]/set.data.W[data.angles.indexOf(0)][1];
  assert.ok(Math.abs(e.yRatio-ratio)<1e-12);assert.ok([e.jncd,e.de00,...e.T].every(Number.isFinite));
 }
 assert.ok(model.buildLUT().data.every(Number.isFinite));
}
const source=JSON.parse(fs.readFileSync(path.join(root,'vendor/angle/measurement-sources.json')));
assert.equal(source.files.length,30);
console.log('Angle snapshot: five six-direction profiles, all 12 rays measured; optical samples and LUTs verified.');
