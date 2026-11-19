// GPU point-sprite particles with simple physics. One pool for normal blending, one additive.
import * as THREE from 'three';

const VS = `attribute float size; attribute vec4 rgba; varying vec4 vC;
  void main(){ vC = rgba; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * (420.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
const FS = `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d); if (r > .25) discard; gl_FragColor = vec4(vC.rgb, vC.a * smoothstep(.25, .05, r)); }`;

class Pool {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max); this.base = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rgba', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.pts = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.pts.frustumCulled = false; this.pts.renderOrder = 5; scene.add(this.pts);
  }
  add(x, y, z, vx, vy, vz, life, s0, s1, color, alpha, grav, drag) {
    if (this.n >= this.max) return; const i = this.n++;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.life[i] = life; this.age[i] = 0; this.s0[i] = s0; this.s1[i] = s1;
    this.base.set([color.r, color.g, color.b], i * 3); this.a0[i] = alpha; this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { const j = --this.n; // swap-remove
        for (const [a, k] of [[this.pos, 3], [this.vel, 3], [this.base, 3]]) a.copyWithin(i * k, j * k, j * k + k);
        for (const a of [this.life, this.age, this.s0, this.s1, this.a0, this.grav, this.drag]) a[i] = a[j]; continue; }
      const f = this.age[i] / this.life[i], d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      if (this.pos[i * 3 + 1] < this.floor) { this.pos[i * 3 + 1] = this.floor; this.vel[i * 3 + 1] *= -.2; }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * f;
      this.col.set([this.base[i * 3], this.base[i * 3 + 1], this.base[i * 3 + 2], this.a0[i] * (1 - f) * Math.min(1, f * 8)], i * 4);
      i++;
    }
    const g = this.pts.geometry; g.setDrawRange(0, this.n);
    for (const k of ['position', 'rgba', 'size']) g.attributes[k].needsUpdate = true;
  }
}

const C = (h) => new THREE.Color(h);
const R = (a, b) => a + Math.random() * (b - a);
// kind -> [count, life, size0, size1, colors, alpha, gravity, drag, speed, up, additive]
const KINDS = {
  dust: [6, [.8, 1.6], .5, 1.6, [0xbfa77c, 0xa89272], .5, -.3, 2.5, 1.5, .8, 0],
  wood: [5, [.5, 1.0], .14, .1, [0xc89a5c, 0x8a5a2b], 1, 9, .5, 2.5, 3, 0],
  gold: [5, [.4, .8], .12, .05, [0xffe066, 0xfff2b0], 1, 9, .5, 2.2, 2.8, 1],
  food: [4, [.4, .8], .12, .08, [0xc8202e, 0x5a8a2a], 1, 8, .5, 1.5, 2, 0],
  water: [7, [.4, .8], .14, .06, [0xd8ecff, 0xffffff], .9, 9, .3, 1.5, 3.2, 0],
  hit: [7, [.15, .35], .18, .02, [0xfff2c0, 0xffffff], 1, 4, 1, 4, 1.5, 1],
  blood: [6, [.3, .6], .1, .06, [0x7a0c0c, 0x5a0808], .9, 9, .5, 2, 1.8, 0],
  spark: [10, [.25, .5], .12, .02, [0xffd27a, 0xff9a3a], 1, 9, .4, 3.5, 3, 1],
  smoke: [1, [2.5, 4], .9, 3.5, [0x5c5852, 0x7a756e], .45, -.6, .8, .3, .9, 0],
  fire: [2, [.4, .8], .7, .1, [0xffb030, 0xff6a1a, 0xffd860], .9, -2.5, 1, .4, 1, 1],
  heal: [8, [.8, 1.3], .25, .05, [0x9dff8a, 0xd8ffb0], .9, -1.5, 1, .6, 1, 1],
  rubble: [30, [.8, 1.6], .45, .2, [0x6a5a4a, 0x9a8a78, 0x4a3a2a], 1, 9, .4, 5, 4, 0],
  firefly: [1, [2.5, 4], .18, .1, [0xe6ff8a], 1, 0, 0, .4, .2, 1],
  splash: [1, [.25, .35], .12, .02, [0xd8e8ff], .6, 6, 0, .6, 1.4, 0],
};
export class Particles {
  constructor(scene) { this.normal = new Pool(scene, 5000, false); this.add = new Pool(scene, 3000, true); this.normal.floor = this.add.floor = -50; }
  emit(kind, x, y, z, n) {
    const k = KINDS[kind]; if (!k) return;
    const [count, life, s0, s1, cols, alpha, grav, drag, spd, up, additive] = k, pool = additive ? this.add : this.normal;
    for (let i = 0; i < (n || count); i++) { const a = Math.random() * 6.28, s = R(.3, 1) * spd;
      pool.add(x + R(-.2, .2), y + R(0, .2), z + R(-.2, .2), Math.cos(a) * s, R(.4, 1) * up * (kind === 'smoke' || kind === 'fire' ? 1 : 1.6), Math.sin(a) * s,
        R(life[0], life[1]), s0 * R(.7, 1.3), s1 * R(.7, 1.3), C(cols[i % cols.length]), alpha, grav, drag); }
  }
  update(dt) { this.normal.update(dt); this.add.update(dt); }
}
