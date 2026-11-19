import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveGameRuntime} from '../src/community/runtime-policy.js';

test('local play stays local and has an optional account', () => {
  const runtime = resolveGameRuntime({pathname: '/', search: ''});
  assert.deepEqual(runtime, {
    kind: 'local',
    communityWorld: false,
    accountRequired: false,
    gameTransport: 'local'
  });
});

test('account login is not a game-mode switch', () => {
  const runningLocalWorld = resolveGameRuntime({pathname: '/', search: '?account=logged-in'});
  assert.equal(runningLocalWorld.communityWorld, false);
  assert.equal(runningLocalWorld.accountRequired, false);
  assert.equal(runningLocalWorld.gameTransport, 'local');
});

test('only the community web entry requires the community world account', () => {
  for (const input of [
    {pathname: '/game/', search: ''},
    {pathname: '/', search: '?runtime=community'},
    {pathname: '/', search: '', communityWeb: true}
  ]) {
    const runtime = resolveGameRuntime(input);
    assert.equal(runtime.communityWorld, true);
    assert.equal(runtime.accountRequired, true);
    assert.equal(runtime.gameTransport, 'browser');
  }
});
test('community builds cannot fall back to local guests through a different URL',()=>{
  const runtime=resolveGameRuntime({pathname:'/',search:'?runtime=local',communityBuild:true});
  assert.equal(runtime.communityWorld,true);assert.equal(runtime.accountRequired,true);
});
