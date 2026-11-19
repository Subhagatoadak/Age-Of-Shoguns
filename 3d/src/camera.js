import * as THREE from 'three';
import { WW, WH, S } from './game/data.js';
import { height } from './gfx/terrain.js';
import { clamp } from './game/util.js';

// RTS orbit camera: eased pan / zoom / yaw around a ground focus point
export class RTSCamera {
  constructor(camera) {
    this.camera = camera; this.target = new THREE.Vector3(52, 0, 148); this.goal = this.target.clone();
    this.yaw = 0; this.yawGoal = 0; this.dist = 62; this.distGoal = 62; this.ray = new THREE.Raycaster(); this.vel = new THREE.Vector2(); this.shake = 0;
  }
  focus(x, z) { this.goal.set(x, 0, z); }
  pan(dx, dz) { const c = Math.cos(this.yaw), s = Math.sin(this.yaw); this.goal.x += dx * c + dz * s; this.goal.z += -dx * s + dz * c; }
  zoom(f) { this.distGoal = clamp(this.distGoal * f, 5, 170); }
  rotate(a) { this.yawGoal += a; }
  update(dt) {
    if (this.vel.lengthSq() > .01) { this.goal.x += this.vel.x * dt; this.goal.z += this.vel.y * dt; this.target.x += this.vel.x * dt; this.target.z += this.vel.y * dt; this.vel.multiplyScalar(Math.pow(.02, dt)); }   // drag momentum
    this.goal.x = clamp(this.goal.x, 0, WW * S); this.goal.z = clamp(this.goal.z, 0, WH * S);
    const k = 1 - Math.pow(.0005, dt);
    this.target.lerp(this.goal, k); this.dist += (this.distGoal - this.dist) * k; this.yaw += (this.yawGoal - this.yaw) * k;
    this.target.y = Math.max(height(this.target.x / S, this.target.z / S), 0);
    const pitch = THREE.MathUtils.lerp(.2, 1.02, clamp((this.dist - 5) / 165, 0, 1) ** .7);      // low and cinematic up close, top-down far out
    const c = this.camera;
    c.position.set(this.target.x + Math.sin(this.yaw) * Math.cos(pitch) * this.dist, this.target.y + Math.sin(pitch) * this.dist, this.target.z + Math.cos(this.yaw) * Math.cos(pitch) * this.dist);
    const ground = height(c.position.x / S, c.position.z / S) + 1.2; if (c.position.y < ground) c.position.y = ground;
    c.lookAt(this.target.x, this.target.y + THREE.MathUtils.lerp(1.6, 1, clamp(this.dist / 40, 0, 1)), this.target.z);
    if (this.shake > .002) { const k = this.shake * Math.min(1, this.dist / 30); c.position.x += (Math.random() - .5) * k; c.position.y += (Math.random() - .5) * k; c.position.z += (Math.random() - .5) * k; this.shake *= Math.pow(.004, dt); }
  }
  // terrain point under a screen pixel (ray marched against the height field)
  groundAt(sx, sy) {
    const ndc = new THREE.Vector2(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1); this.ray.setFromCamera(ndc, this.camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction; if (d.y > -.01) return null;
    let y = 0, p = new THREE.Vector3();
    for (let i = 0; i < 6; i++) { const t = (y - o.y) / d.y; p.copy(o).addScaledVector(d, t); y = height(p.x / S, p.z / S); }
    return p;
  }
  groundQuad() { const pts = [[0, 0], [innerWidth, 0], [innerWidth, innerHeight], [0, innerHeight]].map(([x, y]) => this.groundAt(x, y)); return pts.every(Boolean) ? pts.map(p => [p.x, p.z]) : null; }
}
