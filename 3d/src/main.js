import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { World } from './game/world.js';
import { S, BT, TRAIN } from './game/data.js';
import { buildTerrain, height } from './gfx/terrain.js';
import { Atmosphere } from './gfx/sky.js';
import { View } from './gfx/view.js';
import { RTSCamera } from './camera.js';
import { Hud } from './ui/hud.js';
import { Snd } from './audio.js';
import { Director } from './director.js';
import { Intro } from './gfx/globe.js';
import { Realism } from './gfx/realism.js';
import { shared } from './gfx/geo.js';
import { SEASONS } from './game/data.js';
import './style.css';

class Game {
  constructor() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.75)); r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = .6;
    r.outputColorSpace = THREE.SRGBColorSpace; r.localClippingEnabled = true;
    document.getElementById('app').appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .12, 3000);
    this.cam = new RTSCamera(this.camera);
    this.atmo = new Atmosphere(r, this.scene);
    this.terrain = buildTerrain(this.scene);
    this.sel = []; this.selB = null; this.place = null; this.groups = {}; this.quality = true;
    const ev = {};
    this.world = new World(ev);
    this.director = new Director(this);
    this.view = new View(this.scene, this.world, { grass: this.terrain.grass, sfx: (k, x, y) => this.sfx(k, x, y), shake: () => {}, hit: (e, s) => { this.director.onHit(e, s); this.combatSound('hit', e, s); }, attack: (u, mv) => this.combatSound('attack', u, mv) });
    this.realism = new Realism(this);
    this.hud = new Hud(this);
    Object.assign(ev, {
      spawn: e => this.view.spawn(e), remove: e => { this.view.remove(e); if (e.k === 'u') { this.director.onKill(e); this.onDeath(e); } if (e === this.selB) this.selB = null; if (e.k === 'u') this.sel = this.sel.filter(u => u !== e); },
      hit: (e, s) => this.view.hit(e, s), shoot: p => this.view.shoot(p), fx: (k, x, y, n) => this.view.fxAt(k, x, y, n), harvest: (r, u) => this.view.harvest(r, u),
      heal: t => this.view.heal(t), completed: b => this.view.completed(b), hide: (u, h) => { this.view.hide(u, h); if (h) { this.sel = this.sel.filter(x => x !== u); u.sel = false; } },
      sfx: (k, x, y) => this.sfx(k, x, y), toast: (m, t) => this.hud.toast(m, t), refresh: () => this.hud.refresh(), float: (x, y, t) => this.hud.float(x, y, t),
      end: (win, how) => { try { localStorage.removeItem('aos3d_save'); } catch (e) {} this.hud.end(win, how); }, raid: b => this.hud.ping(b.x, b.y, '#ff5040'),
      chronicle: () => { if (this.hud.townOpen) this.hud.renderTown(); }, ageUp: (age, b) => this.view.ageUp(b),
      season: k => this.hud.toast(['Spring arrives: the cherry trees blossom.', 'Summer: the paddies grow tall and green.', 'Autumn: maples turn red and the harvest comes in.', 'Winter: snow falls on the valley.'][k], 'info'),
      alert: (x, y) => { this.hud.ping(x, y, '#ff5040'); const v = this.camera; const p = new THREE.Vector3(x * S, height(x, y), y * S).project(v);
        if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) { this.hud.toast('You are under attack! ' + (this.hud.mobile ? 'Tap the red ping on the minimap.' : 'Press Space to look.'), 'bad'); this.sfx('alarm'); } },
    });
    try { const r = JSON.parse(localStorage.getItem('aos3d_raids') || 'null'); if (r) Object.assign(this.world.raid, r); } catch (e) {}
    let resumed = false;
    try { if (localStorage.getItem('aos3d_continue') === '1') { localStorage.removeItem('aos3d_continue'); this.world.load(JSON.parse(localStorage.getItem('aos3d_save'))); resumed = true; } } catch (e) { console.error('load failed', e); }
    if (!resumed) this.world.buildMap();
    this.resumed = resumed;
    this.setupPost(); this.setupInput();
    this.realism.setupPost(this.composer);
    this.realism.set((() => { try { const s = localStorage.getItem('aos3d_real'); return s === null ? !matchMedia('(max-width: 700px)').matches : s === '1'; } catch (e) { return true; } })());
    addEventListener('resize', () => this.resize());
    this.hud.refresh();
    this.musT = 5; this.last = performance.now();
    // opening: the globe turns to Japan and dives into the valley, then the game begins
    this.intro = new Intro(r); document.body.classList.add('intro');
    this.intro.onDone = () => { document.body.classList.remove('intro'); this.cam.dist = 210; this.cam.distGoal = 62; this.cam.yaw = -.6; this.cam.yawGoal = 0; this.intro = null;
      const f = document.getElementById('intro-fade'); f.style.transition = 'opacity 2.2s'; requestAnimationFrame(() => f.style.opacity = 0); setTimeout(() => f.remove(), 2400);
      setTimeout(() => this.hud.intro(), 1600); };
    const skip = document.getElementById('intro-skip'); skip.onclick = () => this.intro && this.intro.finish();
    addEventListener('keydown', e => { if (this.intro && e.code === 'Escape') this.intro.finish(); });
    // one bad frame must never stop the loop (three's loop does not reschedule after an exception)
    if (resumed) { this.intro = null; document.body.classList.remove('intro'); for (const id of ['intro-fade', 'intro-skip']) document.getElementById(id)?.remove(); }   // continuing a saved game skips the globe
    (resumed ? Promise.resolve() : this.intro.load()).then(() => { document.getElementById('loading').remove(); if (resumed) { this.world.paused = false; Snd.init(); this.hud.toast('Welcome back: ' + this.world.soc.dateStr(), 'good'); } r.setAnimationLoop(() => { try { this.frame(); } catch (err) { console.error(err); } }); });
  }
  setupPost() {
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .22, .5, 1.05); this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }
  toggleQuality() {
    this.quality = !this.quality; this.bloom.enabled = this.quality; this.view.hooks.grassOn = this.quality; this.terrain.grass.mesh.visible = this.quality;
    this.renderer.setPixelRatio(this.quality ? Math.min(devicePixelRatio, 1.75) : 1); this.atmo.sun.shadow.mapSize.set(this.quality ? 2048 : 1024, this.quality ? 2048 : 1024);
    this.atmo.sun.shadow.map?.dispose(); this.atmo.sun.shadow.map = null; this.realism.fixShadowSize(); this.resize(); return this.quality;
  }
  toggleRealism() { const on = this.realism.set(!this.realism.on); this.hud.toast(on ? 'Realistic graphics on: ambient occlusion, mist, reflections, detailed ground, foot IK (R toggles)' : 'Classic graphics', 'info'); return on; }
  resize() { this.intro?.resize(); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight); }
  // ------------------------------------------------------------ save / continue
  save() { try { localStorage.setItem('aos3d_save', JSON.stringify(this.world.serialize())); } catch (e) { this.hud.toast('Could not save: ' + e.message, 'bad'); } }
  hasSave() { try { return !!localStorage.getItem('aos3d_save'); } catch (e) { return false; } }
  saveAge() { try { const d = JSON.parse(localStorage.getItem('aos3d_save')), m = Math.round((Date.now() - d.saved) / 60000); return (m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago') + ' · ' + (d.soc && d.soc.monthIdx != null ? 'year ' + (1560 + Math.floor((2 + d.soc.monthIdx) / 12)) : ''); } catch (e) { return ''; } }
  continueGame() { try { localStorage.setItem('aos3d_continue', '1'); } catch (e) {} location.reload(); }
  start(diff) { this.world.setDifficulty(diff); this.world.paused = false; Snd.init(); Snd.play('built'); }
  // distance-based loudness for positional sounds
  vol(x, y) { const d = Math.hypot(x * S - this.cam.target.x, y * S - this.cam.target.z) + (this.director.active ? 0 : this.cam.dist * .4); return Math.min(1, 60 / Math.max(28, d)); }
  pitchOf(u) { return u.boss ? .66 : u.type === 'monk' ? .85 : .82 + ((u.id * .618) % 1) * .42; }
  combatSound(kind, u, x) {
    const v = this.vol(u.x, u.y); if (v < .08) return;
    if (kind === 'attack') {
      if (u.type === 'archer' || u.type === 'monk') return;
      if (u.type === 'cav') { if (Math.random() < .45) Snd.voice('neigh', .9 + Math.random() * .2, v * .8); Snd.voice('yell', this.pitchOf(u), v * .7); }
      else if (Math.random() < .8) Snd.voice(u.boss || Math.random() < .25 ? 'yell' : 'kiai', this.pitchOf(u), v * (u.boss ? 1 : .85));
      if (!['punch', 'kickF', 'kickR', 'flyKick'].includes(x)) setTimeout(() => Snd.play('swing', v), 230); else setTimeout(() => Snd.play('swing', v * .6), 180);
      return; }
    const src = x; if (!src || src.k !== 'u') { Snd.play('hit', v); return; }
    if (src.type === 'archer') { Snd.play('hit', v); if (u.k === 'u' && Math.random() < .5) Snd.voice('hurt', this.pitchOf(u), v * .7); return; }
    if (u.k !== 'u') { Snd.play('kick', v * .8); return; }
    const mv = this.view.views.get(src)?.move;
    Snd.play(['punch', 'kickF', 'kickR', 'flyKick'].includes(mv) ? 'kick' : 'slash', v);
    if (src.type === 'samurai' || src.type === 'spear' || src.type === 'cav') Snd.play('clash', v * .7);
    if (u.hp > 0 && Math.random() < .65) Snd.voice(Math.random() < .5 ? 'grunt' : 'hurt', this.pitchOf(u), v * .8);
  }
  // a death on screen: a cry, and outside the battle cam a brief slow-motion beat with a jolt
  onDeath(u) {
    const v = this.vol(u.x, u.y); if (v > .08) Snd.voice('die', this.pitchOf(u), v);
    const p = new THREE.Vector3(u.x * S, height(u.x, u.y) + 1, u.y * S).project(this.camera), onScreen = Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1;
    if (!onScreen) return;
    if (u.boss) Snd.play('boom');
    if (!this.director.active && performance.now() - (this.lastSlow || 0) > 2500 && this.cam.dist < 120) { this.rtsSlow = u.boss ? .9 : .38; this.lastSlow = performance.now(); this.cam.shake = u.boss ? .9 : .35; }
  }
  sfx(k, x, y) { if (x == null) return Snd.play(k); const d = Math.hypot(x * S - this.cam.target.x, y * S - this.cam.target.z) + this.cam.dist * .4; Snd.play(k, Math.min(1, 60 / Math.max(30, d))); }
  // ------------------------------------------------------------ main loop
  frame() {
    const now = performance.now(), dt = Math.min(.05, (now - this.last) / 1000); this.last = now;
    if (this.intro) { const it = this.intro; it.update(dt); if (this.intro) { this.renderer.render(it.scene, it.cam); return; } }   // intro may hand over mid-frame
    if (this.rtsSlow > 0) this.rtsSlow -= dt;
    const w = this.world, ts = this.director.timeScale() * (this.rtsSlow > 0 ? .3 : 1);
    this.keys(dt);
    w.step(dt * ts);
    if (w.exploredDirty) { const d = this.terrain.fowData; for (let i = 0; i < d.length; i++) d[i] = w.explored[i] * 255; this.terrain.fowTex.needsUpdate = true; w.exploredDirty = false; }
    if (!this.director.update(dt)) this.cam.update(dt);
    const gt = w.t; w.night = this.atmo.night;
    this.view.season(w.soc.seasonPos);
    this.atmo.update(gt, w.wet, this.cam.target, dt, shared.snow.value / .95);
    this.realism.update(dt);
    if (w.terrVersion !== this.terrV) { this.terrV = w.terrVersion; const d = this.terrain.terData; for (let i = 0; i < d.length; i++) d[i] = w.terr[i] * 127; this.terrain.terTex.needsUpdate = true; }
    if (!w.paused && !w.over && (this.autoT = (this.autoT ?? 60) - dt) <= 0) { this.autoT = 60; this.save(); }
    this.view.update(w.paused ? 0 : dt * w.speed * ts, now / 1000, this.camera, this.atmo.night, this.cam.target, w.wet);
    this.terrain.water.update(now / 1000);
    this.hud.update(dt);
    if ((this.battleT = (this.battleT || 0) - dt) <= 0) { this.battleT = .5; this.battleI = w.paused ? 0 : Math.min(1, this.director.fights().length / 6) * (this.director.active ? 1 : .8); }
    Snd.battle(this.battleI || 0, dt);
    if (!w.paused && (this.musT -= dt) <= 0) { this.musT = 8 + Math.random() * 8; Snd.phrase(); }
    if (this.place && this.pointer) { const p = this.cam.groundAt(this.pointer.x, this.pointer.y); if (p) { this.placeAt = [Math.round(p.x / S / 5) * 5, Math.round(p.z / S / 5) * 5]; } }
    if (this.place && this.placeAt) this.view.ghost(this.place, ...this.placeAt, w.canPlace(this.place, ...this.placeAt)); else this.view.ghost(null);
    this.composer.render();
  }
  // ------------------------------------------------------------ selection & orders
  select(list, add) { if (!add) { for (const u of this.sel) u.sel = false; this.sel = []; } this.selB = null; for (const u of list) if (!this.sel.includes(u)) { this.sel.push(u); u.sel = true; } if (list.length) this.sfx('select'); this.hud.refresh(); }
  selectB(b) { for (const u of this.sel) u.sel = false; this.sel = []; this.selB = b; this.hud.refresh(); }
  setPlace(t) { this.place = t; this.placeAt = null; this.hud.refresh(); }
  order(x, y, target) {
    if (!this.sel.length) { const b = this.selB; if (b && b.team === 0 && TRAIN[b.type]) { b.rally = target && target.k === 'r' ? target : { x, y }; this.marker(x, y, 0xffffff); this.sfx('order'); } return; }
    const kind = this.world.command(this.sel, x, y, target); if (!kind) return;
    this.sfx('order'); this.marker(target ? target.x : x, target ? target.y : y, kind === 'attack' ? 0xff5040 : kind === 'gather' ? 0xffe066 : 0x7dff8a);
  }
  marker(x, y, col) {
    const m = new THREE.Mesh(new THREE.RingGeometry(.5, .8, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, depthWrite: false }));
    m.position.set(x * S, height(x, y) + .1, y * S); this.scene.add(m); const t0 = performance.now();
    const tick = () => { const f = (performance.now() - t0) / 500; if (f >= 1) { this.scene.remove(m); m.geometry.dispose(); return; } m.scale.setScalar(2 - f * 1.6); m.material.opacity = 1 - f; requestAnimationFrame(tick); }; tick();
  }
  pick(sx, sy) {
    const w = this.world, cam = this.camera, P = new THREE.Vector3();
    let best = null, bd = 30;
    for (const u of w.units) { const a = this.view.anchor(u); if (!a) continue; a.y -= 1.2; P.copy(a).project(cam); const x = (P.x * .5 + .5) * innerWidth, y = (-P.y * .5 + .5) * innerHeight, d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = u; } }
    if (best) return best;
    for (const c of w.soc.cits) { const v = this.view.views.get(c); if (!v || !v.root.visible) continue; P.copy(v.root.position).setY(v.root.position.y + 1).project(cam); const x = (P.x * .5 + .5) * innerWidth, y = (-P.y * .5 + .5) * innerHeight, d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = c; } }
    if (best) return best;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1), cam);
    const meshes = []; for (const b of w.bld) { const v = this.view.views.get(b); if (v && v.root.visible) { v.main.userData.e = b; meshes.push(v.main); } }
    const hit = ray.intersectObjects(meshes, false)[0]; if (hit) return hit.object.userData.e;
    const g = this.cam.groundAt(sx, sy); if (g) for (const b of w.bld) { if (Math.abs(g.x / S - b.x) < b.w / 2 && Math.abs(g.z / S - b.y) < b.h / 2 && (b.team === 0 || w.isExplored(b.x, b.y))) return b; }
    bd = 34;
    for (const r of w.rs) { if (!w.isExplored(r.x, r.y)) continue; P.set(r.x * S, height(r.x, r.y) + (r.kind === 'tree' ? 2.5 : .6), r.y * S).project(cam); const x = (P.x * .5 + .5) * innerWidth, y = (-P.y * .5 + .5) * innerHeight, d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = r; } }
    return best;
  }
  click(sx, sy, e, touch) {
    const g = this.cam.groundAt(sx, sy); const target = this.pick(sx, sy), w = this.world;
    if (this.place) {
      if (!g) return; const x = Math.round(g.x / S / 5) * 5, y = Math.round(g.z / S / 5) * 5;
      if (touch && (!this.placeAt || Math.hypot(this.placeAt[0] - x, this.placeAt[1] - y) > 40)) { this.placeAt = [x, y]; return; }
      const res = w.placeBuilding(this.place, x, y, this.sel); if (res === 'border') return this.hud.toast('You can only build inside your borders. Towers and houses push them outward.', 'bad'); if (res === 'age') return this.hud.toast('Advance your age first', 'bad'); if (res === 'blocked') return this.hud.toast("Can't build there", 'bad'); if (res === 'cost') { this.hud.toast('Not enough resources', 'bad'); return this.setPlace(null); }
      this.sfx('order'); this.setPlace(null); return;
    }
    if (target && target.k === 'c' && !(touch && this.sel.length)) { for (const u of this.sel) u.sel = false; this.sel = []; this.selB = null; this.selC = target; this.hud.refresh(); return; }
    this.selC = null;
    if (target && target.k === 'u' && target.team === 0) {
      const now = performance.now();
      if (this.lastTap && this.lastTap.e === target && now - this.lastTap.t < 350) { const same = w.units.filter(u => u.team === 0 && u.type === target.type && this.onScreen(u)); this.select(same); }
      else if (touch && this.sel.length && !this.sel.includes(target) && this.sel.every(u => u.type !== 'vil')) this.select([target]);
      else this.select([target], e && e.shiftKey);
      this.lastTap = { e: target, t: now }; return; }
    if (touch && (this.sel.length || (this.selB && this.selB.team === 0)) && (!target || target.k !== 'b' || target.team !== 0 || this.sel.some(u => u.type === 'vil'))) { if (g || target) this.order(g ? g.x / S : target.x, g ? g.z / S : target.y, target); return; }
    if (target && target.k === 'b') return this.selectB(target);
    if (target && target.k === 'u') { this.select([]); return; }
    this.select([]);
  }
  onScreen(u) { const a = this.view.anchor(u); if (!a) return false; a.project(this.camera); return Math.abs(a.x) < 1 && Math.abs(a.y) < 1 && a.z < 1; }
  // ------------------------------------------------------------ input
  // ground point under the cursor on the horizontal plane through the camera focus (stable while dragging)
  planeAt(sx, sy) {
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1), this.camera);
    const o = ray.ray.origin, d = ray.ray.direction, y = this.cam.target.y; if (Math.abs(d.y) < 1e-3) return null;
    const t = (y - o.y) / d.y; return t > 0 ? o.clone().addScaledVector(d, Math.min(t, 2000)) : null;
  }
  setupInput() {
    const el = this.renderer.domElement, box = document.getElementById('box'), pts = new Map();
    this.keysDown = new Set();
    const takeControl = () => { if (this.director.active) this.director.exit(true); };
    el.addEventListener('contextmenu', e => e.preventDefault());
    // mouse wheel zooms; trackpad two-finger scroll pans; trackpad pinch (ctrl+wheel) zooms
    el.addEventListener('wheel', e => { e.preventDefault(); takeControl();
      const trackpad = !e.ctrlKey && e.deltaMode === 0 && (Math.abs(e.deltaX) > .5 || (Math.abs(e.deltaY) < 40 && e.deltaY % 1 !== 0));
      if (trackpad) { const k = this.cam.dist / innerHeight * 1.4; this.cam.pan(e.deltaX * k, e.deltaY * k); }
      else this.cam.zoom(Math.exp(e.deltaY * (e.ctrlKey ? .01 : .0012))); }, { passive: false });
    el.addEventListener('pointermove', e => { this.pointer = { x: e.clientX, y: e.clientY };
      const p = pts.get(e.pointerId); if (!p) return; const px = p.x, py = p.y; p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) p.moved = true;
      if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(a.y - b.y, a.x - b.x);
        if (this.pinch) { this.cam.zoom(this.pinch.d / d); this.cam.rotate(ang - this.pinch.a); } this.pinch = { d, a: ang }; return; }
      if (p.btn === 1) { this.cam.rotate(-(p.x - px) * .006); return; }
      if (p.box) { Object.assign(box.style, { display: 'block', left: Math.min(p.sx, p.x) + 'px', top: Math.min(p.sy, p.y) + 'px', width: Math.abs(p.x - p.sx) + 'px', height: Math.abs(p.y - p.sy) + 'px' }); return; }
      if (p.moved && !(this.place && p.touch && !p.panning && false)) {        // grab-and-drag the map: the ground point under the finger follows it
        p.panning = true; takeControl();
        const a = this.planeAt(px, py), b = this.planeAt(p.x, p.y);
        if (a && b) { const dx = a.x - b.x, dz = a.z - b.z; this.cam.goal.x += dx; this.cam.goal.z += dz; this.cam.target.x += dx; this.cam.target.z += dz;
          const now = performance.now(), ddt = Math.max(1, now - (p.t || now - 16)) / 1000; p.t = now; this.cam.vel.set(dx / ddt, dz / ddt); this.cam.update(0); } }
    });
    el.addEventListener('pointerdown', e => { Snd.init(); if (this.hud.modal) return; el.setPointerCapture(e.pointerId); this.cam.vel.set(0, 0);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, btn: e.button, touch: e.pointerType === 'touch', moved: false, box: e.button === 0 && e.shiftKey && e.pointerType !== 'touch' && !this.place, t: performance.now() });
      if (pts.size === 2) this.pinch = null; });
    const up = e => { const p = pts.get(e.pointerId); if (!p) return; pts.delete(e.pointerId);
      if (pts.size || this.pinch) { if (!pts.size) this.pinch = null; return; }
      box.style.display = 'none'; if (this.hud.modal) return;
      if (p.panning) { if (performance.now() - p.t > 80) this.cam.vel.set(0, 0); return; }      // released while moving: keep gliding
      if (p.box && p.moved) {
        const x0 = Math.min(p.sx, p.x), x1 = Math.max(p.sx, p.x), y0 = Math.min(p.sy, p.y), y1 = Math.max(p.sy, p.y), list = [];
        for (const u of this.world.units) { if (u.team) continue; const a = this.view.anchor(u); if (!a) continue; a.y -= 1.2; a.project(this.camera); const x = (a.x * .5 + .5) * innerWidth, y = (-a.y * .5 + .5) * innerHeight; if (x > x0 && x < x1 && y > y0 && y < y1) list.push(u); }
        this.select(list, true); return; }
      if (p.moved) return;
      takeControl();
      if (p.btn === 2) { if (this.place) return this.setPlace(null); const g = this.cam.groundAt(p.x, p.y), t = this.pick(p.x, p.y); if (g || t) this.order(g ? g.x / S : t.x, g ? g.z / S : t.y, t && t.k !== 'u' || (t && t.team === 1) ? t : null); return; }
      if (p.btn === 0) this.click(p.x, p.y, e, p.touch); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    addEventListener('keydown', e => { Snd.init(); if (this.intro) return; if (e.code !== 'KeyT' && !e.ctrlKey) takeControl(); this.keysDown.add(e.code); this.hotkey(e); });
    addEventListener('keyup', e => this.keysDown.delete(e.code));
    addEventListener('blur', () => this.keysDown.clear());
  }
  keys(dt) { const k = this.keysDown, s = this.cam.dist * 1.1 * dt;
    if (k.has('KeyW') || k.has('ArrowUp')) this.cam.pan(0, -s); if (k.has('KeyS') || k.has('ArrowDown')) this.cam.pan(0, s);
    if (k.has('KeyA') || k.has('ArrowLeft')) this.cam.pan(-s, 0); if (k.has('KeyD') || k.has('ArrowRight')) this.cam.pan(s, 0);
    if (k.has('KeyQ')) this.cam.rotate(dt * 1.6); if (k.has('KeyE')) this.cam.rotate(-dt * 1.6); }
  hotkey(e) {
    if (this.hud.modal) return; const w = this.world, m = /^Digit([1-9])$/.exec(e.code);
    if (m) { const n = m[1];
      if (e.ctrlKey || e.shiftKey) { e.preventDefault(); this.groups[n] = this.sel.slice(); this.hud.toast('Group ' + n + ': ' + this.sel.length + ' units', 'info'); return; }
      const grp = (this.groups[n] || []).filter(u => !u.dead && !u.inside); if (!grp.length) return;
      if (this.lastGroup === n && performance.now() - this.lastGroupT < 400) this.cam.focus(grp.reduce((s, u) => s + u.x, 0) / grp.length * S, grp.reduce((s, u) => s + u.y, 0) / grp.length * S);
      this.select(grp); this.lastGroup = n; this.lastGroupT = performance.now(); return; }
    switch (e.code) {
      case 'Escape': this.setPlace(null); return;
      case 'KeyT': this.hud.setCine(this.director.toggle()); return;
      case 'KeyR': this.toggleRealism(); return;
      case 'Space': e.preventDefault(); if (w.alertPos) this.cam.focus(w.alertPos.x * S, w.alertPos.y * S); return;
      case 'KeyP': this.hud.togglePause(); return;
      case 'KeyF': this.hud.cycleSpeed(); return;
      case 'Period': this.hud.idle(); return;
      case 'KeyG': this.hud.army(); return;
      case 'KeyH': { const tc = w.bld.find(b => b.team === 0 && b.type === 'tc'); if (tc) { this.selectB(tc); this.cam.focus(tc.x * S, tc.y * S); } return; }
      case 'Equal': case 'NumpadAdd': this.cam.zoom(.8); return;
      case 'Minus': case 'NumpadSubtract': this.cam.zoom(1.25); return;
    }
    const i = 'ZXCVBNMJKLYUIO'.indexOf((e.key || '').toUpperCase());
    if (i >= 0 && !e.ctrlKey && !e.metaKey && this.hud.hot[i]) { Snd.play('click'); this.hud.hot[i](); }
  }
}
// let the loading screen paint before the heavy world generation
requestAnimationFrame(() => setTimeout(() => { window.game = new Game(); }, 30));
