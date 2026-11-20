import { CLOUD_LAYOUT_LIMITS, extractCloudLayout, normalizeCloudLayout } from '../../shared/world/cloud-layout.js';
import { getCatalogEntry } from '../../shared/world/catalog.js';
import { getTemplate } from '../../shared/world/templates.js';
import { invalidateNavigationCache, nearestFree, portalEnds, walkable } from '../../shared/world/navigation.js';
import { authorizePrincipal, NO_RUNTIME_CHANGE } from './service.js';
import { corners, validateSpatial } from './spatial.js';

export const STRUCTURED_LAYOUT_BODY_LIMIT = CLOUD_LAYOUT_LIMITS.maxBytes + 1024;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const terminal = new Set(['completed', 'cancelled', 'failed']);
function fail(code, details, statusCode = 400) {
  const error = new Error(code);
  Object.assign(error, { details, statusCode });
  throw error;
}

function validateResources(layout, resourceManifest) {
  const available = new Set(resourceManifest.assets.map(asset => asset.type));
  const localTemplates = new Set((resourceManifest.authorScenes || []).map(scene => scene.template?.templateId));
  const missingResources = new Set(), missingTemplates = new Set();
  for (const scene of layout.scenes) {
    try {
      const template = getTemplate(scene.templateId);
      if (template.templateId.startsWith('local_') && !localTemplates.has(template.templateId)) missingTemplates.add(scene.templateId);
    } catch { missingTemplates.add(scene.templateId); }
  }
  for (const entity of layout.entities) {
    try {
      const entry = getCatalogEntry(entity.type);
      if (entry.source?.kind === 'local' && !available.has(entity.type)) missingResources.add(entity.type);
    } catch { missingResources.add(entity.type); }
  }
  if (missingResources.size || missingTemplates.size) {
    fail('CLOUD_LAYOUT_RESOURCE_MISSING', {
      recoverable: true,
      missing_resource_ids: [...missingResources],
      missing_template_ids: [...missingTemplates]
    }, 409);
  }
  const portalIds = new Set();
  for (const portal of layout.portals) {
    const id = portal.id || portal.portalId;
    if (portalIds.has(id)) fail('PORTAL_ID_DUPLICATE');
    portalIds.add(id);
    if (portal.kind !== 'legacy') {
      for (const end of [portal.from, portal.to]) {
        const scene = layout.scenes.find(item => item.sceneId === end.sceneId);
        if (!getTemplate(scene.templateId).portalSlots.some(slot => slot.slotId === end.slotId)) fail('PORTAL_SLOT_UNAVAILABLE', { sceneId: end.sceneId, slotId: end.slotId });
      }
    }
    const ends = portalEnds(layout, portal);
    if (![ends.departure, ends.landing].every(point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite))) fail('PORTAL_ENDPOINT_INVALID');
  }
}

function stopAction(action) {
  if (action.step && !terminal.has(action.step.status)) stopAction(action.step);
  action.status = action.phase = 'cancelled';
  action.result = { status: 'cancelled', reason: 'layout_synced' };
}

function reconcileRuntime(snapshot, before, changedScenes, emit) {
  const changedEntity = entityId => !same(before.entities.find(entity => entity.entityId === entityId), snapshot.entities.find(entity => entity.entityId === entityId));
  const cancelled = new Set();
  for (const action of Object.values(snapshot.actions || {})) {
    if (terminal.has(action.status)) continue;
    const actor = snapshot.actors.find(item => item.actorId === action.actorId);
    const targetId = action.entityId || action.target?.entityId;
    if (!changedScenes.has(actor?.sceneId) && !changedScenes.has(action.target?.sceneId) && !(targetId && changedEntity(targetId)) && !(action.legs || []).some(leg => changedScenes.has(leg.sceneId) || changedScenes.has(leg.portal?.fromSceneId) || changedScenes.has(leg.portal?.toSceneId))) continue;
    stopAction(action);
    cancelled.add(action.actionId);
    emit('action.cancelled', { actorId: action.actorId, actionId: action.actionId, result: action.result });
  }
  const fallback = snapshot.scenes.find(scene => scene.status === 'active');
  if (!fallback) fail('CLOUD_LAYOUT_ACTIVE_SCENE_REQUIRED');
  for (const actor of snapshot.actors) {
    const previousSceneId = actor.sceneId;
    const activeScene = snapshot.scenes.find(scene => scene.sceneId === actor.sceneId && scene.status === 'active');
    const movedScene = !activeScene;
    if (movedScene) {
      actor.sceneId = fallback.sceneId;
      actor.position = [...getTemplate(fallback.templateId).spawn];
    }
    const invalidRest = actor.resting && changedEntity(actor.resting.entityId);
    const interrupted = cancelled.has(actor.actionId) || movedScene || invalidRest;
    if (interrupted) {
      Object.assign(actor, { actionId: null, resting: null, maneuver: null, moving: false, speed: 0, sprint: false, form: 'normal', pose: 'idle', grounded: true, airHeight: 0, verticalVelocity: 0, supportHeight: 0 });
      delete actor.computerDeskId;
      delete actor.climbMotion;
      delete actor.mealFoodId;
    }
    if (changedScenes.has(previousSceneId) && actor.input) actor.input.manualActive = false;
    if (movedScene || invalidRest || !actor.resting && !walkable(snapshot, actor.sceneId, actor.position)) {
      try { actor.position = nearestFree(snapshot, actor.sceneId, actor.position); }
      catch { fail('CLOUD_LAYOUT_RUNTIME_BLOCKED', { recoverable: true, actorId: actor.actorId }, 409); }
    }
  }
  // Every preview carries the old layout revision and can no longer be applied.
  snapshot.buildPlans = {};
}

export function syncStructuredLayout({ worldService, principal, worldId, input, resourceManifest }) {
  try { authorizePrincipal(principal, worldId, 'build:write', undefined, worldService.clock()); }
  catch { fail('UNAUTHORIZED', undefined, 403); }
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Number.isSafeInteger(input.expected_layout_revision) || input.expected_layout_revision < 0 || !Number.isSafeInteger(input.expected_topology_revision) || input.expected_topology_revision < 0) fail('CLOUD_LAYOUT_REVISION_REQUIRED');
  if (Buffer.byteLength(JSON.stringify(input.layout) || '') > CLOUD_LAYOUT_LIMITS.maxBytes) fail('CLOUD_LAYOUT_TOO_LARGE');
  const layout = normalizeCloudLayout(input.layout);
  validateResources(layout, resourceManifest);
  let result;
  worldService.transactRuntime(worldId, ({ snapshot, emit }) => {
    if (snapshot.layoutRevision !== input.expected_layout_revision || snapshot.topologyRevision !== input.expected_topology_revision) {
      fail('CLOUD_LAYOUT_REVISION_CONFLICT', { layoutRevision: snapshot.layoutRevision, topologyRevision: snapshot.topologyRevision }, 409);
    }
    const previousLayout = extractCloudLayout(snapshot);
    result = { worldId, layoutRevision: snapshot.layoutRevision, topologyRevision: snapshot.topologyRevision };
    if (['scenes', 'entities', 'portals'].every(key => same(previousLayout[key], layout[key]))) return NO_RUNTIME_CHANGE;
    const before = structuredClone(snapshot);
    const changedScenes = new Set();
    for (const scene of [...previousLayout.scenes, ...layout.scenes]) {
      if (!same(previousLayout.scenes.find(item => item.sceneId === scene.sceneId), layout.scenes.find(item => item.sceneId === scene.sceneId))) changedScenes.add(scene.sceneId);
    }
    for (const entity of [...previousLayout.entities, ...layout.entities]) {
      const previous = previousLayout.entities.find(item => item.entityId === entity.entityId);
      const next = layout.entities.find(item => item.entityId === entity.entityId);
      if (!same(previous, next)) { if (previous) changedScenes.add(previous.sceneId); if (next) changedScenes.add(next.sceneId); }
    }
    const topology = scenes => scenes.map(({ sceneId, templateId, status }) => ({ sceneId, templateId, status }));
    const topologyChanged = !same(topology(previousLayout.scenes), topology(layout.scenes)) || !same(previousLayout.portals, layout.portals);
    if (!same(previousLayout.portals, layout.portals)) {
      for (const portal of [...previousLayout.portals, ...layout.portals]) {
        for (const sceneId of portal.kind === 'legacy' ? [portal.fromSceneId, portal.toSceneId] : [portal.from.sceneId, portal.to.sceneId]) changedScenes.add(sceneId);
      }
    }
    for (const sceneId of changedScenes) {
      const lock = snapshot.scenes.find(scene => scene.sceneId === sceneId)?.editLock;
      if (lock && lock.expiresAt > worldService.clock() && lock.subjectId !== principal.subjectId) fail('SCENE_EDIT_LOCKED', { sceneId }, 409);
    }
    snapshot.scenes = layout.scenes.map(scene => {
      const current = before.scenes.find(item => item.sceneId === scene.sceneId);
      return { ...scene, ...(current?.editLock ? { editLock: current.editLock } : {}) };
    });
    snapshot.entities = structuredClone(layout.entities);
    snapshot.portals = structuredClone(layout.portals);
    snapshot.layoutRevision++;
    if (topologyChanged) snapshot.topologyRevision++;
    invalidateNavigationCache(snapshot);
    reconcileRuntime(snapshot, before, changedScenes, emit);
    // Compare the common, normalized layout shape so local-only extension fields
    // do not turn every pre-existing object into a spatial edit.
    try {
      validateSpatial({ ...before, scenes: previousLayout.scenes, entities: previousLayout.entities, portals: previousLayout.portals }, snapshot);
    } catch (error) {
      if (error.message === 'OUT_OF_BOUNDS') {
        const changed = snapshot.entities.filter(entity => !same(before.entities.find(item => item.entityId === entity.entityId), entity));
        const invalid = changed.find(entity => {
          const scene = snapshot.scenes.find(item => item.sceneId === entity.sceneId);
          const bounds = scene && getTemplate(scene.templateId).buildBounds;
          return bounds && corners(entity).some(([x, z]) => x < bounds.x0 || x > bounds.x1 || z < bounds.z0 || z > bounds.z1);
        });
        error.details = invalid ? {
          entityId: invalid.entityId,
          sceneId: invalid.sceneId,
          resourceId: invalid.type,
          position: [...invalid.position],
          suggestion: '从云端撤销这件家具，或把它重新放到当前场景边界内。'
        } : { recoverable:true };
      }
      throw error;
    }
    result = { worldId, layoutRevision: snapshot.layoutRevision, topologyRevision: snapshot.topologyRevision };
    emit('world.layout_synced', result);
    return result;
  });
  return result;
}
