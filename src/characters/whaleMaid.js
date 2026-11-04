import * as THREE from 'three';
import characterConfig from 'virtual:character-config';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { damp, clamp } from '../core/anim.js';
import { resolveCircle } from '../world/nav.js';

// Adapter for the existing pet interactions. The GLB's feet are at local Y=0.
export class WhaleMaid {
  constructor({ modelFile = 'Whale_Maid_Repaired.glb', loadModel = () => characterConfig.modelBase ? new GLTFLoader().loadAsync(characterConfig.modelBase + encodeURIComponent(modelFile)) : Promise.reject(new Error('Character model unavailable')) } = {}) {
    this.weightedArms = ['Whale_Maid_Arms.glb','Whale_Maid_Lively.glb'].includes(modelFile);
    this.idleLifeTime = 0; this.idleLifeBlend = 0;
    this.hairTime = 0; this.hairSpeed = 0; this.hairHeading = this.heading ?? Math.PI/4;
    this.group = new THREE.Group();
    this.pivot = new THREE.Group(); this.group.add(this.pivot);
    this.pos = new THREE.Vector3(.05, .025, .55);
    this.home = this.pos.clone(); this.target = this.pos.clone();
    this.groundY = .025; this.bubbleHeight = 1.48;
    this.state = 'idle'; this.stateTime = 0; this.heading = Math.PI / 4;
    this.speed = 0; this.speedMax = .75; this.bounds = null; this.onEffect = null;
    this.actions = {}; this.currentClip = null; this.group.position.copy(this.pos);
    this.ready = loadModel().then(gltf => {
      this.model = gltf.scene;
      // Root scaling remains controlled by existing pet interactions (1.28).
      this.model.scale.setScalar(1.12);
      this.model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      this.pivot.add(this.model);
      this.mixer = new THREE.AnimationMixer(this.model);
      for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
      this.play('Idle');
      // 骨骼：手/小臂/大臂（GLB 里已有 Hand.L/R，可直接驱动）
      // GLTFLoader 会把节点名里的 . 等字符改成 _，两种都试
      const find = (n) => this.model.getObjectByName(n)
        || this.model.getObjectByName(n.replace(/[.\s:[\]/]/g, '_'))
        || this.model.getObjectByName(n.replace(/\./g, ''));
      this.bones = {
        upperL: find('UpperArm.L'), upperR: find('UpperArm.R'),
        foreL: find('Forearm.L'), foreR: find('Forearm.R'),
        handL: find('Hand.L'), handR: find('Hand.R'),
        head: find('Head'), hips: find('Hips'),
        thighL: find('Thigh.L'), thighR: find('Thigh.R'),
        shinL: find('Shin.L'), shinR: find('Shin.R'),
      };
      this.seatLegRest = ['thighL', 'thighR', 'shinL', 'shinR']
        .filter(key => this.bones[key])
        .map(key => ({ key, bone: this.bones[key], rest: this.bones[key].quaternion.clone() }));
      const tail=find('Tail');
      if (tail) {
        this.model.updateWorldMatrix(true,true);
        const inverse=tail.getWorldQuaternion(new THREE.Quaternion()).invert();
        this.tailMotion={bone:tail,rest:tail.quaternion.clone(),sideAxis:new THREE.Vector3(0,1,0).applyQuaternion(inverse),liftAxis:new THREE.Vector3(1,0,0).applyQuaternion(inverse),time:0,swing:0,lift:0};
      }
      this.hairSprings = [];
      for (const side of ['Left','Right','Back']) for (const part of ['Root','Tip']) {
        const bone=find('Hair'+side+part);
        if (bone) this.hairSprings.push({bone,rest:bone.quaternion.clone(),side,tip:part==='Tip',x:0,z:0,vx:0,vz:0});
      }
      return this;
    });
  }
  applyTailMotion(dt, moving, lying) {
    const tail=this.tailMotion;
    if (!this.weightedArms || !tail) return;
    tail.time+=dt*(moving?2.8:1.7);
    const amplitude=lying?.035:(moving?.38:.27);
    const target=Math.sin(tail.time)*amplitude+Math.sin(tail.time*.53)*amplitude*.14;
    tail.swing=damp(tail.swing,target,6,dt);
    tail.lift=damp(tail.lift,Math.sin(tail.time*.8+.6)*(lying?.015:.07),5,dt);
    const sideways=new THREE.Quaternion().setFromAxisAngle(tail.sideAxis,tail.swing);
    const lift=new THREE.Quaternion().setFromAxisAngle(tail.liftAxis,tail.lift);
    tail.bone.quaternion.copy(tail.rest).multiply(sideways).multiply(lift);
  }

  applyIdleLife(dt, moving, lying) {
    if (!this.weightedArms || !this.bones?.head) return;
    this.idleLifeTime += dt;
    const resting = !moving && !lying && this.state === 'idle';
    this.idleLifeBlend = damp(this.idleLifeBlend, resting ? 1 : 0, 3, dt);
    const t = this.idleLifeTime, cycle=t%13;
    // A quiet look-around every so often, rather than constant repetitive nodding.
    const gesture=cycle>3 && cycle<8 ? Math.sin((cycle-3)/5*Math.PI)**2 : 0;
    const k=this.idleLifeBlend;
    const pitch=(Math.sin(t*1.35)*.014+gesture*Math.sin(t*1.5)*.025)*k;
    const yaw=(Math.sin(t*.68)*.023+gesture*Math.sin(t*.95)*.04)*k;
    const tilt=(Math.sin(t*.9+.7)*.018+gesture*.032)*k;
    const offset=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,yaw,tilt));
    this.bones.head.quaternion.multiply(offset);
  }

  applyHairMotion(dt, moving, lying) {
    if (!this.hairSprings?.length) return;
    this.hairTime += dt;
    const acceleration=THREE.MathUtils.clamp((this.speed-this.hairSpeed)/Math.max(dt,.001),-12,12);
    const turn=THREE.MathUtils.clamp(Math.atan2(Math.sin(this.heading-this.hairHeading),Math.cos(this.heading-this.hairHeading))/Math.max(dt,.001),-5,5);
    this.hairSpeed=this.speed;this.hairHeading=this.heading;
    const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
    for (const spring of this.hairSprings) {
      const phase=spring.side==='Left'?0:spring.side==='Right'?1.1:2.2;
      const amplitude=lying?0:(spring.tip?.12:.065);
      const driveX=THREE.MathUtils.clamp(acceleration*.009+Math.sin(this.hairTime*1.6+phase)*(moving?.024:(spring.tip?.045:.027)),-amplitude,amplitude);
      const driveZ=THREE.MathUtils.clamp(-turn*.028+Math.sin(this.hairTime*1.15+phase)*(moving?.018:(spring.tip?.035:.022)),-amplitude,amplitude);
      const stiffness=spring.tip?42:65,damping=spring.tip?9:12;
      for(let i=0;i<steps;i++) {
        spring.vx+=((driveX-spring.x)*stiffness-spring.vx*damping)*h;
        spring.vz+=((driveZ-spring.z)*stiffness-spring.vz*damping)*h;
        spring.x=THREE.MathUtils.clamp(spring.x+spring.vx*h,-amplitude,amplitude);
        spring.z=THREE.MathUtils.clamp(spring.z+spring.vz*h,-amplitude,amplitude);
      }
      const offset=new THREE.Quaternion().setFromEuler(new THREE.Euler(spring.x,0,spring.z));
      spring.bone.quaternion.copy(spring.rest).multiply(offset);
    }
  }

  /** 在动画之上叠加手部动作（wave / 摸头 / 喂饭） */
  applyHandPose(dt, t, lying) {
    if (this.weightedArms) return; // This variant already has weighted, authored arm motion.
    const b = this.bones;
    if (!b || !b.handL || !b.handR) return;
    const pet = this.state === 'pet' ? Math.min(1, this.stateTime / 0.35) : 0;
    const eat = this.state === 'eat' ? 1 : 0;
    // 待机：轻微摆臂（注意：该 GLB 手部蒙皮偏弱，手臂骨骼转动几乎不可见，
    // 真正能看出效果的是头/尾巴；这里保留手臂微动，主要动作用头部表达）
    const sway = Math.sin(t * 1.7) * 0.045;
    b.handL.rotation.z += sway;
    b.handR.rotation.z += sway * 0.8;
    // 被摸头：右手抬起挥手
    if (pet > 0) {
      const wave = Math.sin(t * 15) * 0.45;
      b.upperR.rotation.z += -1.05 * pet;
      b.foreR.rotation.z += 0.55 * pet;
      b.handR.rotation.z += (wave - 0.25) * pet;
      b.upperL.rotation.z += 0.18 * pet;
    }
    // 吃饭：左手托碗、右手往嘴边
    if (eat) {
      b.upperR.rotation.z += -0.75;
      b.foreR.rotation.z += 0.95;
      b.handR.rotation.x += Math.sin(t * 7) * 0.12;
      b.upperL.rotation.z += 0.25;
    }
    // 头部：被摸头时歪头点头，吃饭时轻微前倾（头部骨骼权重正常，效果可见）
    if (b.head) {
      const nod = pet > 0 ? Math.sin(t * 6) * 0.12 * pet : 0;
      const tilt = pet > 0 ? -0.22 * pet : 0;
      b.head.rotation.x += nod;
      b.head.rotation.z += tilt;
      if (eat) b.head.rotation.x += 0.18 + Math.sin(t * 8) * 0.05;
      if (lying) b.head.rotation.z += 0.25;
    }
    // 睡觉：手放松
    if (lying) {
      b.handL.rotation.z *= 0.4;
      b.handR.rotation.z *= 0.4;
    }
  }

  play(name) {
    if (name === this.currentClip || !this.actions[name]) return;
    const previous = this.actions[this.currentClip];
    const next = this.actions[name]; next.reset().setEffectiveWeight(1).play();
    if (previous) next.crossFadeFrom(previous, .22, false);
    this.currentClip = name;
  }
  swimTo(p, { fast = false } = {}) {
    this.target.set(p.x, this.groundY, p.z);
    this.runRequested = fast;
    this.speedMax = fast ? 4.2 : 2.82;
    this.state = this.food ? 'eat' : 'swim'; this.stateTime = 0;
  }
  pet() { this.state = 'pet'; this.stateTime = 0; }
  feed(snack) { this.food = snack; this.chewTime = 0; this.state = 'eat'; }
  sleep(pos) {
    this.food && (this.food.userData.dead = true); this.food = null;
    this.sleepPos = pos.clone(); this.target.copy(pos);
    this.state = 'sleep'; this.stateTime = 0; this.sleepArrived = false; this.speedMax = 2.4;
  }
  wake() { this.state = 'swim'; this.target.copy(this.home); this.sleepArrived = false; }
  setLookAt(v) { this.lookAt = v?.clone(); }
  update(dt, time) {
    this.stateTime += dt;
    const delta = new THREE.Vector3().subVectors(this.target, this.pos);
    const distance = Math.hypot(delta.x, delta.z);
    const localMoving = !this.externalMotion && ['swim', 'eat', 'sleep'].includes(this.state) && distance > .045;
    const moving = this.externalMotion ? this.externalMotion.moving : localMoving;
    const startX = this.pos.x, startZ = this.pos.z;
    if (localMoving) {
      const step = Math.min(distance, this.speedMax * dt);
      this.pos.x += delta.x / distance * step; this.pos.z += delta.z / distance * step;
      const desired = Math.atan2(delta.x, delta.z);
      this.heading += Math.atan2(Math.sin(desired - this.heading), Math.cos(desired - this.heading)) * Math.min(1,dt*8);
      this.speed = step / Math.max(dt, .00001);
    } else {
      this.speed = this.externalMotion?.speed || 0;
      if (this.state === 'swim' && !moving) this.state = 'idle';
      if (this.state === 'eat' && this.food) {
        this.chewTime += dt;
        if (this.chewTime > 1.4) { this.food.userData.consumed = true; this.food.userData.dead = true; this.food = null; this.state = 'idle'; }
      }
      if (this.state === 'sleep') this.sleepArrived = true;
    }
    if (this.colliders && this.colliders.length) resolveCircle(this.pos, .26, this.colliders);
    if (this.bounds) {
      this.pos.x = clamp(this.pos.x,this.bounds.x0,this.bounds.x1);
      this.pos.z = clamp(this.pos.z,this.bounds.z0,this.bounds.z1);
    }
    // 被墙卡住时自动放弃目标，避免一直走
    if (localMoving) {
      const advanced = Math.hypot(this.pos.x - startX, this.pos.z - startZ);
      this._stuck = advanced < this.speedMax * dt * 0.3 ? (this._stuck || 0) + dt : 0;
      if (this._stuck > 1.4) { this._stuck = 0; this.target.copy(this.pos); this.state = 'idle'; }
    } else this._stuck = 0;
    // Sleeping is a provisional lying pose, not a finished bed animation.
    const lying = this.state === 'sleep' && this.sleepArrived;
    this.pos.y = damp(this.pos.y, lying ? this.sleepPos.y + .15 : this.groundY, 5, dt);
    this.pivot.rotation.z = damp(this.pivot.rotation.z, lying ? Math.PI / 2 : 0, 5, dt);
    this.pivot.position.y = this.state === 'pet' ? Math.sin(Math.min(1,this.stateTime/.8)*Math.PI)*.06 : 0;
    if (this.state === 'pet' && this.stateTime > .8) this.state = 'idle';
    this.group.position.copy(this.pos); this.group.rotation.y = this.heading;
    const run = this.weightedArms ? !!this.runRequested : this.speedMax >= 1.7;
    this.play(moving ? (run ? 'Running' : 'Walking') : 'Idle');
    if (this.mixer) {
      // 动作播放速度跟着位移速度走，避免“滑步”
      const animationSpeed = this.externalMotion ? this.speed : this.speedMax;
      const base = run
        ? Math.min(1.9, Math.max(1.0, animationSpeed / 2.1))
        : Math.min(1.9, Math.max(1.0, animationSpeed / 1.25));
      this.mixer.timeScale = lying ? .2 : base;
      // 清掉上一帧的程序坐姿，让没有动画轨道的腿骨也能正确复原。
      if (this.wasSeated || this.state === 'sit') {
        for (const leg of this.seatLegRest || []) leg.bone.quaternion.copy(leg.rest);
      }
      this.mixer.update(dt);
      this.applyHandPose(dt, time || 0, lying);
      this.applyIdleLife(dt, moving, lying);
      this.applyHairMotion(dt, moving, lying);
      this.applyTailMotion(dt, moving, lying);
      this.wasSeated = this.state === 'sit';
      if (this.wasSeated) {
        for (const leg of this.seatLegRest || []) {
          const bend = leg.key.startsWith('thigh') ? -1.35 : 1.35;
          leg.bone.quaternion.copy(leg.rest).multiply(
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), bend));
        }
        if (this.bones.hips) {
          this.group.updateMatrixWorld(true);
          const hip = this.bones.hips.getWorldPosition(new THREE.Vector3());
          this.group.position.y += this.seatHeight - hip.y;
        }
      }

    }
  }
}
