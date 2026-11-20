import test from 'node:test';
import assert from 'node:assert/strict';
import {buildServer} from '../server/app.js';

function cookieHeader(response) { return response.headers['set-cookie'].split(',').map(value => value.split(';')[0]).join('; '); }

test('local package bridge exports and imports through the existing World Package implementation', async () => {
  const app = await buildServer({databasePath: ':memory:', worldMode: true, startRuntime: false, auth: {localAccess: true}});
  try {
    const session = await app.inject({method: 'POST', url: '/api/auth/local-session', headers: {host: '127.0.0.1:5200', origin: 'http://127.0.0.1:5200'}, payload: {}});
    assert.equal(session.statusCode, 200);
    const cookie = cookieHeader(session);
    const csrf = session.json().csrfToken;
    const exported = await app.inject({method: 'GET', url: '/api/world/default/package', headers: {cookie}});
    assert.equal(exported.statusCode, 200);
    assert.equal(exported.headers['content-type'], 'application/octet-stream');
    assert.match(exported.headers['x-world-package-sha256'], /^[a-f0-9]{64}$/);
    const imported = await app.inject({method: 'POST', url: '/api/world/default/package/import?target_world_id=copy-world', headers: {cookie, 'x-csrf-token': csrf, 'content-type': 'application/x-dfworld'}, payload: exported.rawPayload});
    assert.equal(imported.statusCode, 200, imported.body);
    assert.equal(imported.json().worldId, 'copy-world');
    const conflict = await app.inject({method: 'POST', url: '/api/world/default/package/import?target_world_id=copy-world', headers: {cookie, 'x-csrf-token': csrf, 'content-type': 'application/x-dfworld'}, payload: exported.rawPayload});
    assert.equal(conflict.statusCode, 400);
  } finally { await app.close(); }
});
