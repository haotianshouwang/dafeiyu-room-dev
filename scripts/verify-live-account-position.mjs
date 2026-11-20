// Credentials are accepted on stdin only; reports never contain passwords or cookies.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {buildServer} from '../server/app.js';
import {COMMUNITY_SERVER_ORIGINS} from '../src/community/server-config.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'output/playwright/live-account-position-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(output,{recursive:true});
let input='';for await(const chunk of process.stdin)input+=chunk;
const credentials=JSON.parse(input);input='';
if(!credentials.identifier||!credentials.password)throw Error('Login credentials are required on stdin');
const origin=COMMUNITY_SERVER_ORIGINS.production;
const report={startedAt:new Date().toISOString(),server:origin,account:'A',checks:[],pageErrors:[],resourceFailures:[],expectedAuthBootstrap:[],models:{},websockets:{}};
const loggedIn=new WeakSet();
let local,browser,webA,localA,initial,userId,changed=false;
const contexts=[];
const sanitise=value=>String(value).replaceAll(credentials.password,'[redacted]').replaceAll(credentials.identifier,'[account A]').replace(/([?&](?:token|code|key)=)[^&#\s]+/gi,'$1[redacted]');
async function check(name,fn){
  console.log('START '+name);
  try{const details=await fn();report.checks.push({name,status:'PASS',details});console.log('PASS '+name);}
  catch(error){report.checks.push({name,status:'FAIL',error:sanitise(error.message)});throw error;}
}
async function state(page){return page.evaluate(()=>{
  const canonical=window.__worldClient?.snapshot?.actors?.[0],actor=window.__player?.sample()||canonical,rt=window.__communityRealtime?.();
  return {sceneId:actor?.sceneId,position:actor?.position,rotation:actor?.rotation,pose:actor?.pose,form:actor?.form,
    authoritativePosition:canonical?.position,renderPosition:window.__roomDebug?.()?.whale,
    online:rt?.status,room:rt?.roomId,modelReady:Boolean(window.__maid?.model),accountReady:Boolean(window.__communityUser?.()?.id),
    syncing:rt?.accountSyncPending,revision:rt?.accountRevision};
});}
async function ready(page){await page.waitForFunction(()=>window.__worldClient?.snapshot&&window.__editor&&window.__maid?.model&&
  window.__communityUser?.()?.id&&window.__communityRealtime?.()?.status==='online'&&!window.__communityRealtime?.()?.accountSyncPending,
  null,{timeout:120000});}
async function follow(page,target){const start=Date.now();await page.waitForFunction(target=>{
  const a=window.__player?.sample()||window.__worldClient?.snapshot?.actors?.[0],render=window.__roomDebug?.();
  return a?.sceneId===target.sceneId&&render?.sceneId===target.sceneId&&
    Math.hypot(...a.position.map((n,i)=>n-target.position[i]))<.05&&
    Math.hypot(render.whale[0]-target.position[0],render.whale[2]-target.position[2])<.05;
},target,{timeout:20000});return {latencyMs:Date.now()-start,...await state(page)};}
async function move(page,key){
  await page.bringToFront();await page.locator('canvas').first().click({position:{x:500,y:300}});
  await page.keyboard.down(key);await page.waitForTimeout(600);await page.keyboard.up(key);
  await page.waitForTimeout(1000);
  const result=await state(page);
  (report.moves??=[]).push({key,state:result,diagnostics:await diagnostics(page)});
  return result;
}
async function diagnostics(page){return page.evaluate(()=>{
  const p=window.__player,r=window.__communityRealtime?.(),a=window.__worldClient?.snapshot?.actors?.[0];
  return {keys:window.__keys?.(),hidden:document.hidden,focused:document.hasFocus(),activeElement:document.activeElement?.tagName,
    actor:a&&{position:a.position,sceneId:a.sceneId,controller:a.controller,input:a.input},
    player:p&&{active:p.active,held:p.held,sequence:p.sequence,ack:p.ack,pending:p.pending?.length,position:p.sample()?.position,lease:p.lease},
    realtime:r&&{sequence:r.controlSequence,revision:r.accountRevision,pending:r.accountSyncPending},
    inputEvents:window.__verificationInputEvents,freeze:window.__freezeReport?.()};
});}
async function teleport(page,sceneId){
  changed=true;await page.bringToFront();await page.evaluate(async sceneId=>{
    await window.__worldClient.dispatch({kind:'actor.teleport',payload:{actorId:'whale',sceneId}});
  },sceneId);await page.waitForFunction(sceneId=>window.__roomDebug().sceneId===sceneId,sceneId,{timeout:30000});
}
async function newPage(label){
  const context=await browser.newContext({viewport:{width:1360,height:900},serviceWorkers:'block'});contexts.push(context);
  const page=await context.newPage();report.models[label]=[];report.websockets[label]={opened:0,accountUpdates:0,errors:[]};
  await page.addInitScript(()=>{
    window.__verificationInputEvents=[];
    for(const type of ['keydown','keyup','blur','focus','visibilitychange'])window.addEventListener(type,event=>{
      if(type.startsWith('key')&&!/^Key[WASD]$/.test(event.code))return;
      window.__verificationInputEvents.push({type,code:event.code,time:Math.round(performance.now()),hidden:document.hidden,target:event.target?.tagName});
      if(window.__verificationInputEvents.length>30)window.__verificationInputEvents.shift();
    },true);
  });
  page.on('pageerror',error=>report.pageErrors.push({label,message:sanitise(error.message)}));
  page.on('response',async response=>{
    const url=new URL(response.url());
    if(response.status()>=400){
      const entry={label,path:url.pathname,status:response.status()};
      if(response.status()===401&&/\/api\/auth\/(?:me|session)$/.test(url.pathname)&&!loggedIn.has(page))report.expectedAuthBootstrap.push(entry);
      else report.resourceFailures.push(entry);
    }
    if(/Dafeiyu[^/]*\.glb$/.test(url.pathname)){
      const headers=await response.allHeaders();await response.finished();const sizes=await response.request().sizes();
      report.models[label].push({path:url.pathname,status:response.status(),
        encoding:headers['content-encoding']||null,wireBytes:Number(headers['content-length'])||Math.max(0,sizes.responseBodySize)||null,
        decodedBytes:(await response.body()).length});
    }
  });
  page.on('websocket',socket=>{
    if(!socket.url().includes('/ws/realtime'))return;
    report.websockets[label].opened++;
    socket.on('framereceived',event=>{try{const m=JSON.parse(String(event.payload));
      if(m.account_sync)report.websockets[label].accountUpdates++;
      if(m.type==='error')report.websockets[label].errors.push(m.code||'UNKNOWN');
    }catch{}});
  });
  return page;
}
async function login(page,isLocal){
  if(isLocal){
    await page.goto(report.localOrigin+'/');
    await page.waitForFunction(()=>window.__worldClient?.snapshot&&window.__editor,null,{timeout:90000});
    await page.locator('.community-entry').click();
    await page.locator('.community-form input[name="identifier"]').fill(credentials.identifier);
    await page.locator('.community-form input[name="password"]').fill(credentials.password);
  }else{
    await page.goto(origin+'/?next=/game/');
    await page.locator('#login-tab').click();
    await page.locator('#identifier').fill(credentials.identifier);
    await page.locator('#password').fill(credentials.password);
  }
  const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/api/auth/login')&&response.request().method()==='POST');
  await page.locator(isLocal?'.community-form button[type="submit"]':'#auth-submit').click();
  const response=await responsePromise;
  assert.equal(response.status(),200,'Account A login must succeed');
  loggedIn.add(page);
  const body=await response.json();if(userId)assert.equal(body.user.id,userId,'Both clients must use account A');else userId=body.user.id;
  if(!isLocal&&!page.url().includes('/game/'))await page.goto(origin+'/game/');
  await ready(page);
}
async function restore(){
  const page=[webA,localA].find(page=>page&&!page.isClosed());
  if(!page||!initial||!changed)return;
  const restoreState=credentials.restoreState||initial;
  for(const other of [webA,localA])if(other&&other!==page&&!other.isClosed())await other.close();
  await page.bringToFront();
  await page.evaluate(async initial=>{
    await window.__worldClient.dispatch({kind:'actor.sync',payload:{actorId:'whale',state:{scene_id:initial.sceneId,
      position:initial.position,rotation:initial.rotation,pose:initial.pose,form:initial.form,moving:false,sprint:false}}});
    const r=window.__communityRealtime?.();r?.markActivity();
    r?.sendPosition({sceneId:initial.sceneId,position:initial.position,rotation:initial.rotation,pose:initial.pose,form:initial.form,force:true});
  },restoreState);
  await follow(page,restoreState);await page.waitForTimeout(1300);await follow(page,restoreState);
  report.originalPositionRestored=true;
}

try{
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const localPort=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  report.localOrigin=`http://127.0.0.1:${localPort}`;
  local=await buildServer({databasePath:path.join(output,'local.sqlite'),worldMode:true,serveStatic:true,
    localAssetDir:null,auth:{localAccess:true,issuer:report.localOrigin},communityApiOrigin:origin});
  await local.listen({host:'127.0.0.1',port:localPort});
  const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'C:/Users/Win10/AppData/Local/ms-playwright/chromium-1252/chrome-win64/chrome.exe';
  browser=await chromium.launch({headless:true,executablePath,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  webA=await newPage('web-A');
  await check('Account A logs into the public game and renders the real model',async()=>{
    const start=Date.now();await login(webA,false);initial=await state(webA);report.initialState=initial;
    return {...initial,coldLoginAndModelMs:Date.now()-start};
  });
  localA=await newPage('local-A');
  await check('Local game logs into the same live account and restores its position',async()=>{
    await login(localA,true);return follow(localA,initial);
  });
  await check('Public web movement follows to local game',async()=>{
    await teleport(webA,'living');const before=await state(webA),target=await move(webA,'d');
    assert.ok(Math.hypot(...target.position.map((n,i)=>n-before.position[i]))>.1,'Keyboard input must actually move the player');
    return {source:target,target:await follow(localA,target)};
  });
  await check('Local movement takes control and follows back to public web',async()=>{
    const before=await state(localA),target=await move(localA,'a');
    assert.ok(Math.hypot(...target.position.map((n,i)=>n-before.position[i]))>.1,'Local keyboard input must actually move the player');
    const followed=await follow(webA,target);await localA.waitForTimeout(1500);await follow(localA,target);
    return {source:target,target:followed};
  });
  await check('Changing from private room to public lobby stays synchronised',async()=>{
    await teleport(webA,'public-lobby');const target=await move(webA,'d');
    const followed=await follow(localA,target);await webA.waitForTimeout(1500);await follow(webA,target);
    return {source:target,target:followed};
  });
  await check('Public and local clients share the optimised model with no duplicate download',async()=>{
    for(const [label,requests]of Object.entries(report.models)){
      assert.equal(requests.length,1,label+' must download one model');
      assert.match(requests[0].path,/Dafeiyu-web-v1\.glb$/);assert.equal(requests[0].encoding,'gzip');
      assert.equal(requests[0].decodedBytes,7332864);
    }
    await webA.screenshot({path:path.join(output,'public-account-A.png')});
    await localA.screenshot({path:path.join(output,'local-account-A.png')});
    const metrics={};for(const [label,page]of [['web-A',webA],['local-A',localA]]){
      metrics[label]=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>/Dafeiyu[^/]*\.glb$/.test(e.name)).map(e=>({durationMs:Math.round(e.duration),encodedBodySize:e.encodedBodySize,decodedBodySize:e.decodedBodySize})));
    }return {responses:structuredClone(report.models),metrics};
  });
  await check('Refreshing the public game restores the account position',async()=>{
    const target=await state(webA);await webA.reload();await ready(webA);return follow(webA,target);
  });
  await check('Refreshing the local game reconnects to the same account position',async()=>{
    const target=await state(webA);await localA.reload();await ready(localA);return follow(localA,target);
  });
  await check('Movement continues after both clients reconnect',async()=>{
    const target=await move(localA,'a');return {source:target,target:await follow(webA,target)};
  });
  await check('Neither client renders a duplicate avatar for its own account',async()=>{
    for(const page of [webA,localA])assert.equal(await page.evaluate(id=>window.__presenceLayer()?.players.has(id)||window.__communityRealtime()?.players.has(id),userId),false);
  });
  await check('No browser errors, failed resources or realtime errors',async()=>{
    assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.resourceFailures,[]);
    for(const socket of Object.values(report.websockets))assert.deepEqual(socket.errors,[]);
  });
  report.status='PASS';
}catch(error){
  report.status='FAIL';report.error=sanitise(error.stack);process.exitCode=1;console.error(sanitise(error.message));
  for(const [label,page]of [['web-A',webA],['local-A',localA]])if(page&&!page.isClosed()){
    report[label]=await state(page).catch(()=>null);report[label+'-diagnostics']=await diagnostics(page).catch(()=>null);
    await page.screenshot({path:path.join(output,label+'-failure.png')}).catch(()=>{});
    report[label+'-ui']=sanitise(await page.locator('body').innerText().catch(()=>''));
  }
}finally{
  try{await restore();}catch(error){report.originalPositionRestored=false;report.restoreError=sanitise(error.message);report.status='FAIL';process.exitCode=1;}
  for(const page of [webA,localA])if(page&&!page.isClosed()){
    try{await page.evaluate(async()=>{if(window.__communityApi?.currentUserId)await window.__communityApi.logout();});}catch{}
  }
  await Promise.allSettled(contexts.map(c=>c.close()));await browser?.close();await local?.close();
  credentials.password='';report.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));
  console.log('REPORT '+path.join(output,'result.json'));
}
