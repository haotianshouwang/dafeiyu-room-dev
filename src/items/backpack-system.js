import * as THREE from 'three';
import { surfaceAt } from '../../shared/world/coastal.js';
import { getTemplate } from '../../shared/world/templates.js';
import { nearestFree } from '../../shared/world/navigation.js';
import { ITEMS, ITEM_IDS, getItemDef } from '../../shared/world/items.js';
import {
  loadItemState, saveItemState, inventoryTotal, addItem, removeItem,
  addGroundItem, removeGroundItem, getGroundItem,
  tickCompost, getCompostStatus, startCompost, collectCompost, markCompostNotified,
  COMPOST_DURATION_MS,
} from './item-store.js';

const YARD_SCENE_ID = 'yard';
const INTERACT_DISTANCE = 4.5;
const DROP_FORWARD = 1.1;
const COMPOST_FALLBACK = [-3.1, 0, -15.9];
const COMPOST_OFFSET_X = 3.0;

const STYLE = `
#bag-entry{position:relative}
#bag-entry .bag-count{display:inline-flex;min-width:18px;height:18px;align-items:center;justify-content:center;
  padding:0 5px;border-radius:9px;background:#a8794f;color:#fff;font-size:10px;line-height:1;vertical-align:1px}
.bag-panel{width:min(440px,calc(100vw - 32px))}
.bag-tabs{display:flex;gap:6px;margin:8px 0 12px}
.bag-tabs button{flex:1;padding:9px 10px;border:1px solid #d9c9b6;border-radius:10px;background:#fff9ee;color:#51454a;
  font:inherit;cursor:pointer;min-height:42px;transition:background .15s,border-color .15s}
.bag-tabs button:hover{background:#fff2df}
.bag-tabs button.active{background:#e8d6bd;border-color:#b48a5f;font-weight:600}
.bag-summary{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#78665a;margin:2px 0 10px}
.bag-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.bag-card{display:flex;align-items:center;gap:10px;min-height:64px;padding:10px;border:1px solid #e3d2bc;border-radius:13px;
  background:#fffdf7;color:#51454a;font:inherit;text-align:left;cursor:pointer;transition:background .15s,border-color .15s,box-shadow .15s}
.bag-card:hover{background:#fff4e4;border-color:#c9a477}
.bag-card.selected{border-color:#b48a5f;box-shadow:0 0 0 2px #e3c9aa inset;background:#fff7e9}
.bag-card .emoji{font-size:28px;line-height:1;flex:none}
.bag-card .meta{display:grid;gap:2px;min-width:0}
.bag-card b{font-size:14px;font-weight:600}
.bag-card span{font-size:11px;color:#8a7563}
.bag-card .num{margin-left:auto;font-size:13px;font-variant-numeric:tabular-nums;color:#6a5546}
.bag-detail{margin-top:12px;padding:12px;border:1px solid #eadcc9;border-radius:13px;background:#fffaf1}
.bag-detail p{margin:0;font-size:13px;line-height:1.55;color:#6b594b}
.bag-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
.bag-actions button,.bag-compost button{padding:9px 14px;min-height:42px;border:1px solid #d6bfa5;border-radius:10px;
  background:#fff9ee;color:#5d493b;font:inherit;font-size:13px;cursor:pointer;transition:background .15s}
.bag-actions button:hover:not(:disabled),.bag-compost button:hover:not(:disabled){background:#fff0d8}
.bag-actions button.primary,.bag-compost button.primary{background:#a8794f;border-color:#a8794f;color:#fff}
.bag-actions button.primary:hover:not(:disabled),.bag-compost button.primary:hover:not(:disabled){background:#93663f}
.bag-actions button:disabled,.bag-compost button:disabled{opacity:.42;cursor:default}
.bag-empty{padding:22px 8px;text-align:center;color:#8a7563;font-size:13px;line-height:1.6}
.bag-compost{display:grid;gap:12px}
.bag-status{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #eadcc9;border-radius:13px;background:#fffaf1}
.bag-status .badge{flex:none;width:44px;height:44px;display:grid;place-items:center;border-radius:12px;background:#f2e5d3;font-size:23px}
.bag-status .grow{display:grid;gap:4px;min-width:0;flex:1}
.bag-status b{font-size:14px}
.bag-status span{font-size:12px;color:#78665a}
.bag-progress{height:9px;border-radius:99px;background:#e9dccb;overflow:hidden}
.bag-progress i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#b7c98b,#7d9b58);transition:width .4s}
.bag-compost .row{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.bag-hint{margin:0;font-size:11px;line-height:1.55;color:#8a7563}
.bag-hint.warn{color:#9a5a32}
.bag-foot{margin:12px 0 0;font-size:11px;color:#8a7563;line-height:1.55}
@media (max-width:520px){
  .bag-panel{width:calc(100vw - 20px)}
  .bag-card{min-height:60px;padding:9px}
  .bag-card .emoji{font-size:24px}
  .bag-status .badge{width:40px;height:40px;font-size:21px}
}
`;

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function makeRoundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function makeLabelSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.7, 0.425, 1);
  sprite.position.set(0, 1.48, 0);
  sprite.raycast = () => {};
  function draw(text) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 250, 240, .94)';
    makeRoundRect(ctx, 8, 10, 304, 58, 16);
    ctx.fill();
    ctx.strokeStyle = '#c9ad8a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#5d493b';
    ctx.font = '600 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 160, 40);
    texture.needsUpdate = true;
  }
  draw('堆肥箱 · 空闲');
  return { sprite, draw, texture, material };
}

function makeCompostModel() {
  const root = new THREE.Group();
  root.name = 'yard-compost-bin';
  root.userData.interact = 'compost';
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.88, metalness: 0.02 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x653f24, roughness: 0.92 });
  const soil = new THREE.MeshStandardMaterial({ color: 0x3f2a1c, roughness: 1 });
  const add = (geometry, material, position, rotation = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  // 底部垫土
  add(box(1.2, 0.1, 1.1), soil, [0, 0.05, 0]);
  // 四根木柱
  for (const x of [-0.56, 0.56]) for (const z of [-0.5, 0.5]) add(box(0.1, 0.82, 0.1), woodDark, [x, 0.44, z]);
  // 三面木板，正面留出可见的堆肥口
  add(box(1.14, 0.5, 0.08), wood, [0, 0.32, -0.51]);
  add(box(0.08, 0.5, 0.95), wood, [-0.55, 0.32, 0]);
  add(box(0.08, 0.5, 0.95), wood, [0.55, 0.32, 0]);
  add(box(1.02, 0.12, 0.76), soil, [0, 0.5, 0]);
  // 顶部盖板微微掀开
  const lid = add(box(1.22, 0.08, 1.02), wood, [0, 0.83, 0.03], [-0.16, 0, 0]);
  lid.position.z = 0.05;
  // 前面的小踏板
  add(box(1.0, 0.08, 0.18), woodDark, [0, 0.12, 0.58]);
  // 状态灯
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x9c9c85, emissive: 0x3f3f2e, emissiveIntensity: 0.35, roughness: 0.4 }));
  light.position.set(0.46, 0.92, 0.42);
  root.add(light);
  // 小木牌
  const post = add(box(0.07, 0.52, 0.07), woodDark, [-0.68, 0.26, 0.45]);
  const sign = add(box(0.52, 0.24, 0.06), wood, [-0.68, 0.58, 0.45]);
  sign.rotation.z = -0.04;
  const label = makeLabelSprite();
  root.add(label.sprite);
  root.traverse(node => { if (node.isMesh) node.frustumCulled = false; });
  return { root, light, label };
}

function makePoopModel(itemId) {
  const group = new THREE.Group();
  group.name = `ground-${itemId}`;
  group.userData.itemId = itemId;
  group.userData.interact = 'poop';
  const material = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.94 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4b301d, roughness: 1 });
  const lumps = [
    { p: [0, 0.09, 0], s: [0.22, 0.12, 0.2] },
    { p: [0.1, 0.16, 0.02], s: [0.15, 0.13, 0.14] },
    { p: [-0.08, 0.14, -0.03], s: [0.13, 0.1, 0.13] },
  ];
  lumps.forEach((lump, index) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 7), index === 1 ? dark : material);
    mesh.position.set(...lump.p);
    mesh.scale.set(...lump.s);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 8), dark);
  top.position.set(0.02, 0.27, 0.02);
  top.rotation.z = 0.25;
  top.castShadow = true;
  group.add(top);
  group.rotation.y = Math.random() * Math.PI * 2;
  return group;
}

export function mountBackpackSystem({
  scene, canvas,
  getCamera, getSnapshot, getSceneId, getPlayer,
  isEditing = () => false,
  isFirstPerson = () => false,
  isBattle = () => false,
  onMessage = () => {},
  localSound = null,
  fx = null,
} = {}) {
  const storage = (() => { try { return globalThis.localStorage; } catch { return null; } })();
  const state = loadItemState(storage, Date.now());
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundLayer = new THREE.Group();
  groundLayer.name = 'yard-ground-items';
  groundLayer.visible = false;
  scene.add(groundLayer);
  const meshes = new Map();
  let compost = null;
  let pointerDown = null;
  let hoverThrottle = 0;
  let selectedItemId = 'poop';
  let activeTab = 'items';
  let panelTimer = null;
  let lastLabelKey = '';
  let lastCompostTick = 0;

  if (!document.getElementById('backpack-style')) {
    const style = document.createElement('style');
    style.id = 'backpack-style';
    style.textContent = STYLE;
    document.head.append(style);
  }

  const entry = document.createElement('button');
  entry.type = 'button';
  entry.id = 'bag-entry';
  entry.className = 'toolbar-action';
  entry.innerHTML = '<span aria-hidden="true">🎒</span> 背包 <span class="bag-count"></span>';
  document.getElementById('actions')?.prepend(entry);

  const dialog = document.createElement('dialog');
  dialog.id = 'bag-panel';
  dialog.className = 'settings-dialog bag-panel';
  dialog.setAttribute('aria-labelledby', 'bag-panel-title');
  dialog.innerHTML = `<div class="settings-card">
    <header class="settings-header"><h2 id="bag-panel-title">背包</h2><button class="settings-close" type="button" aria-label="关闭背包">×</button></header>
    <div class="bag-tabs" role="tablist">
      <button type="button" data-bag-tab="items" class="active" role="tab" aria-selected="true">物品</button>
      <button type="button" data-bag-tab="compost" role="tab" aria-selected="false">堆肥</button>
    </div>
    <div class="bag-body"></div>
    <p class="bag-foot">便便可以从地面捡进背包，也可以丢回院子；放进农田边的堆肥箱，等一会儿就能收肥料。</p>
  </div>`;
  document.body.append(dialog);
  const body = dialog.querySelector('.bag-body');
  const tabs = dialog.querySelector('.bag-tabs');

  function totalItems() { return inventoryTotal(state); }

  function updateBadge() {
    const count = entry.querySelector('.bag-count');
    if (count) count.textContent = String(totalItems());
  }

  function save() {
    saveItemState(storage, state);
    updateBadge();
  }

  function refreshPanelTimer() {
    if (panelTimer) { clearInterval(panelTimer); panelTimer = null; }
    if (!dialog.open) return;
    panelTimer = setInterval(() => {
      if (!dialog.open) return;
      refreshCompostLive();
    }, 500);
  }

  function nearCompost() {
    if (!compost || getSceneId() !== YARD_SCENE_ID) return false;
    const player = getPlayer();
    return Math.hypot(compost.root.position.x - player.position.x, compost.root.position.z - player.position.z) <= INTERACT_DISTANCE;
  }

  function renderItems() {
    const selected = ITEMS[selectedItemId] ?? ITEMS.poop;
    const count = state.inventory[selected.id] ?? 0;
    body.innerHTML = `
      <div class="bag-summary"><span>身上的物品</span><span>便便 ×${state.inventory.poop} · 肥料 ×${state.inventory.fertilizer}</span></div>
      <div class="bag-grid">
        ${ITEM_IDS.map(id => {
          const def = ITEMS[id];
          const owned = state.inventory[id] ?? 0;
          return `<button type="button" class="bag-card${id === selected.id ? ' selected' : ''}" data-bag-item="${id}">
            <span class="emoji" aria-hidden="true">${def.emoji}</span>
            <span class="meta"><b>${def.name}</b><span>${def.placeable ? '可丢到地上' : '种地时使用'}</span></span>
            <span class="num">×${owned}</span>
          </button>`;
        }).join('')}
      </div>
      <div class="bag-detail">
        <p>${selected.description}</p>
        <div class="bag-actions">
          <button type="button" data-bag-action="drop" class="primary" ${!selected.placeable || count <= 0 ? 'disabled' : ''}>丢到地上</button>
        </div>
      </div>
      ${totalItems() === 0 ? '<p class="bag-empty">背包还是空的。去院子看看宠物留下了什么。</p>' : ''}
    `;
  }

  function refreshCompostLive() {
    if (!dialog.open || activeTab !== 'compost') return;
    const root = body.querySelector('.bag-compost');
    if (!root) return;
    const live = getCompostStatus(state, Date.now());
    const near = nearCompost();
    const count = state.inventory.poop ?? 0;
    const badge = root.querySelector('.bag-status .badge');
    const copy = root.querySelector('.compost-copy');
    const bar = root.querySelector('.bag-progress');
    const fill = bar?.querySelector('i');
    const hint = root.querySelector('.bag-hint');
    const deposit = root.querySelector('[data-bag-action="deposit"]');
    const collect = root.querySelector('[data-bag-action="collect"]');
    if (badge) badge.textContent = live.status === 'processing' ? '⏳' : live.status === 'ready' ? '🌿' : '🪵';
    if (copy) copy.textContent = live.status === 'processing'
      ? `堆肥中 · 还剩 ${formatRemaining(live.remainingMs)}`
      : live.status === 'ready'
        ? '肥料可以收了'
        : '空闲 · 放入便便开始堆肥';
    const progress = Math.round((live.status === 'ready' ? 1 : live.progress ?? 0) * 100);
    if (bar) bar.setAttribute('aria-valuenow', String(progress));
    if (fill) fill.style.width = `${progress}%`;
    if (hint) {
      hint.textContent = near
        ? `背包里有 ${count} 份便便。堆肥约需 ${Math.round(COMPOST_DURATION_MS / 60000)} 分钟。`
        : '走到院子农田边的堆肥箱旁再操作。';
      hint.classList.toggle('warn', !near);
    }
    if (deposit) deposit.disabled = !near || live.status !== 'empty' || count <= 0;
    if (collect) collect.disabled = !near || live.status !== 'ready' || (state.inventory.fertilizer ?? 0) >= ITEMS.fertilizer.stackMax;
  }

  function renderCompost() {
    if (!compost) ensureCompost();
    const now = Date.now();
    const live = getCompostStatus(state, now);
    const near = nearCompost();
    const count = state.inventory.poop ?? 0;
    const statusCopy = live.status === 'processing'
      ? `堆肥中 · 还剩 ${formatRemaining(live.remainingMs)}`
      : live.status === 'ready'
        ? '肥料可以收了'
        : '空闲 · 放入便便开始堆肥';
    const badge = live.status === 'processing' ? '⏳' : live.status === 'ready' ? '🌿' : '🪵';
    const progress = Math.round((live.status === 'ready' ? 1 : live.progress ?? 0) * 100);
    const depositDisabled = !near || live.status !== 'empty' || count <= 0;
    const collectDisabled = !near || live.status !== 'ready' || (state.inventory.fertilizer ?? 0) >= ITEMS.fertilizer.stackMax;
    body.innerHTML = `
      <div class="bag-compost">
        <div class="bag-status">
          <span class="badge" aria-hidden="true">${badge}</span>
          <span class="grow"><b>堆肥箱</b><span class="compost-copy">${statusCopy}</span></span>
        </div>
        <div class="bag-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><i style="width:${progress}%"></i></div>
        <p class="bag-hint${near ? '' : ' warn'}">${near ? `背包里有 ${count} 份便便。堆肥约需 ${Math.round(COMPOST_DURATION_MS / 60000)} 分钟。` : '走到院子农田边的堆肥箱旁再操作。'}</p>
        <div class="row">
          <button type="button" data-bag-action="deposit" ${depositDisabled ? 'disabled' : ''}>放入 1 份便便</button>
          <button type="button" data-bag-action="collect" class="primary" ${collectDisabled ? 'disabled' : ''}>收取肥料</button>
        </div>
      </div>
    `;
    refreshCompostLive();
  }

  function render() {
    tabs.querySelectorAll('button').forEach(button => {
      const active = button.dataset.bagTab === activeTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    if (activeTab === 'items') renderItems();
    else renderCompost();
  }

  function open(tab = 'items') {
    activeTab = tab;
    render();
    if (!dialog.open) dialog.showModal();
    refreshPanelTimer();
  }

  function close() {
    if (dialog.open) dialog.close();
    if (panelTimer) { clearInterval(panelTimer); panelTimer = null; }
  }

  function groundSpot() {
    const player = getPlayer();
    const heading = player.heading ?? 0;
    const snapshot = getSnapshot();
    const sceneId = getSceneId();
    let x = player.position.x + Math.sin(heading) * DROP_FORWARD;
    let z = player.position.z + Math.cos(heading) * DROP_FORWARD;
    let y = player.position.y;
    try {
      const free = nearestFree(snapshot, sceneId, [x, y, z]);
      x = free[0]; z = free[2];
      if (Number.isFinite(free[1])) y = free[1];
    } catch { /* 用玩家前方 */ }
    try {
      const entry = snapshot.scenes?.find(scene => scene.sceneId === sceneId);
      const template = entry ? getTemplate(entry.templateId) : null;
      y = surfaceAt(template, x, z)?.height ?? y;
    } catch { /* 保持玩家高度 */ }
    return [x, y, z];
  }

  function createGroundMesh(item) {
    let mesh = meshes.get(item.id);
    if (mesh) return mesh;
    mesh = makePoopModel(item.id);
    mesh.position.fromArray(item.position);
    groundLayer.add(mesh);
    meshes.set(item.id, mesh);
    return mesh;
  }

  function removeGroundMesh(id) {
    const mesh = meshes.get(id);
    if (!mesh) return;
    groundLayer.remove(mesh);
    mesh.traverse(node => {
      if (node.isMesh) {
        node.geometry?.dispose?.();
        if (Array.isArray(node.material)) node.material.forEach(material => material.dispose?.());
        else node.material?.dispose?.();
      }
    });
    meshes.delete(id);
  }

  function syncGroundMeshes() {
    for (const item of state.groundItems) if (!meshes.has(item.id)) createGroundMesh(item);
    for (const id of [...meshes.keys()]) if (!getGroundItem(state, id)) removeGroundMesh(id);
  }

  function spawnPoop(position, { sceneId = YARD_SCENE_ID, silent = false } = {}) {
    const point = Array.isArray(position) ? position : [position?.x, position?.y, position?.z];
    if (!point.every(Number.isFinite)) return false;
    const result = addGroundItem(state, { type: 'poop', sceneId, position: point, now: Date.now() });
    if (!result.ok) {
      if (!silent && result.reason === 'ground-full') onMessage('院子里便便太多了，先捡一些再让宠物继续吧');
      return false;
    }
    createGroundMesh(result.item);
    save();
    if (dialog.open) render();
    return true;
  }

  function pickupItem(id) {
    const item = getGroundItem(state, id);
    if (!item) return;
    const def = getItemDef(item.type);
    if (!def) return;
    if ((state.inventory[item.type] ?? 0) >= def.stackMax) { onMessage(`背包里的${def.name}已经满了`); return; }
    addItem(state, item.type, 1);
    removeGroundItem(state, id);
    removeGroundMesh(id);
    save();
    if (dialog.open) render();
    localSound?.playAction?.('ui-confirm');
    if (fx) fx.burst(new THREE.Vector3().fromArray(item.position).add(new THREE.Vector3(0, 0.3, 0)), 5);
    onMessage(`捡起 ${def.name} ×1`);
  }

  function dropSelected() {
    const def = ITEMS[selectedItemId];
    if (!def || !def.placeable) return;
    if ((state.inventory[selectedItemId] ?? 0) <= 0) { onMessage(`背包里没有${def.name}了`); return; }
    if (getSceneId() !== YARD_SCENE_ID) { onMessage('回到院子才能把东西丢到地上'); return; }
    const position = groundSpot();
    const removed = removeItem(state, selectedItemId, 1);
    const result = addGroundItem(state, { type: selectedItemId, sceneId: YARD_SCENE_ID, position, now: Date.now() });
    if (!result.ok) {
      if (removed) addItem(state, selectedItemId, removed);
      onMessage(result.reason === 'ground-full' ? '地上东西太多了，先捡一些吧' : '这里放不下，换个地方试试');
      return;
    }
    createGroundMesh(result.item);
    save();
    close();
    localSound?.playAction?.('ui-confirm');
    onMessage(`${def.name}丢在脚边了`);
  }

  function depositCompost() {
    if (!nearCompost()) { onMessage('走到院子农田边的堆肥箱旁再操作'); return; }
    const result = startCompost(state, Date.now());
    if (!result.ok) {
      if (result.reason === 'no-poop') onMessage('背包里还没有便便');
      else if (result.reason === 'busy') onMessage('堆肥箱还在工作，等它完成再放');
      return;
    }
    save();
    render();
    updateCompostVisual(true);
    localSound?.playAction?.('ui-confirm');
    onMessage('便便放进堆肥箱了，等一会儿就能收肥料');
  }

  function collectFertilizer() {
    if (!nearCompost()) { onMessage('走到院子农田边的堆肥箱旁再操作'); return; }
    const result = collectCompost(state, Date.now());
    if (!result.ok) {
      if (result.reason === 'inventory-full') onMessage('背包里的肥料已经满了');
      else if (result.reason === 'not-ready') onMessage('肥料还没好，再等一会儿');
      return;
    }
    save();
    render();
    updateCompostVisual(true);
    localSound?.playAction?.('ui-confirm');
    if (fx && compost) fx.burst(compost.root.position.clone().add(new THREE.Vector3(0, 0.9, 0)), 8);
    onMessage(`收成了 ${result.count} 份肥料`);
  }

  function ensureCompost() {
    if (compost) return;
    const snapshot = getSnapshot();
    if (!snapshot) return;
    const yard = snapshot.scenes?.find(scene => scene.sceneId === YARD_SCENE_ID);
    if (!yard) return;
    const farm = yard.entities?.find(entity => entity.type === 'yardFarm');
    let point = farm?.position
      ? [farm.position[0] + COMPOST_OFFSET_X, farm.position[1] ?? 0, farm.position[2]]
      : [...COMPOST_FALLBACK];
    try {
      const free = nearestFree(snapshot, YARD_SCENE_ID, point);
      if (Math.hypot(free[0] - point[0], free[2] - point[2]) <= 2.2) point = free;
    } catch { /* 使用农田旁的默认点 */ }
    let template = null;
    try { template = getTemplate(yard.templateId); } catch { template = null; }
    const y = surfaceAt(template, point[0], point[2])?.height ?? point[1] ?? 0;
    const built = makeCompostModel();
    built.root.position.set(point[0], y, point[2]);
    built.root.rotation.y = -Math.PI / 2;
    built.root.visible = getSceneId() === YARD_SCENE_ID;
    scene.add(built.root);
    compost = built;
    updateCompostVisual(true);
  }

  function updateCompostVisual(force = false) {
    if (!compost) return;
    const live = getCompostStatus(state, Date.now());
    const key = live.status === 'processing' ? `processing-${Math.ceil(live.remainingMs / 1000)}` : live.status;
    if (!force && key === lastLabelKey) return;
    lastLabelKey = key;
    if (live.status === 'processing') {
      compost.label.draw(`堆肥中 ${formatRemaining(live.remainingMs)}`);
      compost.light.material.color.setHex(0xd4a94c);
      compost.light.material.emissive.setHex(0x8a6518);
    } else if (live.status === 'ready') {
      compost.label.draw('肥料可以收了');
      compost.light.material.color.setHex(0x8fc76c);
      compost.light.material.emissive.setHex(0x3f7f26);
    } else {
      compost.label.draw('堆肥箱 · 空闲');
      compost.light.material.color.setHex(0x9c9c85);
      compost.light.material.emissive.setHex(0x3f3f2e);
    }
  }

  function tick(now) {
    ensureCompost();
    const wasReady = state.compost.status === 'ready';
    const result = tickCompost(state, now);
    if (result.becameReady && !state.compost.notified) {
      markCompostNotified(state);
      save();
      onMessage('堆肥好了，去院子农田边收肥料吧');
    } else if (wasReady && state.compost.status === 'ready') {
      // 保持状态；通知只发一次。
    }
    if (now - lastCompostTick > 500) {
      lastCompostTick = now;
      updateCompostVisual();
      if (dialog.open && activeTab === 'compost') render();
    }
  }

  function raycastTarget(clientX, clientY) {
    if (getSceneId() !== YARD_SCENE_ID) return null;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, getCamera());
    const hits = raycaster.intersectObjects([groundLayer, ...(compost ? [compost.root] : [])], true);
    const player = getPlayer().position;
    for (const hit of hits) {
      let node = hit.object;
      while (node && !node.userData?.interact) node = node.parent;
      if (!node) continue;
      const worldPosition = node.getWorldPosition(new THREE.Vector3());
      if (Math.hypot(worldPosition.x - player.x, worldPosition.z - player.z) > INTERACT_DISTANCE) return { tooFar: true };
      if (node.userData.interact === 'poop' && node.userData.itemId) return { kind: 'poop', itemId: node.userData.itemId };
      if (node.userData.interact === 'compost') return { kind: 'compost' };
    }
    return null;
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button === 0) pointerDown = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointermove', event => {
    if (isEditing() || isFirstPerson() || isBattle() || dialog.open) return;
    const now = performance.now();
    if (now - hoverThrottle < 90) return;
    hoverThrottle = now;
    const target = raycastTarget(event.clientX, event.clientY);
    canvas.style.cursor = target && !target.tooFar ? 'pointer' : '';
  });
  canvas.addEventListener('pointerleave', () => { canvas.style.cursor = ''; });
  canvas.addEventListener('pointerup', event => {
    if (event.button !== 0 || !pointerDown) return;
    const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    pointerDown = null;
    if (moved > 8 || isEditing() || isFirstPerson() || isBattle()) return;
    const target = raycastTarget(event.clientX, event.clientY);
    if (!target) return;
    if (target.tooFar) { onMessage('离得太远了，走近一点再操作'); return; }
    if (target.kind === 'poop') pickupItem(target.itemId);
    else if (target.kind === 'compost') open('compost');
  });

  entry.addEventListener('click', () => open('items'));
  tabs.addEventListener('click', event => {
    const button = event.target.closest('button[data-bag-tab]');
    if (!button) return;
    activeTab = button.dataset.bagTab;
    render();
  });
  body.addEventListener('click', event => {
    const tab = event.target.closest('[data-bag-item]');
    if (tab) { selectedItemId = tab.dataset.bagItem; render(); return; }
    const action = event.target.closest('[data-bag-action]')?.dataset.bagAction;
    if (action === 'drop') dropSelected();
    else if (action === 'deposit') depositCompost();
    else if (action === 'collect') collectFertilizer();
  });
  dialog.querySelector('.settings-close').addEventListener('click', close);
  dialog.addEventListener('close', () => { if (panelTimer) { clearInterval(panelTimer); panelTimer = null; } });
  dialog.addEventListener('cancel', () => { if (panelTimer) { clearInterval(panelTimer); panelTimer = null; } });

  // 恢复上次保存在院子里的地面物品。
  syncGroundMeshes();
  updateBadge();

  return {
    update(dt) {
      const yard = getSceneId() === YARD_SCENE_ID;
      groundLayer.visible = yard;
      if (compost) compost.root.visible = yard;
      ensureCompost();
      tick(Date.now());
    },
    spawnPoop,
    open,
    _debug: () => ({
      inventory: { ...state.inventory },
      ground: state.groundItems.map(item => ({ id: item.id, type: item.type, position: item.position })),
      groundMeshes: [...meshes.keys()],
      compost: compost ? {
        position: compost.root.position.toArray().map(value => +value.toFixed(2)),
        status: getCompostStatus(state, Date.now()).status,
        remainingMs: getCompostStatus(state, Date.now()).remainingMs,
      } : null,
      nearCompost: nearCompost(),
    }),
    _state: () => state,
    _spawnPoop: position => spawnPoop(position),
    _advanceCompost: ms => {
      if (state.compost.status !== 'processing') return false;
      const amount = Number(ms);
      if (!Number.isFinite(amount) || amount <= 0) return false;
      state.compost.readyAt -= amount;
      tick(Date.now());
      save();
      return true;
    },
  };
}
