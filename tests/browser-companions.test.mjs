import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserWorldClient,createStarterSnapshot} from '../src/community/browser-world-client.js';
import {companionStorage,companionErrorText} from '../src/core/companion-storage.js';
import {petAssetUrl} from '../src/pets/pet-asset-url.js';

function memoryStorage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
const command=(client,kind,payload={})=>client.dispatch({kind,payload:{actorId:'whale',...payload}});

test('pet model URLs follow both local and community game entry paths',()=>{
 assert.equal(petAssetUrl('/resources/character/models/baize.glb','https://example.test/game/'),'https://example.test/game/resources/character/models/baize.glb');
 assert.equal(petAssetUrl('/resources/character/models/baize.glb','http://127.0.0.1:5200/?ui=harbor'),'http://127.0.0.1:5200/resources/character/models/baize.glb');
});

test('offline browser can initialize and hatch eggs, reload, and keep another account separate',async()=>{
 const storage=memoryStorage(),a=new BrowserWorldClient({storage,serverId:'test',subjectId:'alice'});
 await a.connect('default');
 const start=await command(a,'pet.bootstrap');
 assert.equal(start.eggs.length,2);
 await command(a,'pet.bootstrap');
 assert.equal(a.snapshot.pets.owners.whale.eggs.length,2,'bootstrap is idempotent');
 const eggId=start.eggs[0].eggId;
 const result=await command(a,'pet.hatchEgg',{eggId});
 assert.equal(typeof result.petId,'string');
 assert.equal(Object.keys(a.snapshot.pets.owners.whale.instances).length,1);
 await assert.rejects(command(a,'pet.hatchEgg',{eggId}),/EGG_NOT_FOUND/);
 const reload=new BrowserWorldClient({storage,serverId:'test',subjectId:'alice'});
 assert.equal(Object.keys(reload.snapshot.pets.owners.whale.instances).length,1);
 const b=new BrowserWorldClient({storage,serverId:'test',subjectId:'bob'});
 await b.connect('default');await command(b,'pet.bootstrap');
 assert.equal(Object.keys(b.snapshot.pets.owners.whale.instances).length,0);
 assert.equal(b.snapshot.pets.owners.whale.eggs.every(egg=>!egg.hatched),true);
 a.dispose();b.dispose();reload.dispose();
});

test('browser items persist and visiting another home cannot modify its companions',async()=>{
 const storage=memoryStorage(),a=new BrowserWorldClient({storage,subjectId:'alice'});
 await a.connect('default');
 await command(a,'item.import',{state:{version:1,inventory:{poop:3}}});
 assert.equal(a.snapshot.items.owners.whale.inventory.poop,3);
 const reload=new BrowserWorldClient({storage,subjectId:'alice'});
 assert.equal(reload.snapshot.items.owners.whale.inventory.poop,3);
 const b=new BrowserWorldClient({storage,subjectId:'bob'});await b.connect('default');
 await command(b,'item.import',{state:{}});assert.equal(b.snapshot.items.owners.whale.inventory.poop??0,0);
 const before=structuredClone(a.snapshot);
 a.enterVisitorSnapshot(createStarterSnapshot({worldId:'friend-home'}));
 for(const kind of ['pet.bootstrap','pet.hatchEgg','item.import','item.poop'])await assert.rejects(command(a,kind),/VISITOR_READ_ONLY/);
 a.leaveVisitorSnapshot();assert.deepEqual(a.snapshot.items,before.items);a.dispose();b.dispose();reload.dispose();
});

test('legacy cache belongs only to the original guest; scoped writes cannot reach another account',()=>{
 const storage=memoryStorage();storage.setItem('pets','old-guest');
 const guest=companionStorage(storage,'guest',{allowLegacy:true}),alice=companionStorage(storage,'alice'),bob=companionStorage(storage,'bob');
 assert.equal(guest.getItem('pets'),'old-guest');assert.equal(alice.getItem('pets'),null);
 alice.setItem('pets','alice-pet');assert.equal(bob.getItem('pets'),null);assert.equal(guest.getItem('pets'),'old-guest');
 assert.equal(companionStorage(storage,'alice').getItem('pets'),'alice-pet');
 assert.equal(companionErrorText(Error('WORLD_CONTEXT_CHANGED')),'');
});

test('map destinations can create the forest in single player and teleport to its lake',async()=>{
 const client=new BrowserWorldClient({storage:memoryStorage()});await client.connect('default');
 await command(client,'actor.teleport',{templateId:'forest_v1',landmarkId:'summit-lake'});
 const actor=client.snapshot.actors.find(actor=>actor.actorId==='whale');
 assert.equal(client.snapshot.scenes.some(scene=>scene.sceneId===actor.sceneId&&scene.templateId==='forest_v1'),true);
 assert.equal(actor.position.every(Number.isFinite),true);
 const before=structuredClone(actor.position);
 await assert.rejects(command(client,'actor.teleport',{sceneId:actor.sceneId,landmarkId:'missing'}),/LANDMARK_NOT_FOUND/);
 assert.deepEqual(client.snapshot.actors[0].position,before);client.dispose();
});
