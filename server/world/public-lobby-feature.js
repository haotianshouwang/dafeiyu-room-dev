import {PUBLIC_LOBBY_SCENE, PUBLIC_LOBBY_SCENE_ID} from '../../shared/world/public-lobby.js';
import {listPortalSlots} from '../../shared/world/build-validation.js';

export function installPublicLobby(service, worldId = 'default') {
  const snapshot = service.readSnapshot(worldId);
  const hasScene=snapshot.scenes.some(scene=>scene.sceneId===PUBLIC_LOBBY_SCENE_ID);
  const scenes=hasScene?snapshot.scenes:[...snapshot.scenes,{...PUBLIC_LOBBY_SCENE}];
  // Rebuild only system-managed lobby exits. Private houses remain accessible
  // through the map; the physical public exit leads to the commercial street.
  const portals=snapshot.portals.filter(portal=>!(portal.id||portal.portalId||'').startsWith('lobby-exit-'));
  const next={...snapshot,scenes,portals};
  const street=scenes.find(scene=>scene.templateId==='street_corner_v1'&&scene.status==='active');
  if(street){
    const from=listPortalSlots(next,PUBLIC_LOBBY_SCENE_ID).find(slot=>slot.slotId==='east'&&!slot.occupied&&!slot.blocked&&slot.reachable);
    const slots=listPortalSlots(next,street.sceneId);
    // Keep north/east available for the Town and Beach author scenes.
    const to=['south','west','north','east'].map(id=>slots.find(slot=>slot.slotId===id)).find(slot=>slot&&!slot.occupied&&!slot.blocked&&slot.reachable);
    if(from&&to)portals.push({id:'lobby-exit-commercial-street',from:{sceneId:PUBLIC_LOBBY_SCENE_ID,slotId:from.slotId},to:{sceneId:street.sceneId,slotId:to.slotId},bidirectional:true});
  }
  if(hasScene&&JSON.stringify(portals)===JSON.stringify(snapshot.portals)&&snapshot.features?.publicLobbyV2)return {installed:false};
  return service.transactRuntime(worldId, ({snapshot: current, emit}) => {
    current.scenes=scenes;current.portals=portals;
    if(!hasScene)current.layoutRevision++;
    current.topologyRevision++;
    current.features = {...(current.features || {}), publicLobbyV1:true, publicLobbyV2:true};
    emit('world.public_lobby_installed', {sceneId:PUBLIC_LOBBY_SCENE_ID});
    return {installed:true, sceneId:PUBLIC_LOBBY_SCENE_ID};
  });
}
