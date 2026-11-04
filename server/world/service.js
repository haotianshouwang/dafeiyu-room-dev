import {installConsumers,recordDelivery,confirmEvents,resumeConsumer,snapshotRecovery} from './consumers.js';
import {randomUUID} from 'node:crypto';
import {validateCommand} from '../../shared/world/schema.js';
import {appendEvent,readEvents,projectEventPage} from './events.js';
const scopeFor=kind=>kind.startsWith('build.')?'build:write':kind.startsWith('control.')||kind.startsWith('action.')||kind==='actor.input'?'actor:control':'world:read';
// Trusted adapter-only principal: {subjectId,worldIds,actorIds,scopes,role,
// expiresAt?,revoked?}. Never construct this object from command/request JSON.
export function authorizePrincipal(principal,worldId,scope,actorId,now=Date.now()){
 if(!principal||typeof principal.subjectId!=='string'||!principal.subjectId||principal.revoked|| (principal.expiresAt!==undefined&&principal.expiresAt<=now)||!principal.worldIds?.includes(worldId)||!principal.scopes?.includes(scope)||(actorId&&!principal.actorIds?.includes(actorId)))throw Error('UNAUTHORIZED');
}
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export class WorldService{
 constructor(db,{handlers={},clock=Date.now}={}){this.db=db;this.handlers={...handlers};this.clock=clock;installConsumers(db);}
 // Internal trusted domain transaction; never wired to an HTTP route.
 transactRuntime(worldId,mutate){
  const db=this.db;db.exec('BEGIN IMMEDIATE');
  try{const snapshot=this.readSnapshot(worldId),previous=canonical(snapshot.entities.filter(e=>e.protected)),pending=[],now=this.clock(),changeId=randomUUID();
   const result=mutate({snapshot,now,emit:(kind,data)=>pending.push({kind,data})});
   if(result&&typeof result.then==='function')throw Error('ASYNC_HANDLER_NOT_ALLOWED');
   if(canonical(snapshot.entities.filter(e=>e.protected))!==previous)throw Error('PROTECTED_AREA');
   db.prepare('UPDATE worlds SET snapshot=?,layout_revision=? WHERE world_id=?').run(JSON.stringify(snapshot),snapshot.layoutRevision,worldId);
   for(const event of pending)appendEvent(db,{...event,worldId,subjectId:null,changeId,now});
   db.exec('COMMIT');return result;
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 getSnapshot(principal,worldId){authorizePrincipal(principal,worldId,'world:read',undefined,this.clock());return this.readSnapshot(worldId);}
 readSnapshot(worldId){const row=this.db.prepare('SELECT snapshot FROM worlds WHERE world_id=?').get(worldId);if(!row)throw Error('WORLD_NOT_FOUND');return JSON.parse(row.snapshot);}
 getEvents(principal,options){authorizePrincipal(principal,options.worldId,'world:read',undefined,this.clock());this.readSnapshot(options.worldId);const page=projectEventPage(readEvents(this.db,{...options,subjectId:principal.subjectId}),principal);recordDelivery(this.db,principal.subjectId,options.worldId,page);return page;}
 ackEvents(principal,options){authorizePrincipal(principal,options.worldId,'world:read',undefined,this.clock());this.readSnapshot(options.worldId);return confirmEvents(this.db,principal.subjectId,options,this.clock());}
 snapshotRecovery(principal,worldId){const snapshot=this.getSnapshot(principal,worldId);return {snapshot,...snapshotRecovery(this.db,principal.subjectId,worldId,this.clock())};}
 resumeSummary(principal,worldId){const snapshot=this.getSnapshot(principal,worldId);return {...resumeConsumer(this.db,principal.subjectId,worldId),rulesVersion:snapshot.rulesVersion};}
 execute(principal,command){
  if(!validateCommand(command).ok)throw Error('INVALID_COMMAND');
  authorizePrincipal(principal,command.worldId,scopeFor(command.kind),command.payload.actorId,this.clock());
  if(command.kind==='control.takeover'&&principal.role!=='owner')throw Error('UNAUTHORIZED');
  const serialized=canonical(command);const db=this.db;db.exec('BEGIN IMMEDIATE');
  try {
   const prior=db.prepare('SELECT command,result FROM command_results WHERE subject_id=? AND world_id=? AND request_id=?').get(principal.subjectId,command.worldId,command.requestId);
   if(prior){if(prior.command!==serialized)throw Error('REQUEST_ID_REUSED');db.exec('COMMIT');return JSON.parse(prior.result);}
   const snapshot=this.readSnapshot(command.worldId);const handler=this.handlers[command.kind];if(!handler)throw Error('NOT_IMPLEMENTED');
   const changeId=randomUUID();const pending=[];
   // Handlers are synchronous: mutate detached snapshot and emit factual events.
   // T3/T4 provide effects and validation; an absent handler never claims success.
   const output=handler({principal,command,snapshot,db,now:this.clock(),changeId,emit:(kind,data)=>pending.push({kind,data})});
   if(output&&typeof output.then==='function')throw Error('ASYNC_HANDLER_NOT_ALLOWED');
   const previous=this.readSnapshot(command.worldId);
   for(const protectedEntity of previous.entities.filter(e=>e.protected))if(canonical(snapshot.entities.find(e=>e.entityId===protectedEntity.entityId))!==canonical(protectedEntity))throw Error('PROTECTED_AREA');
   if(snapshot.worldId!==command.worldId||snapshot.schemaVersion!==previous.schemaVersion)throw Error('INVALID_WORLD_STATE');
   db.prepare('UPDATE worlds SET snapshot=?,layout_revision=? WHERE world_id=?').run(JSON.stringify(snapshot),snapshot.layoutRevision,command.worldId);
   let eventCursor=null;for(const event of pending)eventCursor=appendEvent(db,{...event,worldId:command.worldId,subjectId:principal.subjectId,changeId,now:this.clock()});
   const result={...output,requestId:command.requestId,worldId:command.worldId,changeId,eventCursor};
   db.prepare('INSERT INTO command_results VALUES(?,?,?,?,?)').run(principal.subjectId,command.worldId,command.requestId,serialized,JSON.stringify(result));db.exec('COMMIT');return result;
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
}
