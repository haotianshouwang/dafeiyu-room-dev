import {getTemplate} from './templates.js';
import {getCatalogEntry} from './catalog.js';
export const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
export function anchor(entity,id){const a=getCatalogEntry(entity.type).anchors.find(a=>a.anchorId===id);if(!a)throw Error('ANCHOR_NOT_FOUND');const [x,y,z]=a.position.map((v,i)=>v*entity.scale[i]);const c=Math.cos(entity.rotation),s=Math.sin(entity.rotation);return [entity.position[0]+x*c+z*s,entity.position[1]+y,entity.position[2]-x*s+z*c];}
export function walkable(snapshot,sceneId,p){const scene=snapshot.scenes.find(s=>s.sceneId===sceneId);if(!scene)throw Error('SCENE_NOT_FOUND');const b=getTemplate(scene.templateId).bounds;if(p[0]<b.x0+.15||p[0]>b.x1-.15||p[2]<b.z0+.15||p[2]>b.z1-.15)return false;return !snapshot.entities.some(e=>{if(e.sceneId!==sceneId)return false;const f=getCatalogEntry(e.type).footprint;if(!f.blocking||e.supportEntityId)return false;const dx=p[0]-e.position[0],dz=p[2]-e.position[2],c=Math.cos(e.rotation),s=Math.sin(e.rotation);return Math.abs(dx*c-dz*s)<f.width*e.scale[0]/2+.18&&Math.abs(dx*s+dz*c)<f.depth*e.scale[2]/2+.18;});}
// Exact slab intersection against every inflated, rotated furniture rectangle.
export function segmentWalkable(snapshot,sceneId,start,end){
 if(!walkable(snapshot,sceneId,start)||!walkable(snapshot,sceneId,end))return false;
 return !snapshot.entities.some(entity=>{
  if(entity.sceneId!==sceneId||entity.supportEntityId)return false;
  const footprint=getCatalogEntry(entity.type).footprint;if(!footprint.blocking)return false;
  const c=Math.cos(entity.rotation),s=Math.sin(entity.rotation);
  const local=p=>{const x=p[0]-entity.position[0],z=p[2]-entity.position[2];return [x*c-z*s,x*s+z*c];};
  const a=local(start),b=local(end),half=[footprint.width*entity.scale[0]/2+.18,footprint.depth*entity.scale[2]/2+.18];
  let lo=0,hi=1;
  for(let axis=0;axis<2;axis++){
   const delta=b[axis]-a[axis],extent=half[axis]-1e-10;
   if(Math.abs(delta)<1e-12){if(Math.abs(a[axis])>=extent)return false;continue;}
   const t0=(-extent-a[axis])/delta,t1=(extent-a[axis])/delta;
   lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return false;
  }
  return lo<=hi;
 });
}
export function findPath(snapshot,sceneId,start,goal){
 const scene=snapshot.scenes.find(s=>s.sceneId===sceneId);if(!scene)throw Error('SCENE_NOT_FOUND');
 const groundY=getTemplate(scene.templateId).groundY;
 if(Math.abs(goal[1]-groundY)>1e-6)throw Error('INVALID_GROUND_HEIGHT');
 if(!walkable(snapshot,sceneId,goal))throw Error('DESTINATION_BLOCKED');
 if(!walkable(snapshot,sceneId,start))throw Error('PATH_START_BLOCKED');
 const step=.25,key=p=>`${p[0]},${p[1]}`,point=p=>[p[0]*step,groundY,p[1]*step];
 const a=[Math.round(start[0]/step),Math.round(start[2]/step)],b=[Math.round(goal[0]/step),Math.round(goal[2]/step)],open=[],cost=new Map(),prev=new Map();
 // Attach the exact start only through collision-free edges, including off-grid starts.
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
  const node=[a[0]+dx,a[1]+dz];if(!segmentWalkable(snapshot,sceneId,start,point(node)))continue;
  open.push(node);cost.set(key(node),distance(start,point(node))/step);
 }
 let found;
 for(let n=0;open.length&&n<30000;n++){
  open.sort((x,y)=>(cost.get(key(x))+Math.abs(x[0]-b[0])+Math.abs(x[1]-b[1]))-(cost.get(key(y))+Math.abs(y[0]-b[0])+Math.abs(y[1]-b[1])));
  const u=open.shift();
  if(distance(point(u),goal)<.36&&segmentWalkable(snapshot,sceneId,point(u),goal)){found=u;break;}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const v=[u[0]+dx,u[1]+dz],k=key(v),g=cost.get(key(u))+1;
   if(cost.has(k)&&cost.get(k)<=g||!segmentWalkable(snapshot,sceneId,point(u),point(v)))continue;
   cost.set(k,g);prev.set(k,u);open.push(v);
  }
 }
 if(!found)throw Error('PATH_NOT_FOUND');
 const path=[goal.slice()];for(let u=found;u;u=prev.get(key(u)))path.unshift(point(u));
 return path;
}
export function portalEnds(snapshot,p){if(p.kind==='legacy'){return {fromSceneId:p.fromSceneId,toSceneId:p.toSceneId,departure:({'bedroom-yard':[-3.02,0,1.05],'bedroom-living':[3.12,0,.45],'living-bedroom':[-2.8,0,2.45],'living-yard':[2.35,0,-2.8],'yard-bedroom':[-7.45,0,1.05]})[`${p.fromSceneId}-${p.toSceneId}`],landing:({bedroom:[.05,0,.55],living:[-.1,0,.35],yard:[-6.6,0,.1]})[p.toSceneId]};}const from=p.from||{sceneId:p.fromSceneId,slotId:p.fromSlotId},to=p.to||{sceneId:p.toSceneId,slotId:p.toSlotId};const slot=end=>getTemplate(snapshot.scenes.find(s=>s.sceneId===end.sceneId).templateId).portalSlots.find(s=>s.slotId===end.slotId);return {fromSceneId:from.sceneId,toSceneId:to.sceneId,departure:slot(from).landing,landing:slot(to).landing};}
export function sceneRoute(snapshot,from,to){const queue=[[from,[]]],seen=new Set([from]);while(queue.length){const [id,route]=queue.shift();if(id===to)return route;for(const p of snapshot.portals){const base=portalEnds(snapshot,p);const directions=[base,...p.bidirectional?[{fromSceneId:base.toSceneId,toSceneId:base.fromSceneId,departure:base.landing,landing:base.departure}]:[]];for(const e of directions)if(e.fromSceneId===id&&!seen.has(e.toSceneId)){seen.add(e.toSceneId);queue.push([e.toSceneId,[...route,{...e,portalId:p.portalId||p.id}]]);}}}throw Error('SCENE_UNREACHABLE');}

export function nearestFree(snapshot,sceneId,p){if(walkable(snapshot,sceneId,p))return p;for(let r=.25;r<4;r+=.25)for(let i=0;i<32;i++){const q=[p[0]+Math.cos(i*Math.PI/16)*r,0,p[2]+Math.sin(i*Math.PI/16)*r];if(walkable(snapshot,sceneId,q))return q;}throw Error('DESTINATION_BLOCKED');}

// Pure routing API usable by both headless runtime and clients.
export function planRoute(snapshot,actorId,destination){
 const actor=snapshot.actors.find(a=>a.actorId===actorId);if(!actor)throw Error('ACTOR_NOT_FOUND');
 const entity=destination.entityId?snapshot.entities.find(e=>e.entityId===destination.entityId):null;
 if(destination.entityId&&!entity)throw Error('ENTITY_NOT_FOUND');
 const sceneId=entity?.sceneId||destination.sceneId||actor.sceneId;
 const goal=entity?anchor(entity,destination.anchorId):destination.position||nearestFree(snapshot,sceneId,getTemplate(snapshot.scenes.find(s=>s.sceneId===sceneId).templateId).spawn);
 const segments=[];let current=actor.sceneId,start=actor.position;
 for(const portal of sceneRoute(snapshot,current,sceneId)){segments.push({sceneId:current,path:findPath(snapshot,current,start,portal.departure),portal});current=portal.toSceneId;start=portal.landing;}
 segments.push({sceneId:current,path:findPath(snapshot,current,start,goal)});
 return {segments,topologyRevision:snapshot.topologyRevision};
}
