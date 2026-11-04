import {buildServer} from './app.js';
import {GAME_PORT, DEV_API_PORT} from '../shared/ports.js';
const port=process.argv.includes('--dev')?DEV_API_PORT:GAME_PORT;
const app=await buildServer({serveStatic:true,logger:true,worldMode:!process.argv.includes('--legacy'),auth:{recoverOwner:process.argv.includes('--recover-owner'),issuer:process.env.WORLD_PUBLIC_URL||`http://127.0.0.1:${process.argv.includes('--dev')?GAME_PORT:port}`,onBootstrap:code=>console.error(`首次主人配对码（15分钟有效，仅本机使用）：${code}`)}});
try {await app.listen({host:'127.0.0.1',port});}
catch(error){
  if(error.code==='EADDRINUSE')console.error(`端口 ${port} 已被占用。请关闭已有的大肥鱼服务或占用该端口的程序，然后重试。`);
  else app.log.error(error);
  await app.close();process.exit(1);
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
