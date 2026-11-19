// Cinematic battle camera. Each shot picks ONE fixed camera angle at the cut and then follows a heavily
// smoothed point between the two fighters with a slow push-in, so the frame stays locked on the duel
// instead of swinging around as the fighters move. It stays with a survivor and cuts only every 7-9 s.
import * as THREE from 'three';
import { S } from './game/data.js';
import { height } from './gfx/terrain.js';
import { clamp } from './game/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const NAMES = { vil: 'Villager', spear: 'Ashigaru', archer: 'Archer', samurai: 'Samurai', monk: 'Sohei', cav: 'Rider' };
// [sideways, behind-fighter-A, height] relative to the duel axis at the moment of the cut
const ANGLES = { side: [5.8, 0, 1.7], over: [1.6, -3.6, 2.2], low: [4.6, -1.2, .7], wide: [9, -3, 3.6], front: [-1.5, 4.3, 1.9] };

export class Director {
  constructor(game) {
    this.g = game; this.on = true; this.active = false; this.cool = 0; this.pos = V(); this.look = V(); this.center = V(); this.shake = 0; this.slow = 0;
    try { this.on = localStorage.getItem('aos3d_cine') !== '0'; } catch (e) {}
  }
  toggle() { this.on = !this.on; try { localStorage.setItem('aos3d_cine', this.on ? '1' : '0'); } catch (e) {} if (!this.on && this.active) this.exit(); else if (this.on) this.cool = 0; return this.on; }
  fights() {
    const w = this.g.world, out = [];
    for (const u of w.units) { const t = u.tgt; if (u.st !== 'attack' || !t || t.dead || t.k !== 'u' || u.type === 'archer' || u.type === 'monk') continue;
      if (u.team === t.team || !(u.team === 1 || t.team === 1)) continue; if (Math.hypot(u.x - t.x, u.y - t.y) > 45 || !w.isExplored(u.x, u.y)) continue;
      let crowd = 0; for (const o of w.units) if (o !== u && o !== t && Math.hypot(o.x - (u.x + t.x) / 2, o.y - (u.y + t.y) / 2) < 30) crowd++;
      out.push({ a: u, b: t, score: -crowd * 1.2 + (u.boss || t.boss ? 6 : 0) + (u.type === 'samurai' || t.type === 'samurai' ? 2 : 0) + (u.type === 'cav' || t.type === 'cav' ? 1 : 0) + Math.random() * .5 }); }
    return out.sort((x, y) => y.score - x.score);
  }
  enter(f) { this.active = true; this.quiet = 0; document.body.classList.add('cine'); this.g.camera.fov = 38; this.g.camera.updateProjectionMatrix();
    this.pos.copy(this.g.camera.position); this.look.copy(this.g.cam.target); this.cut(f, true); }
  exit(byUser) {
    if (!this.active) return; this.active = false; document.body.classList.remove('cine'); this.slow = 0;
    this.g.camera.fov = 42; this.g.camera.updateProjectionMatrix();
    const c = this.g.cam; c.target.set(this.center.x, 0, this.center.z); c.goal.copy(c.target); c.dist = c.distGoal = 34;
    this.cool = byUser ? 25 : 6;
  }
  cut(list, first) {
    const pick = list[0]; if (!pick) return;
    this.a = pick.a; this.b = pick.b; this.shotT = 7 + Math.random() * 2; this.age = 0;
    const A = this.unitPos(this.a), B = this.unitPos(this.b); this.center.addVectors(A, B).multiplyScalar(.5);
    // choose the clearest of the classic angles, fixed in world space for the whole shot
    const axis = V().subVectors(B, A).setY(0); if (axis.lengthSq() < 1e-4) axis.set(1, 0, 0); axis.normalize(); const side = V(-axis.z, 0, axis.x);
    const order = Object.keys(ANGLES).sort(() => Math.random() - .5); let best = null, bn = 1e9;
    search: for (const k of order) for (const flip of [1, -1]) { const [sx, bz, h] = ANGLES[k], off = V().addScaledVector(side, sx * flip).addScaledVector(axis, bz).setY(h);
      const n = this.blocked(this.center.clone().add(off), this.center.clone().setY(this.center.y + 1.2)); if (n < bn) { bn = n; best = off; } if (!n) break search; }
    this.offset = best; this.snap = true;
    const an = this.a.boss ? 'Ronin warlord' : NAMES[this.a.type], bn2 = this.b.boss ? 'Ronin warlord' : NAMES[this.b.type], raid = this.g.world.wave;
    document.getElementById('cine-cap').innerHTML = `<b>${raid ? 'Raid ' + raid : 'Skirmish'}</b><span>${this.a.team ? bn2 + ' vs ' + an : an + ' vs ' + bn2}</span>`;
  }
  onHit(e, src) { if (this.active && (e === this.a || e === this.b) && src && src.k === 'u') this.shake = Math.max(this.shake, src.boss || src.type === 'samurai' ? .045 : .025); }
  onKill(e) { if (this.active && (e === this.a || e === this.b)) { this.slow = 1.1; this.shake = .09; } }
  timeScale() { return this.slow > 0 ? .25 : 1; }
  // keep the shot on the survivor when one fighter falls
  follow(list) {
    const alive = [this.a, this.b].find(u => u && !u.dead); if (!alive) return false;
    const next = list.find(f => f.a === alive || f.b === alive); if (!next) return false;
    if (next.a === alive) { this.a = next.a; this.b = next.b; } else { this.a = next.b; this.b = next.a; } return true;
  }
  update(dt) {
    if (this.cool > 0) this.cool -= dt;
    const w = this.g.world;
    if (!this.active) {
      if (!this.on || this.cool > 0 || w.paused || w.over) return false;
      if (!w.units.some(u => u.team === 1 && u.mode === 'raid')) return false;
      const f = this.fights(); if (f.length) this.enter(f); else return false;
    }
    if (this.slow > 0) this.slow -= dt;
    const f = this.fights();
    if (!f.length) { this.quiet += dt; if (this.quiet > 3) { this.exit(false); return false; } } else this.quiet = 0;
    this.shotT -= dt; this.age += dt;
    const lost = !this.a || this.a.dead || !this.b || this.b.dead;
    if (lost && this.slow <= 0 && f.length && !this.follow(f)) this.cut(f);
    else if (this.shotT <= 0 && f.length) this.cut(f);
    // heavily smoothed duel centre: knockback and footwork never jerk the frame
    const A = this.unitPos(this.a), B = this.unitPos(this.b), C = this.a.dead ? B : this.b.dead ? A : V().addVectors(A, B).multiplyScalar(.5);
    this.center.lerp(C, 1 - Math.pow(.25, dt));
    const push = 1 - Math.min(this.age / 9, 1) * .18;                                         // slow dramatic push-in
    const P = this.center.clone().addScaledVector(this.offset, push), L = this.center.clone().setY(this.center.y + 1.2);
    const gP = height(P.x / S, P.z / S) + .45; if (P.y < gP) P.y = gP;
    if (this.snap) { this.pos.copy(P); this.look.copy(L); this.snap = false; }
    this.pos.lerp(P, 1 - Math.pow(.08, dt)); this.look.lerp(L, 1 - Math.pow(.05, dt));
    for (const [u, e] of [[A, this.a], [B, this.b]]) { const m = e.boss ? 3.2 : e.type === 'cav' ? 3 : 2.3, d = V().subVectors(this.pos, u).setY(0), l = d.length(); if (l < m && l > 1e-3) this.pos.addScaledVector(d.normalize(), m - l); }   // never inside a fighter
    const cam = this.g.camera; cam.position.copy(this.pos);
    if (this.shake > .001) { cam.position.x += (Math.random() - .5) * this.shake; cam.position.y += (Math.random() - .5) * this.shake; this.shake *= Math.pow(.01, dt); }
    cam.lookAt(this.look);
    this.g.cam.target.set(this.center.x, this.center.y, this.center.z); this.g.cam.goal.copy(this.g.cam.target);
    return true;
  }
  blocked(P, L) {
    let n = 0; const d = V().subVectors(L, P), len = d.length(); d.normalize();
    for (const [e, v] of this.g.view.views) { if (e.k !== 'u' || e === this.a || e === this.b || !v.root.visible) continue;
      const q = v.root.position.clone().setY(v.root.position.y + 1.1), t = clamp(V().subVectors(q, P).dot(d), 0, len), dist = P.clone().addScaledVector(d, t).distanceTo(q);
      if (dist < .6 || q.distanceTo(P) < 1.4) n++; }
    return n;
  }
  unitPos(u) { const v = this.g.view.views.get(u); if (v) return v.root.position.clone(); const d = this.g.view.dying.find(x => x.e === u); return d ? d.root.position.clone() : V(u.x * S, height(u.x, u.y), u.y * S); }
}
