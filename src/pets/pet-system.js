import * as THREE from 'three';
import { loadBaize, makeBaize } from '../characters/baize.js';
import { surfaceAt } from '../../shared/world/coastal.js';
import { getTemplate } from '../../shared/world/templates.js';
import { nearestFree } from '../../shared/world/navigation.js';
import { FOODS } from '../../shared/world/foods.js';
import {
  PET_BOND_MAX, PET_BOND_HOURLY_CAP,
  loadPetState, savePetState, getPet, selectPet, setPetMode, toggleBattle,
  petPet, evolvePet, petBattlePet, setPetHome, followingPets,
} from './pet-store.js';

const LANES = [{ back: 1.05, side: -0.6 }, { back: 1.35, side: 0.6 }, { back: 1.75, side: 0 }];
const FOOD_EMOJI = { rice: '🍚', hamburger: '🍔', pizza: '🍕', croissant: '🥐', apple: '🍎', strawberry: '🍓' };
const FOOD_COLORS = { rice: 0xfff7e8, hamburger: 0xc98a4b, pizza: 0xe0a34a, croissant: 0xd9a35f, apple: 0xd94f4f, strawberry: 0xe45b6b };
const GAITS = {
  walk: { clip: 'CanineWalk', speed: 1.7 },
  run: { clip: 'CanineLocoTrot', speed: 2.8 },
  sprint: { clip: 'CanineGallop', speed: 5.5 },
};
const STYLE = `
#pet-entry{position:relative}
#pet-entry .pet-count{font-size:11px;opacity:.6}
.pet-panel{width:min(430px,calc(100vw - 32px))}
.pet-tabs{display:flex;gap:6px;margin:8px 0 12px}
.pet-tabs button{flex:1;padding:8px 10px;border:1px solid #d9c9b6;border-radius:10px;background:#fff9ee;color:#51454a;font:inherit;cursor:pointer}
.pet-tabs button.active{background:#e8d6bd;border-color:#b48a5f;font-weight:600}
.pet-list{display:grid;gap:10px;max-height:min(52vh,520px);overflow:auto;padding-right:2px}
.pet-card{border:1px solid #e3d2bc;border-radius:14px;padding:10px 12px;background:#fffdf7}
.pet-card.selected{border-color:#b48a5f;box-shadow:0 0 0 2px #d9bfa2 inset}
.pet-card header{display:flex;align-items:center;gap:8px;justify-content:space-between}
.pet-card header b{font-size:15px}
.pet-card header em{font-style:normal;font-size:11px;color:#8a7563}
.pet-bond{margin:8px 0 6px}
.pet-bond .pet-bond-top{display:flex;justify-content:space-between;font-size:12px;color:#78665a}
.pet-bond i{display:block;height:8px;border-radius:99px;background:#efe0cf;overflow:hidden;margin-top:4px}
.pet-bond i em{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#ffb26b,#ff7f9b)}
.pet-modes{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0}
.pet-modes label{display:flex;align-items:center;gap:4px;font-size:13px;color:#51454a}
.pet-modes input{accent-color:#a8794f}
.pet-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:6px}
.pet-actions button{padding:6px 12px;border:1px solid #d6bfa5;border-radius:10px;background:#fff9ee;color:#5d493b;font:inherit;font-size:13px;cursor:pointer}
.pet-actions button:disabled{opacity:.45;cursor:default}
.pet-actions button.primary{background:#a8794f;border-color:#a8794f;color:#fff}
.pet-food-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
.pet-food-grid button{display:grid;justify-items:center;gap:4px;padding:10px 6px;border:1px solid #e3d2bc;border-radius:12px;background:#fffdf7;color:#51454a;font:inherit;cursor:pointer}
.pet-food-grid button:hover{background:#fff1d9;border-color:#b79065}
.pet-food-grid .emoji{font-size:26px;line-height:1}
.pet-foot{margin:12px 0 0;font-size:11px;color:#8a7563}
`;

function circularLerp(from, to, t) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * t;
}

export function mountPetSystem({
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
  let state = loadPetState(storage);
  const avatars = new Map();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tmp = new THREE.Vector3();
  let asset = null;
  let ready = false;
  let food = null;
  let pointerDown = null;

  if (!document.getElementById('pet-system-style')) {
    const style = document.createElement('style');
    style.id = 'pet-system-style';
    style.textContent = STYLE;
    document.head.append(style);
  }

  const entry = document.createElement('button');
  entry.type = 'button';
  entry.id = 'pet-entry';
  entry.className = 'toolbar-action';
  entry.innerHTML = '<span aria-hidden="true">🐾</span> 宠物 <span class="pet-count"></span>';
  document.getElementById('actions')?.prepend(entry);

  const dialog = document.createElement('dialog');
  dialog.id = 'pet-panel';
  dialog.className = 'settings-dialog pet-panel';
  dialog.setAttribute('aria-labelledby', 'pet-panel-title');
  dialog.innerHTML = `<div class="settings-card">
    <header class="settings-header"><h2 id="pet-panel-title">宠物栏</h2><button class="settings-close" type="button" aria-label="关闭宠物栏">×</button></header>
    <div class="pet-tabs" role="tablist">
      <button type="button" data-tab="pets" class="active" role="tab" aria-selected="true">宠物</button>
      <button type="button" data-tab="food" role="tab" aria-selected="false">食物</button>
    </div>
    <div class="pet-body"></div>
    <p class="pet-foot">抚摸可以提升羁绊（每小时最多 +10）；羁绊满 100 后可以进化。跟随与家园待命互斥，战斗可独立勾选。</p>
  </div>`;
  document.body.append(dialog);
  const body = dialog.querySelector('.pet-body');
  const tabs = dialog.querySelector('.pet-tabs');
  const closeButton = dialog.querySelector('.settings-close');
  let activeTab = 'pets';

  function save() {
    savePetState(storage, state);
    updateEntryCount();
  }

  function updateEntryCount() {
    const count = entry.querySelector('.pet-count');
    if (count) count.textContent = String(state.pets.length);
  }

  function selectedPet() {
    return getPet(state, state.selectedPetId) ?? state.pets[0] ?? null;
  }

  function petById(id) {
    const pet = getPet(state, id);
    if (!pet) return;
    const avatar = avatars.get(id);
    if (!avatar || !avatar.root.visible) {
      onMessage(`${pet.name} 现在不在你身边`);
      return;
    }
    const result = petPet(state, id, Date.now());
    if (!result.ok) {
      if (result.reason === 'hourly-cap') onMessage(`这一小时已经摸满 ${PET_BOND_HOURLY_CAP} 点了，等会儿再陪${pet.name}玩吧`);
      else if (result.reason === 'max') onMessage(`${pet.name} 的羁绊已经满了${pet.evolved ? '，正在陪着你' : '，可以进化了'}`);
      else onMessage('现在摸不到它');
      save();
      render();
      return;
    }
    avatar.bounce = 1;
    if (fx) fx.hearts(avatar.root.position.clone().add(new THREE.Vector3(0, 0.72, 0)), 6);
    save();
    if (result.readyToEvolve) onMessage(`抚摸${pet.name}：羁绊 +${result.gain}（${pet.bond}/${PET_BOND_MAX}）· 可以进化了！`);
    else onMessage(`抚摸${pet.name}：羁绊 +${result.gain}（${pet.bond}/${PET_BOND_MAX}）`);
    render();
  }

  function evolve(id) {
    const pet = getPet(state, id);
    if (!pet) return;
    const result = evolvePet(state, id, Date.now());
    if (!result.ok) { onMessage(`${pet.name} 的羁绊还没满`); return; }
    const avatar = avatars.get(id);
    if (avatar) {
      avatar.baseScale = 1.16;
      applyPetLook(avatar, pet);
      if (fx) fx.burst(avatar.root.position.clone().add(new THREE.Vector3(0, 0.7, 0)), 14);
    }
    save();
    onMessage(`${pet.name} 进化了！`);
    render();
  }

  function setMode(id, mode) {
    const pet = getPet(state, id);
    if (!pet) return;
    if (mode === 'standby') {
      const avatar = avatars.get(id);
      const player = getPlayer();
      const position = avatar && avatar.root.visible
        ? avatar.root.position.toArray()
        : [player.position.x, player.position.y, player.position.z];
      setPetMode(state, id, 'standby', { sceneId: getSceneId(), position });
      if (avatar) avatar.sceneId = getSceneId();
    } else {
      setPetMode(state, id, mode);
    }
    save();
    render();
    const label = mode === 'follow' ? '开始跟随你' : mode === 'standby' ? '留在家园待命' : '自由活动';
    onMessage(`${pet.name} ${label}`);
  }

  function placeFood(foodId) {
    if (!FOODS[foodId]) return;
    if (!ready) { onMessage('宠物们还在赶来的路上，稍等一下'); return; }
    if (food) { onMessage('地上已经有一份食物了，先让宠物吃完'); return; }
    const snapshot = getSnapshot();
    const sceneId = getSceneId();
    const player = getPlayer();
    const heading = player.heading ?? 0;
    const template = (() => {
      try { return getTemplate(snapshot.scenes.find(entry => entry.sceneId === sceneId).templateId); } catch { return null; }
    })();
    let x = player.position.x + Math.sin(heading) * 1.05;
    let z = player.position.z + Math.cos(heading) * 1.05;
    let y = player.position.y;
    try {
      const free = nearestFree(snapshot, sceneId, [x, y, z]);
      x = free[0]; z = free[2];
    } catch { /* 保持原位 */ }
    if (template) {
      try { y = surfaceAt(template, x, z)?.height ?? y; } catch { /* 保持原位 */ }
    }
    const candidates = state.pets.filter(pet => {
      const avatar = avatars.get(pet.id);
      return avatar && avatar.root.visible;
    });
    const pet = candidates.find(candidate => candidate.id === state.selectedPetId) ?? candidates[0];
    if (!pet) { onMessage('附近没有宠物，先让一只宠物跟随或留在家园待命'); return; }
    const mesh = createFoodMesh(foodId);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    food = { foodId, petId: pet.id, mesh, position: new THREE.Vector3(x, y, z), createdAt: performance.now() };
    dialog.close();
    onMessage(`${pet.name} 闻到香味，过来吃了`);
  }

  function createFoodMesh(foodId) {
    const group = new THREE.Group();
    group.name = `pet-food-${foodId}`;
    const ceramic = new THREE.MeshStandardMaterial({ color: 0xeaf3ff, roughness: 0.42 });
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 0.06, 20), ceramic);
    bowl.position.y = 0.03;
    group.add(bowl);
    const foodMaterial = new THREE.MeshStandardMaterial({ color: FOOD_COLORS[foodId] ?? 0xfff0d0, roughness: 0.85 });
    const foodMesh = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 12), foodMaterial);
    foodMesh.scale.y = 0.55;
    foodMesh.position.y = 0.095;
    group.add(foodMesh);
    if (foodId === 'hamburger') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe0b06b, roughness: 0.8 }));
      bun.position.y = 0.14;
      group.add(bun);
    }
    group.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    return group;
  }

  function removeFood() {
    if (!food) return;
    scene.remove(food.mesh);
    food = null;
  }

  function applyPetLook(avatar, pet) {
    avatar.baseScale = pet.evolved ? 1.16 : 1;
    avatar.root.scale.setScalar(avatar.baseScale);
    if (pet.evolved && !avatar.tinted) {
      avatar.root.traverse(node => {
        if (!node.isMesh || !node.material) return;
        const tint = material => {
          const cloned = material.clone();
          if (cloned.emissive) { cloned.emissive = new THREE.Color(0x7fb0ff); cloned.emissiveIntensity = 0.28; }
          return cloned;
        };
        node.material = Array.isArray(node.material) ? node.material.map(tint) : tint(node.material);
      });
      avatar.tinted = true;
    }
  }

  function createAvatar(pet) {
    if (!asset) return null;
    const model = makeBaize(asset, true, { inPlace: true });
    const avatar = { petId: pet.id, model, root: model.root, sceneId: null, baseScale: 1, bounce: 0, eating: 0, tinted: false };
    model.root.name = `pet-avatar-${pet.id}`;
    model.root.visible = false;
    scene.add(model.root);
    applyPetLook(avatar, pet);
    avatars.set(pet.id, avatar);
    return avatar;
  }

  async function load() {
    asset = await loadBaize();
    if (!asset) { onMessage('宠物模型加载失败，稍后再试'); return; }
    ready = true;
    for (const pet of state.pets) createAvatar(pet);
    updateEntryCount();
  }

  function groundAt(template, x, z, fallbackY) {
    if (!template) return fallbackY;
    try { return surfaceAt(template, x, z)?.height ?? fallbackY; } catch { return fallbackY; }
  }

  function offsetTarget(player, heading, lane) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const rx = Math.cos(heading), rz = -Math.sin(heading);
    return { x: player.x - fx * lane.back + rx * lane.side, z: player.z - fz * lane.back + rz * lane.side };
  }

  function placeBehind(avatar, pet, ctx) {
    const lane = LANES[state.pets.findIndex(candidate => candidate.id === pet.id) % LANES.length];
    const point = offsetTarget(ctx.player, ctx.heading, lane);
    let x = point.x, y = ctx.player.y, z = point.z;
    try {
      const free = nearestFree(ctx.snapshot, ctx.sceneId, [x, y, z]);
      x = free[0]; z = free[2];
    } catch { /* 用玩家附近 */ }
    y = groundAt(ctx.template, x, z, y);
    avatar.root.position.set(x, y, z);
    avatar.root.rotation.y = ctx.heading;
    avatar.sceneId = ctx.sceneId;
  }

  function updateAvatar(pet, avatar, dt, ctx) {
    const follow = pet.mode === 'follow';
    const visible = follow || pet.homeSceneId === ctx.sceneId;
    if (!visible) { avatar.root.visible = false; avatar.eating = 0; return; }
    if (!avatar.root.visible && !follow) {
      // 回到待命场景时从家园点出现；首次没有坐标就先放在玩家旁边。
      if (!pet.homePosition) {
        const lane = LANES[state.pets.findIndex(candidate => candidate.id === pet.id) % LANES.length];
        const point = offsetTarget(ctx.player, ctx.heading, lane);
        pet.homePosition = [point.x, groundAt(ctx.template, point.x, point.z, ctx.player.y), point.z];
        save();
      }
      avatar.root.position.fromArray(pet.homePosition);
      avatar.root.rotation.y = ctx.heading;
    }
    avatar.root.visible = true;
    if (avatar.eating > 0) {
      avatar.eating -= dt;
      avatar.model.play('CanineIdle');
      avatar.model.update(dt);
      if (avatar.eating <= 0) finishEating(pet, avatar);
      return;
    }
    if (follow) {
      if (avatar.sceneId !== ctx.sceneId || avatar.root.position.distanceTo(ctx.player) > 7) placeBehind(avatar, pet, ctx);
    } else {
      avatar.sceneId = ctx.sceneId;
      if (!pet.homePosition) {
        const lane = LANES[state.pets.findIndex(candidate => candidate.id === pet.id) % LANES.length];
        const point = offsetTarget(ctx.player, ctx.heading, lane);
        pet.homePosition = [point.x, groundAt(ctx.template, point.x, point.z, ctx.player.y), point.z];
        save();
      }
    }
    let target = null;
    if (food && food.petId === pet.id) target = { x: food.position.x, y: food.position.y, z: food.position.z };
    else if (follow) {
      const lane = LANES[state.pets.findIndex(candidate => candidate.id === pet.id) % LANES.length];
      target = offsetTarget(ctx.player, ctx.heading, lane);
    } else if (pet.homePosition) target = { x: pet.homePosition[0], y: pet.homePosition[1], z: pet.homePosition[2] };

    let stepped = 0;
    if (target) {
      const dx = target.x - avatar.root.position.x;
      const dz = target.z - avatar.root.position.z;
      const distance = Math.hypot(dx, dz);
      if (food && food.petId === pet.id && distance < 0.55) {
        avatar.eating = 0.85;
        avatar.model.play('CanineIdle');
        avatar.model.update(dt);
        return;
      }
      if (distance > 0.07) {
        const speed = Math.min(distance * 5, food && food.petId === pet.id ? 2.6 : 3.4);
        const step = Math.min(distance, dt * speed);
        const x = avatar.root.position.x + (dx / distance) * step;
        const z = avatar.root.position.z + (dz / distance) * step;
        avatar.root.position.x = x;
        avatar.root.position.z = z;
        avatar.root.position.y = groundAt(ctx.template, x, z, avatar.root.position.y);
        const desired = Math.atan2(dx, dz);
        avatar.root.rotation.y = circularLerp(avatar.root.rotation.y, desired, Math.min(1, dt * 12));
        stepped = speed;
      } else {
        avatar.model.play('CanineIdle');
        if (!follow && ctx.player.distanceTo(avatar.root.position) < 4) {
          const desired = Math.atan2(ctx.player.x - avatar.root.position.x, ctx.player.z - avatar.root.position.z);
          avatar.root.rotation.y = circularLerp(avatar.root.rotation.y, desired, Math.min(1, dt * 5));
        }
      }
    }
    if (stepped > 0.05) {
      const gait = stepped > 3.4 ? GAITS.sprint : stepped > 2.1 ? GAITS.run : GAITS.walk;
      avatar.model.play(gait.clip, undefined, THREE.MathUtils.clamp(stepped / gait.speed, 0.4, 1.6));
    } else {
      avatar.model.play('CanineIdle');
    }
    avatar.model.update(dt);
    if (avatar.bounce > 0) {
      avatar.bounce = Math.max(0, avatar.bounce - dt * 3.2);
      avatar.root.scale.setScalar(avatar.baseScale * (1 + avatar.bounce * 0.09));
    }
  }

  function finishEating(pet, avatar) {
    if (!food) return;
    const position = food.mesh.position.clone();
    scene.remove(food.mesh);
    food = null;
    if (localSound) localSound.playAction?.('meal-soft');
    if (fx) fx.hearts(position.clone().add(new THREE.Vector3(0, 0.5, 0)), 5);
    avatar.model.play('CanineIdle');
    onMessage(`${pet.name} 吃完了，心情不错`);
  }

  function update(dt, snapshot, visual, playerPosition) {
    if (!ready || !snapshot) return;
    const sceneId = getSceneId();
    const player = getPlayer();
    const sceneEntry = snapshot.scenes?.find(entry => entry.sceneId === sceneId);
    let template = null;
    try { template = sceneEntry ? getTemplate(sceneEntry.templateId) : null; } catch { template = null; }
    const ctx = { sceneId, snapshot, player: playerPosition ?? player.position, heading: player.heading ?? 0, template };
    for (const pet of state.pets) {
      let avatar = avatars.get(pet.id);
      if (!avatar && asset) avatar = createAvatar(pet);
      if (avatar) updateAvatar(pet, avatar, dt, ctx);
    }
    if (food && performance.now() - food.createdAt > 15000) {
      onMessage('宠物没来得及吃，食物先收起来了');
      removeFood();
    }
  }

  function render() {
    const pet = selectedPet();
    updateEntryCount();
    if (activeTab === 'pets') {
      body.innerHTML = `<div class="pet-list">${state.pets.map(candidate => {
        const bound = candidate.bond;
        const evolvedText = candidate.evolved ? '已进化' : candidate.readyToEvolve ? '可进化' : '';
        return `<article class="pet-card${candidate.id === pet?.id ? ' selected' : ''}" data-pet-id="${candidate.id}">
          <header><b>${candidate.name}</b><em>${evolvedText}</em></header>
          <div class="pet-bond">
            <div class="pet-bond-top"><span>羁绊</span><span>${bound}/${PET_BOND_MAX} · 本小时 +${candidate.bondWindowPoints}/${PET_BOND_HOURLY_CAP}</span></div>
            <i><em style="width:${Math.round((bound / PET_BOND_MAX) * 100)}%"></em></i>
          </div>
          <div class="pet-modes">
            <label><input type="checkbox" data-role="follow" ${candidate.mode === 'follow' ? 'checked' : ''}> 跟随</label>
            <label><input type="checkbox" data-role="standby" ${candidate.mode === 'standby' ? 'checked' : ''}> 家园待命</label>
            <label><input type="checkbox" data-role="battle" ${candidate.battle ? 'checked' : ''}> 战斗</label>
          </div>
          <div class="pet-actions">
            <button type="button" data-action="pet">抚摸</button>
            <button type="button" data-action="evolve" class="primary" ${candidate.readyToEvolve ? '' : 'disabled'}>进化</button>
          </div>
        </article>`;
      }).join('')}</div>`;
    } else {
      body.innerHTML = `<div class="pet-food-grid">${Object.entries(FOODS).map(([foodId, foodDef]) =>
        `<button type="button" data-food-id="${foodId}"><span class="emoji">${FOOD_EMOJI[foodId] ?? '🍽️'}</span><span>${foodDef.label}</span></button>`
      ).join('')}</div>`;
    }
  }

  function open(tab = 'pets') {
    activeTab = tab;
    tabs.querySelectorAll('button').forEach(button => {
      const active = button.dataset.tab === activeTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    render();
    if (!dialog.open) dialog.showModal();
  }

  tabs.addEventListener('click', event => {
    const button = event.target.closest('button[data-tab]');
    if (!button) return;
    activeTab = button.dataset.tab;
    open(activeTab);
  });
  body.addEventListener('change', event => {
    const card = event.target.closest('[data-pet-id]');
    const input = event.target.closest('input[data-role]');
    if (!card || !input) return;
    const id = card.dataset.petId;
    const pet = getPet(state, id);
    if (!pet) return;
    if (input.dataset.role === 'battle') {
      toggleBattle(state, id);
      save();
      render();
      return;
    }
    if (input.checked) {
      setMode(id, input.dataset.role);
    } else if (pet.mode === input.dataset.role) {
      setMode(id, null);
    }
  });
  body.addEventListener('click', event => {
    const card = event.target.closest('[data-pet-id]');
    const actionButton = event.target.closest('button[data-action]');
    if (card) {
      selectPet(state, card.dataset.petId);
      save();
    }
    if (actionButton && card) {
      const id = card.dataset.petId;
      if (actionButton.dataset.action === 'pet') petById(id);
      else if (actionButton.dataset.action === 'evolve') evolve(id);
      return;
    }
    const foodButton = event.target.closest('button[data-food-id]');
    if (foodButton) { placeFood(foodButton.dataset.foodId); }
  });
  entry.addEventListener('click', () => open('pets'));
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', event => event.stopPropagation());

  function raycastPet(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const camera = getCamera?.();
    if (!camera) return null;
    raycaster.setFromCamera(ndc, camera);
    const roots = [...avatars.values()].filter(avatar => avatar.root.visible).map(avatar => avatar.root);
    if (!roots.length) return null;
    const hits = raycaster.intersectObjects(roots, true);
    if (!hits.length) return null;
    let node = hits[0].object;
    while (node && !roots.includes(node)) node = node.parent;
    if (!node) return null;
    const player = getPlayer();
    if (node.position.distanceTo(player.position) > 4.5) return null;
    for (const [id, avatar] of avatars) if (avatar.root === node) return id;
    return null;
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button === 0) pointerDown = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', event => {
    if (event.button !== 0 || !pointerDown) return;
    const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    pointerDown = null;
    if (moved > 8 || isEditing() || isFirstPerson() || isBattle()) return;
    const id = raycastPet(event.clientX, event.clientY);
    if (id) petById(id);
  });

  updateEntryCount();
  return {
    load,
    update,
    open,
    hasFollowers: () => ready && followingPets(state).length > 0,
    hasFollowingPets: () => followingPets(state).length > 0,
    getBattlePet: () => petBattlePet(state),
    isReady: () => ready,
    placeFood,
    _state: () => state,
  };
}
