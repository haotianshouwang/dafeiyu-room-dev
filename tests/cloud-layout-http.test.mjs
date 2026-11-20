import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { buildServer } from '../server/app.js';
import { WorldRuntime } from '../server/world/runtime.js';
import { decodeCloudLayout } from '../shared/world/cloud-layout.js';

function cookieHeader(response) {
  return response.headers['set-cookie'].split(',').map(value => value.split(';')[0]).join('; ');
}

test('local layout bridge exports lightweight JSON and imports an independent furniture copy', async () => {
  const app=await buildServer({ databasePath:':memory:',worldMode:true,startRuntime:false,auth:{ localAccess:true } });
  try {
    const session=await app.inject({
      method:'POST',
      url:'/api/auth/local-session',
      headers:{ host:'127.0.0.1:5200',origin:'http://127.0.0.1:5200' },
      payload:{}
    });
    assert.equal(session.statusCode,200);
    const cookie=cookieHeader(session);
    const csrf=session.json().csrfToken;
    const exported=await app.inject({ method:'GET',url:'/api/world/default/layout',headers:{ cookie } });
    assert.equal(exported.statusCode,200,exported.body);
    assert.match(exported.headers['content-type'],/^application\/json/);
    assert.match(exported.headers['x-world-layout-sha256'],/^[a-f0-9]{64}$/);
    const layout=decodeCloudLayout(exported.rawPayload);
    assert.equal(layout.format,'dafeiyu-layout');
    assert.equal(layout.actors,undefined);
    assert.equal(layout.assets,undefined);
    assert.ok(exported.rawPayload.length < 1024 * 1024);

    const imported=await app.inject({
      method:'POST',
      url:'/api/world/default/layout/import?target_world_id=cloud-copy',
      headers:{ cookie,'x-csrf-token':csrf,'content-type':'application/json' },
      payload:exported.rawPayload
    });
    assert.equal(imported.statusCode,200,imported.body);
    assert.deepEqual(imported.json(),{
      worldId:'cloud-copy',
      revision:layout.layout_revision,
      scenes:layout.scenes.length,
      entities:layout.entities.length,
      actors:1,
      assets:0
    });
    const copy=app.worldService.readSnapshot('cloud-copy');
    assert.deepEqual(copy.entities,layout.entities);
    assert.equal(copy.actions && Object.keys(copy.actions).length,0);
    assert.equal(copy.actors.length,1);
    assert.ok(app.worldService.worldIds().includes('cloud-copy'),'the imported private world is registered with the shared scheduler');
    new WorldRuntime(app.worldService,{worldId:null}).tick();
    assert.ok(app.worldService.readSnapshot('cloud-copy').runtime?.lastTickAt,'the scheduler advances imported private worlds');
    assert.deepEqual(app.worldService.readSnapshot('cloud-copy').actors[0].position,[0.05,0,0.55]);
    const accessibleCopy=await app.inject({ method:'GET',url:'/api/world/cloud-copy/snapshot',headers:{ cookie } });
    assert.equal(accessibleCopy.statusCode,200,accessibleCopy.body);
    assert.equal(accessibleCopy.json().worldId,'cloud-copy');

    const conflict=await app.inject({
      method:'POST',
      url:'/api/world/default/layout/import?target_world_id=cloud-copy',
      headers:{ cookie,'x-csrf-token':csrf,'content-type':'application/json' },
      payload:exported.rawPayload
    });
    assert.equal(conflict.statusCode,400);
  } finally {
    await app.close();
  }
});

test('layout import is CSRF protected and strips credential-shaped extension fields', async () => {
  const app=await buildServer({ databasePath:':memory:',worldMode:true,startRuntime:false,auth:{ localAccess:true } });
  try {
    const session=await app.inject({
      method:'POST',
      url:'/api/auth/local-session',
      headers:{ host:'127.0.0.1:5200',origin:'http://127.0.0.1:5200' },
      payload:{}
    });
    const cookie=cookieHeader(session),csrf=session.json().csrfToken;
    const exported=await app.inject({ method:'GET',url:'/api/world/default/layout',headers:{ cookie } });
    const layout=JSON.parse(exported.body);
    layout.entities[0].tokenHash='should-be-ignored';
    layout.actorState={ secret:'ignored' };
    const noCsrf=await app.inject({
      method:'POST',
      url:'/api/world/default/layout/import?target_world_id=safe-copy',
      headers:{ cookie,'content-type':'application/json' },
      payload:layout
    });
    assert.equal(noCsrf.statusCode,403);
    const imported=await app.inject({
      method:'POST',
      url:'/api/world/default/layout/import?target_world_id=safe-copy',
      headers:{ cookie,'x-csrf-token':csrf,'content-type':'application/json' },
      payload:layout
    });
    assert.equal(imported.statusCode,200,imported.body);
    assert.doesNotMatch(JSON.stringify(app.worldService.readSnapshot('safe-copy')),/should-be-ignored|"secret":"ignored"/);
  } finally {
    await app.close();
  }
});

async function syncFixture({ disk = false } = {}) {
  const root = disk ? fs.mkdtempSync(path.join(os.tmpdir(), 'dafeiyu-layout-sync-')) : null;
  const app = await buildServer({ databasePath: disk ? path.join(root, 'game.sqlite') : ':memory:', worldMode: true, startRuntime: false, auth: { localAccess: true } });
  const session = await app.inject({ method: 'POST', url: '/api/auth/local-session', headers: { host: '127.0.0.1:5200', origin: 'http://127.0.0.1:5200' }, payload: {} });
  assert.equal(session.statusCode, 200, session.body);
  const headers = { cookie: cookieHeader(session), 'x-csrf-token': session.json().csrfToken };
  const exported = await app.inject({ url: '/api/world/default/layout', headers });
  const layout = exported.json();
  const input = { layout, expected_layout_revision: layout.layout_revision, expected_topology_revision: layout.topology_revision };
  let request = 0;
  return { app, headers, input, async command(kind, payload) {
    const response = await app.inject({ method: 'POST', url: '/api/world/default/commands', headers, payload: { worldId: 'default', requestId: `sync-command-${++request}`, kind, payload } });
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  }, async close() { await app.close(); if (root) fs.rmSync(root, { recursive: true, force: true }); } };
}

function addSyncRoom(layout) {
  layout.scenes.push({ sceneId: 'sync-room', name: '同步房间', templateId: 'cozy_room_v1', status: 'active' });
  layout.entities.push({ entityId: 'sync-chair', sceneId: 'sync-room', type: 'chair', position: [-1.8, 0, -1.8], rotation: 0, scale: [1, 1, 1] });
}

test('real SQLite layout sync updates the existing memory runtime, preserves player needs, fences local edits, and leaves dfworld export intact', async () => {
  const f = await syncFixture({ disk: true });
  try {
    const before = f.app.worldService.readSnapshot('default');
    const worldCount = f.app.worldService.db.prepare('SELECT COUNT(*) AS n FROM worlds').get().n;
    addSyncRoom(f.input.layout);
    f.input.layout.actors = [{ actorId: 'intruder', needs: { hunger: 100 } }];
    let response = await f.app.inject({ method: 'POST', url: '/api/world/default/layout/sync', headers: f.headers, payload: f.input });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { worldId: 'default', layoutRevision: before.layoutRevision + 1, topologyRevision: before.topologyRevision + 1 });
    let after = f.app.worldService.readSnapshot('default');
    assert.deepEqual(after.actors, before.actors);
    assert.equal(after.entities.find(entity => entity.entityId === 'sync-chair').position[0], -1.8);
    assert.equal(f.app.worldService.db.prepare('SELECT COUNT(*) AS n FROM worlds').get().n, worldCount);
    const durable = JSON.parse(f.app.worldService.db.prepare('SELECT snapshot FROM worlds WHERE world_id=?').get('default').snapshot);
    assert.deepEqual(durable.entities, after.entities);
    assert.equal(durable.actors[0].position, undefined, 'layout sync must retain the runtime-only position policy');

    const latestLayout = (await f.app.inject({ url: '/api/world/default/layout', headers: f.headers })).json();
    const eventCount = f.app.worldService.db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
    response = await f.app.inject({ method: 'POST', url: '/api/world/default/layout/sync', headers: f.headers, payload: { layout: latestLayout, expected_layout_revision: after.layoutRevision, expected_topology_revision: after.topologyRevision } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().layoutRevision, after.layoutRevision);
    assert.equal(f.app.worldService.db.prepare('SELECT COUNT(*) AS n FROM events').get().n, eventCount);
    assert.deepEqual(f.app.worldService.readSnapshot('default'), after);

    const sameState = structuredClone(after);
    response = await f.app.inject({ method: 'POST', url: '/api/world/default/layout/sync', headers: f.headers, payload: f.input });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error, 'CLOUD_LAYOUT_REVISION_CONFLICT');
    assert.deepEqual(f.app.worldService.readSnapshot('default'), sameState);

    const actorId = after.actors[0].actorId;
    await f.command('actor.teleport', { actorId, sceneId: 'sync-room' });
    const lease = await f.command('control.acquire', { actorId });
    const action = await f.command('action.submit', { actorId, leaseId: lease.leaseId, leaseVersion: lease.leaseVersion, kind: 'move', target: { sceneId: 'sync-room', position: [1.8, 0, 1.8] } });
    after = f.app.worldService.readSnapshot('default');
    await f.command('build.preview', { baseRevision: after.layoutRevision, ops: [{ kind: 'scene.create', ref: 'stale-preview', templateId: 'cozy_room_v1', name: 'Future plan' }] });
    assert.equal(Object.keys(f.app.worldService.readSnapshot('default').buildPlans).length, 1);
    const needs = structuredClone(after.actors[0].needs);
    const controller = structuredClone(after.actors[0].controller);
    const exported = (await f.app.inject({ url: '/api/world/default/layout', headers: f.headers })).json();
    exported.entities.find(entity => entity.entityId === 'sync-chair').position[0] = -1.5;
    const update = { layout: exported, expected_layout_revision: after.layoutRevision, expected_topology_revision: after.topologyRevision };
    response = await f.app.inject({ method: 'POST', url: '/api/world/default/layout/sync', headers: f.headers, payload: update });
    assert.equal(response.statusCode, 200, response.body);
    const updated = f.app.worldService.readSnapshot('default');
    assert.equal(updated.actions[action.actionId].status, 'cancelled');
    assert.equal(updated.actions[action.actionId].result.reason, 'layout_synced');
    assert.equal(updated.actors[0].actionId, null);
    assert.deepEqual(updated.actors[0].needs, needs);
    assert.deepEqual(updated.actors[0].controller, controller);
    assert.equal(updated.layoutRevision, after.layoutRevision + 1);
    assert.equal(updated.topologyRevision, after.topologyRevision);
    assert.deepEqual(updated.buildPlans, {});
    const events = (await f.app.inject({ url: '/api/world/default/events?after=0&limit=500', headers: f.headers })).json().events;
    assert.ok(events.some(event => event.kind === 'world.layout_synced' && event.data.layoutRevision === updated.layoutRevision));
    response = await f.app.inject({ url: '/api/world/default/package', headers: f.headers });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.headers['content-type'], 'application/octet-stream');
    assert.match(response.headers['x-world-package-sha256'], /^[a-f0-9]{64}$/);
  } finally { await f.close(); }
});

test('an actual second world websocket receives the applied layout revision', async () => {
  const f = await syncFixture();
  let socket;
  try {
    await f.app.listen({ host: '127.0.0.1', port: 0 });
    socket = new WebSocket(`ws://127.0.0.1:${f.app.server.address().port}/api/world/default/socket?csrf=${encodeURIComponent(f.headers['x-csrf-token'])}`, { headers: { cookie: f.headers.cookie } });
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const expectedRevision = f.input.expected_layout_revision + 1;
    const changed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('world layout update timeout')), 3000);
      socket.on('message', data => {
        const frame = JSON.parse(data.toString());
        if (frame.type === 'tick' && frame.layoutRevision === expectedRevision) { clearTimeout(timer); resolve(frame); }
      });
      socket.once('error', error => { clearTimeout(timer); reject(error); });
    });
    addSyncRoom(f.input.layout);
    const response = await f.app.inject({ method: 'POST', url: '/api/world/default/layout/sync', headers: f.headers, payload: f.input });
    assert.equal(response.statusCode, 200, response.body);
    const frame = await changed;
    assert.equal(frame.topologyRevision, f.input.expected_topology_revision + 1);
    socket.send(JSON.stringify({ type: 'snapshot', requestId: 'after-layout-sync' }));
    const fresh = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('world snapshot timeout')), 3000);
      socket.on('message', data => { const value = JSON.parse(data.toString()); if (value.type === 'snapshot') { clearTimeout(timer); resolve(value); } });
    });
    assert.ok(fresh.snapshot.entities.some(entity => entity.entityId === 'sync-chair'));
  } finally {
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
    await f.close();
  }
});

test('layout sync rejects missing authorization, CSRF, unknown local resources, invalid portals, and either stale revision without writing', async () => {
  const f = await syncFixture();
  try {
    addSyncRoom(f.input.layout);
    const before = f.app.worldService.readSnapshot('default');
    const post = (payload = f.input, headers = f.headers) => f.app.inject({ method: 'POST', url: '/api/world/default/layout/sync', headers, payload });
    assert.equal((await post(f.input, {})).statusCode, 401);
    assert.equal((await post(f.input, { cookie: f.headers.cookie })).statusCode, 403);
    const reader = f.app.auth.store.create({ scopes: ['world:read'], actorIds: [] });
    assert.equal((await post(f.input, { authorization: `Bearer ${reader.accessToken}` })).statusCode, 403);
    assert.equal((await post(f.input, { ...f.headers, host: '127.0.0.1:5200', origin: 'https://untrusted.invalid' })).statusCode, 403);
    for (const key of ['expected_layout_revision', 'expected_topology_revision']) {
      const response = await post({ ...f.input, [key]: f.input[key] + 1 });
      assert.equal(response.statusCode, 409, response.body);
    }
    let invalid = structuredClone(f.input);
    invalid.layout.entities.at(-1).type = 'pf-resource-not-installed';
    let response = await post(invalid);
    assert.equal(response.statusCode, 409, response.body);
    assert.deepEqual(response.json().details.missing_resource_ids, ['pf-resource-not-installed']);
    invalid = structuredClone(f.input);
    invalid.layout.scenes.at(-1).templateId = 'local_unknown_template';
    response = await post(invalid);
    assert.equal(response.statusCode, 409, response.body);
    assert.deepEqual(response.json().details.missing_template_ids, ['local_unknown_template']);
    invalid = structuredClone(f.input);
    invalid.layout.portals.push({ id: 'invalid-slot', from: { sceneId: 'bedroom', slotId: 'bad' }, to: { sceneId: 'sync-room', slotId: 'north' }, bidirectional: true });
    response = await post(invalid);
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error, 'PORTAL_SLOT_UNAVAILABLE');
    assert.deepEqual(f.app.worldService.readSnapshot('default'), before);
    const db = f.app.worldService.db;
    const durable = db.prepare('SELECT snapshot FROM worlds WHERE world_id=?').get('default').snapshot;
    db.exec("CREATE TRIGGER fail_layout_sync_event BEFORE INSERT ON events WHEN NEW.kind='world.layout_synced' BEGIN SELECT RAISE(ABORT,'layout event failure'); END");
    response = await post();
    assert.equal(response.statusCode, 400, response.body);
    assert.deepEqual(f.app.worldService.readSnapshot('default'), before);
    assert.equal(db.prepare('SELECT snapshot FROM worlds WHERE world_id=?').get('default').snapshot, durable);
  } finally { await f.close(); }
});
