import test from 'node:test';
import assert from 'node:assert/strict';
import { CommunityRealtimeClient, realtimeUrl } from '../src/community/realtime-client.js';

class FakeSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.listeners = new Map();
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  emit(type, value = {}) {
    for (const listener of this.listeners.get(type) || []) listener(value);
  }
  open() {
    this.readyState = 1;
    this.emit('open');
  }
  message(value) {
    this.emit('message', { data: JSON.stringify(value) });
  }
  send(value) {
    this.sent.push(JSON.parse(value));
  }
  close() {
    this.readyState = 3;
  }
}

test('realtime client joins a room and tracks joined and moved players', () => {
  let socket;
  const statuses = [];
  const playerSnapshots = [];
  const client = new CommunityRealtimeClient({
    baseUrl: 'https://community.example.test/game/',
    WebSocketImpl: class extends FakeSocket {
      constructor(url) {
        super(url);
        socket = this;
      }
    },
    onStatus: (status, detail) => statuses.push({ status, detail }),
    onPlayers: players => playerSnapshots.push([...players.values()])
  });
  client.connect();
  assert.equal(socket.url, 'wss://community.example.test/ws/realtime');
  socket.open();
  assert.deepEqual(socket.sent[0], { type: 'connect', room_id: 'community-lobby', world_id: 'community-lobby' });
  assert.equal(client.sendPosition({position:[0,0,0],sceneId:'bedroom',force:true}),false,'presence waits for room authorization');
  socket.message({
    type: 'connected',
    room_id: 'community-lobby',
    user_id: 'alice',
    players: []
  });
  socket.message({
    type: 'player.joined',
    room_id: 'community-lobby',
    user_id: 'bob',
    display_name: 'Bob'
  });
  socket.message({
    type: 'player.position',
    room_id: 'community-lobby',
    user_id: 'bob',
    data: { position: [1, 0, 2], scene_id: 'living', pose: 'idle' }
  });
  assert.equal(client.players.get('bob').position[2], 2);
  assert.equal(statuses.at(-1).detail.count, 2);
  assert.equal(playerSnapshots.at(-1)[0].scene_id, 'living');
  assert.equal(client.sendPosition({ position: [0, 0, 0], sceneId: 'bedroom', pose: 'idle', rotation: 0, animation:{clip:'HumanSpDwarfIdle',time:.4,speed:1,loop:true,revision:1}, force: true }), true);
  assert.equal(socket.sent.at(-1).data.animation_clip,'HumanSpDwarfIdle');
  assert.equal(socket.sent.at(-1).data.animation_revision,1);
  assert.equal(client.sendPosition({ position: [0, 0, 0], sceneId: 'living', pose: 'idle', rotation: 0 }), true, 'a scene change is sent immediately despite the position throttle');
  assert.equal(socket.sent.at(-1).data.scene_id, 'living');
  assert.equal(socket.sent.at(-1).data.animation_clip,undefined,'the next room scene does not inherit an obsolete animation');
  const nearby=[];
  client.onNearby=message=>nearby.push(message);
  socket.message({type:'nearby.message',room_id:'community-lobby',user_id:'bob',data:{message_id:'m1',content:'附近你好',display_name:'Bob'}});
  assert.equal(nearby[0].content,'附近你好');
  assert.equal(client.sendNearby('有人吗'),true);
  assert.equal(socket.sent.at(-1).type,'nearby.chat');
  const casts=[];client.onSpellCast=cast=>casts.push(cast);
  assert.equal(client.sendSpellCast({slot:2,start:[0,0,0],end:[1,0,2]}),true);
  assert.deepEqual(socket.sent.at(-1),{type:'spell.cast',data:{slot:2,start:[0,0,0],end:[1,0,2],scene_id:'living'}});
  socket.message({type:'player.spell.cast',room_id:'community-lobby',user_id:'bob',data:{slot:3,start:[1,0,2],end:[4,0,6],scene_id:'living'}});
  assert.deepEqual(casts,[{userId:'bob',sceneId:'living',slot:3,start:[1,0,2],end:[4,0,6]}]);
  socket.message({type:'player.spell.cast',room_id:'private-owner-1',user_id:'bob',data:{slot:1,start:[0,0,0],end:[1,0,1]}});
  assert.equal(casts.length,1,'cast packets from a different room are ignored');
  socket.message({type:'player.spell.cast',room_id:'private-alice',user_id:'alice',data:{slot:1,start:[0,0,0],end:[1,0,1],scene_id:'bedroom'}});
  assert.equal(casts.length,1,'the local effect is not replayed after the room echoes it');
  client.setRoom('private-owner-1',{grantId:'grant-1'});
  assert.equal(socket.sent.at(-1).room_id,'private-owner-1');
  assert.equal(socket.sent.at(-1).grant_id,'grant-1');
});

test('realtime URL follows HTTP and HTTPS origins', () => {
  assert.equal(realtimeUrl('http://127.0.0.1:4310/game/'), 'ws://127.0.0.1:4310/ws/realtime');
  assert.equal(realtimeUrl('https://community.example.test/game/'), 'wss://community.example.test/ws/realtime');
  assert.equal(realtimeUrl('http://127.0.0.1:5200/community-api'), 'ws://127.0.0.1:5200/community-api/ws/realtime');
});

test('spell casts made during the room handshake wait for confirmation and are discarded on room changes',()=>{
  let socket;const client=new CommunityRealtimeClient({WebSocketImpl:class extends FakeSocket{constructor(url){super(url);socket=this;}}});
  client.connect();socket.open();
  assert.equal(client.sendSpellCast({slot:2,start:[0,0,0],end:[1,0,2],sceneId:'bedroom'}),true);
  assert.equal(socket.sent.some(message=>message.type==='spell.cast'),false);
  socket.message({type:'connected',room_id:'community-lobby',user_id:'alice',players:[]});
  assert.equal(socket.sent.at(-1).type,'spell.cast');
  assert.equal(socket.sent.at(-1).data.scene_id,'bedroom');
  assert.equal(client.sendSpellCast({slot:1,start:[0,0,0],end:[1,0,1],sceneId:'bedroom'}),true);
  client.setRoom('private-alice');assert.equal(client.pendingSpellCasts.length,0);
  socket.message({type:'connected',room_id:'private-alice',user_id:'alice',players:[]});
  assert.equal(socket.sent.filter(message=>message.type==='spell.cast').length,2);
  client.close();
});

test('changing rooms clears old players and ignores delayed room frames and spoofed identity fields',()=>{
  const client=new CommunityRealtimeClient({WebSocketImpl:FakeSocket});client.connect();const socket=client.socket;socket.open();
  socket.message({type:'connected',room_id:'community-lobby',user_id:'alice',players:[{user_id:'bob',display_name:'Bob'}]});
  client.setRoom('private-alice');assert.equal(client.players.size,0);
  socket.message({type:'player.position',room_id:'community-lobby',user_id:'bob',data:{position:[9,0,9],scene_id:'bedroom'}});
  assert.equal(client.players.size,0);
  socket.message({type:'connected',room_id:'private-alice',user_id:'alice',players:[{user_id:'bob',display_name:'Bob'}]});
  socket.message({type:'player.position',room_id:'private-alice',user_id:'bob',data:{position:[1,0,2],user_id:'alice',display_name:'Wrong owner',needs:{hunger:99}}});
  assert.equal(client.players.get('bob').user_id,'bob');assert.equal(client.players.get('bob').display_name,'Bob');assert.equal(client.players.get('bob').needs,undefined);
  const count=socket.sent.length;client.setRoom('private-alice');assert.equal(socket.sent.length,count);client.close();
});

test('rendered height and animation pause cross the transport, and chat waits for a joined room',()=>{
  const client=new CommunityRealtimeClient({WebSocketImpl:FakeSocket});client.connect();const socket=client.socket;socket.open();
  assert.equal(client.sendNearby('too early'),false);
  socket.message({type:'connected',room_id:'community-lobby',user_id:'alice',players:[{user_id:'bob'}]});
  client.sendPosition({position:[1,0,2],renderPosition:[1,1.5,2],sceneId:'public-lobby',animation:{clip:'HumanSpForwardJump',time:.4,speed:1,paused:true,loop:false,revision:2}});
  assert.deepEqual(socket.sent.at(-1).data.render_position,[1,1.5,2]);assert.equal(socket.sent.at(-1).data.animation_paused,true);
  socket.message({type:'player.position',room_id:'community-lobby',user_id:'bob',data:{position:[1,0,2],render_position:[1,1.5,2],animation_clip:'HumanSpForwardJump',animation_paused:true}});
  assert.deepEqual(client.players.get('bob').render_position,[1,1.5,2]);assert.equal(client.players.get('bob').animation_paused,true);
  socket.message({type:'player.position',room_id:'community-lobby',user_id:'bob',data:{position:[1,0,2],pose:'idle'}});
  assert.equal(client.players.get('bob').render_position,undefined);assert.equal(client.players.get('bob').animation_paused,undefined);
  client.setRoom('private-alice');assert.equal(client.sendNearby('wrong room'),false);client.close();
});
