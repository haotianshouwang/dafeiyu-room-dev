import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {BrowserWorldClient} from '../src/community/browser-world-client.js';
import {CommunityRealtimeClient} from '../src/community/realtime-client.js';
import {loadCharacterTemplate, characterModelUrl} from '../src/characters/model-assets.js';

class Socket {
  constructor(){this.readyState=0;this.listeners=new Map();this.sent=[];}
  addEventListener(type,fn){this.listeners.set(type,fn);}
  send(raw){this.sent.push(JSON.parse(raw));}
  emit(type,value){this.listeners.get(type)?.(value);}
  message(message){this.emit('message',{data:JSON.stringify(message)});}
  close(){this.readyState=3;}
}

test('same account accepts cross-room positions, coalesces bursts and waits before publishing',async()=>{
  const applied=[];let release;
  const client=new CommunityRealtimeClient({WebSocketImpl:Socket,onAccountPosition:async data=>{
    applied.push(data);if(applied.length===1)await new Promise(resolve=>release=resolve);
  }});
  client.connect();const socket=client.socket;socket.readyState=1;socket.emit('open');
  socket.message({type:'connected',user_id:'alice',room_id:'community-lobby',connection_id:'local',players:[],account_state:null});
  const packet=revision=>({type:'player.position',user_id:'alice',account_sync:true,room_id:'private-alice',state_revision:revision,controller_id:'other-device',data:{scene_id:'bedroom',position:[revision,0,2]}});
  socket.message(packet(1));socket.message(packet(2));socket.message(packet(3));
  assert.equal(client.sendPosition({position:[0,0,0],sceneId:'public-lobby',force:true}),false);
  socket.message({...packet(10),user_id:'bob'});
  socket.message(packet(2));
  release();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(applied.map(data=>data.position[0]),[1,3]);
  assert.equal(client.players.size,0,'the same account never becomes a second avatar');
  client.markActivity();
  assert.equal(client.sendPosition({position:[3,0,2],sceneId:'bedroom',force:true}),true);
  assert.equal(socket.sent.at(-1).data.control_sequence,1);
  client.close();
});

test('browser follows location without importing needs, furniture or stale controller state',async()=>{
  const client=new BrowserWorldClient({storage:null});await client.connect();
  const before=structuredClone(client.snapshot.entities),needs={...client.snapshot.actors[0].needs};
  const result=await client.dispatch({kind:'actor.sync',payload:{actorId:'whale',state:{scene_id:'living',position:[1,0,2],rotation:.7,moving:true,pose:'walking'}}});
  assert.deepEqual(result.actor.position,[1,0,2]);assert.equal(result.actor.sceneId,'living');
  assert.equal(result.actor.controller,null);assert.deepEqual(result.actor.needs,needs);assert.deepEqual(client.snapshot.entities,before);
  await assert.rejects(client.dispatch({kind:'actor.sync',payload:{actorId:'whale',state:{scene_id:'missing',position:[1,0,2]}}}),/PLAYER_STATE_SCENE_UNAVAILABLE/);
  client.dispose();
});

test('local input survives in-flight remote positions until its latest control claim is acknowledged',async()=>{
  const applied=[];let finishRemote;
  const client=new CommunityRealtimeClient({WebSocketImpl:Socket,onAccountPosition:async data=>{
    applied.push(data.position[0]);if(applied.length===1)await new Promise(resolve=>finishRemote=resolve);
  }});
  client.connect();const socket=client.socket;socket.readyState=1;socket.emit('open');
  socket.message({type:'connected',user_id:'alice',room_id:'community-lobby',connection_id:'local',players:[]});
  const packet=(revision,controller='remote',sequence=0)=>({type:'player.position',user_id:'alice',account_sync:true,
    state_revision:revision,controller_id:controller,control_sequence:sequence,data:{scene_id:'public-lobby',position:[revision,0,2]}});
  socket.message(packet(1));socket.message(packet(2));
  client.markActivity();
  assert.equal(client.localControlPending,true);
  assert.equal(client.sendPosition({sceneId:'public-lobby',position:[10,0,2]}),true,'a new claim bypasses an older in-flight sync');
  socket.message(packet(3));
  client.markActivity();
  assert.equal(client.sendPosition({sceneId:'public-lobby',position:[11,0,2]}),true,'new control intent bypasses the position throttle');
  socket.message(packet(4,'local',1));
  assert.equal(client.localControlPending,true,'an older ack cannot acknowledge newer input');
  socket.message(packet(5));
  socket.message(packet(6,'local',2));
  assert.equal(client.localControlPending,false);
  finishRemote();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(applied,[1],'queued old positions do not erase the new input');
  socket.message(packet(7));await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(applied,[1,7],'the other device can take control after the claim is acknowledged');
  assert.equal(client.players.size,0);
  client.close();
});

test('optimized character keeps exact geometry, skeleton and all animation buffer bytes',()=>{
  function inspect(file){const raw=fs.readFileSync(file),n=raw.readUInt32LE(12);const json=JSON.parse(raw.subarray(20,20+n));const binary=raw.subarray(28+n);
    const chunks=json.bufferViews.filter((view,index)=>!json.images.some(image=>image.bufferView===index)).map(view=>binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength));
    return {json,bytes:raw.length,hash:createHash('sha256').update(Buffer.concat(chunks)).digest('hex')};}
  const source=inspect('resources/character/models/Dafeiyu.glb'),web=inspect('resources/character/models/Dafeiyu-web-v1.glb');
  assert.deepEqual(gunzipSync(fs.readFileSync('resources/character/models/Dafeiyu-web-v1.glb.gz')),fs.readFileSync('resources/character/models/Dafeiyu-web-v1.glb'));
  assert.equal(web.hash,source.hash);assert.deepEqual(web.json.animations,source.json.animations);assert.deepEqual(web.json.skins,source.json.skins);
  assert.ok(web.bytes<source.bytes*.3);assert.equal(web.json.animations.length,33);assert.equal(web.json.images.every(image=>image.mimeType==='image/webp'),true);
});

test('character model cache shares concurrent loads and retries after failures',async()=>{
  let loads=0;const load=async()=>{loads++;return {scene:{},animations:[]};};
  const [a,b]=await Promise.all([loadCharacterTemplate('cache-test.glb',load),loadCharacterTemplate('cache-test.glb',load)]);
  assert.equal(a,b);assert.equal(loads,1);
  await assert.rejects(loadCharacterTemplate('retry-test.glb',async()=>{throw Error('temporary');}));
  await loadCharacterTemplate('retry-test.glb',load);assert.equal(loads,2);
  assert.match(characterModelUrl(),/Dafeiyu-web-v1\.glb$/);
});
