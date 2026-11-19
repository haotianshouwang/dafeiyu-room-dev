import test from 'node:test';
import assert from 'node:assert/strict';
import {playSession,readOnlinePreference,onlinePreferenceKey} from '../src/community/play-session.js';

test('local guests can play public scenes without cloud or multiplayer',()=>{
  const session=playSession({onlineEnabled:true});
  assert.equal(session.canPlay,true);assert.equal(session.canUseCloud,false);assert.equal(session.canConnect,false);
  assert.equal(playSession({communityWorld:true}).canPlay,false);
});
test('local account can remain signed in with cloud available and multiplayer off',()=>{
  const session=playSession({userId:'alice',onlineEnabled:false});
  assert.equal(session.canPlay,true);assert.equal(session.canUseCloud,true);assert.equal(session.canConnect,false);
  assert.equal(playSession({userId:'alice',onlineEnabled:true}).canConnect,true);
});
test('multiplayer preference persists separately for accounts and servers',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)??null};
  values.set(onlinePreferenceKey('server-a','alice'),'false');
  assert.equal(readOnlinePreference(storage,'server-a','alice'),false);
  assert.equal(readOnlinePreference(storage,'server-a','bob'),true);
  assert.equal(readOnlinePreference(storage,'server-b','alice'),true);
  assert.equal(readOnlinePreference(storage,'server-a',null),false);
});
