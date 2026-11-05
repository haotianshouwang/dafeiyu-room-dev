import {buildJapaneseHome} from './japanese-house.js';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
const mats=new Map();
function mat(color,glow=false){const key=`${color}:${glow}`;if(!mats.has(key))mats.set(key,new THREE.MeshStandardMaterial({color,roughness:glow?.4:.72,emissive:glow?color:0,emissiveIntensity:glow?1.1:0}));return mats.get(key);}
function box(root,w,h,d,color,x=0,y=0,z=0,glow=false){const m=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(.035,w/5,h/5,d/5)),mat(color,glow));m.position.set(x,y,z);m.castShadow=!glow;m.receiveShadow=true;root.add(m);return m;}
function cylinder(root,r,h,color,x,y,z){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,12),mat(color));m.position.set(x,y,z);m.castShadow=true;root.add(m);return m;}
function sign(root,text,w,h,x,y,z,{bg='#f5f5de',fg='#23594e',rotation=0}={}){
 let material=new THREE.MeshBasicMaterial({color:bg});
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.round(1024*h/w);const ctx=canvas.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle=fg;ctx.font=`600 ${Math.round(canvas.height*.55)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,canvas.height*.53,980);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;material=new THREE.MeshBasicMaterial({map:texture});
 }
 const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);m.position.set(x,y,z);m.rotation.y=rotation;root.add(m);return m;
}
function goods(root,x,y,z,side=false){const colors=[0x7bc2ab,0xefb273,0x9ba4dd,0xf0db8e,0xec879c,0x8ac4dc];for(let row=0;row<3;row++){box(root,side?.35:1.45,.035,side?1.45:.35,0xe4d8bd,x,y+row*.37,z);for(let col=0;col<6;col++){const xx=side?x:x+(col-2.5)*.215,zz=side?z+(col-2.5)*.215:z;box(root,.13,.24,.13,colors[(col+row)%colors.length],xx,y+.135+row*.37,zz);}}}
function building(){
 const g=new THREE.Group();g.name='whale-mart-building';
 box(g,6.3,.18,4.3,0x534c54,0,.09,0);box(g,6,.28,4,0xddd4b9,0,.3,0);
 box(g,6,2.6,.16,0xddd7c9,0,1.72,-1.94);box(g,.16,2.6,4,0xddd7c9,-2.92,1.72,0);box(g,.16,.55,4,0xd3c9b8,2.92,.65,0);
 // Open front glazing reveals real shelf geometry rather than a flat facade.
 box(g,6,.5,.16,0xded6c5,0,.65,1.94);box(g,6,.55,.16,0xe7e1ce,0,2.76,1.94);
 const glass=new THREE.MeshPhysicalMaterial({color:0x7da4a2,transparent:true,opacity:.21,roughness:.12,metalness:.1,depthWrite:false});
 for(const x of [-2.78,-.95,.95,2.78])box(g,.065,1.85,.09,0x494d4d,x,1.67,2.02);
 for(const x of [-1.87,0,1.87]){const pane=new THREE.Mesh(new THREE.PlaneGeometry(1.75,1.75),glass);pane.position.set(x,1.65,2.035);g.add(pane);}
 for(const x of [-1.85,.15,1.95])goods(g,x,.9,1.5);
 for(const z of [-1.1,.5])goods(g,2.68,.9,z,true);
 const sideGlass=new THREE.Mesh(new THREE.PlaneGeometry(3.7,1.75),glass);sideGlass.rotation.y=Math.PI/2;sideGlass.position.set(3.015,1.65,0);g.add(sideGlass);
 for(const z of [-1.8,0,1.8])box(g,.08,1.85,.065,0x494d4d,3.04,1.67,z);
 // Sliding door and warm entrance canopy.
 box(g,.9,2.15,.07,0x718480,-1.83,1.45,2.09);box(g,.035,.48,.04,0xe1e4d7,-1.52,1.5,2.145);
 sign(g,'OPEN',.52,.2,-1.82,1.9,2.14,{bg:'#1a5b51',fg:'#f4e9a8'});
 box(g,1.7,.09,.75,0x54545a,-1.83,2.6,2.2);box(g,1.5,.035,.6,0xffdc9b,-1.83,2.54,2.2,true);
 box(g,6.2,.6,.15,0xeee9d9,0,3.05,2.035);box(g,6.2,.07,.19,0x56aa8d,0,2.76,2.04,true);box(g,6.2,.055,.19,0xe8ab5d,0,3.35,2.04,true);
 sign(g,'大肥鱼便利店  ·  24H',5.8,.44,0,3.07,2.125);
 box(g,.15,.6,4.1,0xeee9d9,3.035,3.05,0);sign(g,'WHALE MART',3.7,.42,3.12,3.06,0,{rotation:Math.PI/2});
 // Flat roof, parapet, HVAC and fine rail silhouette.
 box(g,6.45,.18,4.4,0x45424c,0,3.47,0);for(const x of [-3.12,3.12])box(g,.1,.22,4.3,0x56525c,x,3.65,0);for(const z of [-2.1,2.1])box(g,6.25,.22,.1,0x56525c,0,3.65,z);
 box(g,1.6,.48,1.05,0x737780,.6,3.84,-.55);for(let i=0;i<6;i++)box(g,1.3,.025,.025,0x3c444e,.6,3.73+i*.05,0);
 for(const x of [-2.65,2.65]){cylinder(g,.025,.6,0x303840,x,3.97,-1.55);box(g,.08,.08,.08,0x56616c,x,4.27,-1.55);}box(g,5.3,.035,.035,0x303840,0,4.22,-1.55);
 const warm=new THREE.PointLight(0xffd39a,3,7,2);warm.position.set(0,1.9,1.5);g.add(warm);
 const spill=new THREE.PointLight(0x8ddcba,1,5,2);spill.position.set(.6,2.7,2.45);g.add(spill);
 return g;
}
function vending(){const g=new THREE.Group();box(g,1.02,2.18,.8,0xcbd7da,0,1.09,0);box(g,.84,1.55,.04,0xe8f5ef,0,1.3,.425,true);for(let row=0;row<4;row++)for(let col=0;col<5;col++){const color=[0x7dc6df,0xe89983,0xe6cc78,0xa3cbaa,0xa6a2ce][col];cylinder(g,.05,.2,color,(col-2)*.145,.84+row*.3,.47);}box(g,.38,.09,.05,0x26333e,0,.28,.44);sign(g,'DRINKS',.8,.2,0,2,.455,{bg:'#45758f',fg:'#fff6e1'});const light=new THREE.PointLight(0x9dd8ff,.8,3,2);light.position.set(0,1.2,.7);g.add(light);return g;}
function lamp(){const g=new THREE.Group();cylinder(g,.13,.16,0x4a4c57,0,.08,0);cylinder(g,.045,4.8,0x51535d,0,2.45,0);box(g,1.05,.065,.065,0x51535d,.48,4.8,0);box(g,.48,.1,.28,0xffdda0,.95,4.76,0,true);const light=new THREE.PointLight(0xffce8f,0,9,2);light.position.set(.95,4.55,0);g.add(light);for(const child of g.children)child.position.x-=.5;return g;}
function car(){const g=new THREE.Group();box(g,2.25,.5,1.05,0x34475e,0,.52,0);box(g,1.35,.52,.94,0x2f4257,-.15,.96,0);box(g,1.15,.36,.95,0x243646,-.15,1,0);for(const x of [-.7,.7])for(const z of [-.52,.52]){const wheel=cylinder(g,.22,.13,0x232530,x,.29,z);wheel.rotation.x=Math.PI/2;}for(const z of [-.32,.32]){box(g,.04,.14,.2,0xffcd95,1.14,.61,z,true);box(g,.04,.13,.18,0xe95475,-1.14,.61,z,true);}return g;}
export const STORE_FURNITURE={shopBuilding:{label:'便利店',icon:'🏪',make:building},shopVending:{label:'自动售货机',icon:'🥤',make:vending},shopLamp:{label:'街道路灯',icon:'💡',make:lamp},shopCar:{label:'小汽车',icon:'🚙',make:car}};
export function buildStoreStreet(){
 const g=new THREE.Group();g.name='store-street-shell';
 const floor=box(g,13,.28,13,0x2a2b37,0,-.18,0);floor.material=new THREE.MeshStandardMaterial({color:0x687176,roughness:.88,metalness:.02});
 box(g,9,.11,6.3,0x65616b,.7,-.005,-2);box(g,9,.07,.1,0xc7a16c,.7,.07,1.18);
 // Fine sidewalk tiles and parking space paint.
 for(let i=0;i<12;i++)box(g,.012,.006,6.2,0x55535e,-3.45+i*.75,.055,-2);
 for(let i=0;i<5;i++){const z=-4.5+i*1.25;box(g,2.1,.009,.055,0xa6a9b1,-4.85,.012,z);}box(g,.055,.009,5,0xa6a9b1,-3.8,.012,-2);
 for(let i=0;i<10;i++)box(g,.32,.009,2.1,0xd2d2d2,-2.25+i*.5,.012,4.55);
 box(g,3.8,.009,.05,0xddd3bb,4,.012,5.55);box(g,.05,.009,1.75,0xddd3bb,2.15,.012,4.7);box(g,.05,.009,1.75,0xddd3bb,5.85,.012,4.7);
 for(const [x,z,w,d] of [[-4.7,1.6,1.8,.65],[1.6,2.3,2,.6],[-1.8,5.8,1,.35],[5.3,1.1,.8,.35]]){const p=new THREE.Mesh(new THREE.CircleGeometry(1,32),new THREE.MeshStandardMaterial({color:0x667b87,roughness:.1,metalness:.55,transparent:true,opacity:.3}));p.rotation.x=-Math.PI/2;p.scale.set(w/2,d/2,1);p.position.set(x,.016,z);g.add(p);}
 for(const x of [-2.8,2.7]){const cover=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,.012,24),mat(0x171d28));cover.position.set(x,.013,3.3);g.add(cover);}
 g.add(buildJapaneseHome());
 return g;
}

// Local +Z points into the street. Extend the road beyond the scene edge.
export function buildStreetExitRoad(side){
 const road=new THREE.Group();road.name='street-exit-road';
 road.rotation.y=({north:0,south:Math.PI,west:Math.PI/2,east:-Math.PI/2})[side]||0;
 const asphalt=box(road,2.4,.045,3.8,0x687176,0,-.03,.6);asphalt.castShadow=false;
 for(const x of [-1.25,1.25]){box(road,.16,.12,3.8,0xcfc7b5,x,.015,.6);box(road,.045,.008,3.5,0xe1cb97,x*.86,.003,.6);}
 for(const z of [-.7,.15,1,1.85])box(road,.065,.008,.42,0xf0dfb6,0,.004,z);
 return road;
}
