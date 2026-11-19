import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserWorldClient, createStarterSnapshot } from '../src/community/browser-world-client.js';
import { buildBrowserWorldPackage, inspectBrowserWorldPackage } from '../src/community/browser-package.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
}

test('browser runtime controls the actor and survives local movement', async () => {
  const client = new BrowserWorldClient({
    storage: memoryStorage(),
    subjectId: 'browser-user',
    now: () => 1000
  });
  await client.connect('default');
  assert.equal(client.snapshot.scenes.length >= 3, true);
  const lease = await client.dispatch({ kind: 'control.takeover', payload: { actorId: 'whale' } });
  const actor = client.snapshot.actors[0];
  const before = [...actor.position];
  const result = await client.dispatch({
    kind: 'actor.input',
    payload: {
      actorId: 'whale',
      leaseId: lease.leaseId,
      leaseVersion: lease.leaseVersion,
      frames: [{ sequence: 1, dtMs: 50, direction: [1, 0] }]
    }
  });
  assert.notDeepEqual(result.actor.position, before);
  assert.equal(result.actor.input.sequence, 1);
  await client.dispatch({ kind: 'actor.teleport', payload: { actorId: 'whale', sceneId: 'living' } });
  assert.equal(client.snapshot.actors[0].sceneId, 'living');
  await assert.rejects(client.dispatch({
    kind: 'actor.input',
    payload: {
      actorId: 'whale',
      leaseId: 'invalid',
      leaseVersion: 0,
      frames: [{ sequence: 2, dtMs: 50, direction: [0, 1] }]
    }
  }), /LEASE_INVALID/);
});

test('community entry starts in the public lobby and visitor snapshots never overwrite the owner home', async () => {
  const storage=memoryStorage();
  const client=new BrowserWorldClient({storage,subjectId:'home-owner'});
  await client.connect('default');
  const homeScenes=client.snapshot.scenes.map(scene=>scene.sceneId);
  assert.equal(homeScenes.includes('public-lobby'),true);
  client.startInPublicLobby();
  assert.equal(client.snapshot.actors[0].sceneId,'public-lobby');
  const exits=client.snapshot.portals.filter(portal=>(portal.id||portal.portalId||'').startsWith('lobby-exit-'));
  assert.equal(exits.length,1,'the lobby has one physical exit');
  assert.equal(exits[0].to.sceneId,'convenience-store','the physical lobby exit leads to the commercial street');
  assert.equal(exits[0].from.sceneId,'public-lobby');
  assert.equal(exits[0].bidirectional,true);
  assert.equal(exits.some(portal=>['bedroom','living','yard'].includes(portal.to?.sceneId)),false,
    'private rooms are reached from the map and do not get lobby doors');
  const visitor={...client.snapshot,worldId:'visitor-room',scenes:[{sceneId:'guest-room',name:'访客房',templateId:'cozy_room_v1',status:'active'}],entities:[],portals:[],actors:[{...client.snapshot.actors[0],sceneId:'guest-room'}]};
  client.enterVisitorSnapshot(visitor);
  assert.equal(client.snapshot.worldId,'visitor-room');
  assert.equal(storage.getItem('dafeiyu-community-browser-world-v2:home-owner').includes('visitor-room'),false);
  client.leaveVisitorSnapshot();
  assert.equal(client.snapshot.worldId,'default');
  assert.equal(client.snapshot.scenes.some(scene=>scene.sceneId==='public-lobby'),true);
});

test('browser build preview, apply and undo mutate the local world', async () => {
  const client = new BrowserWorldClient({ storage: memoryStorage() });
  await client.connect('default');
  const initial = client.snapshot.entities.length;
  const preview = await client.dispatch({
    kind: 'build.preview',
    payload: {
      baseRevision: 0,
      ops: [{
        kind: 'entity.add',
        ref: 'draft-chair',
        sceneId: 'bedroom',
        type: 'chair',
        position: [0, 0, 0],
        rotation: 0,
        scale: [1, 1, 1]
      }]
    }
  });
  const applied = await client.dispatch({ kind: 'build.apply', payload: { planId: preview.planId } });
  assert.equal(client.snapshot.entities.length, initial + 1);
  assert.equal(applied.layoutRevision, 1);
  await client.dispatch({ kind: 'build.undo', payload: { changeId: applied.changeId } });
  assert.equal(client.snapshot.entities.length, initial);
});

test('browser cloud package round-trips a portable world snapshot', async () => {
  const snapshot = createStarterSnapshot({ worldId: 'web-world' });
  const built = await buildBrowserWorldPackage(snapshot, { now: '2026-11-08T00:00:00.000Z' });
  assert.match(built.sha256, /^[a-f0-9]{64}$/);
  const parsed = await inspectBrowserWorldPackage(built.bytes);
  assert.equal(parsed.manifest.format, 'dfworld');
  assert.equal(parsed.snapshot.worldId, 'web-world');
  assert.equal(parsed.snapshot.actors[0].controller, undefined);
  assert.equal(parsed.snapshot.runtime, undefined);
});
