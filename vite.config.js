import {defineConfig} from 'vite';
import fs from 'node:fs';
import path from 'node:path';
const virtualId='virtual:character-config',resolvedId='\0'+virtualId;
export default defineConfig(({command,mode})=>{
  let local={};
  if(command==='serve'&&mode!=='public')try{local=JSON.parse(fs.readFileSync(new URL('./character.local.json',import.meta.url),'utf8'));}catch{}
  const enabled=!!local.assetRoot;
  const config=enabled?{defaultCharacter:local.defaultCharacter||'maid-arms',modelBase:'/__private/models/',paperUrl:'/__private/characters/whale-maid-paper.png'}:{defaultCharacter:'whale',modelBase:null,paperUrl:null};
  return {plugins:[{name:'local-private-character',resolveId(id){if(id===virtualId)return resolvedId;},load(id){if(id===resolvedId)return 'export default '+JSON.stringify(config);},configureServer(server){
    if(!enabled)return;
    const root=fs.realpathSync(local.assetRoot);
    server.middlewares.use('/__private/',(req,res)=>{
      try{
        const rel=decodeURIComponent((req.url||'').split('?')[0]);const candidate=path.resolve(root,'.'+(rel.startsWith('/')?rel:'/'+rel));const file=fs.realpathSync(candidate);
        if(!file.startsWith(root+path.sep)||!['.glb','.png','.jpg','.webp'].includes(path.extname(file))){res.statusCode=403;res.end();return;}
        res.setHeader('Content-Type',path.extname(file)==='.glb'?'model/gltf-binary':'image/'+path.extname(file).slice(1));fs.createReadStream(file).pipe(res);
      }catch{res.statusCode=404;res.end();}
    });
  }}]};
});
