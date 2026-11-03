import * as THREE from 'three';
import { createRenderer } from './core/renderer.js';
import { setupEnvironment, setupBackdrop } from './core/env.js';
import { setupLights } from './core/lights.js';
import { IsoCamera } from './core/camera.js';
import { buildRoom } from './world/room.js';
import { buildProps } from './world/props.js';
import { buildYard } from './world/yard.js';
import {sampleSlideRide} from './world/pool-slide.js';
import { buildLiving } from './world/living.js';
import { Whale } from './characters/whale.js';
import characterConfig from 'virtual:character-config';
import { WhaleMaid } from './characters/whaleMaid.js';
import { WhalePaper } from './characters/whalePaper.js';
import { FX } from './effects/fx.js';
import { HUD } from './ui/hud.js';
import { RoomEditor } from './ui/room-editor.js';
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
let slideRide = null;
function enterWater() {
  if (inWater) return;
  inWater = true;
  // 以当前位置入水，泳池移位或旋转后不会吸回旧坐标。
  const p = whale.pos.clone();
  const tx=p.x, tz=p.z;
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
let portalReadyAt = 0;
const portalPosition = new THREE.Vector3();
const fadeEl = document.getElementById('fade');
const locEl = document.getElementById('loc');
let switching = false;

function applyScene(id, { instant = false } = {}) {
  if (id !== 'yard' && whale === blob) { inWater = false; setCharacter(maidRef, {}); }
  const cfg = SCENES[id];
  for (const key of Object.keys(SCENES)) SCENES[key].root.visible = (key === id);
  if (editor.active) editor.setActive(false);
  slideRide = null; game.editing = false;
  seated = false; seatArmed = true;
  activeScene = id;
  editor.setContext(id);
  portalReadyAt = performance.now() + 1200;
  iso.rotationLimit = id === 'yard' ? Infinity : 0.22;
  iso.setView(cfg.view.target, cfg.view.zoom);
  if (lights?.sun) lights.sun.intensity = cfg.sunIntensity ?? 2.15;
  iso.zoomTarget = iso.homeZoom;
  // 场景使用独立构图，不能沿用院子的跟随位置和旋转。
  iso.target.copy(iso.homeTarget);
  iso.zoom = iso.homeZoom;
  iso.drag = 0;
  iso.dragTarget = 0;
  iso.par.set(0, 0);
  iso.parTarget.set(0, 0);
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
  if (id === 'yard') iso.follow(whale.pos, 0, true);
  iso.update(0);
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

// 出入口统一通过走近门垫切换，鼠标点击不再触发传送。

R.setScene(scene, camera);

/* 指针与拖拽 */
const pointer = new THREE.Vector2(0, 0);
window.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  iso.setPointer(pointer.x, pointer.y);
});

const movementKeys = new Set();
const moveDirection = new THREE.Vector3();
let keyboardMoving = false;
let seated = false, seatArmed = true;
const seatPosition = new THREE.Vector3();
let computerChair = null;
function syncFurnitureInteractions() {
  yard.refreshLandscape?.();
  computerChair = props.group.children.find(o => o.userData.furnitureType === 'chair') || null;
  const bed = props.group.children.find(o => o.userData.furnitureType === 'bed');
  if (bed) {
    bed.updateWorldMatrix(true, false);
    SCENES.room.sleepAnchor = bed.localToWorld(new THREE.Vector3(.21,.84,.24));
  } else SCENES.room.sleepAnchor = null;
  if (activeScene === 'room') game.sleepAnchor = SCENES.room.sleepAnchor;
}
const editor = new RoomEditor({
  group: props.group, scene, camera, canvas: R.renderer.domElement,
  contexts: {
    room:{group:props.group,label:'卧室',sceneId:'bedroom'},
    living:{group:living.group,label:'客厅',sceneId:'living'},
    yard:{group:yard.group,label:'院子',sceneId:'yard',bounds:{x0:-8.2,x1:8.6,z0:-7.8,z1:7.8}},
  },
  getScene: () => activeScene,
  onToggle: (active) => {
    if(slideRide){
      whale.pos.copy(sampleSlideRide(slideRide.slide,0,slideRide.start));
      whale.pos.y=whale.groundY??whale.baseY??1.12;
      whale.group.position.copy(whale.pos);whale.state='idle';slideRide=null;
    }
    game.editing = active;
    if(!active) iso.target.copy(iso.homeTarget);
    stopKeyboard(); seated = false; seatArmed = false;
    whale.target.copy(whale.pos); whale.velocity?.set(0,0,0);
    if (whale.state === 'sit') whale.state = 'idle';
  },
  onChange: syncFurnitureInteractions,
});
const editable = (target) => target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName);
function stopKeyboard() {
  movementKeys.clear();
  if (keyboardMoving) { whale.target.copy(whale.pos); keyboardMoving = false; }
}
window.addEventListener('keydown', (e) => {
  if (editable(e.target) || !['KeyW','KeyA','KeyS','KeyD'].includes(e.code)) return;
  e.preventDefault(); movementKeys.add(e.code);
});
window.addEventListener('keyup', (e) => { movementKeys.delete(e.code); });
window.addEventListener('blur', stopKeyboard);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopKeyboard(); });
function updateKeyboard(dt) {
  if(slideRide)return;
  const x = Number(movementKeys.has('KeyD')) - Number(movementKeys.has('KeyA'));
  const z = Number(movementKeys.has('KeyS')) - Number(movementKeys.has('KeyW'));
  if (editor.active) {
    if(x || z) {
      const az=iso.az+iso.drag;
      moveDirection.set(x*Math.sin(az)+z*Math.cos(az),0,-x*Math.cos(az)+z*Math.sin(az)).normalize();
      iso.target.addScaledVector(moveDirection,4*dt);
      iso.target.x=THREE.MathUtils.clamp(iso.target.x,activeScene==='yard'?-9:-4.5,activeScene==='yard'?9:4.5);
      iso.target.z=THREE.MathUtils.clamp(iso.target.z,activeScene==='yard'?-9:-4.5,activeScene==='yard'?9:4.5);
    }
    return;
  }
  if (!editor.active && !switching && (x || z)) {
    if (seated) { seated = false; seatArmed = false; }
    const az = iso.az + iso.drag;
    moveDirection.set(x * Math.sin(az) + z * Math.cos(az), 0,
      -x * Math.cos(az) + z * Math.sin(az)).normalize();
    whale.swimTo({x: whale.pos.x + moveDirection.x, y: whale.pos.y,
      z: whale.pos.z + moveDirection.z}, {fast: false});
    keyboardMoving = true;
  } else if (keyboardMoving) {
    whale.target.copy(whale.pos); keyboardMoving = false;
  }
}
const canvas = R.renderer.domElement;
let dragging = false, lastX = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  dragging = true; lastX = e.clientX;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (dragging) iso.addDrag((e.clientX - lastX) * 0.005);
  lastX = e.clientX;
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });
canvas.addEventListener('lostpointercapture', () => { dragging = false; });
window.addEventListener('blur', () => { dragging = false; });
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

function updateSlideRide(dt) {
  if(editor.active || activeScene!=='yard')return;
  if(!slideRide && keyboardMoving && whale!==blob && !whale.state.startsWith('sleep')) {
    yard.group.updateMatrixWorld(true);
    for(const pool of yard.group.children.filter(o=>o.userData.poolRect)) {
      const slide=pool.getObjectByName('pool-slide');if(!slide)continue;
      const base=slide.localToWorld(new THREE.Vector3(0,0,1.72));
      if(Math.hypot(whale.pos.x-base.x,whale.pos.z-base.z)<.55) {
        stopKeyboard();slideRide={slide,time:0,start:slide.worldToLocal(whale.pos.clone())};
        game.editing=true;whale.velocity?.set(0,0,0);
        hud.say('爬上滑梯，出发！',whale.pos.clone().setY(1.8),2);break;
      }
    }
  }
  if(!slideRide)return;
  const ride=slideRide;ride.time+=dt;
  const k=Math.min(1,ride.time/5.5),position=sampleSlideRide(ride.slide,k,ride.start);
  const next=sampleSlideRide(ride.slide,Math.min(1,k+.005),ride.start);
  const direction=next.clone().sub(position);
  if(direction.lengthSq()>1e-8)whale.heading=Math.atan2(direction.x,direction.z);
  whale.state=k<.62?'swim':'sit';whale.seatHeight=position.y+.16;
  whale.target.copy(position).addScaledVector(direction.clone().normalize(),.35);whale.speedMax=1.4;
  whale.update(dt,ride.time);
  whale.pos.copy(position);whale.target.copy(position);
  if(k<.62 || !whale.bones)whale.group.position.copy(position);
  else {whale.group.position.x=position.x;whale.group.position.z=position.z;}
  whale.group.rotation.y=whale.heading;
  if(k<.62)whale.play?.('Walking');
  if(k>=1){
    slideRide=null;game.editing=false;whale.state='idle';
    whale.pos.y=whale.groundY??whale.baseY??1.12;whale.target.copy(whale.pos);
    whale.group.position.copy(whale.pos);stopKeyboard();
    fx.splash(position.clone());
  }
}

const clock = new THREE.Clock();
let t = 0;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  t += dt;
  updateTweens(tweens, dt);
  updateKeyboard(dt);
  if (!editor.active && !slideRide) game.update(dt, t);
  SCENES[activeScene].update(dt, t);
  updateSlideRide(dt);
  if (!editor.active && activeScene === 'room' && computerChair) {
    computerChair.getWorldPosition(seatPosition);
    const seatDistance = Math.hypot(whale.pos.x - seatPosition.x, whale.pos.z - seatPosition.z);
    if (seatDistance > 0.9) seatArmed = true;
    if (seatArmed && !seated && seatDistance < 0.5 && keyboardMoving) {
      stopKeyboard(); seated = true; seatArmed = false;
      whale.pos.x = seatPosition.x; whale.pos.z = seatPosition.z;
      whale.target.copy(whale.pos); whale.velocity?.set(0,0,0);
      const facing = new THREE.Vector3(0,0,1).applyQuaternion(computerChair.getWorldQuaternion(new THREE.Quaternion()));
      whale.heading = Math.atan2(facing.x, facing.z);
      whale.seatHeight = computerChair.userData.seat.height;
      whale.state = 'sit';
      hud.say('坐下来玩会儿电脑。WASD 起身', whale.pos.clone().setY(1.6), 2.5);
    }
    if (seated && whale.state === 'sit' && !whale.bones) {
      whale.pos.y = 1.0; whale.group.position.copy(whale.pos);
      whale.group.rotation.y = Math.PI;
    }
  }

  // 用地面距离检测门垫，不依赖鼠标点击或角色悬浮高度。
  if (!editor.active && !slideRide && !switching && performance.now() >= portalReadyAt) {
    let destination = null;
    SCENES[activeScene].root.updateMatrixWorld(true);
    SCENES[activeScene].root.traverse((object) => {
      if (!object.userData.walkPortal || destination) return;
      object.getWorldPosition(portalPosition);
      if (Math.abs(whale.pos.x - portalPosition.x) < 0.68 &&
          Math.abs(whale.pos.z - portalPosition.z) < 0.62) {
        destination = object.userData.walkPortal;
      }
    });
    if (destination) { stopKeyboard(); goTo(destination); }
  }


  // 泳池形态转换：进水变胖鲸鱼，上岸变回人形
  if (!editor.active && !slideRide && activeScene === 'yard' && yard.pool) {
    const b = yard.pool, p = whale.pos;
    const inside = yard.containsWater(p);
    if (inside && whale !== blob) enterWater();
    else if (!inside && whale === blob) exitWater();
  }
  if (!editor.active && activeScene === 'yard') iso.follow(whale.pos, dt);
  iso.update(dt);
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
