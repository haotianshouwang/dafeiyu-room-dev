import {surfaceAt} from '../../shared/world/coastal.js';
import {waterPose} from '../../shared/world/water.js';
import {slidePoint,slideApproach} from '../../shared/world/slide-path.js';
import {advancePlayer,simulateJump} from '../../shared/world/movement.js';
import {advanceNeeds} from './needs.js';
import {randomUUID} from 'node:crypto';
import {getTemplate} from '../../shared/world/templates.js';import {getCatalogEntry} from '../../shared/world/catalog.js';
import {findPath,sceneRoute,anchor,distance,walkable,nearestFree,segmentWalkable,portalEnds} from './navigation.js';
const terminal=new Set(['completed','cancelled','failed']);
function actorOf(s,id){const a=s.actors.find(a=>a.actorId===id);if(!a)throw Error('ACTOR_NOT_FOUND');return a;}
function init(s){s.actions??={};s.runtime??={lastTickAt:null};for(const a of s.actors)a.needs??={hunger:30,energy:80,happiness:70};}
function approachPoints(entity){
 const {width,depth}=getCatalogEntry(entity.type).footprint,c=Math.cos(entity.rotation),sn=Math.sin(entity.rotation);
 return [anchor(entity,'approach'),...[[-width/2-.5,0],[width/2+.5,0],[0,-depth/2-.5]].map(([x,z])=>{x*=entity.scale[0];z*=entity.scale[2];return [entity.position[0]+x*c+z*sn,entity.position[1],entity.position[2]-x*sn+z*c];})];
}
function exitPoint(s,entity,action){
 const candidates=[action.approachPosition,...approachPoints(entity)].filter(Boolean);
 return candidates.find(p=>walkable(s,entity.sceneId,p))||nearestFree(s,entity.sceneId,entity.position.map((v,i)=>i===1?0:v));
}
function leaveSeat(s,a){
 if(!a.resting)return;
 const entity=s.entities.find(e=>e.entityId===a.resting.entityId);
 a.position=entity?exitPoint(s,entity,a.resting):nearestFree(s,a.sceneId,[a.position[0],0,a.position[2]]);
 a.resting=null;a.pose='idle';a.form='normal';a.input=null;
}
function finish(s,a,action,status,emit,reason){
 const previousPhase=action.phase,entity=s.entities.find(e=>e.entityId===action.entityId);
 action.status=status;action.phase=status;
 if(status==='completed'&&action.kind==='sit'&&previousPhase!=='moving'&&entity){
  a.position=anchor(entity,'interaction');a.rotation=entity.rotation;a.pose='seated';a.form='normal';
  a.resting={entityId:entity.entityId,approachPosition:action.approachPosition||anchor(entity,'approach'),entityTransform:JSON.stringify([entity.position,entity.rotation,entity.scale])};
 }else if(status==='completed'&&['slide','swim'].includes(action.kind)&&previousPhase!=='moving'&&entity){
  if(action.kind==='slide')a.position=slidePoint(entity,1);
  a.position[1]=entity.position[1];a.form='swim';a.pose='swimming';a.resting=null;
 }else{
  if(previousPhase!=='moving'&&entity)a.position=exitPoint(s,entity,action);
  a.pose='idle';a.form='normal';a.resting=null;
 }
 if(status==='completed'&&action.kind==='move')Object.assign(a,waterPose(s,{...a,moving:false}));
 a.actionId=null;a.moving=false;a.speed=0;if(action.kind==='move')a.supportHeight=0;
 action.result={status,sceneId:a.sceneId,position:[...a.position],pose:a.pose,needs:{...a.needs},...reason?{reason}:{}};
 emit(`action.${status}`,{actorId:a.actorId,actionId:action.actionId,result:action.result});
}
function lease({snapshot,principal,command,now,emit},takeover=false){init(snapshot);const a=actorOf(snapshot,command.payload.actorId),old=a.controller;if(old&&old.expiresAt>now&&old.subjectId!==principal.subjectId&&!takeover)throw Error('LEASE_BUSY');if(a.actionId&&takeover)finish(snapshot,a,snapshot.actions[a.actionId],'cancelled',emit,'control_takeover');if(takeover)leaveSeat(snapshot,a);const controller={leaseId:randomUUID(),leaseVersion:(old?.leaseVersion||0)+1,subjectId:principal.subjectId,expiresAt:now+60000};a.controller=controller;a.input={leaseId:controller.leaseId,sequence:0,lastAt:now,budgetMs:100};emit('control.acquired',{actorId:a.actorId,...controller});return {...controller};}
function checkLease(a,p,principal,now){const l=a.controller;if(!l||l.leaseId!==p.leaseId||l.leaseVersion!==p.leaseVersion||l.subjectId!==principal.subjectId||l.expiresAt<=now)throw Error('LEASE_INVALID');}
function submit(ctx){const {snapshot:s,command,principal,now,emit}=ctx;init(s);const p=command.payload,a=actorOf(s,p.actorId);checkLease(a,p,principal,now);if(p.kind==='cancel'){leaveSeat(s,a);if(a.actionId)finish(s,a,s.actions[a.actionId],'cancelled',emit,'requested');return {status:'cancelled'};}leaveSeat(s,a);a.input=null;const previous=s.actions[a.actionId];const retarget=principal.role==='owner'&&p.kind==='move'&&previous?.kind==='move'&&previous.phase==='moving'&&previous.subjectId===principal.subjectId;if(a.actionId&&!retarget)throw Error('ACTOR_BUSY');let sceneId=p.target?.sceneId||a.sceneId,target=p.target,entity;if(target?.entityId){entity=s.entities.find(e=>e.entityId===target.entityId);if(!entity)throw Error('ENTITY_NOT_FOUND');sceneId=entity.sceneId;if(p.kind!=='move'&&!getCatalogEntry(entity.type).actions.includes(p.kind)&&!(p.kind==='slide'&&entity.type==='yardPool'))throw Error('ACTION_UNSUPPORTED');}if(p.kind==='jump'){if(target?.sceneId&&target.sceneId!==a.sceneId)throw Error('JUMP_TARGET_INVALID');if(target?.landmarkId){const l=getTemplate(s.scenes.find(x=>x.sceneId===a.sceneId).templateId).landmarks?.find(l=>l.landmarkId===target.landmarkId);if(!l)throw Error('LANDMARK_NOT_FOUND');target={sceneId:a.sceneId,position:l.position};}if(a.grounded===false||a.form==='swim')throw Error('JUMP_UNAVAILABLE');const end=target?.groundPosition?[target.groundPosition[0],a.position[1],target.groundPosition[1]]:target?.position||a.position;const jump=simulateJump(s,a,end);const action={actionId:randomUUID(),subjectId:principal.subjectId,actorId:a.actorId,kind:'jump',status:'running',phase:'jumping',leaseId:p.leaseId,leaseVersion:p.leaseVersion,jumpStart:[...a.position],jumpEnd:[...end],jumpDirection:jump.direction,jumpSpeedScale:jump.speedScale,elapsed:0};s.actions[action.actionId]=action;a.actionId=action.actionId;emit('action.started',{actorId:a.actorId,actionId:action.actionId,kind:'jump'});return {actionId:action.actionId,status:'running',phase:'jumping'};}if(!['move','eat'].includes(p.kind)&&!entity)throw Error('ACTION_TARGET_REQUIRED');if(target?.groundPosition){const [x,z]=target.groundPosition;target={sceneId,position:[x,surfaceAt(getTemplate(s.scenes.find(x=>x.sceneId===sceneId).templateId),x,z)?.height??0,z]};}if(target?.landmarkId){const point=getTemplate(s.scenes.find(x=>x.sceneId===sceneId).templateId).landmarks?.find(l=>l.landmarkId===target.landmarkId);if(!point)throw Error('LANDMARK_NOT_FOUND');target={sceneId,position:point.position};}let goal=entity?anchor(entity,p.kind==='move'?target.anchorId:'approach'):target?.position||(p.kind==='eat'?[a.position[0],0,a.position[2]]:getTemplate(s.scenes.find(x=>x.sceneId===sceneId)?.templateId).spawn);
 if(!entity&&!target?.position)goal=nearestFree(s,sceneId,goal);
 const portals=sceneRoute(s,a.sceneId,sceneId),legs=[];let current=a.sceneId,start=a.position;for(const portal of portals){legs.push({sceneId:current,path:findPath(s,current,start,portal.departure),portal});current=portal.toSceneId;start=portal.landing;}if(p.kind==='move'&&!entity&&!target?.position&&portals.length)goal=nearestFree(s,sceneId,start);let finalPath;
 if(entity&&p.kind!=='move'){
  let error;for(const point of (p.kind==='slide'?[slideApproach(entity)]:approachPoints(entity))){try{finalPath=findPath(s,current,start,point);goal=point;break;}catch(e){error=e;}}
  if(!finalPath)throw error||Error('PATH_NOT_FOUND');
 }else finalPath=findPath(s,current,start,goal);
 legs.push({sceneId:current,path:finalPath});
 if(retarget){Object.assign(previous,{legs,legIndex:0,target:structuredClone(target||{}),entityId:entity?.entityId,entityTransform:entity?JSON.stringify([entity.position,entity.rotation,entity.scale]):null});return {actionId:previous.actionId,status:previous.status,phase:previous.phase};}
 const action={actionId:randomUUID(),subjectId:principal.subjectId,actorId:a.actorId,kind:p.kind,status:'running',phase:'moving',submittedAt:now,approachPosition:entity?[...goal]:null,legs,legIndex:0,entityId:entity?.entityId,entityTransform:entity?JSON.stringify([entity.position,entity.rotation,entity.scale]):null,target:structuredClone(target||{}),leaseId:p.leaseId,leaseVersion:p.leaseVersion};s.actions[action.actionId]=action;a.actionId=action.actionId;emit('action.started',{actorId:a.actorId,actionId:action.actionId,kind:p.kind});return {actionId:action.actionId,status:action.status,phase:action.phase};}
// Trusted authorization hook: same safe stop behavior as owner takeover/release.
export function revokeSubjectControl(snapshot,subjectId,emit){
 init(snapshot);
 for(const actor of snapshot.actors){
  if(actor.controller?.subjectId!==subjectId)continue;
  const action=snapshot.actions[actor.actionId];
  if(action&&!terminal.has(action.status))finish(snapshot,actor,action,'cancelled',emit,'grant_revoked');
  actor.controller=null;
  emit('control.revoked',{actorId:actor.actorId,subjectId});
 }
}
function cancelAction(ctx){
 const {snapshot,command,principal,now,emit}=ctx;init(snapshot);
 const p=command.payload,actor=actorOf(snapshot,p.actorId),action=snapshot.actions[p.actionId];
 if(!action||action.actorId!==actor.actorId||(principal.role!=='owner'&&action.subjectId!==principal.subjectId))throw Error('UNAUTHORIZED');
 // Target and current-action fencing happen inside WorldService's transaction.
 if(terminal.has(action.status))return {actionId:action.actionId,status:action.status,phase:action.phase,result:action.result};
 if(actor.actionId!==action.actionId)throw Error('ACTION_NOT_CURRENT');
 checkLease(actor,p,principal,now);
 finish(snapshot,actor,action,'cancelled',emit,'requested');
 return {actionId:action.actionId,status:action.status,phase:action.phase,result:action.result};
}
function playerInput(ctx){
 const {snapshot:s,principal,command,now,emit}=ctx;
 if(principal.role!=='owner')throw Error('UNAUTHORIZED');
 const p=command.payload,a=actorOf(s,p.actorId);checkLease(a,p,principal,now);
 if(a.actionId)throw Error('ACTOR_BUSY');
 leaveSeat(s,a);
 const state=a.input?.leaseId===p.leaseId?a.input:{leaseId:p.leaseId,sequence:0,lastAt:now,budgetMs:100};
 let sequence=state.sequence,total=0;
 const frames=[];
 for(const frame of p.frames){if(frame.sequence<=state.sequence)continue;if(frame.sequence!==sequence+1)throw Error('INPUT_SEQUENCE');sequence=frame.sequence;total+=frame.dtMs;frames.push(frame);}
 const budget=Math.min(1000,state.budgetMs+Math.max(0,now-state.lastAt));
 if(total>budget+1e-6)throw Error('INPUT_RATE_EXCEEDED');
 for(const frame of frames){const next=advancePlayer(s,a,frame.direction,frame.dtMs,frame.jump);Object.assign(a,{position:next.position,rotation:next.rotation,pose:next.pose,form:next.form,grounded:next.grounded,verticalVelocity:next.verticalVelocity,airHeight:next.airHeight,jumpHeld:next.jumpHeld,supportHeight:next.supportHeight});}
 a.controller.expiresAt=now+60000;
 a.input={leaseId:p.leaseId,sequence,lastAt:now,budgetMs:budget-total};
 return {actor:structuredClone(a)};
}
function teleport(ctx){
 const {snapshot:s,command,principal,emit}=ctx;
 if(principal.role!=='owner')throw Error('UNAUTHORIZED');
 const destination=s.scenes.find(scene=>scene.sceneId===command.payload.sceneId&&scene.status==='active');
 if(!destination)throw Error('SCENE_NOT_FOUND');
 const template=getTemplate(destination.templateId),source=actorOf(s,command.payload.actorId);
 let entry;
 try{entry=sceneRoute(s,source.sceneId,destination.sceneId).at(-1)?.landing;}catch{}
 if(!entry){for(const portal of s.portals){const ends=portalEnds(s,portal);if(ends.toSceneId===destination.sceneId){entry=ends.landing;break;}if(portal.bidirectional&&ends.fromSceneId===destination.sceneId){entry=ends.departure;break;}}}
 const position=nearestFree(s,destination.sceneId,entry||template.portalSlots?.[0]?.landing||template.spawn);
 const a=actorOf(s,command.payload.actorId);
 if(a.actionId)finish(s,a,s.actions[a.actionId],'cancelled',emit,'teleport');
 a.resting=null;a.controller=null;a.input=null;a.actionId=null;a.sceneId=destination.sceneId;a.position=[...position];
 const height=surfaceAt(template,position[0],position[2])?.height??position[1];
 a.position[1]=height;Object.assign(a,{pose:'idle',form:'normal',moving:false,speed:0,grounded:true,verticalVelocity:0,airHeight:0,jumpHeld:false,supportHeight:0});
 Object.assign(a,waterPose(s,a));emit('actor.teleported',{actorId:a.actorId,sceneId:a.sceneId,position:[...a.position]});
 return {sceneId:a.sceneId,position:[...a.position]};
}
export function createRuntimeHandlers(){return {'actor.teleport':teleport,'actor.input':playerInput,'control.acquire':ctx=>lease(ctx),'control.takeover':ctx=>lease(ctx,true),'control.renew':ctx=>{const a=actorOf(ctx.snapshot,ctx.command.payload.actorId);checkLease(a,ctx.command.payload,ctx.principal,ctx.now);a.controller.expiresAt=ctx.now+60000;return {...a.controller};},'control.release':ctx=>{const a=actorOf(ctx.snapshot,ctx.command.payload.actorId);checkLease(a,ctx.command.payload,ctx.principal,ctx.now);if(a.actionId)finish(ctx.snapshot,a,ctx.snapshot.actions[a.actionId],'cancelled',ctx.emit,'control_release');a.controller=null;ctx.emit('control.released',{actorId:a.actorId});return {status:'released'};},'action.submit':submit,'action.cancel':cancelAction};}
export class WorldRuntime{
 constructor(service,{worldId='default',intervalMs=100,onError=error=>console.error('World runtime tick failed',error)}={}){this.onError=onError;this.service=service;this.worldId=worldId;this.intervalMs=intervalMs;this.timer=null;}
 start(){if(!this.timer)this.timer=setInterval(()=>{try{this.tick();}catch(error){this.onError?.(error);}},this.intervalMs);this.timer?.unref?.();return this;}
 stop(){clearInterval(this.timer);this.timer=null;}
 tick(){return this.service.transactRuntime(this.worldId,({snapshot:s,now,emit})=>{init(s);const last=s.runtime.lastTickAt??now-100;const elapsed=now-last;let steps=elapsed>1000?1:Math.floor(elapsed/100);if(elapsed>1000)for(const actor of s.actors)advanceNeeds(actor,elapsed-100);if(steps<=0)return;s.runtime.lastTickAt=now;while(steps-->0){for(const a of s.actors){advanceNeeds(a,100);if(a.resting){const seat=s.entities.find(e=>e.entityId===a.resting.entityId);if(!seat||JSON.stringify([seat.position,seat.rotation,seat.scale])!==a.resting.entityTransform)leaveSeat(s,a);}
 if(!a.actionId){if(a.grounded===false&&(!a.input||now-a.input.lastAt>250)){for(let i=0;i<2;i++)Object.assign(a,advancePlayer(s,a,[0,0],50));}if(!a.resting&&a.input&&now-a.input.lastAt>250)a.pose=a.form==='swim'?'swimming':'idle';continue;}const action=s.actions[a.actionId];if(!action||terminal.has(action.status)){a.actionId=null;continue;}if(!a.controller||a.controller.expiresAt<=now||a.controller.leaseId!==action.leaseId||a.controller.leaseVersion!==action.leaseVersion){finish(s,a,action,'cancelled',emit,'lease_expired');continue;}try{advance(s,a,action,emit);}catch(error){finish(s,a,action,'failed',emit,error.message);}}}if(!s.runtime.lastCheckpointAt||now-s.runtime.lastCheckpointAt>=5000){s.runtime.lastCheckpointAt=now;emit('runtime.checkpoint',{at:now,actors:s.actors.map(a=>({actorId:a.actorId,sceneId:a.sceneId,position:a.position,pose:a.pose,needs:a.needs,actionId:a.actionId}))});}});}
}
function advance(s,a,action,emit){if(action.kind==='jump'){for(let i=0;i<2;i++){Object.assign(a,advancePlayer(s,a,action.jumpDirection,50,action.elapsed===0,Math.min(action.jumpSpeedScale,Math.hypot(action.jumpEnd[0]-a.position[0],action.jumpEnd[2]-a.position[2])/(2.82*.05))));action.elapsed+=.05;}if(action.elapsed>=.6-1e-8&&a.grounded&&Math.hypot(action.jumpEnd[0]-a.position[0],action.jumpEnd[2]-a.position[2])<.001){finish(s,a,action,'completed',emit);Object.assign(a,waterPose(s,a));}return;}if(action.entityId){const entity=s.entities.find(e=>e.entityId===action.entityId);if(entity&&JSON.stringify([entity.position,entity.rotation,entity.scale])!==action.entityTransform)throw Error('TARGET_MOVED');}if(action.entityId&&!s.entities.some(e=>e.entityId===action.entityId))throw Error('ENTITY_REMOVED');if(action.phase==='moving'){const leg=action.legs[action.legIndex];if(leg.path.length){let budget=2.82 * .1;a.pose='walking';while(leg.path.length&&budget>1e-8){const next=leg.path[0];if(!segmentWalkable(s,a.sceneId,a.position,next))throw Error('PATH_BLOCKED');const d=distance(a.position,next);if(d>1e-8)a.rotation=Math.atan2(next[0]-a.position[0],next[2]-a.position[2]);if(d<=budget){a.position=[...next];leg.path.shift();budget-=d;}else{a.position=[a.position[0]+(next[0]-a.position[0])*budget/d,a.position[1]+(next[1]-a.position[1])*budget/d,a.position[2]+(next[2]-a.position[2])*budget/d];budget=0;}const terrain=getTemplate(s.scenes.find(scene=>scene.sceneId===a.sceneId).templateId);if(terrain.authorSceneId)a.position[1]=surfaceAt(terrain,a.position[0],a.position[2])?.height??a.position[1];}Object.assign(a,waterPose(s,{...a,moving:true}));return;}if(leg.portal){validatePortal(s,a,leg.portal);a.sceneId=leg.portal.toSceneId;a.position=[...leg.portal.landing];action.legIndex++;emit('actor.scene_changed',{actorId:a.actorId,sceneId:a.sceneId,portalId:leg.portal.portalId});return;}if(action.kind==='move'){finish(s,a,action,'completed',emit);return;}const entity=s.entities.find(e=>e.entityId===action.entityId);if(!entity&&action.kind!=='eat')throw Error('ENTITY_REMOVED');action.phase='interacting';action.remainingTicks={sit:20,sleep:100,eat:30,swim:60,slide:30}[action.kind];action.recoveryStart={...a.needs};if(entity){a.position=action.kind==='slide'?slidePoint(entity,0):anchor(entity,'interaction');a.rotation=entity.rotation;}a.pose=({sit:'seated',sleep:'sleeping',swim:'swimming',slide:'climbing',eat:'eating'})[action.kind];if(action.kind==='swim')a.form='swim';;emit('action.phase',{actionId:action.actionId,phase:'interacting'});return;}
 const entity=s.entities.find(e=>e.entityId===action.entityId);if(!entity&&action.kind!=='eat')throw Error('ENTITY_REMOVED');if(action.kind==='sleep'){const start=action.recoveryStart?.energy??0;a.needs.energy=Math.min(100,start+(100-start)*(101-action.remainingTicks)/100);}if(action.kind==='eat'){const start=action.recoveryStart?.hunger??a.needs.hunger+(30-action.remainingTicks)*50/30;a.needs.hunger=Math.max(0,start-50*(31-action.remainingTicks)/30);}if(['sit','swim','slide'].includes(action.kind))a.needs.happiness=Math.min(100,a.needs.happiness+.05);if(action.kind==='swim'){const origin=anchor(entity,'interaction');a.position=[origin[0]+Math.sin(action.remainingTicks*.15)*.7,origin[1],origin[2]+Math.cos(action.remainingTicks*.15)*.4];}if(action.kind==='slide'){const t=1-action.remainingTicks/30;action.phase=t<.6?'climbing':'sliding';a.pose=action.phase;a.position=slidePoint(entity,t);a.rotation=entity.rotation+Math.PI/2;}if(--action.remainingTicks<=0){finish(s,a,action,'completed',emit);}}

function validatePortal(snapshot,actor,cached){
 const record=snapshot.portals.find(p=>(p.portalId||p.id)===cached.portalId);
 if(!record)throw Error('PORTAL_REMOVED');
 const ends=portalEnds(snapshot,record),directions=[ends];
 if(record.bidirectional)directions.push({fromSceneId:ends.toSceneId,toSceneId:ends.fromSceneId,departure:ends.landing,landing:ends.departure});
 const current=directions.find(end=>end.fromSceneId===cached.fromSceneId&&end.toSceneId===cached.toSceneId&&JSON.stringify(end.departure)===JSON.stringify(cached.departure)&&JSON.stringify(end.landing)===JSON.stringify(cached.landing));
 if(!current||actor.sceneId!==current.fromSceneId||distance(actor.position,current.departure)>.01)throw Error('PORTAL_CHANGED');
 if(!walkable(snapshot,current.fromSceneId,current.departure)||!walkable(snapshot,current.toSceneId,current.landing))throw Error('PORTAL_BLOCKED');
}
