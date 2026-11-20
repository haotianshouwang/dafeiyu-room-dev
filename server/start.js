import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {buildServer} from './app.js';
import {GAME_PORT, DEV_API_PORT} from '../shared/ports.js';
import {COMMUNITY_SERVER_ORIGINS} from '../src/community/server-config.js';
const port=process.argv.includes('--dev')?DEV_API_PORT:GAME_PORT;
const issuer=process.env.WORLD_PUBLIC_URL||`http://127.0.0.1:${process.argv.includes('--dev')?GAME_PORT:port}`;
const localAccess=['127.0.0.1','localhost','[::1]'].includes(new URL(issuer).hostname);
const devAssets=new URL('../.cache/town-assets/',import.meta.url);
const localAssetDir=process.argv.includes('--dev')&&existsSync(new URL('../.cache/town-assets/manifest.json',import.meta.url))?fileURLToPath(devAssets):undefined;
const communityApiOrigin=process.env.DAFEIYU_COMMUNITY_API_ORIGIN||COMMUNITY_SERVER_ORIGINS.production;
const app=await buildServer({serveStatic:true,localAssetDir,logger:true,worldMode:!process.argv.includes('--legacy'),communityApiOrigin,auth:{localAccess,issuer}});
try {await app.listen({host:'127.0.0.1',port});}
catch(error){
  if(error.code==='EADDRINUSE')console.error(`端口 ${port} 已被占用。请关闭已有的大肥鱼服务或占用该端口的程序，然后重试。`);
  else app.log.error(error);
  await app.close();process.exit(1);
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
