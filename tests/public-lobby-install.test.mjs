import test from 'node:test';
import assert from 'node:assert/strict';
import {buildServer} from '../server/app.js';
import {installPublicLobby} from '../server/world/public-lobby-feature.js';
import {createStarterSnapshot} from '../src/community/browser-world-client.js';

test('fresh local worlds include the public lobby and a commercial-street exit, without private-house portals',async()=>{
 const app=await buildServer({databasePath:':memory:',worldMode:true,startRuntime:false});
 try{
  const service=app.worldService,snapshot=service.readSnapshot('default');
  assert.equal(snapshot.scenes.filter(scene=>scene.sceneId==='public-lobby').length,1);
  const exits=snapshot.portals.filter(portal=>[portal.from?.sceneId,portal.to?.sceneId].includes('public-lobby'));
  assert.equal(exits.length,1);assert.equal(exits[0].to.sceneId,'convenience-store');
  assert.equal(exits[0].to.slotId,'south');
  const browserExit=createStarterSnapshot().portals.find(portal=>portal.id==='lobby-exit-commercial-street');
  assert.deepEqual(browserExit,exits[0]);
  assert.equal(['bedroom','living','yard'].includes(exits[0].to.sceneId),false);
  const before=service.readSnapshot('default');assert.equal(installPublicLobby(service).installed,false);
  assert.deepEqual(service.readSnapshot('default'),before);
 }finally{await app.close();}
});
