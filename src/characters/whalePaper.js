import * as THREE from 'three';
import characterConfig from 'virtual:character-config';
import { WhaleMaid } from './whaleMaid.js';
import { damp } from '../core/anim.js';

// Single-image billboard experiment. No facial rig or multi-direction sprite set yet.
export class WhalePaper extends WhaleMaid {
  constructor({ loadTexture = () => new THREE.TextureLoader().loadAsync(characterConfig.paperUrl) } = {}) {
    super({ loadModel: () => Promise.resolve({scene: new THREE.Group(), animations: []}) });
    this.elapsed = 0; this.lean = 0; this.previousX = this.pos.x;
    const pixels = new Uint8Array(64*64*4);
    for (let y=0;y<64;y++) for (let x=0;x<64;x++) {
      const i=(y*64+x)*4, r=Math.hypot((x-31.5)/31.5,(y-31.5)/31.5);
      pixels[i+3]=Math.round(Math.max(0,1-r)**2*95);
    }
    const shadowMap=new THREE.DataTexture(pixels,64,64);shadowMap.needsUpdate=true;
    const shadowMat=new THREE.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    this.shadow=new THREE.Mesh(new THREE.PlaneGeometry(.65,.36),shadowMat);
    this.shadow.rotation.x=-Math.PI/2;this.shadow.position.y=.006;this.group.add(this.shadow);
    this.ready=Promise.all([this.ready,loadTexture()]).then(([,texture])=>{
      texture.colorSpace=THREE.SRGBColorSpace;
      const material=new THREE.SpriteMaterial({map:texture,transparent:true,alphaTest:.06,depthWrite:false,toneMapped:false});
      this.sprite=new THREE.Sprite(material);this.sprite.center.set(.5,.02);
      this.sprite.scale.set(1.15,1.15,1);this.sprite.name='WhaleMaidPaper';
      this.pivot.add(this.sprite);
      return this;
    });
  }
  update(dt) {
    super.update(dt);this.elapsed+=dt;
    if (!this.sprite) return;
    const moving=this.speed>.01, sleeping=this.state==='sleep'&&this.sleepArrived;
    const stride=Math.sin(this.elapsed*(this.speedMax>.9?15:10));
    const breathe=Math.sin(this.elapsed*2)*.009;
    const hop=moving?Math.abs(stride)*.025:0;
    this.sprite.position.y=hop;
    this.sprite.scale.set(1.15*(1-breathe*.35),1.15*(1+breathe),1);
    const motionLean=moving?stride*.025:Math.sin(this.elapsed*.85)*.008;
    let pointerLean=0;
    if (!moving&&this.lookAt) pointerLean=THREE.MathUtils.clamp((this.lookAt.x-this.pos.x)*.006,-.018,.018);
    this.lean=damp(this.lean,motionLean+pointerLean,7,dt);
    // Sprite rotation is in screen space; billboards always face the camera.
    this.sprite.material.rotation=sleeping?-Math.PI/2:this.lean;
    this.pivot.rotation.set(0,0,0);
    if (sleeping) this.sprite.center.set(.5,.5);else this.sprite.center.set(.5,.02);
    this.shadow.visible=!sleeping;
    this.shadow.scale.setScalar(1-hop*2);
  }
}
