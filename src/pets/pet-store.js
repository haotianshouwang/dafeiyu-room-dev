// 家园宠物状态：纯函数 + localStorage 持久化，便于单测与以后迁移到服务端存档。
export const PET_STORAGE_KEY = 'dafeiyu.pets.v2';
export const PET_BOND_MAX = 100;
export const PET_BOND_HOURLY_CAP = 10;
export const PET_BOND_GAIN = 1;
export const PET_MODES = ['follow', 'standby'];
const HOUR_MS = 60 * 60 * 1000;

function createPet(id, name, now, mode = null) {
  return {
    id,
    name,
    species: 'baize',
    bond: 0,
    evolved: false,
    readyToEvolve: false,
    mode,
    battle: false,
    homeSceneId: 'yard',
    homePosition: null,
    bondWindowStart: now,
    bondWindowPoints: 0,
    createdAt: now,
    evolvedAt: null,
  };
}

// 不预置固定数量：初始只有一只白泽伙伴，其余通过「领养」变成真正的宠物对象。
export function createDefaultPetState(now = Date.now()) {
  return {
    version: 2,
    selectedPetId: 'pet-1',
    pets: [createPet('pet-1', '白泽', now, 'follow')],
  };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function normalizePetState(raw, now = Date.now()) {
  if (!raw || raw.version !== 2 || !Array.isArray(raw.pets) || !raw.pets.length) return createDefaultPetState(now);
  const seen = new Set();
  const pets = [];
  for (const pet of raw.pets) {
    if (!pet || typeof pet.id !== 'string' || !pet.id || seen.has(pet.id)) continue;
    seen.add(pet.id);
    const bond = clamp(Number.isFinite(pet.bond) ? pet.bond : 0, 0, PET_BOND_MAX);
    pets.push({
      id: pet.id,
      name: typeof pet.name === 'string' && pet.name ? pet.name.slice(0, 24) : '白泽',
      species: 'baize',
      bond,
      evolved: Boolean(pet.evolved),
      readyToEvolve: Boolean(pet.readyToEvolve) || (bond >= PET_BOND_MAX && !pet.evolved),
      mode: PET_MODES.includes(pet.mode) ? pet.mode : null,
      battle: Boolean(pet.battle),
      homeSceneId: typeof pet.homeSceneId === 'string' && pet.homeSceneId ? pet.homeSceneId : 'yard',
      homePosition: Array.isArray(pet.homePosition) && pet.homePosition.length === 3 && pet.homePosition.every(Number.isFinite)
        ? pet.homePosition.slice(0, 3)
        : null,
      bondWindowStart: Number.isFinite(pet.bondWindowStart) ? pet.bondWindowStart : now,
      bondWindowPoints: clamp(Number.isFinite(pet.bondWindowPoints) ? pet.bondWindowPoints : 0, 0, PET_BOND_HOURLY_CAP),
      createdAt: Number.isFinite(pet.createdAt) ? pet.createdAt : now,
      evolvedAt: Number.isFinite(pet.evolvedAt) ? pet.evolvedAt : null,
    });
  }
  if (!pets.length) return createDefaultPetState(now);
  return {
    version: 2,
    selectedPetId: pets.some(pet => pet.id === raw.selectedPetId) ? raw.selectedPetId : pets[0].id,
    pets,
  };
}

export function loadPetState(storage, now = Date.now()) {
  try {
    return normalizePetState(JSON.parse(storage?.getItem(PET_STORAGE_KEY) ?? 'null'), now);
  } catch {
    return createDefaultPetState(now);
  }
}

export function savePetState(storage, state) {
  try {
    storage?.setItem(PET_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式/配额满时不阻塞游戏。
  }
}

export function getPet(state, petId) {
  return state.pets.find(pet => pet.id === petId) ?? null;
}

export function selectPet(state, petId) {
  if (getPet(state, petId)) state.selectedPetId = petId;
  return state;
}

/** 领养一只新宠物对象（默认白泽）；返回新宠物，重复调用可继续增加。 */
export function adoptPet(state, { name = null, now = Date.now(), mode = 'follow' } = {}) {
  let index = 1;
  while (state.pets.some(pet => pet.id === `pet-${index}`)) index += 1;
  const pet = createPet(`pet-${index}`, name || (state.pets.length ? `白泽 ${index}` : '白泽'), now, mode);
  state.pets.push(pet);
  state.selectedPetId = pet.id;
  return pet;
}

export function setPetMode(state, petId, mode, { sceneId = null, position = null } = {}) {
  if (mode !== null && !PET_MODES.includes(mode)) throw Error('INVALID_PET_MODE');
  const pet = getPet(state, petId);
  if (!pet) return state;
  pet.mode = mode;
  if (mode === 'standby') {
    if (sceneId) pet.homeSceneId = sceneId;
    if (Array.isArray(position) && position.length === 3 && position.every(Number.isFinite)) pet.homePosition = position.slice(0, 3);
  }
  return state;
}

export function toggleBattle(state, petId) {
  const pet = getPet(state, petId);
  if (pet) pet.battle = !pet.battle;
  return state;
}

function refreshBondWindow(pet, now) {
  if (!Number.isFinite(pet.bondWindowStart) || now - pet.bondWindowStart >= HOUR_MS) {
    pet.bondWindowStart = now;
    pet.bondWindowPoints = 0;
  }
}

export function petPet(state, petId, now = Date.now()) {
  const pet = getPet(state, petId);
  if (!pet) return { ok: false, reason: 'not-found' };
  if (pet.evolved || pet.bond >= PET_BOND_MAX) {
    return { ok: false, reason: 'max', bond: pet.bond };
  }
  refreshBondWindow(pet, now);
  if (pet.bondWindowPoints >= PET_BOND_HOURLY_CAP) {
    return { ok: false, reason: 'hourly-cap', bond: pet.bond, hourUsed: pet.bondWindowPoints };
  }
  const gain = Math.min(PET_BOND_GAIN, PET_BOND_HOURLY_CAP - pet.bondWindowPoints, PET_BOND_MAX - pet.bond);
  pet.bond = clamp(pet.bond + gain, 0, PET_BOND_MAX);
  pet.bondWindowPoints += gain;
  pet.readyToEvolve = pet.bond >= PET_BOND_MAX && !pet.evolved;
  return { ok: true, gain, bond: pet.bond, hourUsed: pet.bondWindowPoints, readyToEvolve: pet.readyToEvolve };
}

export function evolvePet(state, petId, now = Date.now()) {
  const pet = getPet(state, petId);
  if (!pet || pet.evolved || pet.bond < PET_BOND_MAX) return { ok: false, reason: 'not-ready' };
  pet.evolved = true;
  pet.evolvedAt = now;
  pet.readyToEvolve = false;
  return { ok: true, pet };
}

export function followingPets(state) {
  return state.pets.filter(pet => pet.mode === 'follow');
}

export function standbyPetsInScene(state, sceneId) {
  return state.pets.filter(pet => pet.mode !== 'follow' && pet.homeSceneId === sceneId);
}

export function setPetHome(state, petId, { sceneId, position }) {
  const pet = getPet(state, petId);
  if (!pet) return state;
  if (sceneId) pet.homeSceneId = sceneId;
  if (Array.isArray(position) && position.length === 3 && position.every(Number.isFinite)) pet.homePosition = position.slice(0, 3);
  return state;
}

export function petBattlePet(state) {
  const pet = state.pets.find(candidate => candidate.battle);
  return pet ? { id: pet.id, name: pet.name, evolved: pet.evolved } : null;
}
