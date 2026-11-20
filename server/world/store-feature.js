import {STORE_SCENE,STORE_SCENE_ID,STORE_PORTALS} from '../../shared/world/store-scene.js';
// One-time feature installation. Never reapply defaults over later player/agent edits.
export function installStoreScene(service,worldId='default'){
 const initial=service.readSnapshot(worldId);
 const existingEntities=initial.entities.filter(entity=>entity.sceneId===STORE_SCENE_ID);
 // Older world snapshots may contain the scene and feature flag but no
 // furniture. Public street geometry is read-only, so restore only missing
 // baseline entities and preserve any existing edits.
 const needsRepair=STORE_SCENE.entities.some((entity,index)=>!existingEntities.some(item=>item.entityId===`${STORE_SCENE_ID}-${index+1}`||item.type===entity.type&&JSON.stringify(item.position)===JSON.stringify(entity.position)));
 if(initial.features?.convenienceStoreV1&&!needsRepair)return {installed:false};
 if(!initial.scenes.some(s=>s.sceneId==='living'))return {installed:false};
 const alreadyExists=initial.scenes.some(s=>s.sceneId===STORE_SCENE_ID);
 const oldDoor=initial.portals.some(p=>p.kind==='legacy'&&p.fromSceneId==='living'&&p.toSceneId==='yard');
 if(!alreadyExists&&(!oldDoor||initial.scenes.length>=8))return {installed:false};
 return service.transactRuntime(worldId,({snapshot,emit})=>{
  snapshot.features??={};snapshot.features.convenienceStoreV1=1;
  if(alreadyExists){
   let repaired=0;
   for(const [index,entity] of STORE_SCENE.entities.entries()){
    const entityId=STORE_SCENE_ID+'-'+(index+1);
    if(snapshot.entities.some(item=>item.entityId===entityId||item.sceneId===STORE_SCENE_ID&&item.type===entity.type&&JSON.stringify(item.position)===JSON.stringify(entity.position)))continue;
    snapshot.entities.push({...structuredClone(entity),entityId,sceneId:STORE_SCENE_ID});
    repaired++;
   }
   if(repaired){snapshot.layoutRevision++;emit('world.feature_repaired',{feature:'convenienceStoreV1',sceneId:STORE_SCENE_ID,added:repaired});}
   return {installed:false,repaired};
  }
  const {entities,...scene}=structuredClone(STORE_SCENE);snapshot.scenes.push({...scene,status:'active'});
  snapshot.entities.push(...entities.map((e,i)=>({...e,entityId:`${STORE_SCENE_ID}-${i+1}`,sceneId:STORE_SCENE_ID})));
  snapshot.portals=snapshot.portals.filter(p=>!(p.kind==='legacy'&&p.fromSceneId==='living'&&p.toSceneId==='yard'));snapshot.portals.push(...structuredClone(STORE_PORTALS));
  snapshot.layoutRevision++;snapshot.topologyRevision++;emit('world.feature_installed',{feature:'convenienceStoreV1',sceneId:STORE_SCENE_ID});return {installed:true};
 });
}
