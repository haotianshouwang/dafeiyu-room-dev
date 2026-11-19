export const CLOUD_LAYOUT_FORMAT = 'dafeiyu-layout';
export const CLOUD_LAYOUT_VERSION = 1;
export const CLOUD_LAYOUT_LIMITS = Object.freeze({
  maxBytes: 2 * 1024 * 1024,
  maxScenes: 100,
  maxEntities: 10000,
  maxPortals: 500,
  maxDetailBytes: 64 * 1024
});

const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const SCENE_ID = /^[A-Za-z0-9_.-]{1,120}$/;
const HASH = /^[a-f0-9]{64}$/;
const SENSITIVE = /password|passwd|token|secret|credential|cookie|authorization|private.?key/i;

function fail(message) { throw new Error(message); }
function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name}_INVALID`);
  return value;
}
function array(value, name, max) {
  if (!Array.isArray(value) || value.length > max) fail(`${name}_INVALID`);
  return value;
}
function id(value, pattern, name) {
  if (typeof value !== 'string' || !pattern.test(value)) fail(`${name}_INVALID`);
  return value;
}
function text(value, name, max = 120, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string') fail(`${name}_INVALID`);
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || normalized.length > max) fail(`${name}_INVALID`);
  return normalized;
}
function finite(value, name, { min = -100000, max = 100000 } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${name}_INVALID`);
  return value;
}
function integer(value, name, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${name}_INVALID`);
  return value;
}
function vector3(value, name) {
  if (!Array.isArray(value) || value.length !== 3) fail(`${name}_INVALID`);
  return value.map(item => finite(item, name));
}
function scale3(value, name) {
  if (!Array.isArray(value) || value.length !== 3) fail(`${name}_INVALID`);
  return value.map(item => finite(item, name, { min:0.001, max:1000 }));
}
function safeJson(value, depth = 0) {
  if (depth > 8) fail('ENTITY_DETAIL_TOO_DEEP');
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
    if (typeof value === 'number') return finite(value, 'ENTITY_DETAIL_NUMBER');
    if (typeof value === 'string' && value.length > 4000) fail('ENTITY_DETAIL_INVALID');
    return structuredClone(value);
  }
  if (Array.isArray(value)) {
    if (value.length > 512) fail('ENTITY_DETAIL_INVALID');
    return value.map(item => safeJson(item, depth + 1));
  }
  object(value, 'ENTITY_DETAIL');
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE.test(key)) fail('SENSITIVE_LAYOUT_FIELD');
    result[key] = safeJson(item, depth + 1);
  }
  const size = new TextEncoder().encode(JSON.stringify(result)).byteLength;
  if (size > CLOUD_LAYOUT_LIMITS.maxDetailBytes) fail('ENTITY_DETAIL_TOO_LARGE');
  return result;
}

function normalizePortal(value) {
  const portal = object(value, 'PORTAL');
  const kind = portal.kind === 'legacy' ? 'legacy' : 'template';
  const result = {};
  if (portal.portalId !== undefined) result.portalId = id(portal.portalId, ID, 'PORTAL_ID');
  else if (portal.id !== undefined) result.id = id(portal.id, ID, 'PORTAL_ID');
  else fail('PORTAL_ID_INVALID');
  if (portal.bidirectional !== undefined) {
    if (typeof portal.bidirectional !== 'boolean') fail('PORTAL_BIDIRECTIONAL_INVALID');
    result.bidirectional = portal.bidirectional;
  }
  if (kind === 'legacy') {
    result.kind = 'legacy';
    result.fromSceneId = id(portal.fromSceneId, SCENE_ID, 'PORTAL_SCENE');
    result.toSceneId = id(portal.toSceneId, SCENE_ID, 'PORTAL_SCENE');
  } else {
    for (const side of ['from','to']) {
      const end = object(portal[side], 'PORTAL_END');
      result[side] = {
        sceneId:id(end.sceneId, SCENE_ID, 'PORTAL_SCENE'),
        slotId:id(end.slotId, ID, 'PORTAL_SLOT')
      };
    }
  }
  return result;
}

export function normalizeCloudLayout(input) {
  const layout = object(input, 'LAYOUT');
  if (layout.format !== CLOUD_LAYOUT_FORMAT || layout.format_version !== CLOUD_LAYOUT_VERSION) {
    fail('CLOUD_LAYOUT_UNSUPPORTED');
  }
  const scenes = array(layout.scenes, 'SCENES', CLOUD_LAYOUT_LIMITS.maxScenes).map(sceneValue => {
    const scene = object(sceneValue, 'SCENE');
    const result = {
      sceneId:id(scene.sceneId, SCENE_ID, 'SCENE_ID'),
      name:text(scene.name, 'SCENE_NAME', 120),
      templateId:id(scene.templateId, ID, 'TEMPLATE_ID'),
      status:scene.status === 'draft' ? 'draft' : 'active'
    };
    if (scene.legacyRevision !== undefined) result.legacyRevision = integer(scene.legacyRevision, 'LEGACY_REVISION', 0, 1_000_000);
    return result;
  });
  if (!scenes.length) fail('SCENES_REQUIRED');
  const sceneIds = new Set(scenes.map(scene => scene.sceneId));
  if (sceneIds.size !== scenes.length) fail('SCENE_ID_DUPLICATE');

  const entityIds = new Set();
  const entities = array(layout.entities, 'ENTITIES', CLOUD_LAYOUT_LIMITS.maxEntities).map(entityValue => {
    const entity = object(entityValue, 'ENTITY');
    const entityId = id(entity.entityId, ID, 'ENTITY_ID');
    if (entityIds.has(entityId)) fail('ENTITY_ID_DUPLICATE');
    entityIds.add(entityId);
    const sceneId = id(entity.sceneId, SCENE_ID, 'ENTITY_SCENE');
    if (!sceneIds.has(sceneId)) fail('ENTITY_SCENE_MISSING');
    const result = {
      entityId,
      sceneId,
      type:id(entity.type, ID, 'ENTITY_TYPE'),
      position:vector3(entity.position, 'ENTITY_POSITION'),
      rotation:finite(entity.rotation, 'ENTITY_ROTATION', { min:-1000, max:1000 }),
      scale:scale3(entity.scale, 'ENTITY_SCALE')
    };
    if (entity.protected !== undefined) {
      if (typeof entity.protected !== 'boolean') fail('ENTITY_PROTECTED_INVALID');
      result.protected = entity.protected;
    }
    if (entity.legacy !== undefined) {
      if (typeof entity.legacy !== 'boolean') fail('ENTITY_LEGACY_INVALID');
      result.legacy = entity.legacy;
    }
    if (entity.plots !== undefined) result.plots = safeJson(entity.plots);
    if (entity.protectionFingerprint !== undefined) {
      if (typeof entity.protectionFingerprint !== 'string' || !HASH.test(entity.protectionFingerprint)) fail('PROTECTION_FINGERPRINT_INVALID');
      result.protectionFingerprint = entity.protectionFingerprint;
    }
    return result;
  });

  const portals = array(layout.portals, 'PORTALS', CLOUD_LAYOUT_LIMITS.maxPortals).map(normalizePortal);
  for (const portal of portals) {
    const ends = portal.kind === 'legacy'
      ? [portal.fromSceneId,portal.toSceneId]
      : [portal.from.sceneId,portal.to.sceneId];
    if (ends.some(sceneId => !sceneIds.has(sceneId))) fail('PORTAL_SCENE_MISSING');
  }

  const sourceWorldId = typeof layout.world?.source_world_id === 'string'
    ? id(layout.world.source_world_id, SCENE_ID, 'SOURCE_WORLD_ID')
    : 'default';
  const worldName = text(layout.world?.name, 'WORLD_NAME', 120, { optional:true }) ?? sourceWorldId;
  return {
    format: CLOUD_LAYOUT_FORMAT,
    format_version: CLOUD_LAYOUT_VERSION,
    world:{ source_world_id:sourceWorldId,name:worldName },
    layout_revision:integer(layout.layout_revision ?? 0, 'LAYOUT_REVISION', 0, Number.MAX_SAFE_INTEGER),
    topology_revision:integer(layout.topology_revision ?? 0, 'TOPOLOGY_REVISION', 0, Number.MAX_SAFE_INTEGER),
    scenes,
    entities,
    portals
  };
}

export function extractCloudLayout(snapshot, { worldName } = {}) {
  const source = object(snapshot, 'SNAPSHOT');
  const normalized = normalizeCloudLayout({
    format:CLOUD_LAYOUT_FORMAT,
    format_version:CLOUD_LAYOUT_VERSION,
    world:{
      source_world_id:source.worldId ?? 'default',
      name:worldName ?? source.worldName ?? source.worldId ?? '默认世界'
    },
    layout_revision:source.layoutRevision ?? 0,
    topology_revision:source.topologyRevision ?? 0,
    scenes:source.scenes,
    entities:source.entities,
    portals:source.portals ?? []
  });
  return normalized;
}

export function encodeCloudLayout(snapshot, options = {}) {
  const layout = extractCloudLayout(snapshot, options);
  const bytes = new TextEncoder().encode(JSON.stringify(layout));
  if (bytes.byteLength > CLOUD_LAYOUT_LIMITS.maxBytes) fail('CLOUD_LAYOUT_TOO_LARGE');
  return { layout,bytes };
}

export function decodeCloudLayout(input) {
  let bytes;
  if (typeof input === 'string') bytes = new TextEncoder().encode(input);
  else if (input instanceof Uint8Array) bytes = input;
  else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else fail('CLOUD_LAYOUT_BYTES_REQUIRED');
  if (!bytes.byteLength || bytes.byteLength > CLOUD_LAYOUT_LIMITS.maxBytes) fail('CLOUD_LAYOUT_TOO_LARGE');
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8',{ fatal:true }).decode(bytes)); }
  catch { fail('CLOUD_LAYOUT_JSON_INVALID'); }
  return normalizeCloudLayout(parsed);
}

export function applyCloudLayout(baseSnapshot, layoutValue, { worldId = 'default' } = {}) {
  const layout = normalizeCloudLayout(layoutValue);
  if (typeof worldId !== 'string' || !SCENE_ID.test(worldId)) fail('INVALID_WORLD_ID');
  const sceneIds = new Set(layout.scenes.map(scene => scene.sceneId));
  const actors = Array.isArray(baseSnapshot?.actors) ? baseSnapshot.actors.map(actor => {
    const sceneId = sceneIds.has(actor.sceneId) ? actor.sceneId : layout.scenes[0].sceneId;
    return {
      ...structuredClone(actor),
      sceneId,
      controller:null,
      actionId:null,
      input:null,
      resting:null,
      maneuver:null,
      moving:false,
      form:'normal',
      pose:'idle'
    };
  }) : [];
  return {
    protocol_version:baseSnapshot?.protocol_version ?? '1.0.0',
    schemaVersion:1,
    rulesVersion:baseSnapshot?.rulesVersion ?? 1,
    worldId,
    layoutRevision:layout.layout_revision,
    topologyRevision:layout.topology_revision,
    scenes:structuredClone(layout.scenes),
    entities:structuredClone(layout.entities),
    portals:structuredClone(layout.portals),
    actors,
    actions:{},
    buildPlans:{},
    buildChanges:{},
    warnings:[{ code:'CLOUD_LAYOUT_IMPORTED',message:'云布局已导入；角色状态和资源文件未包含在存档中。' }]
  };
}
