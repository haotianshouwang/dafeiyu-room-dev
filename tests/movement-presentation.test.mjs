import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import {findPath} from '../shared/world/navigation.js';
import {damp,clamp} from '../src/core/anim.js';

test('unobstructed keyboard destinations stay on the requested straight line',()=>{
 const snapshot={scenes:[{sceneId:'room',templateId:'cozy_room_v1'}],entities:[]};
 const start=[.13,0,.17],goal=[.13+.8/Math.sqrt(2),0,.17+.8/Math.sqrt(2)];
 assert.deepEqual(findPath(snapshot,'room',start,goal),[goal]);
});
test('externally positioned character plays walk animation without moving itself twice',()=>{
 const source=fs.readFileSync(new URL('../src/characters/whaleMaid.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export class WhaleMaid','class WhaleMaid');
 const context={THREE,damp,clamp};vm.createContext(context);vm.runInContext(source+';globalThis.WhaleMaid=WhaleMaid;',context);
 const character=Object.create(context.WhaleMaid.prototype);const played=[];
 Object.assign(character,{pos:new THREE.Vector3(),target:new THREE.Vector3(),group:new THREE.Group(),pivot:new THREE.Group(),state:'swim',stateTime:0,heading:0,groundY:0,speedMax:1.4,externalMotion:{moving:true,speed:1.4},play:name=>played.push(name)});
 character.update(1/60,1);assert.equal(played.at(-1),'Walking');assert.equal(character.speed,1.4);assert.deepEqual(character.pos.toArray(),[0,0,0]);
 character.externalMotion={moving:false,speed:0};character.update(1/60,2);assert.equal(played.at(-1),'Idle');
});

test('network samples render at an even speed between updates and stop at the last known point',async()=>{
 const {ActorTimeline}=await import('../src/core/actor-timeline.js');const timeline=new ActorTimeline({delayMs:250});
 const actor=x=>({sceneId:'room',position:[x,0,0],rotation:0,pose:'walking'});
 timeline.push(actor(0),0);timeline.push(actor(.28),200);timeline.push(actor(.56),400);
 const positions=Array.from({length:11},(_,i)=>timeline.sample(450+i*10).position[0]);
 for(let i=1;i<positions.length;i++)assert.ok(Math.abs(positions[i]-positions[i-1]-.014)<1e-8);
 assert.equal(timeline.sample(2000).position[0],.56);
 timeline.push({...actor(8),sceneId:'yard'},2100);assert.equal(timeline.sample(2100).position[0],8);
});
