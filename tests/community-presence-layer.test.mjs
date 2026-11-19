import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CommunityPresenceLayer } from '../src/community/presence-layer.js';

function installCanvasDocument() {
  const previous=globalThis.document;
  const context={fillRect(){},beginPath(){},roundRect(){},fill(){},moveTo(){},lineTo(){},closePath(){},fillText(){}};
  globalThis.document={baseURI:'http://127.0.0.1/game/',createElement:()=>({width:0,height:0,getContext:()=>context})};
  return ()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;};
}

test('remote community players replace the placeholder with a per-player GLB clone and stay scene-scoped',async()=>{
  const restore=installCanvasDocument();
  const scene=new THREE.Scene();
  const model=new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial()));
  const layer=new CommunityPresenceLayer({scene,localUserId:'alice',loadModel:async()=>({scene:model,animations:[]})});
  try {
    layer.setLocalScene('home-a');
    layer.update(new Map([['alice',{user_id:'alice',position:[0,0,0],scene_id:'home-a'}],['bob',{user_id:'bob',display_name:'Bob',position:[2,0,3],scene_id:'home-a',pose:'idle'}]]));
    const remote=layer.players.get('bob');
    assert.equal(remote.group.visible,true);
    assert.equal(remote.group.children.some(child=>child.isSprite),true);
    assert.equal(remote.figure.children.some(child=>child.geometry?.type==='CapsuleGeometry'),true);
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.ok(remote.model,'the shared GLB load is cloned for the remote player');
    assert.equal(remote.model.children.some(child=>child.isMesh),true);
    assert.equal(remote.group.children.some(child=>child===remote.figure),false,'the capsule placeholder is removed when the model loads');
    assert.equal(remote.group.position.x,2);
    layer.setLocalScene('home-b');
    assert.equal(remote.group.visible,false);
    layer.update(new Map());
    assert.equal(layer.players.has('bob'),false);
    assert.equal(remote.model.parent,null);
  } finally {
    layer.dispose();
    restore();
  }
});

test('remote model loading retries after a transient asset failure',async()=>{
  const restore=installCanvasDocument();
  const scene=new THREE.Scene();
  const model=new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial()));
  let attempts=0;
  const layer=new CommunityPresenceLayer({scene,localUserId:'alice',loadModel:async()=>{
    attempts++;
    if(attempts===1)throw Error('temporary network failure');
    return {scene:model,animations:[]};
  }});
  try{
    layer.update(new Map([['bob',{user_id:'bob',position:[2,0,3],scene_id:'home-a'}]]));
    await new Promise(resolve=>setTimeout(resolve,1100));
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(attempts,2);
    assert.ok(layer.players.get('bob').model);
  }finally{
    layer.dispose();
    restore();
  }
});

test('remote community players follow the transmitted GLB action and revision clock',async()=>{
  const restore=installCanvasDocument();const scene=new THREE.Scene(),model=new THREE.Group();
  const track=()=>new THREE.VectorKeyframeTrack('.position',[0,1],[0,0,0,1,0,0]);
  const clips=[new THREE.AnimationClip('HumanSpDancingTwerk',2,[track()]),new THREE.AnimationClip('HumanSpForwardJump',1,[track()])];
  const layer=new CommunityPresenceLayer({scene,localUserId:'alice',loadModel:async()=>({scene:model,animations:clips})});
  try{
    const data={user_id:'bob',display_name:'Bob',position:[2,0,3],scene_id:'home-a',animation_clip:'HumanSpDancingTwerk',animation_time:.7,animation_speed:1,animation_loop:false,animation_revision:4,server_time_ms:Date.now()};
    layer.setLocalScene('home-a');layer.update(new Map([['bob',data]]));await new Promise(resolve=>setTimeout(resolve,0));
    const remote=layer.players.get('bob');assert.equal(remote.networkClip,'HumanSpDancingTwerk');assert.equal(remote.networkRevision,4);assert.ok(remote.activeAction.isRunning());assert.ok(remote.activeAction.time>=.69);
    const next={...data,animation_clip:'HumanSpForwardJump',animation_revision:5};layer.update(new Map([['bob',next]]));assert.equal(remote.networkClip,'HumanSpForwardJump','a new animation revision switches actions');
  }finally{layer.dispose();restore();}
});

test('a stopped player returns to idle and keeps the transmitted jump height',async()=>{
  const restore=installCanvasDocument(), scene=new THREE.Scene(), model=new THREE.Group();
  const clips=['HumanSpDwarfIdle','HumanSpWalking6'].map(name=>new THREE.AnimationClip(name,2,[]));
  const layer=new CommunityPresenceLayer({scene,localUserId:'alice',loadModel:async()=>({scene:model,animations:clips})});
  try{
    const data={user_id:'bob',position:[2,0,3],render_position:[2,1.6,3],scene_id:'home',moving:true,pose:'walking'};
    layer.update(new Map([['bob',data]]));await new Promise(resolve=>setTimeout(resolve,0));
    const remote=layer.players.get('bob');
    assert.equal(remote.activeAction.getClip().name,'HumanSpWalking6');
    assert.equal(remote.group.position.y,1.6,'display height includes the local jump arc');
    layer.update(new Map([['bob',{...data,moving:false,pose:'idle',render_position:[2,.025,3]}]]));
    assert.equal(remote.activeAction.getClip().name,'HumanSpDwarfIdle','the received pose must not overwrite the animation state before comparison');
    layer.advance(.05);assert.ok(remote.group.position.y<1.6);
    for(let i=0;i<6;i++)layer.advance(.05);
    assert.equal(remote.actions.get('HumanSpWalking6').isRunning(),false,'retired actions are stopped after the crossfade');
  }finally{layer.dispose();restore();}
});

test('network animation follows a paused clip and speed changes without restarting the revision',async()=>{
  const restore=installCanvasDocument(),model=new THREE.Group();
  const layer=new CommunityPresenceLayer({scene:new THREE.Scene(),localUserId:'alice',loadModel:async()=>({scene:model,animations:[new THREE.AnimationClip('HumanSpForwardJump',3,[])]})});
  try{
    const data={user_id:'bob',position:[0,0,0],animation_clip:'HumanSpForwardJump',animation_time:.6,animation_speed:1,animation_loop:false,animation_paused:true,animation_revision:2,server_time_ms:Date.now()-1500};
    layer.update(new Map([['bob',data]]));await new Promise(resolve=>setTimeout(resolve,0));
    const remote=layer.players.get('bob');assert.equal(remote.activeAction.time,.6);
    layer.advance(.05);assert.equal(remote.activeAction.time,.6,'paused jump poses do not advance on the remote rig');
    layer.update(new Map([['bob',{...data,animation_paused:false,animation_speed:1.8,server_time_ms:Date.now()}]]));
    assert.equal(remote.activeAction.getEffectiveTimeScale(),1.8);
    layer.advance(.05);assert.ok(remote.activeAction.time>.6);
  }finally{layer.dispose();restore();}
});

test('swim form replaces the land model and leaving water restores it',async()=>{
  const restore=installCanvasDocument(),model=new THREE.Group();
  const swimmer={group:new THREE.Group(),pos:new THREE.Vector3(),target:new THREE.Vector3(),update(){}};
  const layer=new CommunityPresenceLayer({scene:new THREE.Scene(),localUserId:'alice',loadModel:async()=>({scene:model,animations:[]}),createSwimCharacter:()=>swimmer});
  try{
    const data={user_id:'bob',position:[0,0,0],render_position:[0,.38,0],form:'swim'};
    layer.update(new Map([['bob',data]]));await new Promise(resolve=>setTimeout(resolve,0));
    const remote=layer.players.get('bob');assert.equal(remote.model.visible,false);assert.equal(swimmer.group.visible,true);
    layer.advance(.05);assert.deepEqual(swimmer.group.position.toArray(),[0,0,0]);
    layer.update(new Map([['bob',{...data,form:'normal',render_position:[0,.025,0]}]]));
    assert.equal(remote.model.visible,true);assert.equal(swimmer.group.visible,false);
  }finally{layer.dispose();restore();}
});
