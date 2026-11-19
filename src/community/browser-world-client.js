import { defaultManifest, farmPlots } from '../../shared/world/default-manifest.js';
import { applyAccountPlayerState } from '../../shared/world/account-player-state.js';
import { advancePlayer, inputSpeedScale } from '../../shared/world/movement.js';
import { anchor, nearestFree } from '../../shared/world/navigation.js';
import { getTemplate } from '../../shared/world/templates.js';
import { registerLocalAssets } from '../../shared/world/catalog.js';
import { applyCloudLayout, encodeCloudLayout } from '../../shared/world/cloud-layout.js';
import {listPortalSlots,simulateBuild} from '../../shared/world/build-validation.js';
import {PUBLIC_LOBBY_SCENE, PUBLIC_LOBBY_SCENE_ID, PUBLIC_LOBBY_TEMPLATE_ID} from '../../shared/world/public-lobby.js';
import {petHandlers} from '../../shared/creatures/commands.js';
import {itemHandlers} from '../../shared/items/commands.js';
import {validateCommand} from '../../shared/world/schema.js';
import {WORLD_LIMITS} from '../../shared/world/policies.js';
import polyforkManifest from '../../resources/polyfork/manifest.json' with { type: 'json' };

const bundledAssetBase = () => new URL(
  'resources/polyfork/',
  globalThis.document?.baseURI || globalThis.location?.href || 'http://127.0.0.1/game/'
).href;

registerLocalAssets({
  assets: polyforkManifest.assets.map(asset => ({
    ...asset,
    modelURL: new URL(asset.file, bundledAssetBase()).href,
    thumbnailURL: new URL(asset.thumbnail, bundledAssetBase()).href
  }))
});

function randomId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function withPublicLobby(snapshot) {
  if (!snapshot?.scenes) return snapshot;
  if (!snapshot.scenes.some(scene => scene.sceneId === PUBLIC_LOBBY_SCENE_ID)) {
    snapshot.scenes = [...snapshot.scenes, {...PUBLIC_LOBBY_SCENE}];
  }
  const activeIds=new Set(snapshot.scenes.filter(scene=>scene.status!=='draft').map(scene=>scene.sceneId));
  snapshot.portals=(snapshot.portals||[]).filter(portal=>
    !(portal.id||portal.portalId||'').startsWith('lobby-exit-'));
  const street=snapshot.scenes.find(scene=>scene.sceneId==='convenience-store'&&activeIds.has(scene.sceneId));
  if(street){
    try{
      const from=listPortalSlots(snapshot,PUBLIC_LOBBY_SCENE_ID).find(slot=>slot.slotId==='east'&&!slot.occupied&&!slot.blocked&&slot.reachable);
      const slots=listPortalSlots(snapshot,street.sceneId);
      const to=['south','west','north','east'].map(id=>slots.find(slot=>slot.slotId===id)).find(slot=>slot&&!slot.occupied&&!slot.blocked&&slot.reachable);
      if(from&&to)snapshot.portals.push({id:'lobby-exit-commercial-street',from:{sceneId:PUBLIC_LOBBY_SCENE_ID,slotId:from.slotId},to:{sceneId:street.sceneId,slotId:to.slotId},bidirectional:true});
    }catch{}
  }
  return snapshot;
}

export function createStarterSnapshot({ worldId = defaultManifest.worldId, now = Date.now() } = {}) {
  const scenes = structuredClone(defaultManifest.scenes).map(scene => ({
    sceneId: scene.sceneId,
    name: scene.name,
    templateId: scene.templateId,
    status: 'active'
  }));
  const entities = [];
  for (const scene of defaultManifest.scenes) {
    scene.entities.forEach((entity, index) => {
      const value = {
        entityId: `${scene.sceneId}-${index + 1}`,
        sceneId: scene.sceneId,
        type: entity.type,
        position: [...entity.position],
        rotation: entity.rotation,
        scale: [...entity.scale]
      };
      if (value.type === 'yardFarm') {
        value.protected = true;
        value.plots = structuredClone(farmPlots);
      }
      entities.push(value);
    });
  }
  const actors = structuredClone(defaultManifest.actors).map(actor => ({
    ...actor,
    pose: 'idle',
    form: 'normal',
    moving: false,
    speed: 0,
    grounded: true,
    needs: { hunger: 30, energy: 80, happiness: 70 }
  }));
  return withPublicLobby({
    protocol_version: '1.0.0',
    schemaVersion: 1,
    rulesVersion: 1,
    worldId,
    layoutRevision: 0,
    topologyRevision: 0,
    scenes,
    entities,
    portals: structuredClone(defaultManifest.portals),
    actors,
    actions: {},
    buildPlans: {},
    buildChanges: {},
    runtime: { lastTickAt: now },
    warnings: []
  });
}

export class BrowserWorldClient {
  constructor({
    snapshot,
    storage = globalThis.localStorage,
    storageKey = 'dafeiyu-community-browser-world-v2',
    subjectId = 'browser-player',
    serverId = '',
    now = Date.now
  } = {}) {
    this.storage = storage;
    this.baseStorageKey = storageKey;
    this.subjectId = subjectId;
    this.serverId = serverId;
    this.contextVersion = 0;
    this.storageKey = this.#storageKey(subjectId);
    this.now = now;
    this.snapshot = withPublicLobby(snapshot) ?? this.#loadPersisted() ?? createStarterSnapshot({ now: now() });
    this.cursor = 0;
    this.readVersion = 0;
    this.appliedVersion = 0;
    this.disposed = false;
    this.listeners = new Set();
    this.snapshotListeners = new Set();
    this.statusListeners = new Set();
    this.actionTimers = new Map();
    this.visitorBackup = null;
  }

  #storageKey(subjectId) {
    return `${this.baseStorageKey}:${this.serverId ? `${encodeURIComponent(this.serverId)}:` : ''}${encodeURIComponent(subjectId)}`;
  }

  get contextKey() { return JSON.stringify([this.serverId, this.subjectId, this.snapshot.worldId, this.contextVersion]); }
  get readOnly() { return Boolean(this.visitorBackup); }

  #resetContext() {
    this.contextVersion++;
    for (const timer of this.actionTimers.values()) clearTimeout(timer);
    this.actionTimers.clear();
    for (const actor of this.snapshot.actors || []) {
      actor.controller = null; actor.input = null; actor.actionId = null; actor.moving = false;
      actor.pose = 'idle'; actor.resting = null; actor.maneuver = null;
    }
    this.snapshot.actions = {};
    this.snapshot.buildPlans = {};
    this.snapshot.buildChanges = {};
  }

  #loadPersisted() {
    try {
      let stored = this.storage?.getItem(this.storageKey);
      // Older releases already separated accounts. Migrate that user's key
      // only on its original browser origin, never the old global world.
      if (!stored && this.serverId && this.serverId === globalThis.location?.origin) stored = this.storage?.getItem(`${this.baseStorageKey}:${encodeURIComponent(this.subjectId)}`);
      const value = JSON.parse(stored);
      return value?.schemaVersion === 1 && Array.isArray(value.scenes) ? withPublicLobby(value) : null;
    } catch {
      return null;
    }
  }

  #persist() {
    if (this.visitorBackup) return;
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.snapshot));
    } catch {}
  }

  #emit() {
    this.snapshot._contextKey = this.contextKey;
    this.#persist();
    for (const listener of this.snapshotListeners) listener(this.snapshot);
  }

  #event(kind, data) {
    const event = { worldId: this.snapshot.worldId, cursor: ++this.cursor, kind, data };
    for (const listener of this.listeners) listener(event);
    return event;
  }

  #actionDuration(kind, payload) {
    if (kind === 'move') return 250;
    if (kind === 'eat' || kind === 'sit' || kind === 'sleep') return 650;
    if (kind === 'maneuver') return payload.maneuver === 'dance' ? 1_200 : 800;
    if (kind === 'climbTree') return 900;
    return 500;
  }

  #finishAction(actor, actionId, kind, payload) {
    const timer = this.actionTimers.get(actionId);
    if (timer) clearTimeout(timer);
    this.actionTimers.delete(actionId);
    actor = this.snapshot.actors.find(item => item.actorId === actor.actorId);
    if (!actor) return;
    if (actor.actionId !== actionId) return;
    actor.actionId = null;
    actor.moving = false;
    actor.maneuver = null;
    if (!['sit', 'sleep'].includes(kind)) {
      actor.pose = actor.form === 'swim' ? 'swimming' : 'idle';
    }
    const result = {
      status: 'completed',
      sceneId: actor.sceneId,
      position: [...actor.position],
      pose: actor.pose,
      needs: { ...actor.needs },
      ...(kind === 'maneuver' ? { maneuver: payload.maneuver, blocked: false } : {})
    };
    this.snapshot.actions[actionId] = { actionId, actorId: actor.actorId, kind, status: 'completed', phase: 'completed', result };
    this.#emit();
    this.#event('action.completed', { actorId: actor.actorId, actionId, result });
  }

  #actor(actorId) {
    const actor = this.snapshot.actors.find(item => item.actorId === actorId);
    if (!actor) throw new Error('ACTOR_NOT_FOUND');
    return actor;
  }

  #checkLease(actor, payload) {
    const controller = actor.controller;
    if (!controller || controller.leaseId !== payload.leaseId ||
      controller.leaseVersion !== payload.leaseVersion ||
      controller.subjectId !== this.subjectId ||
      controller.expiresAt <= this.now()) {
      throw new Error('LEASE_INVALID');
    }
    return controller;
  }

  #targetPosition(sceneId, target) {
    const scene = this.snapshot.scenes.find(item => item.sceneId === sceneId);
    if (!scene) throw new Error('SCENE_NOT_FOUND');
    if (target?.entityId) {
      const entity = this.snapshot.entities.find(item => item.entityId === target.entityId);
      if (!entity) throw new Error('ENTITY_NOT_FOUND');
      return { sceneId: entity.sceneId, position: anchor(entity, target.anchorId || 'approach') };
    }
    if (Array.isArray(target?.position)) return { sceneId, position: [...target.position] };
    const template = getTemplate(scene.templateId);
    const landmark=target?.landmarkId&&template.landmarks?.find(item=>item.landmarkId===target.landmarkId);
    if(target?.landmarkId&&!landmark)throw Error('LANDMARK_NOT_FOUND');
    return { sceneId, position: nearestFree(this.snapshot, sceneId, target?.groundPosition
      ? [target.groundPosition[0], 0, target.groundPosition[1]]
      : landmark?.position||template.spawn) };
  }

  #control(payload, takeOver) {
    const actor = this.#actor(payload.actorId);
    const current = actor.controller;
    if (current && current.expiresAt > this.now() && current.subjectId !== this.subjectId && !takeOver) {
      throw new Error('LEASE_BUSY');
    }
    const controller = {
      leaseId: current?.subjectId === this.subjectId ? current.leaseId : randomId('lease'),
      leaseVersion: (current?.leaseVersion ?? 0) + 1,
      subjectId: this.subjectId,
      expiresAt: this.now() + 60_000
    };
    actor.controller = controller;
    actor.input = { leaseId: controller.leaseId, sequence: actor.input?.sequence ?? 0, lastAt: this.now(), budgetMs: 100 };
    this.#emit();
    return controller;
  }

  onEvent(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  onSnapshot(listener) { this.snapshotListeners.add(listener); return () => this.snapshotListeners.delete(listener); }
  onStatus(listener) { this.statusListeners.add(listener); return () => this.statusListeners.delete(listener); }
  status(value) {
    if (this.connectionStatus === value) return;
    this.connectionStatus = value;
    for (const listener of this.statusListeners) listener(value);
  }

  async connect(worldId = this.snapshot.worldId) {
    this.worldId = worldId;
    this.snapshot.worldId = worldId;
    this.disposed = false;
    this.status('connected');
    this.#emit();
    return this.snapshot;
  }

  setSubjectId(subjectId) {
    if (typeof subjectId !== 'string' || !subjectId || subjectId.length > 128) throw new Error('INVALID_SUBJECT_ID');
    if (this.subjectId === subjectId) return this.snapshot;
    this.#resetContext();
    this.visitorBackup = null;
    this.subjectId = subjectId;
    this.storageKey = this.#storageKey(subjectId);
    this.snapshot = this.#loadPersisted() ?? createStarterSnapshot({ now:this.now() });
    this.worldId = this.snapshot.worldId;
    this.#emit();
    return this.snapshot;
  }

  exportLayout({ worldName = this.snapshot.worldName || this.snapshot.worldId } = {}) {
    return encodeCloudLayout(this.snapshot, { worldName });
  }

  startInPublicLobby(actorId = this.snapshot.actors?.[0]?.actorId) {
    withPublicLobby(this.snapshot);
    const actor = this.snapshot.actors.find(item => item.actorId === actorId);
    if (!actor) throw new Error('ACTOR_NOT_FOUND');
    const spawn = getTemplate(PUBLIC_LOBBY_TEMPLATE_ID).spawn;
    this.snapshot = {
      ...this.snapshot,
      scenes:[...this.snapshot.scenes],
      entities:[...this.snapshot.entities],
      portals:[...this.snapshot.portals],
      actors:this.snapshot.actors.map(item => item.actorId === actorId ? {
        ...item,
        sceneId:PUBLIC_LOBBY_SCENE_ID,
        position:[...spawn],
        rotation:Math.PI,
        pose:'idle',
        moving:false,
        actionId:null
      } : item)
    };
    this.#event('actor.scene_changed', {actorId, sceneId:PUBLIC_LOBBY_SCENE_ID});
    this.#emit();
    return this.snapshot.actors.find(item => item.actorId === actorId);
  }

  importLayout(layout, { worldId = 'default' } = {}) {
    if (this.readOnly) throw Error('VISITOR_READ_ONLY');
    if (worldId !== this.snapshot.worldId) this.#resetContext();
    this.snapshot = applyCloudLayout(this.snapshot, layout, { worldId });
    this.worldId = worldId;
    this.#emit();
    return this.snapshot;
  }

  async refresh() {
    this.readVersion += 1;
    this.appliedVersion = this.readVersion;
    this.#emit();
    return this.snapshot;
  }

  async refreshState() {
    this.readVersion += 1;
    this.appliedVersion = this.readVersion;
    for (const listener of this.snapshotListeners) listener(this.snapshot);
    return this.snapshot;
  }

  async sync() {
    this.status('connected');
    return this.snapshot;
  }

  replaceSnapshot(snapshot, { worldId = snapshot.worldId } = {}) {
    if (worldId !== this.snapshot.worldId) this.#resetContext();
    this.snapshot = structuredClone(snapshot);
    this.snapshot.worldId = worldId;
    this.worldId = worldId;
    this.#emit();
    return this.snapshot;
  }

  enterVisitorSnapshot(snapshot) {
    this.#resetContext();
    if (!this.visitorBackup) this.visitorBackup = structuredClone(this.snapshot);
    this.snapshot = structuredClone(snapshot);
    this.worldId = this.snapshot.worldId;
    this.#emit();
    return this.snapshot;
  }

  leaveVisitorSnapshot() {
    if (!this.visitorBackup) return this.snapshot;
    this.#resetContext();
    this.snapshot = this.visitorBackup;
    this.visitorBackup = null;
    this.worldId = this.snapshot.worldId;
    this.#emit();
    return this.snapshot;
  }

  async dispatch(command, { refresh = true } = {}) {
    if (this.readOnly && /^(build|pet|item)\./.test(command.kind)) throw new Error('VISITOR_READ_ONLY');
    if (command.worldId && command.worldId !== this.snapshot.worldId) throw new Error('WORLD_ID_MISMATCH');
    const companionHandler=petHandlers[command.kind]||itemHandlers[command.kind];
    if(companionHandler){
      const complete={...command,worldId:this.snapshot.worldId,requestId:command.requestId||randomId('command')};
      if(!validateCommand(complete).ok)throw Error('INVALID_COMMAND');
      this.#actor(command.payload.actorId);
      const next={...this.snapshot,pets:structuredClone(this.snapshot.pets),items:structuredClone(this.snapshot.items)};
      const events=[];
      const result=companionHandler({snapshot:next,command:complete,principal:{role:'owner',subjectId:this.subjectId},now:this.now(),emit:(kind,data)=>events.push([kind,data])});
      this.snapshot=next;
      // Companion state is local gameplay, including when multiplayer is off.
      // Persist it even for position-only commands that skip a render refresh.
      if(refresh)this.#emit();else this.#persist();
      for(const [kind,data] of events)this.#event(kind,data);
      return result;
    }
    // Render subscribers retain the previous snapshot. Copy runtime actors
    // before changing scenes or applying input so their comparison stays valid.
    this.snapshot = {...this.snapshot,actors:this.snapshot.actors.map(actor=>structuredClone(actor))};
    const payload = command.payload || {};
    let result;
    switch (command.kind) {
      case 'actor.sync': {
        const actor = this.#actor(payload.actorId);
        const timer = this.actionTimers.get(actor.actionId);
        clearTimeout(timer);
        this.actionTimers.delete(actor.actionId);
        result = { actor: applyAccountPlayerState(this.snapshot, actor, payload.state) };
        break;
      }
      case 'control.takeover':
        result = this.#control(payload, true);
        break;
      case 'control.acquire':
        result = this.#control(payload, false);
        break;
      case 'control.renew': {
        const actor = this.#actor(payload.actorId);
        this.#checkLease(actor, payload).expiresAt = this.now() + 60_000;
        result = { ...actor.controller };
        break;
      }
      case 'control.release': {
        const actor = this.#actor(payload.actorId);
        this.#checkLease(actor, payload);
        actor.controller = null;
        actor.input = null;
        result = { released: true };
        break;
      }
      case 'actor.input': {
        const actor = this.#actor(payload.actorId);
        this.#checkLease(actor, payload);
        for (const frame of payload.frames || []) {
          Object.assign(actor, advancePlayer(this.snapshot, actor, frame.direction, frame.dtMs, frame.jump, inputSpeedScale(frame)));
          actor.sprint = Boolean(frame.sprint);
          actor.crawl = Boolean(frame.crawl);
          actor.boxing = Boolean(frame.boxing);
          actor.input = {
            leaseId: actor.controller.leaseId,
            sequence: frame.sequence,
            lastAt: this.now(),
            budgetMs: 100
          };
        }
        actor.controller.expiresAt = this.now() + 60_000;
        result = { actor };
        break;
      }
      case 'actor.teleport': {
        const actor = this.#actor(payload.actorId);
        let sceneId=payload.sceneId;
        if(payload.templateId==='forest_v1'){
          let forest=this.snapshot.scenes.find(item=>item.templateId==='forest_v1'&&item.status==='active');
          if(!forest){
            if(this.snapshot.scenes.length>=WORLD_LIMITS.scenes)throw Error('QUOTA_EXCEEDED');
            forest={sceneId:randomId('forest'),name:'森林',templateId:'forest_v1',status:'active'};
            this.snapshot.scenes=[...this.snapshot.scenes,forest];
            this.snapshot.layoutRevision++;this.snapshot.topologyRevision++;
          }
          sceneId=forest.sceneId;
        }
        const destination = this.#targetPosition(sceneId, payload);
        actor.sceneId = destination.sceneId;
        actor.position = destination.position;
        actor.pose = 'idle';
        actor.form = 'normal';
        actor.resting = null;
        actor.actionId = null;
        actor.moving = false;
        result = { actor };
        break;
      }
      case 'action.submit': {
        const actor = this.#actor(payload.actorId);
        this.#checkLease(actor, payload);
        const actionId = randomId('action');
        if (payload.kind === 'cancel') {
          if (actor.actionId) {
            const timer = this.actionTimers.get(actor.actionId);
            if (timer) clearTimeout(timer);
            this.actionTimers.delete(actor.actionId);
          }
          actor.actionId = null;
          actor.pose = 'idle';
          actor.form = 'normal';
          actor.resting = null;
          actor.moving = false;
          actor.maneuver = null;
          result = { actionId, status: 'cancelled', phase: 'cancelled' };
        } else {
          if (payload.target || payload.kind === 'move') {
            const destination = this.#targetPosition(payload.target?.sceneId || actor.sceneId, payload.target);
            actor.sceneId = destination.sceneId;
            actor.position = destination.position;
            this.#event('actor.scene_changed', { actorId: actor.actorId, sceneId: actor.sceneId });
          }
          actor.actionId = actionId;
          actor.resting = null;
          actor.moving = payload.kind === 'move';
          actor.maneuver = payload.kind === 'maneuver' ? payload.maneuver : null;
          actor.form = payload.kind === 'swim' || payload.kind === 'slide' ? 'swim' : 'normal';
          actor.pose = ({
            sit: 'seated',
            sleep: 'sleeping',
            swim: 'swimming',
            slide: 'swimming',
            climbTree: 'tree-climbing',
            maneuver: 'maneuver',
            eat: 'eating'
          })[payload.kind] || 'idle';
          if (payload.kind === 'sit' && payload.target?.entityId) actor.resting = { entityId: payload.target.entityId, approachPosition: [...actor.position] };
          if (payload.kind === 'eat') {
            actor.mealFoodId = payload.foodId || 'rice';
            actor.needs.hunger = Math.max(0, actor.needs.hunger - 25);
          }
          this.snapshot.actions[actionId] = { actionId, actorId: actor.actorId, kind: payload.kind, status: 'running', phase: 'running', ...(payload.foodId ? { foodId: payload.foodId } : {}), ...(payload.maneuver ? { maneuver: payload.maneuver } : {}) };
          this.#event('action.started', { actorId: actor.actorId, actionId, kind: payload.kind });
          const timer=setTimeout(() => this.#finishAction(actor, actionId, payload.kind, payload), this.#actionDuration(payload.kind, payload));
          timer.unref?.();
          this.actionTimers.set(actionId, timer);
          result = { actionId, status: 'running', phase: 'running' };
        }
        break;
      }
      case 'action.task': {
        const actor = this.#actor(payload.actorId);
        this.#checkLease(actor, payload);
        const actionId = randomId('task');
        actor.actionId = actionId;
        this.snapshot.actions[actionId] = { actionId, actorId: actor.actorId, kind: 'task', status: 'running', phase: 'running', task: payload.plan };
        this.#event('action.started', { actorId: actor.actorId, actionId, kind: 'task' });
        const timer=setTimeout(() => this.#finishAction(actor, actionId, 'task', payload), 900);
        timer.unref?.();
        this.actionTimers.set(actionId, timer);
        result = { actionId, status: 'running', phase: 'running' };
        break;
      }
      case 'build.editLock':
        result = { status: payload.locked ? 'locked' : 'released', sceneId: payload.sceneId };
        break;
      case 'build.preview': {
        if (payload.baseRevision !== this.snapshot.layoutRevision) throw new Error('REVISION_CONFLICT');
        for (const op of payload.ops || []) {
          const sceneId = op.sceneId || this.snapshot.entities.find(item => item.entityId === op.entityId)?.sceneId;
          const scene = this.snapshot.scenes.find(item => item.sceneId === sceneId);
          if (scene && getTemplate(scene.templateId).readOnly) throw Error('SCENE_READ_ONLY');
        }
        const planId = randomId('plan');
        const createdIds = Object.fromEntries((payload.ops || []).filter(op => op.kind === 'entity.add').map(op => [op.ref, randomId('entity')]));
        simulateBuild(this.snapshot, payload.ops || [], createdIds);
        this.snapshot.buildPlans[planId] = { ops: structuredClone(payload.ops), createdIds, baseRevision: payload.baseRevision };
        result = { planId, status: 'previewed', createdIds, diff: { ops: payload.ops } };
        break;
      }
      case 'build.apply': {
        const plan = this.snapshot.buildPlans[payload.planId];
        if (!plan) throw new Error('PLAN_NOT_FOUND');
        if (plan.baseRevision !== this.snapshot.layoutRevision) throw new Error('REVISION_CONFLICT');
        const validated = simulateBuild(this.snapshot, plan.ops, plan.createdIds);
        const changeId = randomId('change');
        this.snapshot.buildChanges[changeId] = {
          before: structuredClone({
            scenes: this.snapshot.scenes,
            entities: this.snapshot.entities,
            portals: this.snapshot.portals
          }),
          after: null
        };
        this.snapshot.scenes = validated.scenes;
        this.snapshot.entities = validated.entities;
        this.snapshot.portals = validated.portals;
        this.snapshot.layoutRevision += 1;
        this.snapshot.buildChanges[changeId].after = structuredClone({
          scenes: this.snapshot.scenes,
          entities: this.snapshot.entities,
          portals: this.snapshot.portals
        });
        delete this.snapshot.buildPlans[payload.planId];
        result = { status: 'applied', changeId, layoutRevision: this.snapshot.layoutRevision, createdIds: plan.createdIds };
        break;
      }
      case 'build.undo': {
        const change = this.snapshot.buildChanges[payload.changeId];
        if (!change) throw new Error('CHANGE_NOT_FOUND');
        Object.assign(this.snapshot, structuredClone(change.before));
        this.snapshot.layoutRevision += 1;
        this.snapshot.topologyRevision += 1;
        change.undone = true;
        result = { status: 'undone', layoutRevision: this.snapshot.layoutRevision };
        break;
      }
      case 'events.ack':
        result = { cursor: payload.cursor ?? this.cursor };
        break;
      default:
        throw new Error(`NOT_IMPLEMENTED:${command.kind}`);
    }
    if (refresh) this.#emit();
    return result;
  }

  dispose() {
    this.disposed = true;
    for (const timer of this.actionTimers.values()) clearTimeout(timer);
    this.actionTimers.clear();
    this.listeners.clear();
    this.snapshotListeners.clear();
    this.statusListeners.clear();
  }
}
