import fs from 'node:fs';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(fs.readFileSync(new URL('../resources/character/manifest.json',import.meta.url),'utf8'));
const audioManifest=JSON.parse(fs.readFileSync(new URL('../resources/audio/manifest.json',import.meta.url),'utf8'));
const approved=new Map([...manifest.files,...audioManifest.files.map(f=>({...f,runtime:true}))].map(f=>[f.path,f]));
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export function blockedPublicFile(file){
 const p=file.replaceAll('\\','/');
 if(approved.has(p))return false;
 if(p.startsWith('resources/character/')&&p!=='resources/character/manifest.json')return true;
 return /\.(glb|gltf|blend\d*|pem|key|sqlite(?:-wal|-shm)?|db(?:-wal|-shm)?|bin|gguf|onnx|safetensors|pt|pth|wav|mp3|ogg|webm|m4a|woff2?|ttf|otf)$/i.test(p)
  || /(^|\/)(data|模型|assets|shots|qa|scratch|temp|tmp|\.superpowers|\.cache|voices|models|recordings)(\/|$)/i.test(p)
  || /(^|\/)(\.env[^/]*|character\.local\.json|(?:credentials?|tokens?|secrets?)(?:[._-][^/]*)?)(\/|$)/i.test(p)
  || /^public\/characters(\/|$)/.test(p);
}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
export function checkPublic(){
 for(const entry of audioManifest.files){if(!/^resources\/audio\/[a-z0-9-]+\.mp3$/.test(entry.path)||createHash('sha256').update(fs.readFileSync(entry.path)).digest('hex')!==entry.sha256)throw Error('Invalid approved audio: '+entry.path);}
 for(const entry of manifest.files){
  if(!/^resources\/character\/(models\/[^/]+\.(glb|blend)|characters\/whale-maid-paper\.png|notes\/[^/]+\.txt)$/.test(entry.path)||/(before-author|secrets?|tokens?|credentials?)/i.test(entry.path))throw Error('Invalid approved resource: '+entry.path);
  if(createHash('sha256').update(fs.readFileSync(entry.path)).digest('hex')!==entry.sha256)throw Error('Resource digest mismatch: '+entry.path);
 }
 const tracked=execFileSync('git',['ls-files','-z']).toString().split('\0').filter(Boolean),bad=tracked.filter(blockedPublicFile);
 if(bad.length)throw Error('Private/scratch files tracked: '+bad.join(','));
 for(const file of walk('dist')){
  // Vite's generated assets directory is expected; inspect its contents, not the directory name.
  const relative=file.replace(/^dist\//,'');
  const entry=approved.get(relative);
  if(entry){if(!entry.runtime||createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==entry.sha256)throw Error('Unexpected build resource: '+file);continue;}
  if(blockedPublicFile(file.replace(/^dist\/assets\//,'dist/'))||file.includes('/characters/'))throw Error('Private build asset: '+file);
  if(/\.(js|html|json|css)$/.test(file)&&/\/Volumes\/|\/Users\/|__private\/models\//.test(fs.readFileSync(file,'utf8')))throw Error('Private path in build: '+file);
 }
 for(const entry of manifest.files.filter(f=>f.runtime))if(!fs.existsSync(path.join('dist',entry.path)))throw Error('Missing runtime resource: '+entry.path);
 console.log('PASS: tracked files and production build exclude scratch, credentials, unapproved character/audio files, model weights/fonts and local paths');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)checkPublic();
