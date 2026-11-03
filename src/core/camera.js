import * as THREE from 'three';
import { damp, clamp } from './anim.js';

const ISO_AZ = Math.PI / 4;          // 45°
const ISO_EL = Math.atan(1 / Math.SQRT2); // 35.264° 真等距

export class IsoCamera {
  constructor() {
    this.camera = new THREE.OrthographicCamera(-6.5, 6.5, 6.5, -6.5, 0.1, 80);
    this.target = new THREE.Vector3(1.9, 1.05, 0.0);
    this.homeTarget = new THREE.Vector3(1.9, 1.05, 0.0);
    this.homeZoom = 0.98;
    this.az = ISO_AZ;
    this.el = ISO_EL;
    this.dist = 26;
    this.par = new THREE.Vector2();       // 视差偏移
    this.parTarget = new THREE.Vector2();
    this.drag = 0;                         // 用户拖拽角度
    this.dragTarget = 0;
    this.zoom = 1;
    this.zoomTarget = 1;
    this.baseHalfH = 4.78;
    this.baseHalfW = 5.9;
    this.resize();
  }
  resize() {
    const aspect = window.innerWidth / window.innerHeight;
    // 窄屏时优先保证房间宽度占满，允许上下留白
    const targetHalfW = aspect >= 1.25 ? 5.9 : aspect >= 0.85 ? 5.0 : 4.35;
    const targetHalfH = 4.78;
    let halfH = Math.max(targetHalfH, targetHalfW / aspect);
    let halfW = halfH * aspect;
    // 场景基准取景（由 setView 提供），再按屏幕比例微调
    const sc = this._view || { target: new THREE.Vector3(-0.05, 1.12, -0.12), zoom: 0.98 };
    const k = aspect < 0.85 ? 0.74 : aspect < 1.25 ? 0.88 : 1.0;
    this.homeTarget.copy(sc.target);
    this.homeZoom = sc.zoom * k;
    if (!this._inited) { this._inited = true; this.target.copy(this.homeTarget); }
    const c = this.camera;
    c.left = -halfW; c.right = halfW; c.top = halfH; c.bottom = -halfH;
    c.updateProjectionMatrix();
    this.aspect = aspect;
  }
  /** 设置场景默认取景（不同场景不同构图） */
  setView(target, zoom) {
    this._view = { target: target.clone(), zoom };
    this.resize();
  }
  /** 指针位置：-1~1 */
  setPointer(nx, ny) {
    this.parTarget.set(nx * 0.34, ny * 0.24);
  }
  addDrag(dx) {
    this.dragTarget = clamp(this.dragTarget + dx, -0.22, 0.22);
  }
  update(dt) {
    this.par.x = damp(this.par.x, this.parTarget.x, 3.2, dt);
    this.par.y = damp(this.par.y, this.parTarget.y, 3.2, dt);
    this.drag = damp(this.drag, this.dragTarget, 4.5, dt);
    this.zoom = damp(this.zoom, this.zoomTarget, 3.5, dt);

    const az = this.az + this.drag;
    const el = this.el;
    const dir = new THREE.Vector3(
      Math.cos(el) * Math.cos(az),
      Math.sin(el),
      Math.cos(el) * Math.sin(az)
    );
    const c = this.camera;
    c.position.copy(this.target).addScaledVector(dir, this.dist);
    // 视差：沿相机右/上方向微移
    const right = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    c.position.addScaledVector(right, this.par.x).addScaledVector(up, this.par.y);
    c.lookAt(this.target);
    c.zoom = this.zoom;
    c.updateProjectionMatrix();
  }
  /** 屏幕坐标 → 地面（y=height）交点 */
  screenToGround(ndcX, ndcY, height = 0) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, hit) ? hit : null;
  }
}
