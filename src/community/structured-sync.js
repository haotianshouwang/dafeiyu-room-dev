import { decodeCloudLayout, normalizeCloudLayout } from '../../shared/world/cloud-layout.js';

const PREFIX = 'dafeiyu-structured-sync-v2:';
const copy = value => structuredClone(value);
const keyOf = value => value.object_type + ':' + value.object_id;
const randomId = () => globalThis.crypto.randomUUID();
const dataOf = response => response?.data ?? response;
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const same = (a, b) => Boolean(a?.deleted) === Boolean(b?.deleted) && stable(a?.payload ?? null) === stable(b?.payload ?? null);
const abort = signal => { if (signal?.aborted) throw new DOMException('同步已取消', 'AbortError'); };
async function digest(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}
function emptyState() { return { cursor: 0, objects: {}, baseline: null, baselineVersions: {}, outbox: [], desired: {}, conflicts: [], resolutions: {}, inflight: null }; }
function normalizeSource(input) {
  if (input?.layout) return normalizeCloudLayout(input.layout);
  if (input?.format === 'dafeiyu-layout') return normalizeCloudLayout(input);
  return decodeCloudLayout(input?.bytes ?? input);
}
export function structuredLayoutObjects(input) {
  const layout = normalizeSource(input), result = {};
  const add = (type, id, payload) => { result[type + ':' + id] = { object_type: type, object_id: id, payload, deleted: false }; };
  for (const scene of layout.scenes) add('room', scene.sceneId, {
    scene_id: scene.sceneId, name: scene.name, template_id: scene.templateId, status: scene.status,
    ...(scene.legacyRevision === undefined ? {} : { legacy_revision: scene.legacyRevision })
  });
  for (const entity of layout.entities) add('furniture', entity.entityId, {
    scene_id: entity.sceneId, resource_id: entity.type, position: copy(entity.position), rotation: entity.rotation, scale: copy(entity.scale),
    ...(entity.protected === undefined ? {} : { protected: entity.protected }),
    ...(entity.legacy === undefined ? {} : { legacy: entity.legacy }),
    ...(entity.plots === undefined ? {} : { plots: copy(entity.plots) }),
    ...(entity.protectionFingerprint === undefined ? {} : { protection_fingerprint: entity.protectionFingerprint })
  });
  for (const portal of layout.portals) add('portal', portal.portalId || portal.id, copy(portal));
  return result;
}

export function cloudLayoutFromStructuredObjects(objects, {worldId = 'shared-home', worldName = '访客房间', layoutRevision = 0, topologyRevision = 0} = {}) {
  const scenes = [], entities = [], portals = [];
  for (const object of Object.values(objects || {})) {
    if (!object || object.deleted || !object.payload) continue;
    const payload = object.payload;
    if (object.object_type === 'room') scenes.push({
      sceneId: object.object_id,
      name: payload.name,
      templateId: payload.template_id,
      status: payload.status,
      ...(payload.legacy_revision === undefined ? {} : {legacyRevision:payload.legacy_revision})
    });
    if (object.object_type === 'furniture') entities.push({
      entityId: object.object_id,
      sceneId: payload.scene_id,
      type: payload.resource_id,
      position: copy(payload.position),
      rotation: payload.rotation,
      scale: copy(payload.scale),
      ...(payload.protected === undefined ? {} : {protected:payload.protected}),
      ...(payload.legacy === undefined ? {} : {legacy:payload.legacy}),
      ...(payload.plots === undefined ? {} : {plots:copy(payload.plots)}),
      ...(payload.protection_fingerprint === undefined ? {} : {protectionFingerprint:payload.protection_fingerprint})
    });
    if (object.object_type === 'portal') portals.push(copy(payload));
  }
  return normalizeCloudLayout({
    format:'dafeiyu-layout',
    format_version:1,
    world:{source_world_id:worldId,name:worldName},
    layout_revision:layoutRevision,
    topology_revision:topologyRevision,
    scenes,
    entities,
    portals
  });
}
function restoreLayout(base, objects, cursor) {
  const scenes = [], entities = [], portals = [];
  for (const [key, object] of Object.entries(objects)) {
    if (object.deleted) continue;
    const type = key.slice(0, key.indexOf(':')), id = key.slice(key.indexOf(':') + 1), p = object.payload;
    if (type === 'room') scenes.push({ sceneId: id, name: p.name, templateId: p.template_id, status: p.status, ...(p.legacy_revision === undefined ? {} : { legacyRevision: p.legacy_revision }) });
    if (type === 'furniture') entities.push({ entityId: id, sceneId: p.scene_id, type: p.resource_id, position: p.position, rotation: p.rotation, scale: p.scale,
      ...(p.protected === undefined ? {} : { protected: p.protected }), ...(p.legacy === undefined ? {} : { legacy: p.legacy }),
      ...(p.plots === undefined ? {} : { plots: p.plots }), ...(p.protection_fingerprint === undefined ? {} : { protectionFingerprint: p.protection_fingerprint }) });
    if (type === 'portal') portals.push(copy(p));
  }
  // An empty remote space must not erase the local world on its first read.
  if (!scenes.length && !Object.keys(objects).length) return base;
  return normalizeCloudLayout({ ...base, layout_revision: Math.max(base.layout_revision, cursor), scenes, entities, portals });
}

export class StructuredCloudSyncManager {
  constructor({ api, storage = globalThis.localStorage, onState = () => {}, onConflict = () => {}, maxBatch = 100, retryAttempts = 3, retryDelayMs = 250 } = {}) {
    if (!api) throw new Error('结构化云同步需要 API');
    Object.assign(this, { api, storage, onState, onConflict, retryAttempts, retryDelayMs });
    this.maxBatch = Math.max(1, Math.min(100, maxBatch));
    this.memory = new Map();
    this.running = false;
  }
  async #identity() {
    let userId = this.api.currentUserId;
    try { userId = dataOf(await this.api.me()).user.id; }
    catch (error) { if (!userId || error.status === 401 || error.status === 403 || error.retryable === false) throw error; }
    if (!userId) throw new Error('请登录后同步');
    return userId;
  }
  #key(userId, domain, scopeId, worldId) {
    return PREFIX + [this.api.baseUrl || globalThis.location?.origin || 'same-origin', userId, domain, scopeId || 'me', worldId || 'player'].map(encodeURIComponent).join(':');
  }
  #load(key) {
    const raw = this.storage?.getItem(key);
    const value = raw ? JSON.parse(raw) : this.memory.get(key);
    return value ? { ...emptyState(), ...copy(value) } : emptyState();
  }
  #save(key, state) {
    // Never acknowledge a change locally if its retry queue could not be saved.
    if (this.storage) this.storage.setItem(key, JSON.stringify(state));
    this.memory.set(key, copy(state));
  }
  async #retry(fn, signal) {
    for (let attempt = 0; ; attempt++) {
      abort(signal);
      try { return await fn(); }
      catch (error) {
        if (error.retryable !== true || attempt + 1 >= this.retryAttempts || signal?.aborted) throw error;
        this.onState('RETRYING', { attempt: attempt + 1, error });
        await new Promise(resolve => setTimeout(resolve, Math.min(5000, this.retryDelayMs * 2 ** attempt)));
      }
    }
  }
  #operation(object, version) {
    return { operation_id: randomId(), object_type: object.object_type, object_id: object.object_id, base_version: version, payload: object.deleted ? null : copy(object.payload), deleted: Boolean(object.deleted) };
  }
  #capture(state, current) {
    const baseline = state.baseline || {};
    const keys = new Set([...Object.keys(current), ...Object.keys(baseline)]);
    for (const key of keys) {
      const previous = baseline[key], next = current[key] || { ...previous, deleted: true, payload: null };
      if (same(previous, next)) continue;
      const conflict = state.conflicts.find(item => item.status === 'OPEN' && keyOf(item) === key);
      if (state.outbox.some(item => keyOf(item) === key) || conflict) state.desired[key] = copy(next);
      // Downloaded versions are not ancestors of a local edit until apply succeeds.
      // In particular, a revision-fence failure must not silently rebase that edit.
      else state.outbox.push(this.#operation(next, state.baselineVersions[key] || 0));
    }
    state.baseline = copy(current);
  }
  #confirmEquivalent(state) {
    if (state.inflight) return;
    const retained = [];
    for (const operation of state.outbox) {
      const key = keyOf(operation), remote = state.objects[key];
      if (!same(operation, remote)) { retained.push(operation); continue; }
      const desired = state.desired[key];
      if (desired && !same(desired, remote)) retained.push(this.#operation(desired, remote?.version || 0));
      delete state.desired[key];
    }
    state.outbox = retained;
  }
  #refreshConflicts(state, remote) {
    const liveIds = new Set(remote.map(item => item.conflict_id));
    for (const previous of state.conflicts) {
      if (liveIds.has(previous.conflict_id) || state.resolutions[previous.conflict_id]) continue;
      const key = keyOf(previous), desired = state.desired[key];
      // Another device may have resolved the original conflict. A newer local
      // edit still needs its own CAS check, rather than an untracked view overlay.
      if (desired && !same(desired, state.objects[key]) && !state.outbox.some(item => keyOf(item) === key)) {
        state.outbox.push(this.#operation(desired, previous.base_version));
      }
      delete state.desired[key];
    }
    const resolving = Object.values(state.resolutions).map(item => item.conflict).filter(item => !liveIds.has(item.conflict_id));
    state.conflicts = [...remote, ...resolving];
    for (const [key, desired] of Object.entries(state.desired)) {
      if (state.conflicts.some(item => keyOf(item) === key) || state.outbox.some(item => keyOf(item) === key)) continue;
      if (!same(desired, state.objects[key])) state.outbox.push(this.#operation(desired, state.baselineVersions[key] || 0));
      delete state.desired[key];
    }
  }
  #appliedVersions(state, view) {
    const versions = {};
    for (const [key, object] of Object.entries(view)) {
      const operation = state.outbox.find(item => keyOf(item) === key);
      const conflict = state.conflicts.find(item => item.status === 'OPEN' && keyOf(item) === key);
      versions[key] = operation?.base_version ?? conflict?.base_version ?? (same(object, state.objects[key]) ? state.objects[key]?.version || 0 : state.baselineVersions[key] || 0);
    }
    return versions;
  }
  async #pull(scopeId, domain, state, key, signal, checkIdentity) {
    let more;
    do {
      const data = dataOf(await this.#retry(() => { checkIdentity(); return this.api.pullStructuredSync({ scopeId, domain, afterCursor: state.cursor, limit: this.maxBatch, signal }); }, signal));
      checkIdentity();
      let cursor = state.cursor;
      for (const change of data.changes || []) {
        if (change.cursor !== cursor + 1) throw new Error('结构化同步游标不连续，请保留本地数据并重新连接');
        if (!change.deleted && await digest(change.payload) !== change.payload_hash) throw new Error('结构化数据完整性校验失败');
        const objectKey = keyOf(change), existing = state.objects[objectKey];
        if (!existing || change.version >= existing.version) state.objects[objectKey] = copy(change);
        cursor = change.cursor;
      }
      if (data.next_cursor !== cursor) throw new Error('结构化同步游标校验失败');
      state.cursor = cursor;
      more = Boolean(data.has_more);
      if (more && !(data.changes || []).length) throw new Error('结构化同步分页无进展');
      this.#save(key, state);
    } while (more);
  }
  async #flush(scopeId, domain, state, key, signal, checkIdentity) {
    while (state.outbox.length) {
      if (!state.inflight) state.inflight = { request_id: randomId(), scope_id: scopeId, domain, client_cursor: state.cursor, operations: copy(state.outbox.slice(0, this.maxBatch)) };
      this.#save(key, state);
      const data = dataOf(await this.#retry(() => { checkIdentity(); return this.api.structuredSyncBatch(state.inflight, { signal }); }, signal));
      checkIdentity();
      const accepted = data.accepted || [], conflicts = data.conflicts || [];
      const done = new Set([...accepted, ...conflicts].map(item => item.operation_id));
      if (state.inflight.operations.some(item => !done.has(item.operation_id))) throw new Error('服务端未确认全部操作，本地队列已保留');
      for (const item of accepted) {
        const objectKey = keyOf(item), existing = state.objects[objectKey];
        if (!item.deleted && await digest(item.payload) !== item.payload_hash) throw new Error('结构化数据完整性校验失败');
        if (!existing || item.version >= existing.version) state.objects[objectKey] = copy(item);
      }
      for (const conflict of conflicts) state.conflicts = [...state.conflicts.filter(item => item.conflict_id !== conflict.conflict_id), copy(conflict)];
      state.outbox = state.outbox.filter(item => !done.has(item.operation_id));
      state.inflight = null;
      for (const item of accepted) {
        const objectKey = keyOf(item), desired = state.desired[objectKey];
        if (desired) { if (!same(desired, item)) state.outbox.push(this.#operation(desired, item.version)); delete state.desired[objectKey]; }
      }
      // A batch's server_cursor may include other devices' changes. Only pull advances our cursor.
      this.#save(key, state);
    }
  }
  #view(state) {
    const view = copy(state.objects);
    for (const conflict of state.conflicts.filter(item => item.status === 'OPEN')) {
      view[keyOf(conflict)] = { object_type: conflict.object_type, object_id: conflict.object_id, payload: copy(conflict.local_payload), deleted: conflict.local_deleted };
    }
    for (const operation of state.outbox) view[keyOf(operation)] = copy(operation);
    for (const [key, desired] of Object.entries(state.desired)) view[key] = copy(desired);
    return view;
  }
  async sync({ scopeId, domain = 'building', layout, snapshot, objects, signal, pullOnly = false, refreshOnly = false, apply, expectedUserId } = {}) {
    if (this.running) throw new Error('正在同步，请等待当前同步完成');
    this.running = true;
    try {
      const userId = await this.#identity();
      if (expectedUserId && expectedUserId !== userId) throw new Error('同步账号已改变，请重新打开云同步');
      const server = this.api.baseUrl, identityVersion = this.api.identityVersion;
      const checkIdentity = () => {
        if (this.api.baseUrl !== server || this.api.identityVersion !== identityVersion || (this.api.currentUserId !== undefined && this.api.currentUserId !== userId)) throw new Error('同步账号已改变，请重新打开云同步');
        abort(signal);
      };
      const source = domain === 'building' ? normalizeSource(layout || snapshot) : null;
      const current = domain === 'building' ? structuredLayoutObjects(source) : Object.fromEntries((objects || []).map(item => [keyOf(item), copy(item)]));
      const key = this.#key(userId, domain, scopeId, source?.world.source_world_id);
      const state = this.#load(key);
      if (!pullOnly && domain === 'community') throw new Error('社区关系、货币和权限由各业务模块管理，不能通过存档写入');
      if (pullOnly && !refreshOnly && (state.outbox.length || state.conflicts.some(item => item.status === 'OPEN'))) throw new Error('请先同步或处理本机待提交修改，再读取云端布局');
      // Capture against the previously applied version BEFORE fetching remote changes.
      if ((!pullOnly && !refreshOnly) || (refreshOnly && state.baseline)) this.#capture(state, current);
      this.#save(key, state);
      this.onState('PULLING', { scopeId, domain });
      await this.#pull(scopeId, domain, state, key, signal, checkIdentity);
      checkIdentity();
      // Identical objects seen on a first connection need no write or conflict.
      this.#confirmEquivalent(state);
      this.#save(key, state);
      if (!pullOnly && !refreshOnly) { this.onState('PUSHING', { pending: state.outbox.length }); await this.#flush(scopeId, domain, state, key, signal, checkIdentity); }
      await this.#pull(scopeId, domain, state, key, signal, checkIdentity);
      if (this.api.structuredSyncConflicts) {
        const remote = dataOf(await this.api.structuredSyncConflicts({ scopeId, domain, signal })).conflicts || [];
        this.#refreshConflicts(state, remote);
      }
      const view = this.#view(state);
      const restored = source ? restoreLayout(source, view, state.cursor) : null;
      checkIdentity();
      if (apply) await apply(restored || view);
      checkIdentity();
      state.baseline = source ? structuredLayoutObjects(restored) : copy(view);
      state.baselineVersions = this.#appliedVersions(state, view);
      this.#save(key, state);
      const conflicts = state.conflicts.filter(item => item.status === 'OPEN');
      if (conflicts.length) this.onConflict(conflicts);
      this.onState(conflicts.length ? 'CONFLICT' : state.outbox.length ? 'PENDING' : 'IN_SYNC', { conflicts, scopeId, cursor: state.cursor });
      return { scopeId, layout: restored, objects: view, cursor: state.cursor, pending: state.outbox.length, conflicts, state };
    } catch (error) { this.onState(error.retryable ? 'OFFLINE' : 'ERROR', { error }); throw error; }
    finally { this.running = false; }
  }
  async resolveConflict({ scopeId, domain = 'building', worldId, conflictId, resolution, objectId } = {}) {
    if (this.running) throw new Error('正在同步，请等待当前同步完成');
    this.running = true;
    try {
    const userId = await this.#identity(), key = this.#key(userId, domain, scopeId, worldId);
    const server = this.api.baseUrl, identityVersion = this.api.identityVersion;
    const checkIdentity = () => {
      if (this.api.baseUrl !== server || this.api.identityVersion !== identityVersion || (this.api.currentUserId !== undefined && this.api.currentUserId !== userId)) throw new Error('同步账号已改变，请重新打开云同步');
    };
    const state = this.#load(key); state.resolutions ||= {};
    const pending = state.resolutions[conflictId];
    const conflict = pending?.conflict || state.conflicts.find(item => item.conflict_id === conflictId);
    if (!conflict) throw new Error('本机未找到该冲突，请先读取同步状态');
    const desired = state.desired[keyOf(conflict)];
    if(pending && pending.body.resolution !== resolution) throw new Error('此前的冲突处理尚未确认，请重试相同处理方式');
    const body = pending?.body || { resolution, ...(resolution === 'save_as_new' ? { object_id: objectId || randomId() } : {}),
      ...(resolution === 'keep_remote' ? {} : { deleted: desired?.deleted ?? conflict.local_deleted, payload: desired ? desired.payload : conflict.local_payload }), request_id: randomId() };
    state.resolutions[conflictId] = {body, conflict};
    this.#save(key, state);
    const result = dataOf(await this.#retry(() => { checkIdentity(); return this.api.resolveStructuredConflict(conflictId, body); }));
    checkIdentity();
    delete state.resolutions[conflictId];
    state.conflicts = state.conflicts.filter(item => item.conflict_id !== conflictId);
    delete state.desired[keyOf(conflict)];
    if (result.accepted) {
      if (!result.accepted.deleted && await digest(result.accepted.payload) !== result.accepted.payload_hash) throw new Error('结构化数据完整性校验失败');
      const objectKey = keyOf(result.accepted), previous = state.objects[objectKey];
      if (!previous || result.accepted.version >= previous.version) state.objects[objectKey] = copy(result.accepted);
    }
    // Keep the baseline of what is actually displayed until the resolved view
    // is applied. Otherwise the rejected local value would be queued again.
    this.#save(key, state);
    return result;
    } finally { this.running = false; }
  }
}
