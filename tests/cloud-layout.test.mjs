import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCloudLayout,
  decodeCloudLayout,
  encodeCloudLayout,
  extractCloudLayout
} from '../shared/world/cloud-layout.js';
import { BrowserWorldClient, createStarterSnapshot } from '../src/community/browser-world-client.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
    values
  };
}

test('cloud layout contains only scenes, furniture and portal wiring', () => {
  const snapshot = createStarterSnapshot({ worldId:'source-world' });
  snapshot.actors[0].position = [8,0,8];
  snapshot.actors[0].needs.hunger = 99;
  snapshot.actions.running = { actionId:'secret-action' };
  snapshot.runtime.sessionToken = 'must-not-upload';
  snapshot.entities[0].passwordHash = 'must-not-upload';
  snapshot.assets = [{ bytes:'large model' }];

  const layout = extractCloudLayout(snapshot, { worldName:'家具布局' });
  assert.equal(layout.format, 'dafeiyu-layout');
  assert.equal(layout.world.name, '家具布局');
  assert.equal(layout.entities.length, snapshot.entities.length);
  assert.equal(layout.entities[0].passwordHash, undefined);
  assert.deepEqual(Object.keys(layout).sort(), [
    'entities','format','format_version','layout_revision','portals','scenes','topology_revision','world'
  ]);
  assert.doesNotMatch(JSON.stringify(layout), /must-not-upload|running|assets/);
  const { bytes } = encodeCloudLayout(snapshot, { worldName:'家具布局' });
  assert.deepEqual(decodeCloudLayout(bytes), layout);
  assert.ok(bytes.byteLength < 512 * 1024);
});

test('cloud layout recreates furniture without importing actor or action runtime', () => {
  const source = createStarterSnapshot({ worldId:'source-world' });
  source.entities.push({ entityId:'cloud-chair',sceneId:'bedroom',type:'chair',position:[1,0,1],rotation:0,scale:[1,1,1] });
  source.actors[0].position = [8,0,8];
  source.actors[0].needs.hunger = 99;
  source.actions.running = { actionId:'running' };
  const base = createStarterSnapshot({ worldId:'base-world' });
  const layout = extractCloudLayout(source, { worldName:'跨端布局' });
  const restored = applyCloudLayout(base, layout, { worldId:'restored-world' });

  assert.equal(restored.worldId, 'restored-world');
  assert.ok(restored.entities.some(entity => entity.entityId === 'cloud-chair'));
  assert.equal(restored.actions.running, undefined);
  assert.notDeepEqual(restored.actors[0].position, [8,0,8]);
  assert.equal(restored.actors[0].needs.hunger, base.actors[0].needs.hunger);
  assert.equal(restored.actors[0].controller, null);
});

test('browser world storage is isolated per community subject in one browser', async () => {
  const storage = memoryStorage();
  const first = new BrowserWorldClient({ storage,subjectId:'account-a',now:() => 1000 });
  await first.connect('default');
  await first.dispatch({
    kind:'build.preview',
    payload:{ baseRevision:0,ops:[{kind:'entity.add',ref:'private',sceneId:'bedroom',type:'chair',position:[0,0,0],rotation:0,scale:[1,1,1]}] }
  }).then(plan => first.dispatch({ kind:'build.apply',payload:{ planId:plan.planId } }));
  const firstIds = first.snapshot.entities.map(entity => entity.entityId);

  const second = new BrowserWorldClient({ storage,subjectId:'account-b',now:() => 1000 });
  await second.connect('default');
  assert.equal(second.snapshot.entities.some(entity => firstIds.includes(entity.entityId) && entity.entityId.startsWith('entity-')), false);

  const restored = new BrowserWorldClient({ storage,subjectId:'account-a',now:() => 1000 });
  await restored.connect('default');
  assert.equal(restored.snapshot.entities.some(entity => firstIds.includes(entity.entityId) && entity.entityId.startsWith('entity-')), true);
  assert.notEqual(first.storageKey, second.storageKey);
});
