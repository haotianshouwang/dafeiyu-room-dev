import {selectAuthorizedWorld} from './world-selection.js';
import {z} from 'zod';
import {idSchema,vectorSchema,buildOperationSchema} from '../../shared/world/schema.js';
import {listPortalSlots} from '../world/build.js';
import {suggestLayout} from '../world/layout-suggestions.js';
import {RULES,catalog,projectSnapshot} from './resources.js';
const id=idSchema,rev=z.number().int().nonnegative(),request={requestId:id},world={worldId:id.optional().describe('通常省略：自动进入当前凭证授权的默认世界。首次调用 world_enter {}，使用返回的 worldId；不要猜 main、home 或角色名字。')},actor={actorId:id},lease={...actor,leaseId:id,leaseVersion:rev},obj=shape=>z.object({...world,...shape}).strict();
const target=z.union([z.object({sceneId:id,position:vectorSchema}).strict(),z.object({entityId:id,anchorId:id}).strict(),z.object({sceneId:id}).strict()]);
const definitions=[
 ['audio_play','播放智能体已生成的音频；需要 audio:play 授权和主人开启声音。最多4MiB、60秒；结果仅表示设备播放回执，不能证明听见。',{...request,audioBase64:z.string().min(4).max(5592408),mimeType:z.enum(['audio/mpeg','audio/wav','audio/ogg'])}],
 ['audio_get_status','查询本授权的实际播放状态。',{playbackId:id}],
 ['audio_stop','取消本授权音频并删除临时内容。',{...request,playbackId:id}],
 ['world_enter','进入当前授权世界。首次调用 world_enter {}，省略 worldId 即可；不要猜世界名。返回实际 worldId、角色、规则与能力，不移动或新建角色。',{}],
 ['world_observe','观察场景和物件；detail=portals 返回当前可用门槽。',{sceneId:id.optional(),entityId:id.optional(),detail:z.enum(['summary','entities','portals','map']).optional()}],
 ['world_get_events','按游标读取有序事件；读取不确认消费。',{afterCursor:rev.optional(),limit:z.number().int().min(1).max(500).optional()}],
 ['world_ack_events','确认已处理的事件游标；历史缺口须先处理 world_enter 返回的 recoverySnapshot，再提交其 recoveryToken 和 recoveryCursor。',{...request,cursor:rev,recoveryToken:id.optional()}],
 ['catalog_list','查询批准的场景模板和家具目录。',{category:z.enum(['all','templates','assets']).optional(),sceneKind:z.enum(['indoor','outdoor']).optional()}],
 ['layout_suggest','按区域与用途生成候选 ops；不会修改世界。',{sceneId:id,purpose:z.string().max(80).optional(),zoneId:id.optional(),preferences:z.union([z.array(id).max(6),z.object({types:z.array(id).max(6)}).strict()]).optional()}],
 ['actor_take_control','取得指定已授权角色60秒控制租约，不能抢占他人。',{...actor,...request}],
 ['actor_release_control','归还租约，并取消该角色未完成动作。',{...lease,...request}],
 ['actor_move','地面坐标为[X,Y,Z]米，Y须在地面；提交寻路动作后查询 actionId。',{...lease,...request,target}],
 ['actor_interact','走到物件交互点再坐、睡、游泳、滑梯或吃白饭。',{...lease,...request,verb:z.enum(['sit','sleep','swim','slide','eat']),targetId:id.optional()}],
 ['action_get','读取属于本授权主体的动作真实状态、阶段与结果。',{actionId:id}],
 ['action_cancel','取消本授权主体正在执行的动作。',{actionId:id,...request}],
 ['build_preview','预览最多20项严格建设操作，签发5分钟方案，不自动应用。',{...request,baseRevision:rev,ops:z.array(buildOperationSchema).min(1).max(20)}],
 ['build_apply','原子提交自己的有效预览方案。',{...request,planId:id}],
 ['build_undo','撤销自己的建设变更；后续依赖会明确报错。',{...request,changeId:id}],

];
export const TOOL_DEFINITIONS=definitions.map(([name,description,shape])=>({name,description,schema:obj(shape)}));
export function createToolCaller(service,{resolvePrincipal,extensions={}}={}){
 return async(name,input)=>{const def=TOOL_DEFINITIONS.find(d=>d.name===name);if(!def)throw Error('UNKNOWN_TOOL');const a=def.schema.parse(input),p=await resolvePrincipal(),worldId=selectAuthorizedWorld(p,a.worldId,service.clock());
 const snap=()=>service.getSnapshot(p,worldId),command=(kind,payload)=>service.execute(p,{worldId,requestId:a.requestId,kind,payload});
 const action=()=>{const act=snap().actions?.[a.actionId];if(!act||!p.actorIds.includes(act.actorId)||(p.role!=='owner'&&act.subjectId!==p.subjectId))throw Error('UNAUTHORIZED');return act;};
 if(extensions[name])return extensions[name]({principal:p,worldId,args:a,service});
 switch(name){
 case 'world_enter':{const s=projectSnapshot(snap(),p),summary=service.resumeSummary(p,worldId),recovery=summary.snapshotResetRequired?service.snapshotRecovery(p,worldId):null;return {worldId,...summary,...recovery?{recoveryToken:recovery.recoveryToken,recoveryCursor:recovery.recoveryCursor,recoverySnapshot:projectSnapshot(recovery.snapshot,p)}:{},actor:s.actors[0]||null,actors:s.actors,activeActions:Object.values(s.actions).filter(a=>['running','queued'].includes(a.status)),permissions:{scopes:p.scopes,actorIds:p.actorIds},rules:RULES,capabilities:{tools:TOOL_DEFINITIONS.map(t=>t.name),ackEvents:true},nextStep:'先观察目录与场景，再按授权取得控制或预览建设。'};}
 case 'world_observe':{const s=projectSnapshot(snap(),p);if(a.sceneId&&!s.scenes.some(s=>s.sceneId===a.sceneId))throw Error('SCENE_NOT_FOUND');if(a.entityId){const entity=s.entities.find(e=>e.entityId===a.entityId);if(!entity)throw Error('ENTITY_NOT_FOUND');return {worldId,layoutRevision:s.layoutRevision,entity};}if(a.detail==='portals'){if(!a.sceneId)throw Error('SCENE_REQUIRED');return {worldId,sceneId:a.sceneId,slots:listPortalSlots(snap(),a.sceneId)};}if(a.sceneId)return {...s,scenes:s.scenes.filter(s=>s.sceneId===a.sceneId),entities:s.entities.filter(e=>e.sceneId===a.sceneId),actors:s.actors.filter(e=>e.sceneId===a.sceneId)};return s;}
 case 'world_get_events':return service.getEvents(p,{worldId,afterCursor:a.afterCursor||0,limit:a.limit||100});
 case 'world_ack_events':return service.ackEvents(p,{worldId,cursor:a.cursor,requestId:a.requestId,recoveryToken:a.recoveryToken});
 case 'catalog_list':{const c=catalog();return {worldId,...a.category==='assets'?{}:{templates:c.templates.filter(t=>!a.sceneKind||t.kind===a.sceneKind)},...a.category==='templates'?{}:{assets:c.assets.filter(t=>!a.sceneKind||t.sceneKinds.includes(a.sceneKind))}};}
 case 'layout_suggest':return {worldId,...suggestLayout(snap(),a)};
 case 'actor_take_control':return command('control.acquire',{actorId:a.actorId});
 case 'actor_release_control':return command('control.release',{actorId:a.actorId,leaseId:a.leaseId,leaseVersion:a.leaseVersion});
 case 'actor_move':return command('action.submit',{actorId:a.actorId,leaseId:a.leaseId,leaseVersion:a.leaseVersion,kind:'move',target:a.target});
 case 'actor_interact':return command('action.submit',{actorId:a.actorId,leaseId:a.leaseId,leaseVersion:a.leaseVersion,kind:a.verb,...a.targetId?{target:{entityId:a.targetId,anchorId:'approach'}}:{}});
 case 'action_get':return {worldId,...action()};
 case 'action_cancel':{const act=action(),actor=snap().actors.find(a=>a.actorId===act.actorId),l=actor.controller||act;return command('action.cancel',{actorId:actor.actorId,actionId:act.actionId,leaseId:l.leaseId,leaseVersion:l.leaseVersion});}
 case 'build_preview':return command('build.preview',{baseRevision:a.baseRevision,ops:a.ops});
 case 'build_apply':return command('build.apply',{planId:a.planId});
 case 'build_undo':return command('build.undo',{changeId:a.changeId});
 default:throw Error('CAPABILITY_UNAVAILABLE');
 }
 };
}
