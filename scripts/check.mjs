import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync,existsSync} from 'node:fs';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const args of [['--check','app.js'],['--check','vendor/angle/embed-app.js'],['--check','vendor/uniformity/app.js'],['--check','vendor/reflectance/app.js'],['scripts/check-measurements.mjs'],['scripts/check-angle-data.mjs'],['scripts/svm/rebuild.mjs','--check'],['scripts/svm/audit.mjs'],['scripts/build-svm-embed.mjs','--check'],['vendor/svm/verify-bridge.mjs']]){
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
const index=JSON.parse(readFileSync(root+'data/svm/index.json'));
if(index.records.length!==17)throw new Error('Expected 17 SVM records');
for(const entry of index.records){
  if(!Number.isInteger(entry.displayedDataPoints)||entry.displayedDataPoints<0)throw new Error(`Invalid displayedDataPoints for ${entry.file}`);
  for(const key of ['rawFile','processedFile'])if(!existsSync(root+'data/svm/'+entry[key]))throw new Error(`Missing ${entry[key]}`);
}
const mate90=index.records.find(entry=>entry.file==='huawei_mate90promax.json');
if(!mate90||mate90.device!=='华为 Mate 90 Pro Max 典藏版'||mate90.mode!=='默认'||mate90.displayedDataPoints!==0)throw new Error('Mate 90 SVM record must preserve its identity and report no measured points under the 500 nits G255 axis cap');
for(const name of ['index.html','vendor/angle/embed.html','vendor/uniformity/index.html','vendor/reflectance/index.html']){
  const dir=name.slice(0,name.lastIndexOf('/')+1);
  const html=readFileSync(root+name,'utf8');
  for(const match of html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"#]*)?"/g)){
    const resource=match[1];
    if(resource.includes(':')||resource.startsWith('#'))continue;
    if(!existsSync(root+dir+resource))throw new Error(`Missing asset ${dir+resource}`);
  }
}
console.log('JavaScript syntax, source data, reproducibility, and local assets: PASS');
