import * as THREE from 'three';
import { loadCharacterTemplate } from '../characters/model-assets.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { buildBoxingClips } from '../characters/boxing-clips.js';
import { buildFloorSit } from '../characters/floor-sit.js';
import { Whale } from '../characters/whale.js';

const GROUND_OFFSET = .025;
const REMOTE_CLIPS = Object.freeze({
  idle: ['HumanSpDwarfIdle', 'Idle'],
  walking: ['HumanSpWalking6', 'Walking'],
  running: ['HumanSpJogging', 'Running'],
  jumping: ['HumanSpForwardJump', 'Jump'],
  swimming: ['HumanSpDwarfIdle', 'Idle'],
  seated: ['HumanSpSitting2', 'Sit'],
  sleeping: ['HumanSpDwarfIdle', 'Idle'],
  eating: ['HumanSpDwarfIdle', 'Idle'],
});
const REMOTE_CLIP_ALIASES = Object.freeze({
  Slide:'HumanSpForwardJump', Idle:'HumanSpDwarfIdle',
  Walking:'HumanSpWalking6', Running:'HumanSpJogging', Jump:'HumanSpForwardJump', Sit:'HumanSpSitting2'
});

function labelSprite(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(255,248,238,.92)';
  context.beginPath();
  context.roundRect(8, 8, 240, 48, 18);
  context.fill();
  context.fillStyle = '#51444a';
  context.font = '600 24px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(name.slice(0, 16), 128, 33);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.y = 1.85;
  sprite.userData.texture = texture;
  return sprite;
}

function fallbackFigure() {
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({color:0x75b9bd,roughness:.72});
  const skin = new THREE.MeshStandardMaterial({color:0xf0c6a4,roughness:.82});
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.16,.38,4,8),mat);
  body.position.y=.62; body.castShadow=true; root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.15,12,10),skin);
  head.position.y=1.02; head.castShadow=true; root.add(head);
  return root;
}

export class CommunityPresenceLayer {
  constructor({ scene, localUserId, localCharacter = null, loadModel = () => loadCharacterTemplate(), createSwimCharacter = () => new Whale() }) {
    this.scene = scene;
    this.localUserId = localUserId;
    this.localCharacter = localCharacter;
    this.loadModel = loadModel;
    this.createSwimCharacter = createSwimCharacter;
    this.activeScene = null;
    this.players = new Map();
    this.modelPromise = null;
    this.modelTemplate = null;
    this.modelRetryTimer = null;
    this.modelRetryDelay = 1000;
    this.disposed = false;
  }

  setLocalScene(sceneId) {
    this.activeScene = sceneId;
    for (const player of this.players.values()) this.#visible(player);
  }

  #visible(player) {
    player.group.visible = Boolean(player.position) && (!player.scene_id || player.scene_id === this.activeScene);
  }

  #create(player) {
    const group = new THREE.Group();
    const figure = fallbackFigure();
    const label = labelSprite(player.display_name || '玩家');
    group.add(figure, label);
    this.scene.add(group);
    const remote = { ...player, group, figure, label, labelName: player.display_name || '玩家', mixer: null, actions: new Map(), activeAction: null, animationState: null, retiring: [], lastPosition: null, targetPosition:new THREE.Vector3(), justCreated: true };
    if (this.modelTemplate) this.#installModel(remote, this.modelTemplate);
    else this.#loadSharedModel();
    return remote;
  }

  #loadSharedModel() {
    if (this.modelPromise || this.disposed) return;
    this.modelPromise = Promise.resolve().then(() => this.loadModel()).then(gltf => {
      if (this.disposed) return;
      this.modelTemplate = gltf;
      this.modelRetryDelay = 1000;
      clearTimeout(this.modelRetryTimer);
      this.modelRetryTimer = null;
      for (const player of this.players.values()) this.#installModel(player, gltf);
    }).catch(() => {
      this.modelPromise = null;
      if (this.disposed || !this.players.size) return;
      clearTimeout(this.modelRetryTimer);
      this.modelRetryTimer = setTimeout(() => {
        this.modelRetryTimer = null;
        this.#loadSharedModel();
        this.modelRetryDelay = Math.min(15000, this.modelRetryDelay * 2);
      }, this.modelRetryDelay);
    });
  }

  #installModel(player, gltf) {
    if (player.model || this.disposed) return;
    const model = SkeletonUtils.clone(gltf.scene);
    model.scale.setScalar(.65 * 1.28);
    model.rotation.y = 0;
    player.ownedMaterials = new Set();
    model.traverse(object => {
      if (object.isMesh) {
        object.castShadow = true; object.receiveShadow = true; object.frustumCulled = false;
        if (Array.isArray(object.material)) object.material = object.material.map(material => { const copy=material.clone(); player.ownedMaterials.add(copy); return copy; });
        else if (object.material) { object.material=object.material.clone(); player.ownedMaterials.add(object.material); }
      }
    });
    player.group.remove(player.figure);
    player.figure.traverse(object => {
      object.geometry?.dispose?.();
      object.material?.dispose?.();
    });
    player.group.add(model);
    player.model = model;
    model.visible = !player.swimmer?.group.visible;
    player.mixer = new THREE.AnimationMixer(model);
    for (const source of gltf.animations) {
      // Match the local rig: world positions already contain locomotion.
      const clip = source.clone();
      for (const track of clip.tracks) {
        if (!/(^|\.)Hips\.position$/.test(track.name)) continue;
        const values = track.values;
        let min = Infinity, max = -Infinity;
        for (let i = 2; i < values.length; i += 3) { min = Math.min(min, values[i]); max = Math.max(max, values[i]); }
        if (max - min < .5) continue;
        for (let i = 3; i < values.length; i += 3) { values[i] = values[0]; values[i+2] = values[2]; }
      }
      player.actions.set(clip.name, player.mixer.clipAction(clip));
    }
    const boxing = player.actions.get('HumanSpBoxing')?.getClip();
    if (boxing) for (const clip of buildBoxingClips(model, boxing)) player.actions.set(clip.name, player.mixer.clipAction(clip));
    const sitting = player.actions.get('HumanSpSitting2')?.getClip();
    if (sitting) { const floorSit = buildFloorSit(model, sitting); if (floorSit) player.actions.set(floorSit.name, player.mixer.clipAction(floorSit)); }
    player.animationState = null;
    this.#animate(player, player.data || player);
  }

  #retire(player, next, fade) {
    if (player.activeAction && player.activeAction !== next) {
      next.crossFadeFrom(player.activeAction, fade, false);
      player.retiring.push({action:player.activeAction, remaining:fade+.05});
    }
    player.retiring = player.retiring.filter(item => item.action !== next);
  }

  #animate(player, data) {
    if (!player.mixer || !player.model) return;
    if (typeof data.animation_clip === 'string') {
      const revision = Number.isSafeInteger(data.animation_revision) ? data.animation_revision : 0;
      const networkName = data.animation_clip;
      const resolvedName = player.actions.has(networkName) ? networkName : REMOTE_CLIP_ALIASES[networkName];
      const next = resolvedName && player.actions.get(resolvedName);
      if (next) {
        const changed = player.networkRevision !== revision || player.networkClip !== networkName || player.activeAction !== next;
        if (changed) {
          next.reset().setLoop(data.animation_loop === false ? THREE.LoopOnce : THREE.LoopRepeat, data.animation_loop === false ? 1 : Infinity);
          next.clampWhenFinished = data.animation_loop === false;
          next.setEffectiveWeight(1).setEffectiveTimeScale(THREE.MathUtils.clamp(data.animation_speed || 1, .05, 4)).play();
          this.#retire(player, next, .08);
          player.activeAction = next; player.networkRevision = revision; player.networkClip = networkName; player.animationState = `network:${networkName}`;
        }
        next.paused = data.animation_paused === true;
        next.setEffectiveTimeScale(THREE.MathUtils.clamp(data.animation_speed || 1, .05, 4));
        const duration = next.getClip().duration;
        const elapsed = !next.paused && Number.isFinite(data.server_time_ms) ? Math.max(0, Math.min(2, (Date.now() - data.server_time_ms) / 1000)) : 0;
        const clockTime = Math.max(0, (Number.isFinite(data.animation_time) ? data.animation_time : 0) + elapsed * THREE.MathUtils.clamp(data.animation_speed || 1, .05, 4));
        const expected = data.animation_loop === false ? Math.min(Math.max(0, duration - .001), clockTime) : (duration > 0 ? clockTime % duration : 0);
        let drift = expected - next.time;
        if (data.animation_loop !== false && duration > 0) drift = ((drift + duration * 1.5) % duration) - duration * .5;
        if (changed || next.paused) next.time = expected;
        else if (Math.abs(drift) > .12) next.time = Math.max(0, Math.min(duration, next.time + drift * .28));
        return;
      }
    }
    player.networkClip = null; player.networkRevision = null;
    const pose = data.pose || 'idle';
    const moving = typeof data.moving === 'boolean' ? data.moving : Boolean(data.lastPosition && data.position && Math.hypot(data.position[0]-data.lastPosition[0],data.position[2]-data.lastPosition[2]) > .03);
    const state = pose === 'jumping' || pose === 'sliding' || pose === 'tree-climbing' ? 'jumping'
      : moving && data.sprint ? 'running'
      : moving ? 'walking' : pose;
    if (state === player.animationState) return;
    const candidates = REMOTE_CLIPS[state] || REMOTE_CLIPS.idle;
    const clipName = candidates.find(name => player.actions.has(name));
    const next = clipName && player.actions.get(clipName);
    if (!next) return;
    player.animationState = state;
    if (next === player.activeAction) return;
    next.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).play();
    next.paused = false;
    this.#retire(player, next, .16);
    player.activeAction = next;
  }

  update(players, dt = 1/60) {
    if (this.disposed) return;
    const seen = new Set();
    for (const [userId, data] of players) {
      if (userId === this.localUserId) continue;
      seen.add(userId);
      let player = this.players.get(userId);
      if (!player) { player = this.#create(data); this.players.set(userId, player); }
      player.lastPosition = player.position;
      Object.assign(player, data);
      player.data = data;
      if (Array.isArray(data.position)) {
        const rendered = Array.isArray(data.render_position) && data.render_position.length === 3 && data.render_position.every(Number.isFinite);
        player.targetPosition.set(...(rendered ? data.render_position : data.position));
        if (!rendered && !['seated','sleeping','climbing','sliding','tree-climbing'].includes(data.pose)) player.targetPosition.y += GROUND_OFFSET + (data.form === 'swim' || data.pose === 'swimming' ? .38 : 0);
        if (player.justCreated) { player.group.position.copy(player.targetPosition); player.justCreated=false; }
      }
      const swimming = data.form === 'swim';
      if (swimming && !player.swimmer) {
        player.swimmer = this.createSwimCharacter();
        player.swimmer.group.scale.setScalar(1.28);
        player.swimmer.baseY = 0;
        if (player.swimmer.shadow) player.swimmer.shadow.visible = false;
        player.group.add(player.swimmer.group);
      }
      if (player.swimmer) player.swimmer.group.visible = swimming;
      (player.model || player.figure).visible = !swimming;
      if (Number.isFinite(data.rotation)) player.group.rotation.y = data.rotation;
      if (player.label && data.display_name && player.labelName !== data.display_name) {
        player.group.remove(player.label);
        player.label.material.map?.dispose?.(); player.label.material.dispose();
        player.labelName = data.display_name;
        player.label = labelSprite(data.display_name); player.group.add(player.label);
      }
      this.#animate(player, {...data,lastPosition:player.lastPosition});
      this.#visible(player);
    }
    for (const [userId, player] of this.players) {
      if (seen.has(userId)) continue;
      this.#remove(player);
      this.players.delete(userId);
    }
  }

  #remove(player) {
    this.scene.remove(player.group);
    player.mixer?.stopAllAction();
    player.figure?.traverse(object => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
      else object.material?.dispose?.();
    });
    player.label?.material.map?.dispose?.();
    player.label?.material.dispose?.();
    for(const material of player.ownedMaterials||[])material.dispose?.();
    for(const action of player.actions?.values?.()||[])player.mixer?.uncacheAction(action.getClip(),player.model);
    player.model?.removeFromParent();
    if (player.swimmer) {
      const geometries = new Set();
      player.swimmer.group.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
      for (const geometry of geometries) geometry.dispose();
      player.swimmer.shadow?.material.map?.dispose();
      player.swimmer.group.removeFromParent();
    }
  }

  advance(dt) {
    const alpha=1-Math.exp(-Math.min(Math.max(dt,0),.05)*18);
    for (const player of this.players.values()) {
      const step = Math.min(Math.max(dt,0),.05);
      if (!player.swimmer?.group.visible) player.mixer?.update(step);
      if (player.swimmer?.group.visible) {
        const swimmer = player.swimmer;
        swimmer.pos.set(0,0,0); swimmer.target.set(0,0,player.moving ? 1 : 0); swimmer.heading=0; swimmer.state=player.moving?'swim':'idle';
        swimmer.update(step, (this.swimTime = (this.swimTime || 0) + step));
        swimmer.group.position.set(0,0,0); swimmer.group.rotation.y=0;
      }
      player.retiring = player.retiring.filter(item => { item.remaining -= step; if (item.remaining > 0) return true; if (item.action !== player.activeAction) item.action.stop(); return false; });
      if(player.targetPosition)player.group.position.lerp(player.targetPosition,alpha);
    }
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.modelRetryTimer);
    for (const player of this.players.values()) this.#remove(player);
    this.players.clear();
  }
}
