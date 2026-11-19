import {normalizeCloudLayout} from '../../shared/world/cloud-layout.js';
import {getTemplate} from '../../shared/world/templates.js';

export function sceneIsPublic(scene) {
  try { return getTemplate(scene.templateId).socialArea === 'public'; } catch { return false; }
}

export function privateCloudSnapshot(snapshot) {
  const publicIds = new Set((snapshot.scenes || []).filter(sceneIsPublic).map(scene => scene.sceneId));
  return {
    ...snapshot,
    scenes:(snapshot.scenes || []).filter(scene => !publicIds.has(scene.sceneId)),
    entities:(snapshot.entities || []).filter(entity => !publicIds.has(entity.sceneId)),
    portals:(snapshot.portals || []).filter(portal => {
      const ids = portal.kind === 'legacy' ? [portal.fromSceneId,portal.toSceneId] : [portal.from?.sceneId,portal.to?.sceneId];
      return ids.every(id => !publicIds.has(id));
    })
  };
}

export function mergePrivateLayoutWithPublic(layout, baseSnapshot) {
  const privateLayout = normalizeCloudLayout({
    ...layout,
    scenes:layout.scenes.filter(scene => !sceneIsPublic(scene)),
    entities:layout.entities.filter(entity => !layout.scenes.some(scene => scene.sceneId === entity.sceneId && sceneIsPublic(scene))),
    portals:layout.portals.filter(portal => {
      const ids = portal.kind === 'legacy' ? [portal.fromSceneId,portal.toSceneId] : [portal.from.sceneId,portal.to.sceneId];
      return ids.every(id => layout.scenes.some(scene => scene.sceneId === id && !sceneIsPublic(scene)));
    })
  });
  const privateIds = new Set(privateLayout.scenes.map(scene => scene.sceneId));
  const publicIds = new Set((baseSnapshot.scenes || []).filter(sceneIsPublic).map(scene => scene.sceneId));
  return normalizeCloudLayout({
    ...privateLayout,
    world:{source_world_id:layout.world.source_world_id,name:layout.world.name},
    layout_revision:Math.max(layout.layout_revision,baseSnapshot.layoutRevision || 0),
    topology_revision:Math.max(layout.topology_revision,baseSnapshot.topologyRevision || 0),
    scenes:[...privateLayout.scenes,...(baseSnapshot.scenes || []).filter(scene => publicIds.has(scene.sceneId))],
    entities:[...privateLayout.entities,...(baseSnapshot.entities || []).filter(entity => publicIds.has(entity.sceneId))],
    portals:[...privateLayout.portals,...(baseSnapshot.portals || []).filter(portal => {
      const ids = portal.kind === 'legacy' ? [portal.fromSceneId,portal.toSceneId] : [portal.from?.sceneId,portal.to?.sceneId];
      return ids.every(id => !privateIds.has(id) && publicIds.has(id));
    })]
  });
}
