import {buildServer} from './app.js';
import {GAME_PORT, DEV_API_PORT} from '../shared/ports.js';
const port=process.argv.includes('--dev')?DEV_API_PORT:GAME_PORT;
const app=await buildServer({serveStatic:true,logger:true});
try {await app.listen({host:'127.0.0.1',port});}
catch(error){
  if(error.code==='EADDRINUSE')console.error(`端口 ${port} 已被占用。请关闭已有的大肥鱼服务或占用该端口的程序，然后重试。`);
  else app.log.error(error);
  await app.close();process.exit(1);
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
