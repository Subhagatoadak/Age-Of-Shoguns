// Bridges the simulation to the 3D scene: one view object per entity, kept in sync every frame.
import * as THREE from 'three';
import { S, UT, BT, TEAMC } from '../game/data.js';
import { height, WATER_Y } from './terrain.js';
import { buildHuman, buildHorse, buildQuad, chickenGeo, clips, STYLE, propGeo, MOVES } from './rig.js';
import { buildingGeo, teamTrimGeo, treeGeo, stumpGeo, goldGeo, bushGeo, bannerTex, rockGeo } from './models.js';
import { bldMat, glowMat, vcMat, withFog, piece, merge, shared } from './geo.js';
import { Particles } from './particles.js';

const V3 = new THREE.Vector3(), Q = new THREE.Quaternion(), M4 = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
const wpos = (x, y, dy = 0) => V3.set(x * S, height(x, y) + dy, y * S);
const TOOL = { chop: 'axe', attack: 'axe', mine: 'pick', build: 'hammer', farm: 'hoe', fish: 'rod', pick: 'basket' };
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

// glowing ribbon traced by a weapon's tip and base during a strike
class Trail {
  constructor(scene, color) {
    this.N = 10; this.pts = []; const g = new THREE.BufferGeometry(), n = this.N * 2;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.base = new THREE.Color(color);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const idx = []; for (let i = 0; i < this.N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  update(tip, base, active, fresh) {
    if (fresh) this.pts.length = 0;
    if (active) { if (this.pts.length && this.pts[0][0].distanceTo(tip) > 1.2) this.pts.length = 0; this.pts.unshift([tip.clone(), base.clone()]); } else this.pts.pop();
    if (this.pts.length > this.N) this.pts.length = this.N;
    this.mesh.visible = this.pts.length > 1; if (!this.mesh.visible) return;
    for (let i = 0; i < this.N; i++) { const p = this.pts[Math.min(i, this.pts.length - 1)], k = i < this.pts.length ? Math.pow(1 - i / this.N, 2.4) * .38 : 0;
      this.pos.set([p[0].x, p[0].y, p[0].z, p[1].x, p[1].y, p[1].z], i * 6);
      this.col.set([this.base.r * k, this.base.g * k, this.base.b * k, this.base.r * k * .15, this.base.g * k * .15, this.base.b * k * .15], i * 6); }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.color.needsUpdate = true;
  }
  dispose(scene) { scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}

export class View {
  constructor(scene, world, hooks) {
    this.scene = scene; this.world = world; this.hooks = hooks; this.fx = new Particles(scene);
    this.views = new Map(); this.arrows = []; this.falling = []; this.dying = []; this.ruins = []; this.birds = []; this.birdT = 8; this.shake = [];
    this.flagMat = [0, 1].map(t => withFog(new THREE.MeshStandardMaterial({ map: bannerTex(t), side: THREE.DoubleSide, roughness: .9 }), { wind: 'flag' }));
    this.flagGeo = new THREE.PlaneGeometry(.9, 2.2, 10, 4).translate(.45, 0, 0);
    this.ringGeo = new THREE.RingGeometry(.55, .68, 32).rotateX(-Math.PI / 2);
    this.ringMat = [0, 1].map(t => new THREE.MeshBasicMaterial({ color: t ? 0xff6a5e : 0xbfe0ff, transparent: true, opacity: .85, depthWrite: false }));
    this.arrowGeo = merge([piece(new THREE.CylinderGeometry(.012, .012, .9, 4), 0x8a6a3a, { r: [Math.PI / 2, 0, 0] }), piece(new THREE.ConeGeometry(.025, .09, 4), 0x9aa0a8, { p: [0, 0, .49], r: [Math.PI / 2, 0, 0] }),
      piece(new THREE.BoxGeometry(.002, .05, .14), 0xf0eadc, { p: [0, 0, -.38] }), piece(new THREE.BoxGeometry(.05, .002, .14), 0xf0eadc, { p: [0, 0, -.38] })]);
    // trees: one instanced mesh per species, shared wind shader
    this.treeMat = withFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 }), { wind: .12 });
    this.trees = {}; for (const k of ['pine', 'cedar', 'maple', 'sakura', 'autumn']) { const m = new THREE.InstancedMesh(treeGeo(k), this.treeMat, 420); m.count = 0; m.castShadow = m.receiveShadow = true; m.frustumCulled = false; scene.add(m); this.trees[k] = m; }
    this.stumps = new THREE.InstancedMesh(stumpGeo(), bldMat, 600); this.stumps.count = 0; this.stumps.castShadow = true; scene.add(this.stumps);
    this.scatterRocks();
    this.shocks = []; this.shockGeo = new THREE.RingGeometry(.82, 1, 40).rotateX(-Math.PI / 2);
  }
  // expanding ground shockwave under a heavy blow
  shock(x, y, z, color = 0xfff0c8, size = 2.6) {
    const m = new THREE.Mesh(this.shockGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(x, y + .06, z); this.scene.add(m); this.shocks.push({ m, t: 0, size });
  }
  scatterRocks() {
    const m = [0, 1, 2].map(i => { const im = new THREE.InstancedMesh(rockGeo(i), bldMat, 120); im.count = 0; im.castShadow = im.receiveShadow = true; this.scene.add(im); return im; });
    for (let i = 0; i < 300; i++) { const x = Math.random() * 3000, y = Math.random() * 2000, k = i % 3;
      if (Math.hypot((x - 1400) / 280, (y - 1110) / 160) < 1 || Math.hypot(x - 520, y - 1480) < 200 || Math.hypot(x - 2480, y - 440) < 220) continue;
      const im = m[k]; if (im.count >= 120) continue; const s = .35 + Math.random() * .7;
      im.setMatrixAt(im.count++, M4.compose(wpos(x, y, -.1).clone(), Q.setFromAxisAngle(UP, Math.random() * 6), new THREE.Vector3(s, s * (.6 + Math.random() * .5), s))); }
  }
  // ------------------------------------------------------------ entity creation
  spawn(e) {
    if (e.k === 'c') return this.spawnCitizen(e);
    if (e.k === 'a') return this.spawnAnimal(e);
    if (e.k === 'u') return this.spawnUnit(e);
    if (e.k === 'b') return this.spawnBuilding(e);
    return this.spawnRes(e);
  }
  spawnUnit(u) {
    const root = new THREE.Group(), v = { e: u, root, props: {}, cur: {}, actions: {}, seq: u.atkSeq, lock: 0, yaw: Math.random() * 6, flinch: 0 };
    const style = STYLE[u.type]; v.lib = clips(style);
    if (u.type === 'cav') {
      v.horse = buildHorse(u.team, root);
      const rider = new THREE.Group(); rider.position.set(0, .3, -.08); v.horse.hBody.add(rider);
      v.rig = buildHuman('cav', u.team, rider); this.prop(v, 'handR', 'yari');
      root.scale.setScalar(1.12 * (u.boss ? 1.3 : 1));
    } else {
      v.rig = buildHuman(u.type, u.team, root, { gender: u.g || 'm' });
      if (u.type === 'spear') this.prop(v, 'handR', 'yari');
      if (u.type === 'samurai') this.prop(v, 'handR', 'katana');
      const wpn = v.props.katana;                                 // trails on sword cuts only: thrusts read better without
      if (wpn) { const len = [.62, 1.02]; v.tip = new THREE.Object3D(); v.tip.position.z = len[1]; v.tbase = new THREE.Object3D(); v.tbase.position.z = len[0]; wpn.add(v.tip, v.tbase); }
      if (u.type === 'monk') this.prop(v, 'handR', 'staff');
      if (u.type === 'archer') { this.prop(v, 'handL', 'bow'); this.prop(v, 'handR', 'arrowNock').visible = false; }
      if (u.type === 'vil') { for (const t of ['axe', 'pick', 'hammer', 'hoe', 'rod']) this.prop(v, 'handR', t).visible = false; this.prop(v, 'handL', 'basket').visible = false;
        for (const c of ['wood', 'gold', 'food']) this.prop(v, 'chest', c).visible = false; }
      root.scale.setScalar(1.22 * (u.boss ? 1.45 : 1));
    }
    v.mixer = new THREE.AnimationMixer(root);
    v.ring = new THREE.Mesh(this.ringGeo, this.ringMat[u.team]); v.ring.visible = false; v.ring.scale.setScalar(u.type === 'cav' ? 1.5 : 1); this.scene.add(v.ring);
    root.position.copy(wpos(u.x, u.y)); root.rotation.y = v.yaw;
    this.scene.add(root); this.views.set(u, v);
    this.play(v, u.type === 'cav' ? 'rideIdle' : 'idle', 'r', 0); if (u.type === 'cav') this.play(v, 'hIdle', 'h', 0);
    root.scale.multiplyScalar(.01); v.grow = 0;                     // pop-in
  }
  // ------------------------------------------------------------ townsfolk & animals
  spawnCitizen(c) {
    const root = new THREE.Group(), v = { e: c, root, cur: {}, actions: {}, lock: 0, yaw: Math.random() * 6, props: {} };
    v.lib = clips('cit'); v.rig = buildHuman('cit', 0, root, { gender: c.gender, variant: c.id % 4, elder: c.age >= 58 }); v.elder = c.age >= 58;
    v.mixer = new THREE.AnimationMixer(root); this.play(v, 'idle', 'r', 0);
    this.scaleCit(c, v); root.position.copy(wpos(c.x, c.y)); this.scene.add(root); this.views.set(c, v);
  }
  scaleCit(c, v) { const a = c.age, child = a < 15 ? .55 + a / 15 * .4 : 1; v.root.scale.setScalar(1.18 * child * (c.gender === 'f' ? .95 : 1)); v.rig.j.head.scale.setScalar(a < 15 ? 1.25 - a / 15 * .25 : 1); v.child = a < 15; }
  spawnAnimal(a) {
    const root = new THREE.Group(), v = { e: a, root, cur: {}, actions: {}, lock: 0, yaw: a.face || 0 };
    if (a.kind === 'chicken') { v.mesh = new THREE.Mesh(chickenGeo(), bldMat); v.mesh.castShadow = true; root.add(v.mesh); root.scale.setScalar(1.2); }
    else { buildQuad(a.kind, root); v.lib = clips('quad'); v.mixer = new THREE.AnimationMixer(root); this.play(v, 'graze', 'r', 0);
      root.scale.setScalar(a.kind === 'cow' ? 1.05 : .82); for (const m of root.children) m.traverse(o => o.isMesh && (o.castShadow = true)); }
    root.position.copy(wpos(a.x, a.y)); this.scene.add(root); this.views.set(a, v);
  }
  syncCitizen(c, v, dt) {
    const vis = !v.hidden; v.root.visible = vis; if (!vis) return;
    if (v.child !== (c.age < 15) || Math.random() < .002) this.scaleCit(c, v);
    if (!v.elder && c.age >= 58) { v.elder = true; }                       // ageing shows in the stoop
    const p = wpos(c.x, c.y), r = v.root; r.position.x += (p.x - r.position.x) * Math.min(1, dt * 12); r.position.z += (p.z - r.position.z) * Math.min(1, dt * 12); r.position.y = p.y;
    const want = Math.atan2(Math.cos(c.face), Math.sin(c.face)); v.yaw += angDiff(v.yaw, want) * Math.min(1, dt * 6); r.rotation.y = v.yaw;
    if (r.position.distanceTo(this.camPos || r.position) > 140) return;     // far away: skip animation work
    const spd = (c.run ? 2.2 : c.age < 13 ? 1.25 : v.elder ? .7 : 1) * 26 * S;
    if (c.mv) this.play(v, 'walk', 'r', .25, false, spd / 2.9 * (v.child ? 1.5 : 1));
    else if (c.work && v.lib[c.work]) this.play(v, c.work, 'r', .4);
    else if (c.task === 'pray') this.play(v, 'pray', 'r', .4);
    else this.play(v, 'idle', 'r', .4);
    this.real?.pre(v); v.mixer.update(dt);
    if (v.elder) { v.rig.j.spine.rotation.x += .32; v.rig.j.head.rotation.x -= .2; }
    this.real?.body(c, v, dt, false);
  }
  syncAnimal(a, v, dt, t) {
    const vis = this.world.isExplored(a.x, a.y); v.root.visible = vis; if (!vis) return;
    const p = wpos(a.x, a.y), r = v.root; r.position.x += (p.x - r.position.x) * Math.min(1, dt * 10); r.position.z += (p.z - r.position.z) * Math.min(1, dt * 10); r.position.y = p.y;
    const want = Math.atan2(Math.cos(a.face), Math.sin(a.face)); v.yaw += angDiff(v.yaw, want) * Math.min(1, dt * 4); r.rotation.y = v.yaw;
    if (r.position.distanceTo(this.camPos || r.position) > 160) return;
    if (a.kind === 'chicken') { const hop = a.mv ? Math.abs(Math.sin(t * 14 + a.id)) * .08 : 0, peck = !a.mv && Math.sin(t * 3 + a.id) > .6 ? .7 : 0; v.mesh.position.y = hop; v.mesh.rotation.x = peck; return; }
    if (a.mv) this.play(v, a.kind === 'deer' && a.run ? 'gallop' : 'qWalk', 'r', .3, false, a.kind === 'deer' && a.run ? 1.3 : a.kind === 'cow' ? .55 : 1);
    else this.play(v, 'graze', 'r', .5);
    v.mixer.update(dt);
  }
  // ------------------------------------------------------------ seasons: blossom, deep summer green, red maples, snow
  season(pos) {
    const w = i => Math.max(0, 1 - Math.min(Math.abs(pos - i), Math.abs(pos - i - 4), Math.abs(pos - i + 4)));
    const spring = w(.5), summer = w(1.5), autumn = w(2.5), winter = w(3.5);
    shared.snow.value = winter * .95; shared.autumn.value = autumn * .85;
    if (this.hooks.grass) this.hooks.grass.mesh.visible = winter < .55 && this.hooks.grassOn !== false;
    if (Math.abs((this.lastSeasonPos ?? -9) - pos) < .02) return; this.lastSeasonPos = pos;
    const C = new THREE.Color(), mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const tint = { pine: [1, 1, 1], cedar: [1, 1, 1], maple: [1, 1, 1], autumn: [1, 1, 1], sakura: [1, 1, 1] };
    const blend = (cols) => cols.reduce((acc, [c, k]) => [acc[0] + c[0] * k, acc[1] + c[1] * k, acc[2] + c[2] * k], [0, 0, 0]);
    const W = [[spring], [summer], [autumn], [winter]].map(x => x[0]), tot = W.reduce((a, b) => a + b, 0) || 1;
    const by = (sp, su, au, wi) => blend([[sp, W[0] / tot], [su, W[1] / tot], [au, W[2] / tot], [wi, W[3] / tot]]);
    tint.maple = by([1.1, 1.1, 1], [.85, .9, .8], [2.6, .85, .3], [.62, .5, .42]); tint.autumn = by([1, 1, 1], [.9, .9, .9], [1.2, 1, .9], [.6, .5, .45]);
    tint.sakura = by([1, 1, 1], [.42, .78, .4], [1.4, .7, .35], [.55, .48, .45]); tint.pine = by([1, 1, 1], [.9, .95, .9], [.95, .95, .9], [.85, .9, 1]); tint.cedar = tint.pine;
    for (const [k, im] of Object.entries(this.trees)) { C.setRGB(...tint[k]); for (let i = 0; i < im.count; i++) im.setColorAt(i, C); if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
  // ------------------------------------------------------------ the clan advances an age: fireworks over the castle
  ageUp(b) {
    const v = this.views.get(b); if (!v) return; const x = b.x * S, z = b.y * S, y = v.y + 18;
    for (let i = 0; i < 8; i++) setTimeout(() => { const ox = (Math.random() - .5) * 14, oz = (Math.random() - .5) * 10, oy = Math.random() * 6; this.fx.emit('spark', x + ox, y + oy, z + oz, 60); this.fx.emit('fire', x + ox, y + oy, z + oz, 8); this.hooks.sfx('boom'); }, i * 260);
    this.shock(x, v.y, z, 0xffd36a, 12); this.shock(x, v.y, z, 0xffffff, 8);
  }
  prop(v, joint, kind) { const m = new THREE.Mesh(propGeo(kind), vcMat); m.castShadow = true; v.rig.j[joint].add(m); m.position.y = joint.startsWith('hand') ? -.05 : 0; v.props[kind] = m; return m; }
  play(v, name, layer = 'r', fade = .22, once = false, ts = 1) {
    const clip = v.lib[name]; if (!clip) return;
    let a = v.actions[name]; if (!a) { a = v.actions[name] = v.mixer.clipAction(clip); }
    a.timeScale = ts;
    if (v.cur[layer] === a) { if (once) a.reset().play(); return a; }
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.enabled = true; a.setEffectiveWeight(1);
    if (v.cur[layer]) a.crossFadeFrom(v.cur[layer], fade, false); a.play();
    v.cur[layer] = a; return a;
  }
  spawnBuilding(b) {
    const g = buildingGeo(b.type), root = new THREE.Group(), W = b.w * S, D = b.h * S;
    let y = 1e9; for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) y = Math.min(y, height(b.x + dx * b.w / 2, b.y + dy * b.h / 2));
    root.position.set(b.x * S, y, b.y * S);
    const mat = b.prog < 1 ? this.clipMat() : bldMat;
    const main = new THREE.Mesh(g.geo, mat), trim = new THREE.Mesh(teamTrimGeo(b.type, b.team), mat);
    main.castShadow = main.receiveShadow = trim.castShadow = true; root.add(main, trim);
    if (b.type !== 'farm') { const f = new THREE.Mesh(merge([piece(new THREE.BoxGeometry(W * .96, 3, D * .96), 0x7d776b, { jit: .1 })]), bldMat); f.position.y = -1.48; root.add(f); f.receiveShadow = true; }   // foundation into the slope
    let glow = null; if (g.glow) { glow = new THREE.Mesh(g.glow, glowMat); root.add(glow); }
    const flags = g.flags.map(([fx, fy, fz]) => { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, 4.6, 6), vcMat); pole.geometry = this.poleGeo || (this.poleGeo = merge([piece(new THREE.CylinderGeometry(.04, .05, 4.6, 6), 0x3a2a1a, { p: [0, 2.3, 0] })]));
      const f = new THREE.Mesh(this.flagGeo, this.flagMat[b.team]); f.position.set(.05, 3.2, 0); f.castShadow = true; pole.add(f); pole.position.set(fx, fy, fz); pole.castShadow = true; root.add(pole); return pole; });
    const v = { e: b, root, main, trim, glow, flags, h: g.h, mat, scaffold: null, y };
    if (b.prog < 1) { v.scaffold = this.scaffold(W, D, g.h); root.add(v.scaffold); }
    this.scene.add(root); this.views.set(b, v);
    this.hooks.grass?.clearRect(b);
  }
  clipMat() { const m = bldMat.clone(); m.onBeforeCompile = bldMat.onBeforeCompile; m.customProgramCacheKey = bldMat.customProgramCacheKey; m.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)]; m.clipShadows = true; return m; }
  scaffold(W, D, H) {
    const P = [], bam = 0xb8a066, h = Math.min(H, 14);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) P.push(piece(new THREE.CylinderGeometry(.05, .05, h, 5), bam, { p: [x * (W / 2 + .35), h / 2, z * (D / 2 + .35)] }));
    for (let k = 1; k <= Math.floor(h / 2.2); k++) { const y = k * 2.2; P.push(piece(new THREE.BoxGeometry(W + .8, .05, .05), bam, { p: [0, y, D / 2 + .35] }), piece(new THREE.BoxGeometry(W + .8, .05, .05), bam, { p: [0, y, -D / 2 - .35] }),
      piece(new THREE.BoxGeometry(.05, .05, D + .8), bam, { p: [W / 2 + .35, y, 0] }), piece(new THREE.BoxGeometry(.05, .05, D + .8), bam, { p: [-W / 2 - .35, y, 0] }),
      piece(new THREE.BoxGeometry(W + .6, .04, .4), 0x8a7048, { p: [0, y - .02, D / 2 + .5] })); }
    const m = new THREE.Mesh(merge(P), bldMat); m.castShadow = true; return m;
  }
  spawnRes(r) {
    const v = { e: r };
    if (r.kind === 'tree') {
      const kind = r.v === 0 ? 'pine' : r.v === 1 ? 'cedar' : r.id % 5 === 0 ? 'sakura' : r.id % 7 === 0 ? 'autumn' : 'maple';
      const im = this.trees[kind]; v.im = im; v.idx = im.count++; v.rot = Math.random() * 6.28; v.sc = .8 + Math.random() * .45; v.pos = wpos(r.x, r.y, -.05).clone();
      v.mat = M4.compose(v.pos, Q.setFromAxisAngle(UP, v.rot), V3.clone().setScalar(v.sc)).clone(); im.setMatrixAt(v.idx, v.mat); im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere?.();
    } else if (r.kind === 'fish') {
      const g = new THREE.Group(); g.position.set(r.x * S, WATER_Y + .02, r.y * S);
      v.rings = [0, 1].map(i => { const m = new THREE.Mesh(new THREE.RingGeometry(.6, .7, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: .5, depthWrite: false })); m.userData.ph = i * .5; g.add(m); return m; });
      v.root = g; this.scene.add(g);
    } else {
      const m = new THREE.Mesh(r.kind === 'gold' ? goldGeo() : bushGeo(), bldMat); m.castShadow = m.receiveShadow = true;
      m.position.copy(wpos(r.x, r.y, -.1)); m.rotation.y = Math.random() * 6; v.root = m; v.base = r.kind === 'gold' ? 1.1 : 1; m.scale.setScalar(v.base); this.scene.add(m);
    }
    this.views.set(r, v);
  }
  // ------------------------------------------------------------ events
  remove(e) {
    const v = this.views.get(e); if (!v) return; this.views.delete(e);
    if (e.k === 'c' || e.k === 'a') { if (e.k === 'c' && e.age >= 58 && v.root.visible) { v.mixer.stopAllAction(); v.cur = {}; this.play(v, 'die', 'r', .1, true); v.t = 0; v.ring = new THREE.Object3D(); this.dying.push(v); } else this.scene.remove(v.root); return; }
    if (e.k === 'u') { v.dead = true; v.ring.visible = false; v.mixer.stopAllAction(); v.cur = {};
      if (e.type === 'cav') { this.play(v, 'hDie', 'h', .1, true); } this.play(v, 'die', 'r', .1, true); v.t = 0; this.dying.push(v); return; }
    if (e.k === 'b') { this.fx.emit('rubble', e.x * S, v.y + 2, e.y * S, 50); for (let i = 0; i < 12; i++) this.fx.emit('smoke', e.x * S + (Math.random() - .5) * e.w * S, v.y + 1 + Math.random() * 3, e.y * S + (Math.random() - .5) * e.h * S, 1);
      v.t = 0; v.tilt = (Math.random() - .5) * .3; this.ruins.push(v); this.hooks.shake?.(e); return; }
    if (e.kind === 'tree') { v.t = 0; const a = Math.random() * 6.28; v.axis = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)); this.falling.push(v);
      this.stumps.setMatrixAt(this.stumps.count++, M4.compose(v.pos, Q.setFromAxisAngle(UP, v.rot), V3.clone().setScalar(v.sc))); this.stumps.instanceMatrix.needsUpdate = true;
      if (Math.random() < .5) this.spawnFlock(e.x * S, 9, e.y * S, 3); return; }
    if (v.root) { v.dead = true; v.t = 0; this.ruins.push(v); }
  }
  hit(e, src) {
    const v = this.views.get(e); if (!v) return; const y = e.k === 'b' ? v.y + 2.5 : height(e.x, e.y) + 1.3;
    const melee = src && src.k === 'u' && src.type !== 'archer';
    if (e.k === 'u' && melee && v.lock <= 0 && e.hp > 0 && e.type !== 'cav') {           // defender reacts: parry, sidestep or stagger
      const r = Math.random(), armed = e.type === 'samurai' || e.type === 'spear';
      const re = armed && r < .35 ? 'block' : r < .5 ? 'dodge' : 'hitReact'; const a = this.play(v, re, 'r', .06, true); if (a) v.lock = a.getClip().duration * .8; v.move = null;
      if (re === 'block') { this.fx.emit('spark', e.x * S, y + .3, e.y * S, 14); this.hooks.sfx('clash', e.x, e.y); }
    }
    this.fx.emit('hit', e.x * S, y, e.y * S, melee ? 12 : 7); if (e.k === 'u') { this.fx.emit('blood', e.x * S, y - .2, e.y * S, melee ? 16 : 5); v.flinch = 1; }
    if (melee && e.k === 'u') { const sv = this.views.get(src), mv = sv && sv.move, heavy = e.hp <= 0 || src.boss || ['kickR', 'flyKick', 'spin', 'kickF', 'sweep'].includes(mv);
      if (src.type === 'samurai' || src.type === 'spear' || src.type === 'cav') this.fx.emit('spark', e.x * S, y + .2, e.y * S, 8);
      if (heavy) { const gy = height(e.x, e.y); this.shock(e.x * S, gy, e.y * S, e.hp <= 0 ? 0xffb080 : 0xfff0c8, e.hp <= 0 ? 3.4 : 2.4); this.fx.emit('dust', e.x * S, gy + .2, e.y * S, 10); } }
    this.real?.onHit(e, src, v, melee);
    this.hooks.hit?.(e, src);
    if (e.k === 'b' && Math.random() < .5) this.fx.emit('dust', e.x * S + (Math.random() - .5) * e.w * S * .8, y - 1, e.y * S + e.h * S * .45, 3);
  }
  harvest(r, u) {
    const v = this.views.get(r); if (!v) return; const x = r.x * S, z = r.y * S, y = height(r.x, r.y);
    if (r.kind === 'tree') { this.fx.emit('wood', x, y + 1.2, z); this.hooks.sfx('chop', r.x, r.y); v.shakeT = .35; if (!this.shake.includes(v)) this.shake.push(v); }
    else if (r.kind === 'gold') { this.fx.emit('gold', x, y + .8, z); this.fx.emit('dust', x, y + .4, z, 2); this.hooks.sfx('mine', r.x, r.y); v.root.scale.setScalar(v.base * (.45 + .55 * Math.sqrt(r.amt / r.max))); }
    else if (r.kind === 'fish') this.fx.emit('water', x, WATER_Y + .1, z);
    else { this.fx.emit('food', x, y + .7, z); v.root.scale.setScalar(.5 + .5 * r.amt / r.max); }
  }
  heal(t) { this.fx.emit('heal', t.x * S, height(t.x, t.y) + 1.2, t.y * S); }
  fxAt(kind, x, y, n) { this.fx.emit(kind, x * S, height(x, y) + .3, y * S, n); }
  completed(b) {
    const v = this.views.get(b); if (!v) return;
    if (v.scaffold) { v.root.remove(v.scaffold); v.scaffold = null; }
    v.main.material = v.trim.material = bldMat; v.mat = bldMat;
    for (let i = 0; i < 16; i++) this.fx.emit('dust', b.x * S + (Math.random() - .5) * b.w * S, v.y + .3, b.y * S + (Math.random() - .5) * b.h * S, 2);
    v.pop = 0;
  }
  shoot(p) { const m = new THREE.Mesh(this.arrowGeo, vcMat); m.castShadow = true; this.scene.add(m); this.arrows.push({ p, m, sy: height(p.sx, p.sy) + p.sh * S }); }
  hide(u, h) { const v = this.views.get(u); if (v) { v.root.visible = !h; v.hidden = h; } }
  spawnFlock(x, y, z, n) {
    const dir = Math.random() * 6.28;
    for (let i = 0; i < n; i++) { const g = new THREE.Group(), body = new THREE.Mesh(this.birdBody || (this.birdBody = merge([piece(new THREE.ConeGeometry(.06, .4, 5), 0x1e1e24, { r: [Math.PI / 2, 0, 0] })])), vcMat);
      const wing = this.birdWing || (this.birdWing = merge([piece(new THREE.BoxGeometry(.45, .01, .14), 0x26262c, { p: [.22, 0, 0] })]));
      const l = new THREE.Mesh(wing, vcMat), r = new THREE.Mesh(wing, vcMat); r.scale.x = -1; g.add(body, l, r); g.position.set(x + (Math.random() - .5) * 3, y + Math.random() * 2, z + (Math.random() - .5) * 3);
      g.rotation.y = dir + Math.PI / 2; this.scene.add(g); this.birds.push({ g, l, r, vx: Math.cos(dir) * 9, vz: Math.sin(dir) * 9, vy: 2 + Math.random(), t: Math.random() * 6, life: 18 }); }
  }
  // ------------------------------------------------------------ per-frame sync
  update(dt, t, cam, night, focus, wet) {
    shared.time.value = t; shared.wind.value = 1 + wet * 1.5;
    glowMat.emissiveIntensity = night * 2.6 + .15;
    const W = this.world;
    for (const [e, v] of this.views) {
      if (e.k === 'u') this.syncUnit(e, v, dt);
      else if (e.k === 'c') this.syncCitizen(e, v, dt);
      else if (e.k === 'a') this.syncAnimal(e, v, dt, t);
      else if (e.k === 'b') this.syncBuilding(e, v, dt, t);
      else if (e.kind === 'fish') for (const m of v.rings) { const f = (t * .35 + m.userData.ph) % 1; m.scale.setScalar(.4 + f * 1.8); m.material.opacity = .5 * (1 - f); }
    }
    this.camPos = cam.position;
    for (const s of this.shocks) { s.t += dt; const f = Math.min(1, s.t / .42); s.m.scale.setScalar(.3 + f * s.size); s.m.material.opacity = .8 * (1 - f); if (f >= 1) { this.scene.remove(s.m); s.m.material.dispose(); s.gone = true; } }
    this.shocks = this.shocks.filter(s => !s.gone);
    for (const v of this.dying) { if (v.trail) { v.trail.dispose(this.scene); v.trail = null; } v.t += dt; v.mixer.update(dt); this.real?.dying(v, dt); if (v.t > 4) { v.root.position.y -= dt * .4; } if (v.t > 6.5) { this.scene.remove(v.root, v.ring); v.gone = true; } }
    this.dying = this.dying.filter(v => !v.gone);
    for (const v of this.ruins) { v.t += dt;
      if (v.e.k === 'b') { const k = Math.min(1, v.t / 1.6); v.root.position.y = v.y - k * k * v.h * .55; v.root.rotation.z = v.tilt * k; v.root.rotation.x = v.tilt * .5 * k;
        if (v.t < 3 && Math.random() < dt * 8) this.fx.emit('smoke', v.e.x * S, v.y + 1, v.e.y * S, 1);
        if (v.t > 1.6 && !v.ruinMesh) { v.root.visible = false; v.ruinMesh = this.ruin(v.e, v.y); }
        if (v.t > 45 && v.ruinMesh) { v.ruinMesh.position.y -= dt * .1; } if (v.t > 60) { this.scene.remove(v.root, v.ruinMesh); v.gone = true; } }
      else { const k = Math.min(1, v.t / .5); v.root.scale.setScalar((v.base || 1) * (1 - k) + .001); if (k >= 1) { this.scene.remove(v.root); v.gone = true; } } }
    this.ruins = this.ruins.filter(v => !v.gone);
    for (const v of this.falling) { v.t += dt; const k = Math.min(1, v.t / 1.3), ang = k * k * 1.5;
      Q.setFromAxisAngle(v.axis, ang).multiply(new THREE.Quaternion().setFromAxisAngle(UP, v.rot));
      const sink = v.t > 3.5 ? (v.t - 3.5) * .8 : 0, sc = v.t > 5 ? Math.max(0, 1 - (v.t - 5)) : 1;
      if (k >= 1 && !v.thud) { v.thud = true; const d = V3.set(-v.axis.z, 0, v.axis.x).multiplyScalar(-4); this.fx.emit('dust', v.pos.x + d.x, v.pos.y + .3, v.pos.z + d.z, 14); this.fx.emit('wood', v.pos.x + d.x, v.pos.y + .5, v.pos.z + d.z, 8); this.hooks.sfx('timber', v.e.x, v.e.y); }
      v.im.setMatrixAt(v.idx, M4.compose(V3.copy(v.pos).setY(v.pos.y - sink), Q, new THREE.Vector3().setScalar(v.sc * sc + .0001))); v.im.instanceMatrix.needsUpdate = true; if (v.t > 6) v.gone = true; }
    this.falling = this.falling.filter(v => !v.gone);
    for (const v of this.shake) { v.shakeT -= dt; const a = Math.max(0, v.shakeT) * .12 * Math.sin(t * 60);
      v.im.setMatrixAt(v.idx, M4.compose(v.pos, Q.setFromAxisAngle(UP, v.rot).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a)), V3.clone().setScalar(v.sc))); v.im.instanceMatrix.needsUpdate = true; }
    this.shake = this.shake.filter(v => v.shakeT > 0 && !this.falling.includes(v));
    // arrows on ballistic arcs
    for (const a of this.arrows) { const p = a.p, k = Math.min(1, p.t / p.T), tx = p.tx * S, tz = p.ty * S, ty = height(p.tx, p.ty) + (p.tgt.k === 'b' ? 2.5 : 1.3);
      const x = p.sx * S + (tx - p.sx * S) * k, z = p.sy * S + (tz - p.sy * S) * k, y = a.sy + (ty - a.sy) * k + Math.sin(k * Math.PI) * Math.hypot(tx - p.sx * S, tz - p.sy * S) * .12;
      if (a.last) { V3.set(x, y, z); a.m.position.copy(a.last); a.m.lookAt(V3); } a.m.position.set(x, y, z); a.last = a.m.position.clone();
      if (p.done || k >= 1) { a.gone = true; this.scene.remove(a.m); } }
    this.arrows = this.arrows.filter(a => !a.gone);
    // ambient life: birds by day, fireflies by night, splashes in rain
    if ((this.birdT -= dt) <= 0) { this.birdT = 14 + Math.random() * 20; if (night < .5 && wet < .5) this.spawnFlock(focus.x + (Math.random() - .5) * 60, 22 + Math.random() * 10, focus.z + (Math.random() - .5) * 60, 4 + Math.floor(Math.random() * 5)); }
    for (const b of this.birds) { b.t += dt; b.life -= dt; b.g.position.x += b.vx * dt; b.g.position.z += b.vz * dt; b.g.position.y += b.vy * dt * Math.max(0, 1 - b.t / 4); const f = Math.sin(b.t * 14) * .8; b.l.rotation.z = f; b.r.rotation.z = -f; if (b.life <= 0) { this.scene.remove(b.g); b.gone = true; } }
    this.birds = this.birds.filter(b => !b.gone);
    if (night > .6 && wet < .3 && Math.random() < dt * 14) { const a = Math.random() * 6.28, d = Math.random() * 45, x = focus.x + Math.cos(a) * d, z = focus.z + Math.sin(a) * d; this.fx.emit('firefly', x, height(x / S, z / S) + .5 + Math.random() * 2, z, 1); }
    if (wet > .2) for (let i = 0; i < wet * 6; i++) { const x = focus.x + (Math.random() - .5) * 80, z = focus.z + (Math.random() - .5) * 80; this.fx.emit('splash', x, height(x / S, z / S) + .05, z, 1); }
    this.fx.update(dt);
  }
  ruin(b, y) {
    const P = [piece(new THREE.CircleGeometry(Math.max(b.w, b.h) * S * .62, 20), 0x1e1812, { r: [-Math.PI / 2, 0, 0], p: [0, .06, 0] })];
    for (let i = 0; i < 24; i++) P.push(piece(new THREE.DodecahedronGeometry(.25 + Math.random() * .4), [0x5b4a3a, 0x7d7568, 0x3a2e26][i % 3], { p: [(Math.random() - .5) * b.w * S * .8, .15, (Math.random() - .5) * b.h * S * .8], s: [1, .6, 1], jit: .2 }));
    for (let i = 0; i < 6; i++) P.push(piece(new THREE.BoxGeometry(.18, .18, 2 + Math.random() * 2), 0x1a1410, { p: [(Math.random() - .5) * b.w * S * .6, .25, (Math.random() - .5) * b.h * S * .6], r: [Math.random() * .3, Math.random() * 3, .2] }));
    const m = new THREE.Mesh(merge(P), bldMat); m.position.set(b.x * S, y, b.y * S); m.receiveShadow = true; this.scene.add(m); return m;
  }
  syncUnit(u, v, dt) {
    const W = this.world, vis = !v.hidden && (u.team === 0 || W.isExplored(u.x, u.y));
    v.root.visible = vis; v.ring.visible = vis && !!u.sel;
    const p = wpos(u.x, u.y), r = v.root;
    r.position.x += (p.x - r.position.x) * Math.min(1, dt * 16); r.position.z += (p.z - r.position.z) * Math.min(1, dt * 16); r.position.y = p.y;
    if (v.grow < 1) { v.grow = Math.min(1, v.grow + dt * 3); const s = (u.type === 'cav' ? 1.12 : 1.22) * (u.boss ? (u.type === 'cav' ? 1.3 : 1.45) : 1); r.scale.setScalar(s * (1 - Math.pow(1 - v.grow, 3))); }
    const want = Math.atan2(Math.cos(u.face), Math.sin(u.face)); v.yaw += angDiff(v.yaw, want) * Math.min(1, dt * 9); r.rotation.y = v.yaw;
    v.ring.position.set(r.position.x, p.y + .05, r.position.z);
    if (!vis && v.lock <= 0) { this.real?.pre(v); v.mixer.update(dt); return; }
    // animation state machine
    const cav = u.type === 'cav', spd = UT[u.type].spd * S;
    v.lock -= dt;
    if (u.atkSeq !== v.seq) { v.seq = u.atkSeq;
      if (cav) { this.play(v, 'rideAttack', 'r', .1, true); this.play(v, 'hRear', 'h', .15, true); v.lock = .8; }
      else { const list = u.work === 'chop' && u.type === 'vil' && !u.tgt ? ['attack'] : MOVES[STYLE[u.type]] || ['attack'];
        let mv = list[Math.floor(Math.random() * list.length)]; if (mv === v.lastMove && list.length > 1) mv = list[(list.indexOf(mv) + 1) % list.length];
        if (u.boss && Math.random() < .35) mv = v.lib.flyKick ? 'flyKick' : mv; v.lastMove = mv;
        const a = this.play(v, mv, 'r', .1, true) || this.play(v, 'attack', 'r', .1, true); v.lock = a ? a.getClip().duration * .92 : .6; v.move = mv;
        this.hooks.attack?.(u, mv); } }
    if (v.lock <= 0) {
      if (cav) { if (u.mv) { this.play(v, 'ride', 'r', .25, false, spd / 4.2); this.play(v, 'gallop', 'h', .25, false, spd / 4.2); } else { this.play(v, 'rideIdle', 'r', .35); this.play(v, 'hIdle', 'h', .35); } }
      else if (u.mv) this.play(v, 'walk', 'r', .2, false, spd / 2.9);
      else if (u.work && v.lib[u.work]) this.play(v, u.work, 'r', .25);
      else this.play(v, 'idle', 'r', .35);
    }
    if (u.type === 'vil') { const tool = TOOL[u.work] || (v.lock > 0 ? 'axe' : null);
      for (const k of ['axe', 'pick', 'hammer', 'hoe', 'rod']) v.props[k].visible = tool === k;
      v.props.basket.visible = tool === 'basket';
      for (const c of ['wood', 'gold', 'food']) v.props[c].visible = u.carryN > 0 && u.carry === c; }
    if (u.type === 'archer') { const a = v.actions.attack, tt = a && v.cur.r === a ? a.time : 0; v.props.arrowNock.visible = a && v.cur.r === a && tt > .3 && tt < 1.0; }
    this.real?.pre(v); v.mixer.update(dt);
    if (v.tip) { const near = r.position.distanceTo(this.camPos || r.position) < 150, swinging = v.lock > 0 && v.move && v.move !== 'punch' && !v.move.startsWith('kick') && v.move !== 'flyKick';
      if (near && (swinging || v.trail)) { if (!v.trail) v.trail = new Trail(this.scene, u.team ? 0xffb090 : 0xcfe4ff); r.updateMatrixWorld(true); v.trail.update(v.tip.getWorldPosition(new THREE.Vector3()), v.tbase.getWorldPosition(new THREE.Vector3()), swinging, v.trailSeq !== v.seq); v.trailSeq = v.seq; } }
    if (v.flinch > .01) { v.flinch *= Math.pow(.004, dt); v.rig.j.spine.rotation.x -= v.flinch * .35; v.rig.j.head.rotation.x -= v.flinch * .3; }
    this.real?.body(u, v, dt, u.type === 'cav');
    if (u.type === 'cav' && u.mv && vis && Math.random() < dt * 10) this.fx.emit('dust', r.position.x + (Math.random() - .5), p.y + .1, r.position.z + (Math.random() - .5), 2);   // hooves throw up dust
    if (u.regen && Math.random() < dt * 1.2) this.fx.emit('heal', r.position.x, p.y + 1, r.position.z, 1);
  }
  syncBuilding(b, v, dt, t) {
    const vis = b.team === 0 || this.world.isExplored(b.x, b.y); v.root.visible = vis;
    if (b.prog < 1 && v.mat.clippingPlanes) v.mat.clippingPlanes[0].constant = v.y + Math.max(.15, b.prog) * v.h;
    if (v.pop !== undefined && v.pop < 1) { v.pop = Math.min(1, v.pop + dt * 2.5); v.root.scale.y = 1 + Math.sin(v.pop * Math.PI) * .04; }
    if (!vis) return;
    const x = b.x * S, z = b.y * S;
    if (b.prog >= 1 && b.hp < b.max * .55 && Math.random() < dt * 4) this.fx.emit('smoke', x + (Math.random() - .5) * b.w * S * .6, v.y + v.h * .5, z + (Math.random() - .5) * b.h * S * .6, 1);
    if (b.prog >= 1 && b.hp < b.max * .3 && Math.random() < dt * 14) this.fx.emit('fire', x + (Math.random() - .5) * b.w * S * .7, v.y + Math.random() * v.h * .6, z + (Math.random() - .5) * b.h * S * .7, 2);
    if (b.type === 'smith' && b.prog >= 1) { if (Math.random() < dt * 2.5) this.fx.emit('smoke', x + b.w * S * .3, v.y + 6.6, z - b.h * S * .1, 1);
      if (Math.random() < dt * 1.2) { this.fx.emit('spark', x - b.w * S * .35, v.y + .9, z + b.h * S * .5 + .3, 8); this.hooks.sfx('hammer', b.x, b.y); } }
  }
  ghost(type, x, y, ok) {
    if (!type) { if (this.gh) this.gh.visible = false; return; }
    if (!this.gh || this.ghType !== type) { if (this.gh) this.scene.remove(this.gh); const g = buildingGeo(type);
      this.gh = new THREE.Mesh(g.geo, this.ghostMat || (this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x80ff80, transparent: true, opacity: .45, depthWrite: false }))); this.ghType = type; this.scene.add(this.gh); }
    this.gh.visible = true; this.gh.position.set(x * S, height(x, y) + .05, y * S); this.ghostMat.color.set(ok ? 0x7dff8a : 0xff5a5a);
  }
  // world-space anchor for HTML health bars and labels
  anchor(e) { const v = this.views.get(e); if (!v || (v.root && !v.root.visible)) return null;
    if (e.k === 'u') return V3.set(v.root.position.x, v.root.position.y + (e.type === 'cav' ? 3.3 : 2.6) * (e.boss ? 1.35 : 1), v.root.position.z).clone();
    if (e.k === 'b') return V3.set(e.x * S, v.y + Math.min(v.h, 14) + 1, e.y * S).clone(); return null; }
}
