import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BrowserWorldClient,createStarterSnapshot} from '../src/community/browser-world-client.js';
import {LocalAccountWorlds} from '../src/community/local-account-worlds.js';
import {WorldLayoutSync} from '../src/ui/layout-sync.js';
import {WorldClient} from '../src/core/world-client.js';
import {SceneRegistry} from '../src/world/registry.js';

function storage(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}
const entity=(type='chair')=>({entityId:'same-id',sceneId:'bedroom',type,position:[1.5,0,-1],rotation:0,scale:[1,1,1]});
function room(worldId='default'){const s=createStarterSnapshot({worldId});s.scenes=s.scenes.filter(scene=>scene.sceneId==='bedroom');s.entities=[];s.portals=[];return s;}

test('existing per-account browser homes migrate on the same origin without reading another server or global save',async()=>{
  const disk=storage(),legacy={...room(),entities:[entity()]};disk.setItem('dafeiyu-community-browser-world-v2:alice',JSON.stringify(legacy));
  disk.setItem('dafeiyu-community-browser-world-v2',JSON.stringify({...room(),worldId:'old-global'}));
  const previous=globalThis.location;globalThis.location={origin:'https://one.example'};
  try{
    const client=new BrowserWorldClient({storage:disk,subjectId:'alice',serverId:globalThis.location.origin});await client.connect();assert.equal(client.snapshot.entities[0].entityId,'same-id');
    assert.ok(disk.getItem(client.storageKey));
    const another=new BrowserWorldClient({storage:disk,subjectId:'alice',serverId:'https://two.example'});assert.equal(another.snapshot.entities.some(e=>e.entityId==='same-id'),false);
    const bob=new BrowserWorldClient({storage:disk,subjectId:'bob',serverId:globalThis.location.origin});assert.notEqual(bob.snapshot.worldId,'old-global');
  }finally{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;}
});

test('account switch clears old actions, visitor backup and personal state, including across servers',async()=>{
  const disk=storage(),client=new BrowserWorldClient({storage:disk,subjectId:'alice',serverId:'server-one'});
  await client.connect();
  client.snapshot.actors[0].needs.hunger=91;client.snapshot.entities.push({...entity(),entityId:'alice-chair'});
  await client.refresh();
  const lease=await client.dispatch({kind:'control.acquire',payload:{actorId:'whale'}});
  await client.dispatch({kind:'action.submit',payload:{actorId:'whale',...lease,kind:'sit'}});
  assert.equal(client.actionTimers.size,1);
  client.enterVisitorSnapshot({...room('visitor'),entities:[entity('table')]});
  client.setSubjectId('bob');
  assert.equal(client.actionTimers.size,0);assert.equal(client.visitorBackup,null);
  assert.equal(client.readOnly,false);assert.equal(client.snapshot.actors[0].needs.hunger,30);
  assert.equal(client.snapshot.entities.some(e=>e.entityId==='alice-chair'),false);
  client.leaveVisitorSnapshot();assert.equal(client.subjectId,'bob');
  client.setSubjectId('alice');assert.equal(client.snapshot.actors[0].needs.hunger,91);
  assert.equal(client.snapshot.entities.some(e=>e.entityId==='alice-chair'),true);
  const elsewhere=new BrowserWorldClient({storage:disk,subjectId:'alice',serverId:'server-two'});
  assert.equal(elsewhere.snapshot.actors[0].needs.hunger,30);
  assert.equal(elsewhere.snapshot.entities.some(e=>e.entityId==='alice-chair'),false);
});

test('visitors can move but cannot mutate furniture or save a visited house over their own',async()=>{
  const client=new BrowserWorldClient({storage:storage(),snapshot:room()});await client.connect();
  const own=structuredClone(client.snapshot);client.enterVisitorSnapshot({...room('friend-home'),entities:[entity()]});
  await assert.rejects(client.dispatch({kind:'build.preview',payload:{baseRevision:0,ops:[]}}),/VISITOR_READ_ONLY/);
  await client.dispatch({kind:'actor.teleport',payload:{actorId:'whale',sceneId:'bedroom',position:[0,0,0]}});
  client.leaveVisitorSnapshot();assert.deepEqual(client.snapshot.entities,own.entities);assert.equal(client.worldId,own.worldId);
});

test('browser furniture validation enforces room bounds, distinct object IDs and stale plan versions',async()=>{
  const client=new BrowserWorldClient({storage:storage(),snapshot:room()});await client.connect();
  const op={kind:'entity.add',ref:'chair-one',sceneId:'bedroom',type:'chair',position:[1.5,0,-1],rotation:0,scale:[1,1,1]};
  await assert.rejects(client.dispatch({kind:'build.preview',payload:{baseRevision:0,ops:[{...op,position:[999,0,999]}]}}),/OUT_OF_BOUNDS/);
  assert.equal(client.snapshot.entities.length,0);
  const first=await client.dispatch({kind:'build.preview',payload:{baseRevision:0,ops:[op]}});
  const second=await client.dispatch({kind:'build.preview',payload:{baseRevision:0,ops:[op]}});
  await client.dispatch({kind:'build.apply',payload:{planId:second.planId}});
  await assert.rejects(client.dispatch({kind:'build.apply',payload:{planId:first.planId}}),/REVISION_CONFLICT/);
  assert.equal(client.snapshot.entities.length,1);
});

test('late furniture preview cannot apply after an account switch with the same scene and revision',async()=>{
  const gate=deferred(),disk=storage(),calls=[],scene={draft:false};
  const client={contextKey:'alice',snapshot:{worldId:'default',layoutRevision:0,entities:[]},dispatch:async command=>{calls.push(command.kind);await gate.promise;return {planId:'alice-plan'};}};
  const registry={scenes:new Map([['bedroom',scene]]),applySnapshot(){throw Error('old callback reached new room');}};
  const sync=new WorldLayoutSync({client,registry,sceneId:'bedroom',notify(){},storage:disk});
  sync.enqueue([entity()]);const flushing=sync.flush();
  client.contextKey='bob';registry.scenes.set('bedroom',{draft:false});gate.resolve();await flushing;
  assert.deepEqual(calls,['build.preview']);assert.equal(registry.scenes.get('bedroom').draft,false);
  const bob=new WorldLayoutSync({client,registry,sceneId:'bedroom',notify(){},storage:disk});
  assert.notEqual(sync.key,bob.key);assert.ok(disk.getItem(sync.key));sync.dispose();bob.dispose();
});

test('scene registry discards previous account drafts even when furniture IDs are identical',()=>{
  const registry=new SceneRegistry({scene:new THREE.Scene(),createFurniture:type=>{const object=new THREE.Group();object.userData.furnitureType=type;return object;}});
  const alice={...room(),_contextKey:'alice',entities:[entity()]};registry.applySnapshot(alice);
  const old=registry.entities.get('same-id');old.userData.editPreview=true;old.position.x=99;registry.scenes.get('bedroom').draft=true;
  registry.applySnapshot({...room(),_contextKey:'bob',entities:[entity('table')]});
  const current=registry.entities.get('same-id');assert.notEqual(current,old);
  assert.equal(current.userData.furnitureType,'table');assert.equal(current.position.x,1.5);assert.equal(registry.scene.getObjectById(old.id),undefined);
  registry.unload('bedroom');
});

test('late HTTP snapshot from a former world cannot replace the current player',async()=>{
  const gate=deferred();
  const client=new WorldClient({pollMs:0,transport:'http',request:async url=>{
    if(url==='/api/world/alice/snapshot')await gate.promise;
    const worldId=url.includes('/alice/')?'alice':'bob';
    const data=url.includes('/events')?{events:[],nextCursor:0}:room(worldId);
    return {ok:true,json:async()=>data};
  }});
  client.worldId='alice';client.snapshot=room('alice');const late=client.refresh();
  await client.switchWorld('bob');gate.resolve();await late;
  assert.equal(client.snapshot.worldId,'bob');client.dispose();
});

test('local guest and each account keep distinct houses and player needs across switches',async()=>{
  const disk=storage(),worlds=new Map([['guest',{chair:'guest-chair',hunger:77}]]);
  const client={worldId:'guest',async switchWorld(id){assert.ok(worlds.has(id));this.worldId=id;}};
  const profiles=new LocalAccountWorlds({client,storage:disk,createWorld:async id=>{worlds.set(id,{chair:null,hunger:30});await client.switchWorld(id);}});
  await profiles.setAccount('alice','server-one');const alice=client.worldId;worlds.get(alice).chair='alice-chair';worlds.get(alice).hunger=8;
  await profiles.setAccount('bob','server-one');assert.notEqual(client.worldId,alice);assert.equal(worlds.get(client.worldId).chair,null);assert.equal(worlds.get(client.worldId).hunger,30);
  await profiles.setAccount('alice','server-one');assert.equal(worlds.get(client.worldId).chair,'alice-chair');assert.equal(worlds.get(client.worldId).hunger,8);
  await profiles.setAccount('alice','server-two');assert.equal(worlds.get(client.worldId).chair,null);
  await profiles.setAccount(null);assert.equal(client.worldId,'guest');assert.equal(worlds.get(client.worldId).hunger,77);
});

test('changing browser scenes materializes that house furniture in the lazy renderer',async()=>{
  const client=new BrowserWorldClient({storage:storage()});
  const registry=new SceneRegistry({scene:new THREE.Scene(),lazy:true,legacy:{'public-lobby':()=>({root:new THREE.Group(),furniture:new THREE.Group()})},createFurniture:type=>{const object=new THREE.Group();object.userData.furnitureType=type;return object;}});
  client.onSnapshot(snapshot=>registry.applySnapshot(snapshot));await client.connect();client.startInPublicLobby();
  assert.equal([...registry.entities.values()].some(object=>object.userData.worldEntity.sceneId==='bedroom'),false);
  const previous=client.snapshot;await client.dispatch({kind:'actor.teleport',payload:{actorId:'whale',sceneId:'bedroom'}});
  assert.equal(previous.actors[0].sceneId,'public-lobby');
  assert.ok([...registry.entities.values()].some(object=>object.userData.worldEntity.sceneId==='bedroom'));
  for(const id of [...registry.scenes.keys()])registry.unload(id);
});
