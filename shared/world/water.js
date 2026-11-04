// Match the actual basin (4.8 × 3.4), not the larger furniture footprint
// which includes the ladder. X/Z are transformed into pool-local space.
export function poolAt(snapshot,sceneId,position){
 return snapshot.entities.find(e=>{if(e.sceneId!==sceneId||e.type!=='yardPool')return false;const dx=position[0]-e.position[0],dz=position[2]-e.position[2],c=Math.cos(e.rotation),s=Math.sin(e.rotation);return Math.abs((dx*c-dz*s)/e.scale[0])<2.3&&Math.abs((dx*s+dz*c)/e.scale[2])<1.6;});
}
export function waterPose(snapshot,actor){
 const pool=poolAt(snapshot,actor.sceneId,actor.position);
 return {form:pool?'swim':'normal',pose:pool?'swimming':actor.moving?'walking':'idle'};
}
