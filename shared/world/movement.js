import {waterPose} from './water.js';
import {segmentWalkable} from './navigation.js';
import {getTemplate} from './templates.js';
export const PLAYER_SPEED=2.82;
// Identical deterministic integration on the browser and authoritative server.
export function advancePlayer(snapshot,actor,direction,dtMs){
 const [x,z]=direction,length=Math.hypot(x,z),dt=Math.max(0,Math.min(50,dtMs))/1000;
 const start=actor.position,position=[...start];let rotation=actor.rotation||0;
 if(length&&dt){
  const distance=PLAYER_SPEED*dt,dx=x/length*distance,dz=z/length*distance;
  const scene=snapshot.scenes.find(s=>s.sceneId===actor.sceneId);
  position[1]=getTemplate(scene.templateId).groundY;
  const goal=[position[0]+dx,position[1],position[2]+dz];
  if(segmentWalkable(snapshot,actor.sceneId,position,goal))position.splice(0,3,...goal);
  else for(const axis of [0,2]){const slide=[...position];slide[axis]+=axis===0?dx:dz;if(segmentWalkable(snapshot,actor.sceneId,position,slide))position.splice(0,3,...slide);}
  if(Math.hypot(position[0]-start[0],position[2]-start[2])>1e-9)rotation=Math.atan2(position[0]-start[0],position[2]-start[2]);
 }
 const speed=dt?Math.hypot(position[0]-start[0],position[2]-start[2])/dt:0;
 const next={...actor,position,rotation,speed,moving:speed>.001};return {...next,...waterPose(snapshot,next)};
}
