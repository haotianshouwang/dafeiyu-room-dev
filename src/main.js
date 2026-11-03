import * as THREE from 'three';
import { createRenderer } from './core/renderer.js';
import { setupEnvironment, setupBackdrop } from './core/env.js';
import { setupLights } from './core/lights.js';
import { IsoCamera } from './core/camera.js';
import { buildRoom } from './world/room.js';
import { buildProps } from './world/props.js';
import { buildYard } from './world/yard.js';
import { buildLiving } from './world/living.js';
import { Whale } from './characters/whale.js';
import characterConfig from 'virtual:character-config';
import { WhaleMaid } from './characters/whaleMaid.js';
import { WhalePaper } from './characters/whalePaper.js';
import { FX } from './effects/fx.js';
import { HUD } from './ui/hud.js';
import { Interactions } from './interactions.js';
import { characterVoice } from './ui/voice.js';
import { updateTweens, Tween, ease } from './core/anim.js';

setupBackdrop();
const app = document.getElementById('app');
const R = createRenderer(app);

const scene = new THREE.Scene();
const iso = new IsoCamera();
const camera = iso.camera;

setupEnvironment(R.renderer, scene);
const lights = setupLights(scene, { windowPos: new THREE.Vector3(0.05, 1.6, -3.4) });
const room = buildRoom();
const props = buildProps();
const roomRoot = new THREE.Group();
roomRoot.name = 'roomScene';
roomRoot.add(room.group, props.group);
scene.add(roomRoot);

const yard = buildYard();
scene.add(yard.group);
yard.group.visible = false;

const living = buildLiving();
scene.add(living.group);
living.group.visible = false;


const requestedCharacter = new URLSearchParams(location.search).get('character');
const characterMode = characterConfig.modelBase ? (requestedCharacter || characterConfig.defaultCharacter) : 'whale';
let whale = characterMode === 'whale' ? new Whale() : characterMode === 'paper' ? new WhalePaper() : characterMode === 'maid-arms' ? new WhaleMaid({ modelFile: 'Whale_Maid_Lively.glb' }) : new WhaleMaid();
whale.ready?.catch(error => {
  console.error('大肥鱼模型加载失败', error);
  const hint = document.getElementById('hint');
  if (hint) { hint.textContent = '模型加载失败，请刷新页面，或在地址后加 ?character=whale 查看原角色。'; hint.classList.add('in'); }
});
whale.group.scale.setScalar(1.28);
whale.group.position.copy(whale.pos);
scene.add(whale.group);

// 备用形态：掉进泳池会变成这只圆胖鲸鱼
const maidRef = whale;
const blob = new Whale();
blob.group.scale.setScalar(1.28);
blob.group.visible = false;
scene.add(blob.group);

const fx = new FX(scene);
const hud = new HUD();
const game = new Interactions({ scene, camera, iso, whale, fx, props, hud, lights });

/* ---------------- 人形 / 胖鲸鱼 形态切换 ---------------- */
function setCharacter(next, { y } = {}) {
  if (whale === next) return;
  const from = whale;
  from.group.visible = false;
  next.group.visible = true;
  const targetY = y ?? (next === blob ? 0.38 : (next.groundY ?? 0.025));
  next.pos.set(from.pos.x, targetY, from.pos.z);
  next.target?.copy?.(next.pos);
  next.heading = from.heading;
  next.group.position.copy(next.pos);
  next.group.rotation.y = next.heading;
  next.group.scale.setScalar(1.28);
  const cfg = SCENES[activeScene];
  next.bounds = cfg.bounds;
  next.colliders = cfg.colliders || null;
  if (next === blob) {
    next.baseY = 0.38;
    next.state = 'idle';
    if (next.shadow) next.shadow.visible = false;
  } else {
    next.state = 'idle';
  }
  whale = next;
  game.whale = next;
  window.__whale = next;
}

let inWater = false;
function enterWater() {
  if (inWater) return;
  inWater = true;
  const b = yard.pool;
  const tgt = whale.target;
  // 落到池子里（目标点若在池内就游到那里，否则就近吸附）
  const tx = Math.min(Math.max(tgt.x, b.x0 + 0.45), b.x1 - 0.45);
  const tz = Math.min(Math.max(tgt.z, b.z0 + 0.45), b.z1 - 0.45);
  const p = whale.group.position.clone();
  setCharacter(blob, { y: 0.38 });
  blob.pos.set(tx, 0.38, tz);
  blob.target.set(tx, 0.38, tz);
  blob.group.position.copy(blob.pos);
  fx.splash(p.clone().setY(0.4));
  fx.ripple(new THREE.Vector3(tx, 0, tz));
  characterVoice.play('pool');
  const poolVoice=characterVoice.clip('pool');
  hud.say(poolVoice.text,p.clone().setY(1.5),poolVoice.duration);
  return;
  fx.burst(p.clone().setY(0.5), 8);
  hud.say('噗通——变回大肥鱼了。', p.clone().setY(1.5), 2.8);
  game.stats.love = Math.min(100, game.stats.love + 2);
  game._syncStats?.();
}
function exitWater() {
  if (!inWater) return;
  inWater = false;
  const p = whale.group.position.clone();
  setCharacter(whale === blob ? (characterMode === 'whale' ? whale : maidRef) : whale, {});
  fx.splash(p.clone().setY(0.4));
  hud.say('上岸就变回来啦。', p.clone().setY(1.6), 2.8);
}

/* ---------------- 场景管理 ---------------- */
const SCENES = {
  room: {
    label: '房间',
    root: roomRoot,
    update: (dt, t) => { room.update?.(dt, t); props.update?.(dt, t); },
    view: { target: new THREE.Vector3(0.15, 1.05, 0.0), zoom: 1.02 },
    spawn: new THREE.Vector3(0.05, 1.12, 0.55),
    bounds: { x0: -3.0, x1: 3.0, z0: -3.0, z1: 3.0 },
    sleepAnchor: new THREE.Vector3(-2.31, 0.84, -2.08),
  },
  living: {
    label: '客厅',
    root: living.group,
    update: (dt, t) => living.update?.(dt, t),
    view: living.view,
    spawn: living.spawn.clone(),
    bounds: living.bounds,
  },
  yard: {
    label: '院子',
    root: yard.group,
    update: (dt, t) => yard.update?.(dt, t),
    view: yard.view,
    spawn: yard.spawn.clone(),
    bounds: yard.bounds,
  },
};
let activeScene = 'room';
const fadeEl = document.getElementById('fade');
const locEl = document.getElementById('loc');
let switching = false;

function applyScene(id, { instant = false } = {}) {
  if (id !== 'yard' && whale === blob) { inWater = false; setCharacter(maidRef, {}); }
  const cfg = SCENES[id];
  for (const key of Object.keys(SCENES)) SCENES[key].root.visible = (key === id);
  activeScene = id;
  iso.setView(cfg.view.target, cfg.view.zoom);
  if (lights?.sun) lights.sun.intensity = cfg.sunIntensity ?? 2.15;
  iso.zoomTarget = iso.homeZoom;
  if (instant) { iso.target.copy(iso.homeTarget); iso.zoom = iso.homeZoom; }
  whale.bounds = cfg.bounds;
  whale.colliders = cfg.colliders || null;
  game.sleepAnchor = cfg.sleepAnchor || null;
  whale.pos.copy(cfg.spawn);
  if (whale.groundY !== undefined) whale.pos.y = whale.groundY;
  whale.target.copy(whale.pos);
  whale.state = 'idle'; whale.history = [];
  whale.velocity?.set(0,0,0);
  if (whale.food) { whale.food.userData.dead=true; whale.food=null; }
  whale.group.position.copy(whale.pos);
  game.setScene(cfg);
  if (locEl) { locEl.textContent = cfg.label + ' · 切换'; }
  if (pendingSleep && id === 'room') {
    pendingSleep = false;
    setTimeout(() => { try { game.toggleSleep(); } catch (e) { /* ignore */ } }, 500);
  }
  fx.sparklePool.items.forEach((i) => { i.life = 0; i.sp.visible = false; });
}

function goTo(id) {
  if (switching || id === activeScene) return;
  switching = true;
  // 看门狗：任何情况下 3 秒后恢复，不会卡在黑屏
  setTimeout(() => {
    if (switching) { switching = false; fadeEl.classList.remove('on'); }
  }, 3000);
  fadeEl.classList.add('on');
  setTimeout(() => {
    applyScene(id);
    R.composer.render();           // 让新场景的着色器在遮罩期间编译完
    requestAnimationFrame(() => {
      fadeEl.classList.remove('on');
      switching = false;
    });
  }, 420);
}

if (locEl) {
  locEl.style.cursor = 'pointer';
  locEl.title = '点击切换 房间 / 院子';
  const CYCLE = ['room', 'living', 'yard'];
  locEl.addEventListener('click', () => {
    const i = CYCLE.indexOf(activeScene);
    goTo(CYCLE[(i + 1) % CYCLE.length]);
  });
}

let pendingSleep = false;
game.onNeedBed = () => {
  if (activeScene === 'room') return;
  pendingSleep = true;
  goTo('room');
};

const HOTSPOT_TARGET = { exit: 'yard', enter: 'room' };
game.onHotspot = (kind) => goTo(HOTSPOT_TARGET[kind] || kind);

R.setScene(scene, camera);

/* 指针与拖拽 */
const pointer = new THREE.Vector2(0, 0);
window.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  iso.setPointer(pointer.x, pointer.y);
});

let dragging = false, lastX = 0, downT = 0;
window.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; downT = performance.now(); });
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointermove', (e) => {
  if (dragging && Math.abs(e.clientX - lastX) > 2 && performance.now() - downT > 90) {
    iso.addDrag((e.clientX - lastX) * 0.0022);
  }
  lastX = e.clientX;
});
window.addEventListener('resize', () => { R.resize(window.innerWidth, window.innerHeight); iso.resize(); });

/* 开场镜头 */
iso.zoom = 0.92;
iso.zoomTarget = 0.92;
const tweens = [];
let introStarted = false;
function startIntro() {
  if (introStarted) return; introStarted = true;
  applyScene('room', { instant: true });
  iso.zoomTarget = iso.homeZoom;
  const hp = iso.homeTarget.clone();
  tweens.push(new Tween(2.4, (k) => {
    iso.target.set(hp.x, hp.y - 0.16 * (1 - k), hp.z);
  }, { ease: ease.outCubic }));
}

// 阴影每 2 帧更新一次（只有鲸鱼在动，肉眼无差）
lights.sun.shadow.autoUpdate = false;
lights.sun.shadow.needsUpdate = true;
let shadowTick = 0;

const clock = new THREE.Clock();
let t = 0;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  t += dt;
  iso.update(dt);
  updateTweens(tweens, dt);
  game.update(dt, t);
  SCENES[activeScene].update(dt, t);

  // 泳池形态转换：进水变胖鲸鱼，上岸变回人形
  if (activeScene === 'yard' && yard.pool) {
    const b = yard.pool, p = whale.pos;
    const inside = p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1;
    if (inside && whale !== blob) enterWater();
    else if (!inside && whale === blob) exitWater();
  }
  fx.update(dt, t);
  hud.updateBubble(dt, camera);
  // 相机轻微呼吸
  R.gradePass.uniforms.uTime.value = t;
  if (++shadowTick % 2 === 0) lights.sun.shadow.needsUpdate = true;
  R.composer.render();
  requestAnimationFrame(frame);
}

R.renderer.compile(scene, camera);
frame();

/* 载入进度 */
const loadBar = document.getElementById('loadBar');
const loadText = document.getElementById('loadText');
let prog = 0;
const tick = setInterval(() => {
  prog = Math.min(100, prog + 22 + Math.random() * 14);
  loadBar.style.width = prog + '%';
  if (prog >= 100) {
    clearInterval(tick);
    loadText.textContent = '她来了';
    setTimeout(() => {
      document.getElementById('loading').classList.add('gone');
      startIntro();
      document.getElementById('title').classList.add('in');
      document.getElementById('hint').classList.add('in');
      setTimeout(() => {
        document.getElementById('status').classList.add('in');
        document.getElementById('actions').classList.add('in');
      }, 260);
    }, 280);
  }
}, 120);

window.__renderer = R.renderer;
window.__R = R;
window.__lights = lights;
window.__iso = iso;
window.__whale = whale;
window.__scene = scene;
window.__game = game;
window.__blob = blob;
window.__maid = maidRef;
window.__roomDebug = () => ({
  whale: whale.pos.toArray().map((v) => +v.toFixed(2)),
  state: whale.state,
  zoom: iso.zoom,
  info: { calls: R.renderer.info.render.calls, tris: R.renderer.info.render.triangles },
});
