import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultPetState, normalizePetState, loadPetState, savePetState,
  getPet, selectPet, setPetMode, toggleBattle, petPet, evolvePet,
  followingPets, standbyPetsInScene, petBattlePet, setPetHome,
  PET_BOND_MAX, PET_BOND_HOURLY_CAP, PET_STORAGE_KEY,
} from '../src/pets/pet-store.js';

const memoryStorage = () => {
  const map = new Map();
  return { getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), map };
};

test('默认三只白泽：跟随/待命/自由各一，羁绊从 0 开始', () => {
  const state = createDefaultPetState(1000);
  assert.equal(state.pets.length, 3);
  assert.deepEqual(state.pets.map(pet => pet.mode), ['follow', 'standby', null]);
  assert.equal(state.selectedPetId, 'pet-1');
  assert.ok(state.pets.every(pet => pet.bond === 0 && pet.evolved === false));
});

test('跟随与家园待命互斥，待命会记录家园位置', () => {
  const state = createDefaultPetState(1000);
  setPetMode(state, 'pet-1', 'standby', { sceneId: 'bedroom', position: [1, 0, 2] });
  assert.equal(getPet(state, 'pet-1').mode, 'standby');
  assert.deepEqual(getPet(state, 'pet-1').homePosition, [1, 0, 2]);
  setPetMode(state, 'pet-1', 'follow');
  assert.equal(getPet(state, 'pet-1').mode, 'follow');
  setPetMode(state, 'pet-1', null);
  assert.equal(getPet(state, 'pet-1').mode, null);
});

test('战斗勾选独立于跟随/待命，出战宠物取第一只勾选', () => {
  const state = createDefaultPetState(1000);
  toggleBattle(state, 'pet-2');
  assert.equal(getPet(state, 'pet-2').battle, true);
  assert.equal(petBattlePet(state).name, '青岚');
  toggleBattle(state, 'pet-2');
  assert.equal(petBattlePet(state), null);
});

test('抚摸 +1 羁绊，一小时最多 10 点', () => {
  const state = createDefaultPetState(1000);
  let now = 1000;
  for (let i = 0; i < PET_BOND_HOURLY_CAP; i += 1) {
    const result = petPet(state, 'pet-1', now);
    assert.equal(result.ok, true);
    now += 1000;
  }
  assert.equal(getPet(state, 'pet-1').bond, 10);
  const capped = petPet(state, 'pet-1', now);
  assert.equal(capped.ok, false);
  assert.equal(capped.reason, 'hourly-cap');
  // 一小时后窗口重置，可以继续摸
  const reset = petPet(state, 'pet-1', now + 60 * 60 * 1000 + 1);
  assert.equal(reset.ok, true);
  assert.equal(getPet(state, 'pet-1').bond, 11);
});

test('羁绊满后可以进化，进化后不再加羁绊', () => {
  const state = createDefaultPetState(1000);
  const pet = getPet(state, 'pet-1');
  pet.bond = PET_BOND_MAX - 1;
  const now = 1000;
  const last = petPet(state, 'pet-1', now);
  assert.equal(last.ok, true);
  assert.equal(pet.bond, PET_BOND_MAX);
  assert.equal(pet.readyToEvolve, true);
  assert.equal(evolvePet(state, 'pet-1', now + 1).ok, true);
  assert.equal(pet.evolved, true);
  assert.equal(pet.readyToEvolve, false);
  assert.equal(petPet(state, 'pet-1', now + 2).reason, 'max');
});

test('未满羁绊不能进化', () => {
  const state = createDefaultPetState(1000);
  const result = evolvePet(state, 'pet-1', 1000);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not-ready');
});

test('跟随/待命筛选与出战宠物', () => {
  const state = createDefaultPetState(1000);
  setPetHome(state, 'pet-2', { sceneId: 'living', position: [0, 0, 0] });
  assert.deepEqual(followingPets(state).map(pet => pet.id), ['pet-1']);
  assert.deepEqual(standbyPetsInScene(state, 'bedroom').map(pet => pet.id), ['pet-3']);
  assert.deepEqual(standbyPetsInScene(state, 'living').map(pet => pet.id), ['pet-2']);
});

test('localStorage 读写与容错', () => {
  const storage = memoryStorage();
  const state = createDefaultPetState(1000);
  setPetMode(state, 'pet-2', 'follow');
  selectPet(state, 'pet-2');
  savePetState(storage, state);
  const loaded = loadPetState(storage, 2000);
  assert.equal(loaded.selectedPetId, 'pet-2');
  assert.equal(getPet(loaded, 'pet-2').mode, 'follow');
  storage.map.set(PET_STORAGE_KEY, '{broken');
  assert.equal(loadPetState(storage, 3000).pets.length, 3);
});

test('规范化会修复越界字段', () => {
  const state = normalizePetState({
    version: 1,
    pets: [{ id: 'x', name: '', bond: 999, mode: 'weird', bondWindowPoints: 99, homePosition: [1, 2] }],
  }, 5000);
  assert.equal(state.pets.length, 1);
  assert.equal(state.pets[0].bond, PET_BOND_MAX);
  assert.equal(state.pets[0].mode, null);
  assert.equal(state.pets[0].bondWindowPoints, PET_BOND_HOURLY_CAP);
  assert.equal(state.pets[0].homePosition, null);
  assert.equal(state.selectedPetId, 'x');
});
