import {createTeleportEffect} from './ui/teleport-effect.js';
import {mountAuthorExamples} from './ui/author-examples.js';
import {discoverLocalAssets,localAssetCache,prepareLocalSnapshot} from './world/local-assets.js';
import {registerLocalFurniture} from './world/props.js';
import {LocalSound} from './core/local-sound.js';
import {mountAudioPlayer} from './core/audio-playback.js';
import * as THREE from 'three';
import {createRenderer} from './core/renderer.js';
import {setupEnvironment,setupBackdrop} from './core/env.js';
import {setupLights} from './core/lights.js';
import {IsoCamera,bindCameraWheel} from './core/camera.js';
import {buildRoom} from './world/room.js';
import {buildProps,createFurniture} from './world/props.js';
import {buildYard} from './world/yard.js';
import {buildLiving} from './world/living.js';
import {SceneRegistry} from './world/registry.js';
import {ActionDispatcher} from './core/action-dispatcher.js';
import {presentActor} from './core/actor-presentation.js';
import {PlayerController} from './core/player-controller.js';
import {ActorTimeline} from './core/actor-timeline.js';
import {WorldClient} from './core/world-client.js';
import {ownerSession} from './ui/owner-session.js';
import {AgentConnect} from './ui/agent-connect.js';
const agentConnect=new AgentConnect();
import {Whale} from './characters/whale.js';
import characterConfig from 'virtual:character-config';
import {WhaleMaid} from './characters/whaleMaid.js';
import {WhalePaper} from './characters/whalePaper.js';
import {FX} from './effects/fx.js';
import {HUD} from './ui/hud.js';
import {RoomEditor} from './ui/room-editor.js';
import {Interactions} from './interactions.js';
import {portalInwardNormal} from './core/keyboard-portals.js';
import {portalEnds,walkable,segmentWalkable} from '../shared/world/navigation.js';
import {getCatalogEntry} from '../shared/world/catalog.js';

setupBackdrop();
const R=createRenderer(document.getElementById('app')),scene=new THREE.Scene(),iso=new IsoCamera(),camera=iso.camera;
setupEnvironment(R.renderer,scene);const lights=setupLights(scene,{windowPos:new THREE.Vector3(.05,1.6,-3.4)});
const lightDefaults=Object.fromEntries(Object.entries(lights).map(([key,light])=>[key,light.intensity]));
let yard=null;const props={group:new THREE.Group()};
const registry=new SceneRegistry({scene,createFurniture,lazy:true,legacy:{
 bedroom:()=>{const room=buildRoom(),p=buildProps(),root=new THREE.Group();root.add(room.group,p.group);return {root,furniture:p.group,view:{target:new THREE.Vector3(.15,1.05,0),zoom:1.02},update:(dt,t)=>{room.update?.(dt,t);p.update?.(dt,t);}};},
 living:()=>{const c=buildLiving();return {root:c.group,furniture:c.group,view:c.view,update:c.update};},
 yard:()=>{yard=buildYard();return {root:yard.group,furniture:yard.group,view:yard.view,update:yard.update,refreshLandscape:yard.refreshLandscape};}
}});
const requested=new URLSearchParams(location.search).get('character');
const mode=characterConfig.modelBase?(requested||characterConfig.defaultCharacter):'whale';
const original=mode==='whale'?new Whale():mode==='paper'?new WhalePaper():new WhaleMaid(mode==='maid-arms'?{modelFile:'Whale_Maid_Lively.glb'}:{});
let whale=original;const blob=new Whale();blob.group.visible=false;scene.add(original.group,blob.group);original.ready?.then(()=>registry.pool.retain(original.group));registry.pool.retain(blob.group);original.group.scale.setScalar(1.28);blob.group.scale.setScalar(1.28);
original.ready?.catch(()=>showMessage('角色模型加载失败，可使用 ?character=whale 查看默认鲸鱼'));
const fx=new FX(scene),hud=new HUD(),game=new Interactions({scene,camera,iso,whale,fx,props,hud,lights});
const localSound=new LocalSound();game.onVoice=kind=>localSound.play(kind);
const client=new WorldClient({pollMs:100,prepareSnapshot:prepareLocalSnapshot}),actorTimeline=new ActorTimeline();let editor=null,activeScene=null,actor=null,lease=null,takeover=null,lastInputAt=0,lastPortalAt=0,portalPending=false;
const keys=new Set(),goal=new THREE.Vector3(),renderPosition=new THREE.Vector3();
const status=document.createElement('div');status.id='world-sync-status';status.setAttribute('role','status');status.style.cssText='position:fixed;left:20px;bottom:20px;z-index:32;background:#faf1e5e8;border-radius:12px;padding:8px 12px;color:#51454a;font:13px system-ui;max-width:70vw';status.textContent='正在连接世界…';document.body.append(status);
function showMessage(message){status.textContent=message;}
client.onStatus(value=>{if(value==='connected')showMessage('世界已连接 · WASD 接管移动 · 点击地点可选择目的场景');else{keys.clear();player.release();lease=null;showMessage(value==='unauthorized'?'主人会话已失效，请刷新页面重新连接':'世界离线 · 草稿已保留，正在重连');}});
function showScene(id){const cfg=registry.scenes.get(id);if(!cfg)return;activeScene=id;registry.show(id);refreshScenePicker();const street=cfg.data.templateId==='street_corner_v1';scene.background=street?new THREE.Color(0xc9e5ed):(cfg.data.templateId==='coastal_town_v1'||cfg.template.authorSceneId)?new THREE.Color(0xd8e6dd):null;for(const [key,light]of Object.entries(lights))light.intensity=lightDefaults[key]*(street?({sun:1.1,hemi:1.5,fill:1.15}[key]??0):1);iso.setProfile(cfg.data.templateId);iso.setView(cfg.view.target,cfg.view.zoom);iso.target.copy(iso.homeTarget);iso.zoom=iso.homeZoom;iso.zoomTarget=iso.homeZoom;iso.drag=iso.dragTarget=0;iso.par.set(0,0);iso.parTarget.set(0,0);game.setScene(cfg);whale.bounds=cfg.bounds;whale.colliders=null;editor?.setContext(id);const loc=document.getElementById('loc');if(loc)loc.textContent=`${cfg.label}`;lastPortalAt=performance.now();}
client.onSnapshot(snapshot=>{
 registry.applySnapshot(snapshot);refreshScenePicker();const next=snapshot.actors.find(a=>a.actorId==='whale')||snapshot.actors[0];if(!next)return;
 const changed=actor?.sceneId!==next.sceneId;actor=next;player.reconcile(next);actorTimeline.push(next,performance.now());
 if(editor){const missing=Object.values(registry.contexts).some(c=>!c.sync);if(missing)editor.updateWorldContexts();}
 if(changed){if(portalPending)keys.clear();renderPosition.fromArray(next.position);showScene(next.sceneId);}
 if(portalPending&&!player.active&&!next.actionId&&!dispatcher.busy)portalPending=false;
 if(lease&&(next.controller?.leaseId!==lease.leaseId||next.controller?.leaseVersion!==lease.leaseVersion))lease=null;
 const need=next.needs||{};game.stats.food=100-(need.hunger??54);game.stats.mood=need.happiness??72;game.stats.energy=need.energy??80;game._syncStats();
});
async function control(force=false){if(takeover)return takeover;if(!force&&lease&&lease.expiresAt>Date.now()+5000)return lease;takeover=client.dispatch({kind:force||!lease?'control.takeover':'control.renew',payload:force||!lease?{actorId:actor.actorId}:{actorId:actor.actorId,leaseId:lease.leaseId,leaseVersion:lease.leaseVersion}}).then(result=>{lease=result;return result;}).finally(()=>takeover=null);return takeover;}
const dispatcher=new ActionDispatcher(async(kind,target,{force=false}={})=>{if(!actor||client.connectionStatus!=='connected')return;try{const token=await control(force);const current=client.snapshot.actors.find(a=>a.actorId===actor.actorId);if(kind!=='cancel'&&current.actionId&&!(kind==='move'&&client.snapshot.actions[current.actionId]?.kind==='move')){await client.dispatch({kind:'action.submit',payload:{actorId:actor.actorId,leaseId:token.leaseId,leaseVersion:token.leaseVersion,kind:'cancel'}});}return await client.dispatch({kind:'action.submit',payload:{actorId:actor.actorId,leaseId:token.leaseId,leaseVersion:token.leaseVersion,kind,...(target?{target}:{})}});}catch(error){showMessage(`操作未执行：${error.message}`);}});
const player=new PlayerController({takeControl:()=>control(true),send:payload=>client.dispatch({kind:'actor.input',payload},{refresh:false}),onError:error=>{keys.clear();showMessage(`移动未同步：${error.message}`);}});
async function action(kind,target,options){
 try{if(player.active){player.stop();await player.drain();await client.refreshState();const settled=client.snapshot.actors.find(a=>a.actorId===actor.actorId);if(settled)actorTimeline.handoff(settled,performance.now());player.release();}
  return await dispatcher.submit(kind,target,options);
 }catch(error){showMessage(`操作未执行：${error.message}`);}
 finally{if(kind==='cancel')portalPending=false;}
}
function interact(kind,target){if(!actor)return;stopMovement();keys.clear();if(kind==='eat'){localSound.play(kind);return action(kind,undefined,{force:true});}const candidate=client.snapshot.entities.filter(e=>(!target?.entityId||e.entityId===target.entityId)&&getCatalogEntry(e.type).actions.includes(kind)).sort((a,b)=>Number(b.sceneId===actor.sceneId)-Number(a.sceneId===actor.sceneId))[0];if(!candidate){showMessage('世界里还没有对应的家具');return;}action(kind,{entityId:candidate.entityId,anchorId:'approach'},{force:true}).then(result=>{if(result)localSound.play(kind);});}
game.worldAction=interact;
game.getFurniture=()=>registry.scenes.get(activeScene)?.furniture.children||[];
const teleportEffect=createTeleportEffect();let teleportPending=false;
async function teleportToScene(id){
 if(teleportPending||!actor||id===actor.sceneId)return;
 if(dispatcher.busy){showMessage('请等待当前操作完成后传送');return;}
 teleportPending=true;keys.clear();
 try{
  if(editor?.active){await editor.setActive(false);if(editor.active){showMessage('请先保存当前布置再传送');return;}}
  player.stop();await player.drain();player.release();lease=null;
  await teleportEffect.depart(registry.scenes.get(id)?.label||id);
  await client.dispatch({kind:'actor.teleport',payload:{actorId:actor.actorId,sceneId:id}});
  actorTimeline.handoff(actor,performance.now());renderPosition.fromArray(actor.position);
  await teleportEffect.arrive();
 }catch(error){showMessage(`传送失败：${error.message}`);}
 finally{teleportEffect.clear();teleportPending=false;keys.clear();}
}
const scenePicker=document.createElement('nav');scenePicker.setAttribute('aria-label','场景传送');scenePicker.style.cssText='position:fixed;left:24px;top:110px;z-index:30;display:grid;gap:7px;background:#faf1e5ed;padding:12px;border:1px solid #fff9;border-radius:16px;font:14px system-ui;max-height:calc(100vh - 300px);overflow:auto;min-width:110px';document.body.append(scenePicker);
let scenePickerKey='';
function refreshScenePicker(){
 const choices=[...registry.scenes].filter(([,cfg])=>cfg.data.status==='active');
 const key=JSON.stringify([activeScene,choices.map(([id,cfg])=>[id,cfg.label])]);if(key===scenePickerKey)return;scenePickerKey=key;
 scenePicker.replaceChildren();
 for(const [id,cfg]of choices){const current=id===activeScene,button=document.createElement('button');button.type='button';button.textContent=cfg.label;button.setAttribute('aria-current',current?'location':'false');button.disabled=current;button.style.cssText=`border:1px solid ${current?'#af8556':'#cbbba8'};background:${current?'#dfc39f':'#fff9ee'};color:#51454a;border-radius:10px;padding:9px 12px;font:inherit;cursor:${current?'default':'pointer'}`;button.onclick=()=>{keys.clear();void teleportToScene(id);};scenePicker.append(button);}
}

const editable=target=>target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName);
window.addEventListener('keydown',e=>{if(teleportPending||e.repeat||editor?.resetPending||agentConnect.panel||editable(e.target)||!['KeyW','KeyA','KeyS','KeyD','Space'].includes(e.code))return;e.preventDefault();if(e.code==='Space'){if(!editor?.active)player.jumpRequested=true;return;}keys.add(e.code);});
window.addEventListener('keyup',e=>{const wasMovement=keys.delete(e.code);if(wasMovement&&!keys.size&&!editor?.active){player.stop();player.flush().catch(()=>{});}});
function stopMovement(){const moving=keys.size>0;keys.clear();if(moving&&!editor?.active){player.stop();player.flush().catch(()=>{});}}window.addEventListener('blur',stopMovement);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMovement();});
const pointer=new THREE.Vector2();window.addEventListener('pointermove',e=>{pointer.set(e.clientX/window.innerWidth*2-1,-e.clientY/window.innerHeight*2+1);iso.setPointer(pointer.x,pointer.y);});
const canvas=R.renderer.domElement;let dragging=false,lastX=0;canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging=true;lastX=e.clientX;});canvas.addEventListener('pointermove',e=>{if(dragging)iso.addDrag((e.clientX-lastX)*.005);lastX=e.clientX;});for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>dragging=false);
bindCameraWheel(canvas,iso,()=>editor);
window.addEventListener('resize',()=>{R.resize(window.innerWidth,window.innerHeight);iso.resize();});
function directions(snapshot){const result=[];for(const portal of snapshot.portals){const end=portalEnds(snapshot,portal);if(end.fromSceneId===actor.sceneId)result.push({...end,inwardNormal:portalInwardNormal(snapshot,{...portal,...end})});if(portal.bidirectional&&end.toSceneId===actor.sceneId)result.push({fromSceneId:end.toSceneId,toSceneId:end.fromSceneId,departure:end.landing,landing:end.departure,inwardNormal:portalInwardNormal(snapshot,{...portal,...end},true)});}return result;}
function updateKeyboard(dt,now){
 if(teleportPending||agentConnect.panel||editor?.resetPending){stopMovement();return;}
 const x=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),z=Number(keys.has('KeyS'))-Number(keys.has('KeyW'));
 if(!actor)return;
 if(!(x||z)&&!player.jumpRequested&&player.sample?.()?.grounded!==false){if(player.active&&player.held){player.stop();player.flush().catch(()=>{});}return;}
 const az=iso.az+iso.drag,dx=x*Math.sin(az)+z*Math.cos(az),dz=-x*Math.cos(az)+z*Math.sin(az),length=Math.hypot(dx,dz);
 if(editor?.active){iso.target.x+=dx/length*4*dt;iso.target.z+=dz/length*4*dt;return;}
 if(portalPending||client.connectionStatus!=='connected')return;
 if(player.active&&player.lease?.expiresAt<=Date.now())player.release();
 if(!player.active)player.begin(actor);
 player.step(client.snapshot,[length?dx/length:0,length?dz/length:0],dt,player.jumpRequested);player.jumpRequested=false;
 const position=player.sample()?.position||actor.position;
 const portal=directions(client.snapshot).find(p=>Math.hypot(position[0]-p.departure[0],position[2]-p.departure[2])<.8&&dx*p.inwardNormal[0]+dz*p.inwardNormal[2]<-1e-6);
 if(portal&&now-lastPortalAt>2000){
  lastPortalAt=now;portalPending=true;
  action('move',{sceneId:portal.toSceneId}).then(result=>{if(!result)portalPending=false;}).catch(error=>{portalPending=false;showMessage(error.message);});return;
 }
 if(now-lastInputAt>=100){lastInputAt=now;player.flush().catch(()=>{});}
}
function renderActor(dt,t){if(!actor)return;const visual=player.sample()||actorTimeline.sample(performance.now())||actor;const next=visual.form==='swim'?blob:original;if(next!==whale){whale.group.visible=false;whale=next;whale.group.visible=true;game.whale=whale;window.__whale=whale;if(next===blob)localSound.play('pool');fx.splash(new THREE.Vector3(...actor.position));}
 presentActor(whale,visual,dt,t);const seatOffset=registry.seatOffset(visual);if(seatOffset)whale.group.position.add(seatOffset);renderPosition.copy(whale.group.position);
 if(visual.pose==='sleeping'&&Math.floor(t*2)!==Math.floor((t-dt)*2))fx.zzz(renderPosition.clone().add(new THREE.Vector3(.3,.5,0)));
 if(registry.scenes.get(activeScene)?.template.kind==='outdoor'&&!editor?.active)iso.follow(new THREE.Vector3(visual.position[0],visual.position[1],visual.position[2]),dt);
}
R.setScene(scene,camera);const clock=new THREE.Clock();let time=0,shadowTick=0;lights.sun.shadow.autoUpdate=false;
const performanceStats={frames:[],longTasks:0};try{new PerformanceObserver(list=>{performanceStats.longTasks+=list.getEntries().filter(e=>e.duration>100).length;}).observe({entryTypes:['longtask']});}catch{}
const authorProgress=document.createElement('div');authorProgress.style.cssText='position:fixed;top:110px;right:24px;z-index:25;padding:7px 10px;border-radius:10px;background:#fff9ee;color:#51454a;font:12px system-ui';document.body.append(authorProgress);
function updateAuthorProgress(){const cfg=registry.scenes.get(activeScene);authorProgress.hidden=!cfg?.template.progressiveEntities;if(authorProgress.hidden)return;const fixed=cfg.shell?.userData.streaming?.stats,p=cfg.progress;authorProgress.textContent=`完整小镇 · 地形 ${fixed?.resident||0}/185 · 摆设 ${p?.resident||0}/${p?.total||516} · 待加载 ${(fixed?.pending||0)+(p?.pending||0)+localAssetCache.stats.pending}`;}
function frame(){const frameStart=performance.now();const dt=Math.min(.05,clock.getDelta());time+=dt;updateKeyboard(dt,performance.now());registry.update(dt,time);updateAuthorProgress();renderActor(dt,time);iso.update(dt);fx.update(dt,time);hud.updateBubble(dt,camera);R.gradePass.uniforms.uTime.value=time;if(++shadowTick%2===0)lights.sun.shadow.needsUpdate=true;R.composer.render();performanceStats.frames.push(performance.now()-frameStart);if(performanceStats.frames.length>1200)performanceStats.frames.shift();requestAnimationFrame(frame);}frame();
async function start(){const session=await ownerSession.ensure();client.csrfToken=session.csrfToken;registerLocalFurniture(await discoverLocalAssets());mountAudioPlayer(client,localSound);await client.connect('default');editor=new RoomEditor({group:registry.contexts[activeScene].group,scene,camera,canvas,getScene:()=>activeScene,contexts:registry.contexts,worldClient:client,registry,onToggle:active=>{game.editing=active;stopMovement();if(player.active){player.stop();player.drain().then(()=>player.release()).catch(()=>{});}keys.clear();if(!active)iso.target.copy(iso.homeTarget);},onChange:()=>yard?.refreshLandscape?.()});editor.setContext(activeScene);window.__editor=editor;mountAuthorExamples({onOpen:()=>{stopMovement();keys.clear();game.editing=true;},onClose:()=>{game.editing=editor.active;}});document.getElementById('loading')?.classList.add('gone');for(const id of ['title','hint','status','actions'])document.getElementById(id)?.classList.add('in');showMessage('世界已连接 · WASD 接管移动');}
// Loading overlay must never hide the owner pairing dialog or block recovery.
document.getElementById('loadBar').style.width='100%';document.getElementById('loadText').textContent='正在连接世界';start().catch(error=>{document.getElementById('loading')?.classList.add('gone');showMessage(`连接失败：${error.message} · 请刷新重试`);});
Object.assign(window,{__localAssetCache:localAssetCache,__renderer:R.renderer,__R:R,__lights:lights,__iso:iso,__whale:whale,__scene:scene,__game:game,__blob:blob,__maid:original,__worldClient:client,__registry:registry,__coastalPerformance:()=>({p95:[...performanceStats.frames].sort((a,b)=>a-b)[Math.floor(performanceStats.frames.length*.95)]||0,longTasks:performanceStats.longTasks,heap:performance.memory?.usedJSHeapSize,geometries:R.renderer.info.memory.geometries,textures:R.renderer.info.memory.textures,loadedScenes:[...registry.scenes].filter(([,c])=>c.loaded||c.shell).map(([id])=>id),streaming:registry.scenes.get(activeScene)?.shell?.userData.streaming?.stats}),__ownerSession:ownerSession,__roomDebug:()=>({whale:whale.pos.toArray(),state:whale.state,sceneId:activeScene,zoom:iso.zoom,info:{calls:R.renderer.info.render.calls,tris:R.renderer.info.render.triangles}})});
