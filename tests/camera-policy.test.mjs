import test from 'node:test';
import assert from 'node:assert/strict';
import {IsoCamera} from '../src/core/camera.js';
import {cameraPolicyFor} from '../shared/world/policies.js';
globalThis.window={innerWidth:1200,innerHeight:800};
test('immutable profiles survive pointer drag resize follow and 100 scene switches',()=>{
 const c=new IsoCamera();const p=cameraPolicyFor('cozy_room_v1');assert.ok(Object.isFrozen(p));assert.equal(p.az,Math.PI/4);
 let expected;
 for(let i=0;i<100;i++){
  const outdoor=i%2===1;c.setProfile(outdoor?'courtyard_v1':'cozy_room_v1');c.setPointer(1,-1);c.addDrag(.5);window.innerWidth=400+i*13;c.resize();c.follow({x:i,y:90,z:-i},.1,true);c.update(.1);
  const height=c.camera.position.y;
  expected??=height;assert.ok(Math.abs(height-expected)<1e-10);assert.equal(c.el,p.el);if(!outdoor){assert.ok(c.drag>0);assert.ok(c.drag<=p.horizontalDragLimit);}else assert.ok(c.drag>0);
 }
});

test('indoor left drag has a bounded horizontal sway while height and pitch stay fixed',()=>{
 const c=new IsoCamera();c.update(.1);const height=c.camera.position.y,pitch=c.el;
 c.addDrag(100);for(let i=0;i<100;i++)c.update(.1);
 assert.ok(c.drag>0&&c.drag<=Math.PI*8/180+1e-10);assert.equal(c.camera.position.y,height);assert.equal(c.el,pitch);
 c.addDrag(-200);for(let i=0;i<100;i++)c.update(.1);
 assert.ok(c.drag<0&&c.drag>=-Math.PI*8/180-1e-10);assert.equal(c.camera.position.y,height);
 c.setProfile('courtyard_v1');c.addDrag(Math.PI);for(let i=0;i<100;i++)c.update(.1);assert.ok(c.drag>3);
 c.setProfile('cozy_room_v1');assert.equal(c.drag,0);assert.equal(c.dragTarget,0);
});
