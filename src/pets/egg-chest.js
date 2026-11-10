import * as THREE from 'three';
import {getTemplate} from '../../shared/world/templates.js';
import {nearestFree} from '../../shared/world/navigation.js';
import {surfaceAt} from '../../shared/world/coastal.js';
import {getSpecies} from '../../shared/creatures/species.js';

const YARD_SCENE_ID = 'yard';
const INTERACT_DISTANCE = 4.5;
const WINDOW_Z = -1.65;

const STYLE = `
#egg-panel{width:min(420px,calc(100vw - 32px))}
.egg-body{display:grid;gap:10px;padding-top:4px}
.egg-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.egg-card{display:grid;justify-items:center;gap:6px;padding:14px 8px;border:1px solid #e3d2bc;border-radius:15px;
  background:#fffdf7;color:#51454a;font:inherit;cursor:pointer;transition:background .15s,border-color .15s,transform .12s}
.egg-card:hover:not(:disabled){background:#fff4e4;border-color:#c9a477;transform:translateY(-2px)}
.egg-card:disabled{opacity:.55;cursor:default}
.egg-icon{font-size:38px;line-height:1;filter:drop-shadow(0 5px 5px #51331728)}
.egg-card b{font-size:14px}
.egg-card span{font-size:11px;color:#8a7563}
.egg-note{margin:0;text-align:center;font-size:12px;line-height:1.6;color:#78665a;padding:16px 8px}
.egg-foot{margin:12px 0 0;font-size:11px;line-height:1.55;color:#8a7563}
@media (max-width:520px){#egg-panel{width:calc(100vw - 20px)}.egg-card{padding:12px 6px}.egg-icon{font-size:32px}}
`;

function makeLabelSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({map: texture, transparent: true, depthTest: false, depthWrite: false});
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.45, 0.36, 1);
  sprite.position.set(0, 1.1, 0);
  sprite.raycast = () => {};
  function draw(text) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 250, 240, .94)';
    ctx.beginPath();
    ctx.roundRect?.(8, 10, 304, 58, 16);
    if (!ctx.roundRect) ctx.rect(8, 10, 304, 58);
    ctx.fill();
    ctx.strokeStyle = '#c9ad8a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#5d493b';
    ctx.font = '600 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 160, 40);
    texture.needsUpdate = true;
  }
  draw('宠物蛋宝箱');
  return {sprite, draw};
}

function makeChestModel() {
  const root = new THREE.Group();
  root.name = 'yard-egg-chest';
  const wood = new THREE.MeshStandardMaterial({color: 0x8a5a34, roughness: 0.82});
  const dark = new THREE.MeshStandardMaterial({color: 0x5b3a22, roughness: 0.9});
  const brass = new THREE.MeshStandardMaterial({color: 0xc9a45e, roughness: 0.45, metalness: 0.45});
  const eggMat = new THREE.MeshStandardMaterial({color: 0xfff3cf, roughness: 0.65, emissive: 0x5b451e, emissiveIntensity: 0.15});
  const add = (geometry, material, position, rotation = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  // 箱体
  add(new THREE.BoxGeometry(1.0, 0.46, 0.66), wood, [0, 0.23, 0]);
  add(new THREE.BoxGeometry(1.04, 0.08, 0.7), dark, [0, 0.02, 0]);
  for (const x of [-0.35, 0.35]) add(new THREE.BoxGeometry(0.06, 0.5, 0.7), brass, [x, 0.25, 0]);
  // 打开一条缝的盖子
  const lid = add(new THREE.BoxGeometry(1.05, 0.1, 0.7), wood, [0, 0.56, -0.16], [-0.52, 0, 0]);
  lid.geometry.translate(0, 0, 0.02);
  add(new THREE.BoxGeometry(0.22, 0.16, 0.05), brass, [0, 0.43, 0.35]);
  // 箱内露出的两颗蛋
  for (const [x, z, s] of [[-0.19, -0.04, 0.12], [0.2, -0.03, 0.105]]) {
    const egg = add(new THREE.SphereGeometry(1, 14, 10), eggMat, [x, 0.56, z]);
    egg.scale.set(s * 0.82, s * 1.08, s * 0.82);
  }
  const glow = new THREE.PointLight(0xffd893, 0.65, 2.2, 2);
  glow.position.set(0, 0.7, 0);
  root.add(glow);
  const label = makeLabelSprite();
  root.add(label.sprite);
  root.traverse(node => { if (node.isMesh) node.frustumCulled = false; });
  return {root, label, lid, glow};
}

export function mountEggChest({
  scene, canvas,
  getCamera, getSnapshot, getSceneId, getPlayer, getActor,
  dispatchPet = null,
  isConnected = () => false,
  isEditing = () => false,
  isFirstPerson = () => false,
  isBattle = () => false,
  onMessage = () => {},
  localSound = null,
  fx = null,
} = {}) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let chest = null;
  let pointerDown = null;
  let duplicateBootstrap = false;
  let labelKey = '';
  let renderKey = '';

  if (!document.getElementById('egg-chest-style')) {
    const style = document.createElement('style');
    style.id = 'egg-chest-style';
    style.textContent = STYLE;
    document.head.append(style);
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'egg-panel';
  dialog.className = 'settings-dialog';
  dialog.setAttribute('aria-labelledby', 'egg-panel-title');
  dialog.innerHTML = `<div class="settings-card">
    <header class="settings-header"><h2 id="egg-panel-title">窗下的宝箱</h2><button class="settings-close" type="button" aria-label="关闭宝箱">×</button></header>
    <div class="egg-body"></div>
    <p class="egg-foot">打开宠物蛋，它会成为你的新伙伴。</p>
  </div>`;
  document.body.append(dialog);
  const eggBody = dialog.querySelector('.egg-body');

  function actorId() {
    return getActor?.()?.actorId ?? getSnapshot()?.actors?.[0]?.actorId ?? null;
  }

  function ownerBucket() {
    const id = actorId();
    return id ? getSnapshot()?.pets?.owners?.[id] ?? null : null;
  }

  function eggs() {
    return Array.isArray(ownerBucket()?.eggs) ? ownerBucket().eggs.filter(egg => !egg.hatched) : [];
  }

  function nearChest() {
    if (!chest || getSceneId() !== YARD_SCENE_ID) return false;
    const player = getPlayer();
    return Math.hypot(chest.root.position.x - player.position.x, chest.root.position.z - player.position.z) <= INTERACT_DISTANCE;
  }

  function ensureChest() {
    if (chest) return;
    const snapshot = getSnapshot();
    if (!snapshot) return;
    const yard = snapshot.scenes?.find(scene => scene.sceneId === YARD_SCENE_ID);
    if (!yard) return;
    let template = null;
    try { template = getTemplate(yard.templateId); } catch { template = null; }
    let point = [template ? template.bounds.x0 + 0.85 : -7.65, 0, WINDOW_Z];
    try {
      const free = nearestFree(snapshot, YARD_SCENE_ID, point);
      if (Math.hypot(free[0] - point[0], free[2] - point[2]) <= 2.2) point = free;
    } catch { /* 保持窗下位置 */ }
    let y = point[1] ?? 0;
    try { y = surfaceAt(template, point[0], point[2])?.height ?? y; } catch { /* 保持 */ }
    const built = makeChestModel();
    built.root.position.set(point[0], y, point[2]);
    built.root.rotation.y = -Math.PI / 2;
    built.root.visible = getSceneId() === YARD_SCENE_ID;
    scene.add(built.root);
    chest = built;
    updateLabel();
  }

  function bootstrap() {
    if (!dispatchPet || duplicateBootstrap || !isConnected()) return;
    const id = actorId();
    if (!id) return;
    const owner = ownerBucket();
    if (owner && Array.isArray(owner.eggs)) return;
    duplicateBootstrap = true;
    void dispatchPet('pet.bootstrap', {actorId: id})
      .then(() => { duplicateBootstrap = false; if (dialog.open) render(); })
      .catch(error => { duplicateBootstrap = false; onMessage(`宝箱初始化失败：${error.message}`); });
  }

  function eggStateKey() {
    const owner = ownerBucket();
    return JSON.stringify({eggs: owner?.eggs ?? null});
  }

  function render() {
    renderKey = eggStateKey();
    const owner = ownerBucket();
    const available = eggs();
    if (!owner || !Array.isArray(owner.eggs)) {
      eggBody.innerHTML = `<p class="egg-note">宝箱正在准备中…</p>`;
      bootstrap();
      return;
    }
    if (!available.length) {
      eggBody.innerHTML = `<p class="egg-note">宝箱已经空了。</p>`;
      return;
    }
    eggBody.innerHTML = `<div class="egg-list">${available.map(egg => {
      const species = getSpecies(egg.speciesId);
      return `<button type="button" class="egg-card" data-egg-id="${egg.eggId}">
        <span class="egg-icon" aria-hidden="true">🥚</span>
        <b>${species.name}蛋</b>
        <span>点击孵化</span>
      </button>`;
    }).join('')}</div>`;
  }

  async function hatch(eggId) {
    if (!dispatchPet || !isConnected()) { onMessage('连接世界后才能孵化宠物蛋'); return; }
    const id = actorId();
    if (!id) return;
    try {
      const result = await dispatchPet('pet.hatchEgg', {actorId: id, eggId});
      if (!result) return;
      dialog.close();
      if (localSound) localSound.playAction?.('ui-confirm');
      if (fx && chest) fx.burst(chest.root.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 10);
      onMessage(`${result.name} 从蛋里孵出来了！`);
    } catch (error) {
      onMessage(`孵化失败：${error.message}`);
    }
  }

  function updateLabel() {
    if (!chest) return;
    const available = eggs().length;
    const key = `${available}`;
    if (key === labelKey) return;
    labelKey = key;
    chest.label.draw(available ? `宝箱 · ${available} 颗宠物蛋` : '宝箱空了');
  }

  function raycastChest(clientX, clientY) {
    if (!chest || !chest.root.visible) return false;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, getCamera());
    const hits = raycaster.intersectObject(chest.root, true);
    if (!hits.length) return false;
    const player = getPlayer();
    return chest.root.position.distanceTo(player.position) <= INTERACT_DISTANCE;
  }

  function open() {
    if (!nearChest()) { onMessage('走近院子窗户下的宝箱'); return; }
    bootstrap();
    render();
    if (!dialog.open) dialog.showModal();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button === 0) pointerDown = {x: event.clientX, y: event.clientY};
  });
  canvas.addEventListener('pointerup', event => {
    if (event.button !== 0 || !pointerDown) return;
    const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    pointerDown = null;
    if (moved > 8 || isEditing() || isFirstPerson() || isBattle()) return;
    if (!nearChest()) return;
    if (raycastChest(event.clientX, event.clientY)) open();
  });
  canvas.addEventListener('pointermove', event => {
    if (isEditing() || isFirstPerson() || isBattle() || dialog.open) return;
    if (chest && nearChest() && raycastChest(event.clientX, event.clientY)) canvas.style.cursor = 'pointer';
  });
  eggBody.addEventListener('click', event => {
    const card = event.target.closest('[data-egg-id]');
    if (card) void hatch(card.dataset.eggId);
  });
  dialog.querySelector('.settings-close').addEventListener('click', close);
  dialog.addEventListener('cancel', close);

  return {
    update() {
      ensureChest();
      if (!chest) return;
      chest.root.visible = getSceneId() === YARD_SCENE_ID;
      updateLabel();
      if (dialog.open && eggStateKey() !== renderKey) render();
    },
    open,
    _debug: () => ({
      chest: chest ? chest.root.position.toArray().map(value => +value.toFixed(2)) : null,
      eggs: eggs().map(egg => egg.eggId),
      owner: Boolean(ownerBucket()),
    }),
  };
}
