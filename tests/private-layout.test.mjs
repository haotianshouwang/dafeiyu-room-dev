import test from 'node:test';
import assert from 'node:assert/strict';
import {createStarterSnapshot} from '../src/community/browser-world-client.js';
import {mergePrivateLayoutWithPublic,privateCloudSnapshot} from '../src/community/private-layout.js';
import {encodeCloudLayout,normalizeCloudLayout} from '../shared/world/cloud-layout.js';

test('private cloud export excludes public maps and never includes model or texture bytes',()=>{
  const snapshot=createStarterSnapshot({worldId:'home'});
  snapshot.entities.push({entityId:'local-chair',sceneId:'bedroom',type:'chair',position:[1,0,1],rotation:0,scale:[1,1,1],model_path:'/secret/chair.glb',texture_bytes:'AAAA'});
  const privateSnapshot=privateCloudSnapshot(snapshot);
  assert.equal(privateSnapshot.scenes.some(scene=>scene.templateId==='public_lobby_v1'),false);
  assert.equal(privateSnapshot.scenes.some(scene=>scene.templateId==='coastal_town_v1'),false);
  const serialized=JSON.stringify(encodeCloudLayout(privateSnapshot).layout);
  assert.doesNotMatch(serialized,/model_path|texture_bytes|data:model/);
  assert.ok(serialized.length<100_000);
});

test('pulling a private cloud layout keeps local public maps and their positions',()=>{
  const base=createStarterSnapshot({worldId:'local'});
  base.entities.push({entityId:'public-bench',sceneId:'public-lobby',type:'chair',position:[3,0,4],rotation:0,scale:[1,1,1]});
  const remote=normalizeCloudLayout({
    format:'dafeiyu-layout',format_version:1,
    world:{source_world_id:'cloud',name:'云私宅'},
    layout_revision:9,topology_revision:2,
    scenes:[
      {sceneId:'bedroom',name:'云端卧室',templateId:'cozy_room_v1',status:'active'},
      {sceneId:'public-lobby',name:'不应覆盖',templateId:'public_lobby_v1',status:'active'}
    ],
    entities:[{entityId:'chair-1',sceneId:'bedroom',type:'chair',position:[1,0,1],rotation:0,scale:[1,1,1]}],
    portals:[]
  });
  const merged=mergePrivateLayoutWithPublic(remote,base);
  assert.equal(merged.scenes.find(scene=>scene.sceneId==='public-lobby').name,'星港公共大厅');
  assert.equal(merged.scenes.find(scene=>scene.sceneId==='bedroom').name,'云端卧室');
  assert.equal(merged.entities.filter(entity=>entity.sceneId==='public-lobby').length,1);
  assert.deepEqual(merged.entities.find(entity=>entity.entityId==='public-bench').position,[3,0,4]);
  assert.equal(merged.entities.some(entity=>entity.entityId==='chair-1'),true);
});
