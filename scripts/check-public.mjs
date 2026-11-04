import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export function blockedPublicFile(file){
 const p=file.replaceAll('\\','/');
 return /\.(glb|gltf|blend\d*|pem|key|sqlite(?:-wal|-shm)?|db(?:-wal|-shm)?|bin|gguf|onnx|safetensors|pt|pth|wav|mp3|ogg|webm|m4a|woff2?|ttf|otf)$/i.test(p)
  || /(^|\/)(data|模型|assets|shots|qa|scratch|temp|tmp|\.superpowers|\.cache|voices|models|recordings)(\/|$)/i.test(p)
  || /(^|\/)(\.env[^/]*|character\.local\.json|(?:credentials?|tokens?|secrets?)(?:[._-][^/]*)?)(\/|$)/i.test(p)
  || /^public\/characters(\/|$)/.test(p);
}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
export function checkPublic(){
 const tracked=execFileSync('git',['ls-files','-z']).toString().split('\0').filter(Boolean),bad=tracked.filter(blockedPublicFile);
 if(bad.length)throw Error('Private/scratch files tracked: '+bad.join(','));
 for(const file of walk('dist')){
  // Vite's generated assets directory is expected; inspect its contents, not the directory name.
  if(blockedPublicFile(file.replace(/^dist\/assets\//,'dist/'))||file.includes('/characters/'))throw Error('Private build asset: '+file);
  if(/\.(js|html|json|css)$/.test(file)&&/\/Volumes\/|\/Users\/|__private\/models\//.test(fs.readFileSync(file,'utf8')))throw Error('Private path in build: '+file);
 }
 console.log('PASS: tracked files and production build exclude scratch, credentials, private models, voice/model/font assets and local paths');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)checkPublic();
