import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMUNITY_API_PROXY_PATH, COMMUNITY_SERVER_ORIGINS, resolveCommunityApiBase } from '../src/community/server-config.js';

test('community server defaults cover local, production and explicit overrides', () => {
  assert.equal(COMMUNITY_SERVER_ORIGINS.local, 'http://127.0.0.1:4311');
  assert.equal(COMMUNITY_SERVER_ORIGINS.production, 'https://dsh.xn--n6qv0quslfsn.top');
  assert.equal(COMMUNITY_API_PROXY_PATH, '/community-api');
  assert.equal(resolveCommunityApiBase({ location: { hostname: '127.0.0.1' }, buildBase: '' }), COMMUNITY_API_PROXY_PATH);
  assert.equal(resolveCommunityApiBase({ location: { hostname: 'dsh.xn--n6qv0quslfsn.top' }, buildBase: '' }), COMMUNITY_SERVER_ORIGINS.production);
  assert.equal(resolveCommunityApiBase({ location: { hostname: '127.0.0.1' }, desktop: true, buildBase: COMMUNITY_SERVER_ORIGINS.production }), COMMUNITY_API_PROXY_PATH);
  assert.equal(resolveCommunityApiBase({ explicitBase: 'https://staging.example.test/', buildBase: COMMUNITY_SERVER_ORIGINS.production }), 'https://staging.example.test/');
  assert.equal(resolveCommunityApiBase({ runtimeBase: 'http://127.0.0.1:4400', buildBase: COMMUNITY_SERVER_ORIGINS.production }), 'http://127.0.0.1:4400');
});
