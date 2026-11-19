import {defineConfig,loadEnv} from 'vite';
import {GAME_PORT,DEV_API_PORT} from './shared/ports.js';
import {COMMUNITY_API_PROXY_PATH,COMMUNITY_SERVER_ORIGINS} from './src/community/server-config.js';
import fs from 'node:fs';
import path from 'node:path';
function removeFinderMetadata(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())removeFinderMetadata(file);
    else if(entry.name==='.DS_Store')fs.unlinkSync(file);
  }
}

const virtualId='virtual:character-config',resolvedId='\0'+virtualId;
export default defineConfig(({command,mode})=>{
  const community=mode==='community';
  const fileEnv=loadEnv(command==='serve'?'development':'production',process.cwd(),'VITE_');
  const gameProxyTarget=`http://127.0.0.1:${DEV_API_PORT}`;
  const communityProxyTarget=process.env.VITE_COMMUNITY_API_PROXY_TARGET||fileEnv.VITE_COMMUNITY_API_PROXY_TARGET||process.env.VITE_COMMUNITY_API_BASE||fileEnv.VITE_COMMUNITY_API_BASE||COMMUNITY_SERVER_ORIGINS.production;
  const communityProxyOrigin=process.env.VITE_COMMUNITY_PROXY_ORIGIN||new URL(communityProxyTarget).origin;
  const builtCommunityApiBase=process.env.VITE_COMMUNITY_API_BASE||fileEnv.VITE_COMMUNITY_API_BASE||'same-origin';
  const communityApiBase=community?builtCommunityApiBase:COMMUNITY_API_PROXY_PATH;
  const configureProxy=proxy=>{
    const rewrite=proxyRequest=>{proxyRequest.setHeader('origin',communityProxyOrigin);proxyRequest.setHeader('referer',`${communityProxyOrigin}/`);};
    proxy.on('proxyReq',rewrite);
    proxy.on('proxyReqWs',rewrite);
    proxy.on('proxyRes',proxyResponse=>{if(proxyResponse.headers['set-cookie'])proxyResponse.headers['set-cookie']=proxyResponse.headers['set-cookie'].map(cookie=>cookie.replace(/;\s*Secure/gi,''));});
  };
  const gameProxyEntry=ws=>({target:gameProxyTarget,changeOrigin:false,...(ws?{ws:true}:{})});
  const communityProxyEntry={target:communityProxyTarget,changeOrigin:true,ws:true,secure:communityProxyTarget.startsWith('https:'),rewrite:path=>path.replace(new RegExp(`^${COMMUNITY_API_PROXY_PATH}`),''),configure:configureProxy};
  const proxy={
    '/mcp':gameProxyEntry(),
    '/api':gameProxyEntry(true),
    '/oauth':gameProxyEntry(),
    '/.well-known':gameProxyEntry(),
    '/ws':gameProxyEntry(true),
    [COMMUNITY_API_PROXY_PATH]:communityProxyEntry
  };
  const config={defaultCharacter:'dafeiyu',modelBase:community?'/game/resources/character/models/':'/resources/character/models/'};
  const manifest=JSON.parse(fs.readFileSync(new URL('./resources/character/manifest.json',import.meta.url),'utf8'));
  return {base:community?'/game/':'/',define:{__DAFEIYU_COMMUNITY_API_BASE_DEFAULT__:JSON.stringify(communityApiBase),__DAFEIYU_COMMUNITY_BUILD__:JSON.stringify(community)},build:community?{outDir:'dist-community',emptyOutDir:true}:undefined,server:{port:GAME_PORT,strictPort:true,proxy},preview:{port:GAME_PORT,strictPort:true,proxy},plugins:[{name:'exclude-finder-metadata',apply:'build',writeBundle({dir}){removeFinderMetadata(dir);}},{name:'bundled-character',resolveId(id){if(id===virtualId)return resolvedId;},load(id){if(id===resolvedId)return 'export default '+JSON.stringify(config);},generateBundle(){
    const audio=JSON.parse(fs.readFileSync(new URL('./resources/audio/manifest.json',import.meta.url),'utf8'));
    const polyfork=JSON.parse(fs.readFileSync(new URL('./resources/polyfork/manifest.json',import.meta.url),'utf8'));
    const bundled=[...manifest.files.filter(f=>f.runtime),...audio.files,{path:'resources/polyfork/LICENSE.md'},{path:'resources/polyfork/CREDITS.md'},...polyfork.assets.flatMap(asset=>[{path:`resources/polyfork/${asset.file}`},{path:`resources/polyfork/${asset.thumbnail}`}])];
    for(const file of bundled)this.emitFile({type:'asset',fileName:file.path,source:fs.readFileSync(new URL('./'+file.path,import.meta.url))});
  }}]};
});
