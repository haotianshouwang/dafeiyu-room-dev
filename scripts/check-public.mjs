import fs from 'node:fs';import path from 'node:path';import {execFileSync}from 'node:child_process';
const tracked=execFileSync('git',['ls-files','-z']).toString().split('\0').filter(Boolean);
const blocked=p=>/\.(glb|gltf|blend\d*|pem|key|sqlite(?:-wal|-shm)?|db(?:-wal|-shm)?)$/i.test(p)||/^(data|模型|assets|shots|qa|\.env|character\.local\.json|public\/characters)(\/|$)/.test(p);
const bad=tracked.filter(blocked);if(bad.length)throw new Error('Private files tracked: '+bad.join(','));
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walk('dist')){if(/\.(glb|gltf|blend\d*|pem|key|sqlite(?:-wal|-shm)?|db(?:-wal|-shm)?)$/i.test(file)||file.includes('/characters/'))throw new Error('Private build asset: '+file);if(/\.(js|html|json)$/.test(file)){const s=fs.readFileSync(file,'utf8');if(/\/Volumes\/|\/Users\/|__private\/models\//.test(s))throw new Error('Private path in build: '+file);}}
console.log('PASS: tracked files and production build exclude private models and local paths');
