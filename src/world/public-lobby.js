import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {clay, glow} from '../core/materials.js';
import {tex} from '../core/textures.js';

function stoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = '#c9c1ad';
  context.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const shade = 155 + Math.round(Math.random() * 55);
    context.fillStyle = `rgba(${shade},${shade - 4},${shade - 14},${.06 + Math.random() * .12})`;
    context.beginPath();
    context.arc(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 16, 0, Math.PI * 2);
    context.fill();
  }
  context.strokeStyle = 'rgba(105,96,82,.22)';
  context.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    context.beginPath();
    context.moveTo(i, 0);
    context.lineTo(i, 512);
    context.stroke();
    context.beginPath();
    context.moveTo(0, i);
    context.lineTo(512, i);
    context.stroke();
  }
  return canvas;
}

function rounded(width, height, depth, radius, material) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 4, radius), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function bench(x, z, rotation = 0) {
  const group = new THREE.Group();
  const wood = clay(0x9a6f4b, {roughness:.78});
  const metal = clay(0x4f5c63, {roughness:.5});
  const seat = rounded(3.2, .16, .72, .08, wood);
  seat.position.y = .72;
  const back = rounded(3.2, .85, .14, .06, wood);
  back.position.set(0, 1.12, -.34);
  back.rotation.x = -.12;
  group.add(seat, back);
  for (const side of [-1.15, 1.15]) {
    const leg = rounded(.14, .68, .14, .03, metal);
    leg.position.set(side, .34, 0);
    group.add(leg);
  }
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  return group;
}

function lamp(x, z) {
  const group = new THREE.Group();
  const metal = clay(0x44525a, {roughness:.44, metalness:.25});
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.09, .13, 4.2, 10), metal);
  pole.position.y = 2.1;
  pole.castShadow = true;
  const lampMat = new THREE.MeshStandardMaterial({color:0xffd394, emissive:0xffb55c, emissiveIntensity:1.5, roughness:.35});
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.28, 18, 12), lampMat);
  bulb.position.y = 4.25;
  group.add(pole, bulb);
  group.position.set(x, 0, z);
  return group;
}

function treePlanter(x, z) {
  const group = new THREE.Group();
  const planter = rounded(3.3, .62, 3.3, .18, clay(0x74604f, {roughness:.9}));
  planter.position.y = .31;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.22, .32, 2.4, 9), clay(0x73513b, {roughness:.95}));
  trunk.position.y = 1.55;
  trunk.castShadow = true;
  group.add(planter, trunk);
  for (let i = 0; i < 7; i++) {
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(.95 + (i % 3) * .15, 1),
      new THREE.MeshStandardMaterial({color:i % 2 ? 0x5b8b64 : 0x6b9b68, roughness:.92})
    );
    crown.position.set(Math.cos(i * 2.2) * .78, 2.7 + Math.sin(i * 1.7) * .6, Math.sin(i * 2.2) * .78);
    crown.castShadow = true;
    group.add(crown);
  }
  group.position.set(x, 0, z);
  return group;
}

function portalGate(x,z,rotation,label,color) {
  const group=new THREE.Group();
  const stone=clay(0x829489,{roughness:.7});
  const trim=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.55,roughness:.3});
  for(const side of [-1,1]){
    const pillar=new THREE.Mesh(new THREE.BoxGeometry(.34,2.65,.36),stone);
    pillar.position.set(side*1.28,1.32,0);pillar.castShadow=true;group.add(pillar);
    const cap=new THREE.Mesh(new THREE.BoxGeometry(.52,.18,.54),trim);
    cap.position.set(side*1.28,2.61,0);group.add(cap);
  }
  const lintel=new THREE.Mesh(new THREE.BoxGeometry(3.02,.34,.4),stone);
  lintel.position.y=2.81;lintel.castShadow=true;group.add(lintel);
  const inset=new THREE.Mesh(new THREE.BoxGeometry(2.35,.11,.08),trim);
  inset.position.set(0,2.82,.23);group.add(inset);
  const pad=new THREE.Mesh(new THREE.RingGeometry(1.35,1.55,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.54,side:THREE.DoubleSide}));
  pad.rotation.x=-Math.PI/2;pad.position.y=.025;group.add(pad);
  const arrow=new THREE.Mesh(new THREE.ConeGeometry(.24,.48,4),trim);
  arrow.rotation.x=Math.PI/2;arrow.position.set(0,.14,-.76);group.add(arrow);
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=96;
  const context=canvas.getContext('2d');context.fillStyle='#f3f4e7';context.font='700 36px system-ui,sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(label,192,48);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.85,.46),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide}));
  sign.position.set(0,3.32,0);group.add(sign);
  group.position.set(x,0,z);group.rotation.y=rotation;
  return group;
}

export function buildPublicLobby() {
  const group = new THREE.Group();
  const groundTexture = tex(stoneTexture(), {repeat:[8, 6], aniso:12});
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(56, 44),
    new THREE.MeshStandardMaterial({map:groundTexture, roughness:.88, envMapIntensity:.35})
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.02;
  ground.receiveShadow = true;
  group.add(ground);

  const rim = new THREE.Mesh(new THREE.RingGeometry(7.7, 8.2, 64), new THREE.MeshStandardMaterial({color:0xd9c597, roughness:.5, metalness:.08}));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = .018;
  group.add(rim);

  const fountain = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.5, .62, 48), clay(0xc4b89c, {roughness:.72}));
  base.position.y = .31;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.82, 2.82, .12, 48), new THREE.MeshPhysicalMaterial({color:0x72b9d1, roughness:.12, metalness:.05, transparent:true, opacity:.86}));
  water.position.y = .64;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(.34, .55, 2.5, 24), clay(0xb9a98b, {roughness:.68}));
  column.position.y = 1.75;
  const crown = new THREE.Mesh(new THREE.TorusGeometry(1.15, .1, 10, 48), new THREE.MeshBasicMaterial({color:0x86d9ee}));
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 2.45;
  const light = new THREE.PointLight(0x83dcff, .75, 8, 2);
  light.position.y = 1.7;
  fountain.add(base, water, column, crown, light);
  group.add(fountain);

  const stage = rounded(8.2, .55, 5.4, .12, clay(0x725c54, {roughness:.8}));
  stage.position.set(-20, .27, -15);
  group.add(stage);
  const stageBack = rounded(7.4, 3.4, .35, .1, clay(0x5d4751, {roughness:.72}));
  stageBack.position.set(-20, 2.05, -17.45);
  group.add(stageBack);
  const marquee = new THREE.Mesh(new THREE.BoxGeometry(7.5, .45, .75), new THREE.MeshBasicMaterial({color:0xf0b36f}));
  marquee.position.set(-20, 4.0, -17.05);
  group.add(marquee);

  const kiosk = rounded(6.5, 3.2, 5.2, .22, clay(0xd4b891, {roughness:.72}));
  kiosk.position.set(19, 1.6, 14);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.3, 1.7, 4), clay(0x9b5e58, {roughness:.7}));
  roof.position.set(19, 4.05, 14);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(kiosk, roof);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.1, .16), glow(0xffe1a3, {intensity:.35}));
  sign.position.set(19, 2.5, 11.35);
  group.add(sign);

  for (const [x, z, r] of [[-9,6,Math.PI/2],[9,6,-Math.PI/2],[-9,-6,Math.PI/2],[9,-6,-Math.PI/2],[0,-10,0],[0,10,Math.PI]]) group.add(bench(x,z,r));
  for (const [x,z] of [[-14,-18],[14,-18],[-14,18],[14,18],[-24,0],[24,0],[-7,-17],[7,-17],[-7,17],[7,17]]) group.add(lamp(x,z));
  for (const [x,z] of [[-25,-19],[-25,19],[25,-19],[25,19],[-12,-19],[12,-19],[-12,19],[12,19]]) group.add(treePlanter(x,z));
  group.add(portalGate(26.25,0,-Math.PI/2,'商业街',0xe99d84));

  return group;
}
