// Pure game simulation: no rendering. The view layer subscribes to events in `ev`.
import { WW, WH, LAKE, COST, UT, BT, TECH, TRAIN, GARRISON, DIFF, FORESTS, WONDER_T, NC, NW, NH, AGES, AGE_REQ, BORDER, ATTRITION, RAID_DEFAULT } from './data.js';
import { Society } from './society.js';
import { clamp, rectDist, makeRng } from './util.js';

const noop = () => {};

export class World {
  constructor(ev = {}) {
    this.ev = new Proxy(ev, { get: (o, k) => o[k] || noop });
    this.paused = true; this.over = false; this.t = 0; this.speed = 1;
    this.res = { food: 200, wood: 220, gold: 100 };
    this.units = []; this.bld = []; this.rs = []; this.proj = []; this.timers = [];
    this.wave = 0; this.nextWave = 170; this.nextGuard = 60; this.nid = 1;
    this.tech = [new Set(), new Set()]; this.diffKey = 'normal'; this.diff = DIFF.normal;
    this.stats = { trained: 0, kills: 0, lost: 0, gathered: 0, built: 0 };
    this.alertT = -99; this.alertPos = null; this.wonder = null; this.bellOn = false;
    this.price = { wood: 1, food: 1 }; this.wet = 0; this.raining = false; this.rainT = 160 + Math.random() * 60;
    this.navDirty = true; this.pathBudget = 4;
    this.explored = new Uint8Array(NW * NH); this.exploredDirty = true;
    this.rng = makeRng(42);
    this.age = 0; this.raid = { ...RAID_DEFAULT }; this.terr = new Uint8Array(NW * NH); this.terrDirty = true; this.night = 0;
    this.soc = new Society(this);
  }
  // ------------------------------------------------------------ setup
  buildMap() {
    const R = this.rng.range;
    this.addB(0, 'tc', 520, 1480, true);
    for (let i = 0; i < 4; i++) this.addU(0, 'vil', 450 + i * 30, 1580);
    this.addU(0, 'spear', 600, 1560);
    for (const [t, x, y] of [['tc', 2480, 440], ['barracks', 2260, 330], ['tower', 2330, 640], ['tower', 2620, 640], ['house', 2650, 300], ['house', 2700, 380], ['farm', 2560, 260]]) this.addB(1, t, x, y, true);
    for (let i = 0; i < 4; i++) this.addU(1, 'spear', 2380 + i * 30, 580, 'guard');
    this.addU(1, 'archer', 2500, 600, 'guard');
    const pts = [];
    for (const [cx, cy, n, rad] of FORESTS) for (let i = 0; i < n; i++) { const a = R(0, 6.28), d = Math.sqrt(this.rng()) * rad; pts.push(['tree', cx + Math.cos(a) * d, cy + Math.sin(a) * d]); }
    const gold = (x, y, n) => { for (let i = 0; i < n; i++) pts.push(['gold', x + i * 26, y + (i % 2) * 14]); };
    gold(760, 1330, 4); gold(1450, 960, 5); gold(2250, 780, 4); gold(400, 920, 3); gold(1900, 1150, 4);
    const berry = (x, y, n) => { for (let i = 0; i < n; i++) pts.push(['berry', x + (i % 3) * 30, y + Math.floor(i / 3) * 28]); };
    berry(640, 1630, 6); berry(1050, 1500, 6); berry(2150, 1050, 6);
    for (const [k, x, y] of pts) {
      if (x < 15 || y < 15 || x > WW - 15 || y > WH - 15) continue;
      if (this.bld.some(b => rectDist(b, x, y) < 30)) continue;
      if (Math.hypot((x - LAKE.x) / (LAKE.rx + 30), (y - LAKE.y) / (LAKE.ry + 30)) < 1) continue;
      if (this.rs.some(r => Math.hypot(r.x - x, r.y - y) < 18)) continue;
      this.addR(k, x, y);
    }
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + .35; this.addR('fish', LAKE.x + Math.cos(a) * (LAKE.rx - 6), LAKE.y + Math.sin(a) * (LAKE.ry - 6)); }
    this.soc.start();
  }
  setDifficulty(k) { this.diffKey = k; this.diff = DIFF[k]; this.nextWave = this.raid.first ?? this.diff.first; for (const r in this.res) this.res[r] = Math.round(this.res[r] * this.diff.res); }
  later(sec, fn) { this.timers.push({ t: this.t + sec, fn }); }
  // ------------------------------------------------------------ entities
  addU(team, type, x, y, mode, boss) {
    const s = UT[type], hp = s.hp * this.hpMul(team, type) * (boss ? 5 : 1);
    const u = { id: this.nid++, k: 'u', team, type, x, y, hp, max: hp, g: type === 'vil' && Math.random() < .5 ? 'f' : 'm', st: 'idle', mode: mode || 'idle', face: 0, cd: 0, carry: null, carryN: 0, gt: 0, mv: false,
      hx: x, hy: y, atkT: 0, atkSeq: 0, kills: 0, rank: 0, boss: !!boss, work: null };
    this.units.push(u); this.ev.spawn(u); return u;
  }
  addB(team, type, x, y, done) {
    const t = BT[type], max = t.hp * (this.tech[team].has('masonry') ? 1.4 : 1);
    const b = { id: this.nid++, k: 'b', team, type, x, y, w: t.w, h: t.h, hp: done ? max : max * .15, max, prog: done ? 1 : 0, q: [], qt: 0, rally: null, cd: Math.random(), rk: null, rt: 0, gar: [] };
    this.bld.push(b); this.navDirty = true; this.terrDirty = true; this.ev.spawn(b); return b;
  }
  addR(kind, x, y) {
    const amt = { tree: 100, gold: 300, berry: 120, fish: 220 }[kind];
    const r = { id: this.nid++, k: 'r', kind, x, y, amt, max: amt, r: { tree: 14, gold: 16, fish: 12, berry: 13 }[kind], v: Math.floor(this.rng() * 3) };
    this.rs.push(r); this.navDirty = true; this.ev.spawn(r); return r;
  }
  alive(e) { return e && !e.dead; }
  hpMul(team, type) { return type !== 'vil' && type !== 'monk' && this.tech[team].has('armor') ? 1.35 : 1; }
  hasB(type, team = 0) { return this.bld.some(b => b.team === team && b.type === type && b.prog >= 1); }
  atkOf(u, t) {
    let a = UT[u.type].atk * (u.type !== 'vil' && this.tech[u.team].has('steel') ? 1.3 : 1) * (1 + .12 * u.rank) * (u.boss ? 2 : 1);
    if (u.team === 1) a *= this.diff.atk;
    if (t && u.type === 'spear' && t.type === 'samurai') a *= 1.6;
    if (t && u.type === 'spear' && t.type === 'cav') a *= 2;
    if (t && u.type === 'samurai' && t.k === 'b') a *= 1.5;
    if (t && u.type === 'cav' && t.type === 'archer') a *= 1.5;
    return a;
  }
  rngOf(u) { return u.type === 'archer' ? (UT.archer.rng + (this.tech[u.team].has('fletch') ? 45 : 0)) * (1 - .2 * this.wet) : UT[u.type].rng; }
  applyTech(team, k) {
    if (this.tech[team].has(k)) return; this.tech[team].add(k);
    if (k === 'armor') for (const u of this.units) if (u.team === team && u.type !== 'vil' && u.type !== 'monk') { u.max *= 1.35; u.hp *= 1.35; }
    if (k === 'masonry') for (const b of this.bld) if (b.team === team) { b.max *= 1.4; b.hp *= 1.4; }
    if (team === 0) { this.ev.toast(TECH[k].name + ' researched: ' + TECH[k].desc, 'good'); this.ev.sfx('built'); }
    else if (this.wave) this.ev.toast('The enemy has learned ' + TECH[k].name.toLowerCase() + '!', 'warn');
    this.ev.refresh();
  }
  addKill(u) {
    u.kills++; const r = u.kills >= 12 ? 3 : u.kills >= 6 ? 2 : u.kills >= 2 ? 1 : 0;
    if (r > u.rank) { u.rank = r; u.hp = Math.min(u.max, u.hp + u.max * .3); if (u.team === 0) { this.ev.float(u.x, u.y, '★'.repeat(r) + ' veteran'); this.ev.sfx('rank', u.x, u.y); } }
  }
  kill(e) {
    if (e.dead) return; e.dead = true;
    if (e.k === 'u') {
      this.units = this.units.filter(u => u !== e);
      if (e.team === 0) { this.stats.lost++; this.soc.lostThisMonth++; } else { this.stats.kills++; if (e.boss) this.ev.toast('The ronin warlord has fallen!', 'good'); }
    } else if (e.k === 'b') {
      this.bld = this.bld.filter(b => b !== e); this.navDirty = true; this.terrDirty = true; if (e.team === 0) this.soc.lost(e); this.ev.sfx('collapse', e.x, e.y);
      if (e.gar.length) this.release(e);
      if (this.wonder && this.wonder.b === e) { this.wonder = null; this.ev.toast('The Great Pagoda has fallen!', 'bad'); }
      if (e.type === 'tc' && !this.over) { this.over = true; this.ev.end(e.team === 1); }
      else if (e.team === 1) this.ev.toast('Enemy ' + BT[e.type].name.toLowerCase() + ' destroyed', 'good');
    } else { this.rs = this.rs.filter(r => r !== e); this.navDirty = true; }
    this.ev.remove(e); this.ev.refresh();
  }
  damage(e, d, src) {
    if (e.dead) return;
    e.hp -= d;
    // melee knockback: a step back on every blow, flung clear on a killing blow
    if (e.k === 'u' && src && src.k === 'u' && src.type !== 'archer') { const dx = e.x - src.x, dy = e.y - src.y, dd = Math.hypot(dx, dy) || 1, kb = e.hp <= 0 ? 16 : 4; e.x += dx / dd * kb; e.y += dy / dd * kb; }
    this.ev.hit(e, src);
    if (e.k === 'u' && src && this.alive(src) && e.type !== 'monk' && e.st !== 'attack' && (e.team === 1 || e.type !== 'vil')) { e.st = 'attack'; e.tgt = src; }
    if (e.team === 0 && src && src.team === 1) this.alert(e.x, e.y);
    if (e.hp <= 0) { if (src && src.k === 'u' && this.alive(src) && src.team !== e.team) this.addKill(src); this.kill(e); }
  }
  alert(x, y) { this.soc.raidedThisMonth = true; if (this.t - this.alertT < 8) return; this.alertT = this.t; this.alertPos = { x, y }; this.ev.alert(x, y); }
  shoot(src, tgt, dmg, h) {
    this.ev.sfx('arrow', src.x, src.y);
    const T = Math.max(.3, Math.hypot(tgt.x - src.x, tgt.y - src.y) / 400);
    const p = { sx: src.x, sy: src.y, sh: h, tgt, tx: tgt.x, ty: tgt.y, t: 0, T, dmg, src };
    this.proj.push(p); this.ev.shoot(p);
  }
  // ------------------------------------------------------------ fog of war (logic grid, shared with the nav grid)
  reveal(x, y, r) {
    const c0 = Math.max(0, Math.floor((x - r) / NC)), c1 = Math.min(NW - 1, Math.floor((x + r) / NC)), r0 = Math.max(0, Math.floor((y - r) / NC)), r1 = Math.min(NH - 1, Math.floor((y + r) / NC));
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) { const i = cy * NW + cx; if (!this.explored[i] && Math.hypot(cx * NC + NC / 2 - x, cy * NC + NC / 2 - y) < r) { this.explored[i] = 1; this.exploredDirty = true; } }
  }
  isExplored(x, y) { const cx = Math.floor(x / NC), cy = Math.floor(y / NC); return cx >= 0 && cy >= 0 && cx < NW && cy < NH && this.explored[cy * NW + cx] === 1; }
  // ------------------------------------------------------------ helpers
  nearest(list, x, y, f) { let best = null, bd = 1e9; for (const e of list) { if (f && !f(e)) continue; const d = e.k === 'b' ? rectDist(e, x, y) : Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } } return best ? { e: best, d: bd } : null; }
  edist(u, e) { return e.k === 'b' ? rectDist(e, u.x, u.y) : Math.hypot(e.x - u.x, e.y - u.y) - (e.k === 'r' ? e.r : 0); }
  pop() { return this.units.filter(u => u.team === 0).length + this.bld.filter(b => b.team === 0).reduce((a, b) => a + b.q.length + b.gar.length, 0); }
  ageBonus() { let p = 0; for (let i = 1; i <= this.age; i++) p += AGES[i].pop; return p; }
  popCap() { return Math.min(75 + this.ageBonus(), this.ageBonus() + this.bld.filter(b => b.team === 0 && b.prog >= 1).reduce((a, b) => a + (b.type === 'tc' ? 10 : b.type === 'house' ? 5 : 0), 0)); }
  ageOk(k) { return (AGE_REQ[k] || 0) <= this.age; }
  // ------------------------------------------------------------ national borders (Rise of Nations style)
  buildTerritory() {
    const T = this.terr; T.fill(0); const B = this.bld.filter(b => b.prog >= .3 || b.type === 'tc');
    for (let cy = 0; cy < NH; cy++) for (let cx = 0; cx < NW; cx++) { const x = cx * NC + NC / 2, y = cy * NC + NC / 2; let best = 1, own = 0;
      for (const b of B) { const r = BORDER[b.type] || 160, d = Math.hypot(x - b.x, y - b.y) / r; if (d < best) { best = d; own = b.team + 1; } }
      T[cy * NW + cx] = own; }
    this.terrDirty = false; this.terrVersion = (this.terrVersion || 0) + 1;
  }
  owner(x, y) { if (this.terrDirty) this.buildTerritory(); const cx = Math.floor(x / NC), cy = Math.floor(y / NC); return cx < 0 || cy < 0 || cx >= NW || cy >= NH ? 0 : this.terr[cy * NW + cx]; }
  advanceAge(b) {
    const next = AGES[this.age + 1]; if (!next) return 'Your clan has reached the final age';
    if (b.ageT != null) return 'Already advancing'; if (!this.afford(next.cost)) return 'Not enough resources';
    this.pay(next.cost); b.ageT = 0; this.ev.refresh(); return null;
  }
  afford(c) { return Object.keys(c).every(k => this.res[k] >= c[k]); }
  pay(c) { for (const k in c) this.res[k] -= c[k]; }
  face(u, x, y) { if (Math.hypot(x - u.x, y - u.y) > 1) u.face = Math.atan2(y - u.y, x - u.x); }
  // ------------------------------------------------------------ movement: straight when clear, A* around obstacles otherwise
  moveTo(u, x, y, stop, dt, ent) {
    const d = ent ? this.edist(u, ent) : Math.hypot(x - u.x, y - u.y); if (d <= stop) { u.path = null; return true; }
    const [wx, wy, direct] = this.waypoint(u, x, y, stop, ent, dt);
    const dx = wx - u.x, dy = wy - u.y, dd = Math.hypot(dx, dy) || 1;
    const step = Math.min(UT[u.type].spd * dt, direct && !ent ? Math.max(0, dd - stop + .1) : dd);
    u.x += dx / dd * step; u.y += dy / dd * step; u.mv = true; this.face(u, wx, wy); return false;
  }
  approach(u, e, stop, dt) { if (this.edist(u, e) <= stop) { u.path = null; this.face(u, e.x, e.y); return true; } this.moveTo(u, e.x, e.y, stop, dt, e); return false; }
  waypoint(u, x, y, stop, ent, dt) {
    if (u.path && Math.hypot(u.pgx - x, u.pgy - y) > 40) u.path = null;
    u.navT = (u.navT || 0) - dt;
    if (!u.path && u.navT <= 0) { u.navT = .3 + Math.random() * .2;
      if ((u.forcePath || !this.clearTo(u.x, u.y, x, y, stop, ent)) && this.pathBudget > 0) { this.pathBudget--; u.forcePath = false; u.path = this.findPath(u.x, u.y, x, y, stop, ent); u.pgx = x; u.pgy = y; } }
    if (u.path) { while (u.path.length && Math.hypot(u.path[0][0] - u.x, u.path[0][1] - u.y) < 9) u.path.shift(); if (u.path.length) return [u.path[0][0], u.path[0][1], false]; u.path = null; }
    return [x, y, true];
  }
  distFn(x, y, ent) { return ent ? (ent.k === 'b' ? (px, py) => rectDist(ent, px, py) : (px, py) => Math.hypot(px - ent.x, py - ent.y) - (ent.r || 0)) : (px, py) => Math.hypot(px - x, py - y); }
  buildNav() {
    const g = this.navG || (this.navG = new Uint8Array(NW * NH)); g.fill(0);
    const mark = (x0, y0, x1, y1, v, test) => { const c0 = Math.max(0, Math.floor(x0 / NC)), c1 = Math.min(NW - 1, Math.floor(x1 / NC)), r0 = Math.max(0, Math.floor(y0 / NC)), r1 = Math.min(NH - 1, Math.floor(y1 / NC));
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) { const px = cx * NC + NC / 2, py = cy * NC + NC / 2, i = cy * NW + cx; if ((!test || test(px, py)) && g[i] < v) g[i] = v; } };
    for (const b of this.bld) if (b.type !== 'farm') mark(b.x - b.w / 2 - 6, b.y - b.h / 2 - 6, b.x + b.w / 2 + 6, b.y + b.h / 2 + 6, 3);
    for (const r of this.rs) if (r.kind !== 'fish') { const m = r.r + 5; mark(r.x - m, r.y - m, r.x + m, r.y + m, 2, (px, py) => Math.hypot(px - r.x, py - r.y) < m); }
    mark(LAKE.x - LAKE.rx - 12, LAKE.y - LAKE.ry - 12, LAKE.x + LAKE.rx + 12, LAKE.y + LAKE.ry + 12, 255, (px, py) => Math.hypot((px - LAKE.x) / (LAKE.rx + 6), (py - LAKE.y) / (LAKE.ry + 6)) < 1);
    this.navDirty = false;
  }
  navAt(px, py) { const cx = Math.floor(px / NC), cy = Math.floor(py / NC); return cx < 0 || cy < 0 || cx >= NW || cy >= NH ? 255 : this.navG[cy * NW + cx]; }
  clearTo(x0, y0, x1, y1, stop, ent) {
    if (this.navDirty) this.buildNav();
    const D = this.distFn(x1, y1, ent), L = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(L / 8);
    for (let k = 1; k <= n; k++) { const t = k / n, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t; if (L * t < 10) continue; if (D(px, py) <= stop + 22) return true; if (this.navAt(px, py)) return false; }
    return true;
  }
  findPath(sx, sy, tx, ty, stop, ent) {
    if (this.navDirty) this.buildNav();
    const g = this.navG, N = NW * NH;
    if (!this.nG) { this.nG = new Float32Array(N); this.nP = new Int32Array(N); this.nS = new Uint32Array(N); this.nC = new Uint32Array(N); this.stamp = 0; }
    const G = this.nG, P = this.nP, Sx = this.nS, C = this.nC, st = ++this.stamp, D = this.distFn(tx, ty, ent), tol = Math.max(0, stop) + NC * .8;
    const hOf = i => Math.max(0, D((i % NW) * NC + NC / 2, ((i / NW) | 0) * NC + NC / 2) - tol);
    const hI = [], hF = [];
    const push = (i, f) => { let k = hI.length; hI.push(i); hF.push(f); while (k > 0) { const q = (k - 1) >> 1; if (hF[q] <= f) break; hI[k] = hI[q]; hF[k] = hF[q]; k = q; } hI[k] = i; hF[k] = f; };
    const pop = () => { const top = hI[0], li = hI.pop(), lf = hF.pop(), n = hI.length; if (n) { let k = 0;
      for (;;) { let c = 2 * k + 1; if (c >= n) break; if (c + 1 < n && hF[c + 1] < hF[c]) c++; if (hF[c] >= lf) break; hI[k] = hI[c]; hF[k] = hF[c]; k = c; } hI[k] = li; hF[k] = lf; } return top; };
    const s0 = clamp(Math.floor(sy / NC), 0, NH - 1) * NW + clamp(Math.floor(sx / NC), 0, NW - 1);
    G[s0] = 0; P[s0] = -1; Sx[s0] = st; push(s0, hOf(s0));
    let best = s0, bestH = 1e9, found = -1, n = 0;
    while (hI.length && n++ < 4500) {
      const i = pop(); if (C[i] === st) continue; C[i] = st;
      const h = hOf(i); if (h <= 0) { found = i; break; } if (h < bestH) { bestH = h; best = i; }
      const x = i % NW, y = (i / NW) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= NW || ny >= NH) continue;
        const j = ny * NW + nx, v = g[j]; if (v === 255 || C[j] === st) continue;
        if (dx && dy && (g[y * NW + nx] >= 2 || g[ny * NW + x] >= 2)) continue;
        const ng = G[i] + (dx && dy ? 1.414 : 1) * NC * (v === 0 ? 1 : v === 2 ? 10 : 40);
        if (Sx[j] === st && G[j] <= ng) continue;
        Sx[j] = st; G[j] = ng; P[j] = i; push(j, ng + hOf(j)); }
    }
    const cells = []; for (let i = found >= 0 ? found : best; i >= 0 && i !== s0; i = P[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map(i => [(i % NW) * NC + NC / 2, ((i / NW) | 0) * NC + NC / 2]);
    const out = []; let cx = sx, cy = sy, i = 0;
    while (i < pts.length) { let j = Math.min(pts.length - 1, i + 24); while (j > i && !this.clearTo(cx, cy, pts[j][0], pts[j][1], -1e9, null)) j--; out.push(pts[j]); [cx, cy] = pts[j]; i = j + 1; }
    return out;
  }
  unstick(u, dt) {
    if (!u.mv) { u.stT = 0; u.stX = u.x; u.stY = u.y; u.stuck = 0; return; }
    if ((u.stT = (u.stT || 0) + dt) < .8) return;
    if (Math.hypot(u.x - u.stX, u.y - u.stY) < 6) { u.stuck = (u.stuck || 0) + 1; u.path = null; u.forcePath = true; u.navT = 0;
      if (u.st === 'move' && u.stuck >= 2 && Math.hypot(u.mx - u.x, u.my - u.y) < 70) { u.st = 'idle'; u.hx = u.x; u.hy = u.y; }
      else if (u.stuck >= 3) { const a = Math.random() * 6.28; u.x += Math.cos(a) * 10; u.y += Math.sin(a) * 10; } }
    else u.stuck = 0;
    u.stT = 0; u.stX = u.x; u.stY = u.y;
  }
  // ------------------------------------------------------------ main step
  step(dt) {
    if (this.paused || this.over) return;
    for (let i = 0; i < this.speed && !this.over; i++) this.sim(dt);
  }
  sim(dt) {
    this.t += dt; this.pathBudget = 4; this.weatherTick(dt);
    if (this.terrDirty) this.buildTerritory();
    this.soc.step(dt);
    if (this.timers.length) { const due = this.timers.filter(t => t.t <= this.t); if (due.length) { this.timers = this.timers.filter(t => t.t > this.t); due.forEach(t => t.fn()); } }
    for (const u of this.units) {
      u.cd = Math.max(0, u.cd - dt); u.atkT = Math.max(0, u.atkT - dt); u.mv = false; u.work = null;
      if (u.type === 'vil') this.vilAI(u, dt); else if (u.type === 'monk') this.monkAI(u, dt); else this.milAI(u, dt);
      if (u.hp < u.max && !u.dead) { let reg = this.tech[u.team].has('zen') ? .8 : 0;
        if (this.bld.some(b => b.type === 'temple' && b.team === u.team && b.prog >= 1 && Math.hypot(b.x - u.x, b.y - u.y) < 170)) reg += 2.5;
        if (reg) { u.hp = Math.min(u.max, u.hp + reg * dt); u.regen = true; } else u.regen = false; }
      if (u.team === 0) this.reveal(u.x, u.y, u.type === 'vil' ? 170 : 210);
      const own = this.owner(u.x, u.y); if (own && own !== u.team + 1 && !u.dead) { u.hp -= ATTRITION * dt; u.attrit = true; if (u.hp <= 0) this.kill(u); } else u.attrit = false;   // attrition in enemy lands
    }
    this.collide();
    for (const u of this.units) this.unstick(u, dt);
    for (const b of this.bld) {
      b.cd = Math.max(0, b.cd - dt);
      if (b.team === 0 && b.prog > 0) this.reveal(b.x, b.y, b.type === 'tower' ? 320 : b.type === 'tc' ? 300 : 200);
      if (b.prog >= 1 && b.q.length) { b.qt += dt; const ty = b.q[0]; if (b.qt >= UT[ty].train) { b.qt = 0; b.q.shift();
        const u = this.addU(b.team, ty, b.x + (Math.random() - .5) * 40, b.y + b.h / 2 + 14);
        if (b.team === 0) { this.stats.trained++; this.ev.sfx('train', b.x, b.y); }
        if (b.rally) { if (b.rally.k === 'r' && u.type === 'vil' && this.alive(b.rally)) { u.st = 'gather'; u.res = b.rally; } else { u.st = 'move'; u.mx = b.rally.x; u.my = b.rally.y; } }
        this.ev.refresh(); } }
      if (b.prog >= 1 && b.ageT != null && b.team === 0) { b.ageT += dt; if (b.ageT >= AGES[this.age + 1].time) { b.ageT = null; this.age++; this.terrDirty = true;
        this.soc.chronicle(`The clan enters the ${AGES[this.age].name}!`, 'gold'); this.ev.ageUp(this.age, b); this.ev.sfx('built'); this.ev.refresh(); } }
      if (b.prog >= 1 && b.rk) { b.rt += dt; if (b.rt >= TECH[b.rk].time) { const k = b.rk; b.rk = null; b.rt = 0; this.applyTech(b.team, k); } }
      if (b.prog >= 1 && (b.type === 'tc' || b.type === 'tower') && b.cd <= 0) {
        const t = this.nearest(this.units, b.x, b.y, u => u.team !== b.team), ext = this.tech[b.team].has('fletch') ? 45 : 0;
        if (t && t.d < ((b.type === 'tc' ? 240 : 270) + ext) * (1 - .18 * this.wet)) {
          const h = b.type === 'tower' ? 90 : 120; this.shoot(b, t.e, b.type === 'tc' ? 6 : 8, h);
          const extra = Math.min(5, Math.ceil(b.gar.length / 2)), tg = t.e;
          for (let k = 1; k <= extra; k++) this.later(k * .11, () => this.alive(b) && this.alive(tg) && this.shoot(b, tg, 5, h));
          b.cd = (b.type === 'tc' ? 1.4 : 1.6) * (this.tech[b.team].has('masonry') ? .7 : 1); } }
    }
    if (this.wonder && this.wonder.b.prog >= 1) { this.wonder.t -= dt; if (this.wonder.t <= 0 && !this.over) { this.over = true; this.ev.end(true, 'pagoda'); } }
    for (const p of this.proj) {
      p.t += dt; if (this.alive(p.tgt)) { p.tx = p.tgt.x; p.ty = p.tgt.y; }
      if (p.t >= p.T) { p.done = true; if (this.alive(p.tgt)) this.damage(p.tgt, p.dmg, p.src); }
    }
    this.proj = this.proj.filter(p => !p.done);
    this.enemyAI();
  }
  weatherTick(dt) {
    if ((this.rainT -= dt) <= 0) { this.raining = !this.raining; this.rainT = this.raining ? 45 + Math.random() * 35 : 160 + Math.random() * 120;
      if (this.raining) this.ev.toast('Rain sweeps the valley. Bows and towers lose range.', 'info'); }
    this.wet = clamp(this.wet + (this.raining ? dt / 6 : -dt / 8), 0, 1);
    for (const k in this.price) this.price[k] += (1 - this.price[k]) * dt * .01;
  }
  collide() {
    const U = this.units;
    for (let i = 0; i < U.length; i++) { const a = U[i], ra = a.type === 'cav' ? 10 : 7.5;
      for (let j = i + 1; j < U.length; j++) { const b = U[j], m = ra + (b.type === 'cav' ? 10 : 7.5), dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 < m * m && d2 > .01) { const d = Math.sqrt(d2), p = (m - d) / 2 / d; a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p; } }
      for (const b of this.bld) { if (b.type === 'farm') continue; const hw = b.w / 2 + 5, hh = b.h / 2 + 5, dx = a.x - b.x, dy = a.y - b.y;
        if (Math.abs(dx) < hw && Math.abs(dy) < hh) { const px = hw - Math.abs(dx), py = hh - Math.abs(dy); if (px < py) a.x += Math.sign(dx || 1) * px; else a.y += Math.sign(dy || 1) * py; } }
      for (const r of this.rs) { if (r.kind === 'fish') continue; const dx = a.x - r.x, dy = a.y - r.y, d = Math.hypot(dx, dy), m = r.r + 4; if (d < m && d > .01) { a.x += dx / d * (m - d); a.y += dy / d * (m - d); } }
      const lx = (a.x - LAKE.x) / (LAKE.rx + 6), ly = (a.y - LAKE.y) / (LAKE.ry + 6), ld = Math.hypot(lx, ly); if (ld < 1) { a.x = LAKE.x + lx / ld * (LAKE.rx + 6); a.y = LAKE.y + ly / ld * (LAKE.ry + 6); }
      a.x = clamp(a.x, 10, WW - 10); a.y = clamp(a.y, 10, WH - 10);
    }
  }
  dropSites(team) { return this.bld.filter(b => b.team === team && b.prog >= 1 && (b.type === 'tc' || b.type === 'store')); }
  vilAI(u, dt) {
    if (u.st === 'garrison') { const b = u.gb; if (!this.alive(b) || b.prog < 1) { u.st = 'idle'; return; } if (this.approach(u, b, 8, dt)) this.enter(u, b); return; }
    if (u.st === 'move') { if (this.moveTo(u, u.mx, u.my, 4, dt)) u.st = 'idle'; return; }
    if (u.st === 'attack') { if (!this.alive(u.tgt)) { u.st = 'idle'; return; }
      if (this.approach(u, u.tgt, UT.vil.rng, dt)) { u.work = 'chop'; if (u.cd <= 0) { this.damage(u.tgt, UT.vil.atk, u); u.cd = UT.vil.cd; } } return; }
    if (u.st === 'build') { const b = u.bt; if (!this.alive(b)) { u.st = 'idle'; return; }
      if (b.prog >= 1 && b.hp >= b.max) { const nb = this.nearest(this.bld, u.x, u.y, x => x.team === u.team && x.prog < 1); if (nb && nb.d < 300) { u.bt = nb.e; return; }
        if (b.type === 'farm') { u.st = 'gather'; u.res = b; return; } u.st = 'idle'; return; }
      if (this.approach(u, b, 9, dt)) { u.work = 'build';
        if (b.prog < 1) { b.prog = Math.min(1, b.prog + dt / BT[b.type].build); b.hp = Math.min(b.max, b.hp + b.max * dt / BT[b.type].build * .85);
          if (Math.random() < dt * 3) { this.ev.fx('dust', b.x + (Math.random() - .5) * b.w, b.y + b.h / 2, 3); this.ev.sfx('hammer', b.x, b.y); }
          if (b.prog >= 1) this.completed(b); }
        else b.hp = Math.min(b.max, b.hp + 15 * dt); }
      return; }
    if (u.st === 'gather') { const r = u.res;
      if (!this.alive(r) || (r.k === 'b' && r.prog < 1)) { const kind = u.lastKind; const n = kind && this.nearest(this.rs, u.x, u.y, x => x.kind === kind); if (n && n.d < 350) { u.res = n.e; return; } u.st = u.carryN ? 'return' : 'idle'; return; }
      const kind = r.k === 'b' ? 'food' : (r.kind === 'tree' ? 'wood' : r.kind === 'gold' ? 'gold' : 'food'), fish = r.kind === 'fish';
      if (u.carry !== kind) { u.carry = kind; u.carryN = 0; }
      u.lastKind = r.k === 'r' ? r.kind : null;
      if (u.carryN >= 10) { u.st = 'return'; return; }
      const inRange = r.k === 'b' ? (Math.abs(u.x - r.x) < r.w / 2 && Math.abs(u.y - r.y) < r.h / 2) : Math.hypot(r.x - u.x, r.y - u.y) <= r.r + 9;
      if (!inRange) { if (r.k === 'b') this.moveTo(u, r.x, r.y, r.w / 3, dt); else this.moveTo(u, r.x, r.y, 7, dt, r); return; }
      if (r.k === 'r') this.face(u, r.x, r.y);
      u.work = r.k === 'b' ? 'farm' : r.kind === 'berry' ? 'pick' : fish ? 'fish' : r.kind === 'tree' ? 'chop' : 'mine';
      u.gt += dt; const rate = (kind === 'wood' ? 1.1 : kind === 'gold' ? 1.4 : r.k === 'b' ? 1.5 : fish ? 1.2 : 1.0) / (this.tech[u.team].has('tools') ? 1.25 : 1);
      if (u.gt >= rate) { u.gt = 0; u.carryN++;
        if (r.k === 'r') { r.amt--; this.ev.harvest(r, u);
          if (r.amt <= 0) this.kill(r); } }
      u.ret = r; return; }
    if (u.st === 'return') { const d = this.nearest(this.dropSites(u.team), u.x, u.y); if (!d) { u.st = 'idle'; return; }
      if (this.approach(u, d.e, 8, dt)) { if (u.team === 0) { this.res[u.carry] += u.carryN; this.stats.gathered += u.carryN; this.ev.float(d.e.x, d.e.y, '+' + u.carryN + ' ' + u.carry); }
        u.carryN = 0; u.st = 'gather'; u.res = this.alive(u.ret) ? u.ret : null; } }
  }
  completed(b) {
    b.hp = Math.max(b.hp, b.max * .9);
    if (b.team === 0) { this.ev.toast(BT[b.type].name + ' complete', 'good'); this.stats.built++; this.ev.sfx('built'); }
    this.soc.built(b);
    if (b.type === 'pagoda' && b.team === 0) { this.wonder = { b, t: WONDER_T }; this.nextWave = Math.min(this.nextWave, this.t + 20); this.ev.toast('The Great Pagoda stands! Hold it for 3:00 to win. The enemy is enraged!', 'gold'); }
    this.ev.completed(b); this.ev.refresh();
  }
  monkAI(u, dt) {
    const s = UT.monk;
    if (u.st === 'move') { if (this.moveTo(u, u.mx, u.my, 4, dt)) { u.st = 'idle'; u.hx = u.x; u.hy = u.y; } return; }
    const t0 = u.tgt;
    if (!t0 || t0.dead || t0.k !== 'u' || t0.team !== u.team || t0.hp >= t0.max) { const n = this.nearest(this.units, u.x, u.y, x => x.team === u.team && x !== u && x.hp < x.max); u.tgt = n && n.d < (u.mode === 'raid' ? 500 : 260) ? n.e : null; }
    if (u.tgt) { u.st = 'heal';
      if (this.approach(u, u.tgt, s.rng, dt) && u.cd <= 0) { const t = u.tgt; u.cd = s.cd; u.atkT = .9; u.atkSeq++;
        t.hp = Math.min(t.max, t.hp + s.heal * (this.tech[u.team].has('zen') ? 1.5 : 1)); this.ev.heal(t); this.ev.sfx('heal', t.x, t.y); }
      return; }
    u.st = 'idle';
    if (u.mode === 'raid') { const f = this.nearest(this.units, u.x, u.y, x => x.team === u.team && x.mode === 'raid' && x.type !== 'monk');
      if (!f) { u.mode = 'guard'; u.hx = u.x; u.hy = u.y; } else if (f.d > 50) this.moveTo(u, f.e.x, f.e.y, 40, dt); return; }
    if (u.mode === 'guard' && Math.hypot(u.x - u.hx, u.y - u.hy) > 8) this.moveTo(u, u.hx, u.hy, 4, dt);
  }
  milAI(u, dt) {
    const s = UT[u.type];
    const aggro = () => { const t = this.nearest(this.units, u.x, u.y, x => x.team !== u.team && (u.team === 1 || this.isExplored(x.x, x.y)));
      if (t && t.d < (u.type === 'archer' ? 200 + this.rngOf(u) - s.rng : 170)) { u.st = 'attack'; u.tgt = t.e; return true; }
      if (u.team === 1) { const b = this.nearest(this.bld, u.x, u.y, x => x.team === 0); if (b && b.d < 160) { u.st = 'attack'; u.tgt = b.e; return true; } } return false; };
    if (u.st === 'move') { if (this.moveTo(u, u.mx, u.my, 4, dt)) { u.st = 'idle'; u.hx = u.x; u.hy = u.y; } return; }
    if (u.st === 'attack') { const t = u.tgt; if (!this.alive(t)) { u.st = u.mode === 'raid' ? 'raid' : u.mode === 'guard' ? 'return' : 'idle'; return; }
      if (u.mode === 'guard' && Math.hypot(u.x - u.hx, u.y - u.hy) > 420) { u.st = 'return'; return; }
      if (this.approach(u, t, this.rngOf(u), dt) && u.cd <= 0) { u.cd = s.cd; u.atkT = .6; u.atkSeq++;
        if (u.type === 'archer') this.later(.55, () => this.alive(u) && this.alive(t) && this.shoot(u, t, this.atkOf(u, t), 14));
        else this.later(u.type === 'cav' ? .25 : .32, () => this.alive(u) && this.alive(t) && this.damage(t, this.atkOf(u, t), u)); }
      return; }
    if (u.st === 'return') { if (aggro()) return; if (this.moveTo(u, u.hx, u.hy, 4, dt)) u.st = 'idle'; return; }
    if (u.st === 'raid' || (u.mode === 'raid' && u.st === 'idle')) { u.st = 'raid'; if (aggro()) return;
      const tc = u.team === 1 && this.wonder && this.alive(this.wonder.b) ? { e: this.wonder.b } : this.nearest(this.bld, u.x, u.y, x => x.team === 0);
      if (tc && this.approach(u, tc.e, this.rngOf(u), dt)) { u.st = 'attack'; u.tgt = tc.e; } return; }
    if (u.st === 'idle') aggro();
  }
  enemyAI() {
    const etc = this.bld.find(b => b.team === 1 && b.type === 'tc'), eb = this.bld.find(b => b.team === 1 && b.type === 'barracks') || etc; if (!eb) return;
    const D = this.diff;
    if (this.t >= this.nextGuard) { this.nextGuard = this.t + 70; if (this.units.filter(u => u.team === 1 && u.mode === 'guard').length < 7) { const p = this.rng();
      this.addU(1, this.wave >= 3 && p < .2 ? 'samurai' : p < .6 ? 'spear' : 'archer', eb.x, eb.y + eb.h / 2 + 12, 'guard'); } }
    if (this.wave >= D.techW[0]) this.applyTech(1, 'steel');
    if (this.wave >= D.techW[1]) this.applyTech(1, 'armor');
    if (!this.raid.on) { this.nextWave = Math.max(this.nextWave, this.t + 1); return; }
    if (this.t >= this.nextWave) {
      this.wave++; this.nextWave = this.t + (this.raid.gap ?? Math.max(50, 95 - this.wave * 4) * D.gap);
      const n = Math.max(1, Math.min(30, Math.round((2 + this.wave * 1.6) * D.size * this.raid.size))) + (this.wonder ? 4 : 0), boss = this.wave % 5 === 0;
      for (let i = 0; i < n; i++) {
        const type = this.wave >= 3 && i % 5 === 4 ? 'samurai' : this.wave >= 4 && i % 6 === 5 ? 'cav' : this.wave >= 5 && i % 7 === 6 ? 'monk' : i % 3 === 2 ? 'archer' : 'spear';
        const u = this.addU(1, type, eb.x + (Math.random() - .5) * 80, eb.y + eb.h / 2 + 10 + Math.random() * 30, 'raid'); u.st = 'raid'; }
      if (boss) { const u = this.addU(1, 'samurai', eb.x, eb.y + eb.h / 2 + 30, 'raid', true); u.st = 'raid'; }
      this.ev.raid(eb); this.ev.sfx('raid');
      this.ev.toast('Raid ' + this.wave + ': ' + (boss ? 'a ronin warlord leads ' : '') + n + ' enemy soldiers ' + (this.wonder ? 'storm your pagoda!' : 'march on your village!'), 'bad');
    }
  }
  // ------------------------------------------------------------ player commands
  command(sel, wx, wy, target) {
    sel = sel.filter(u => u.team === 0 && !u.dead);
    if (!sel.length) return false;
    if (target && target.team === 1) { for (const u of sel) { if (u.type === 'monk') { u.st = 'move'; u.mx = target.x; u.my = target.y + 40; continue; } u.st = 'attack'; u.tgt = target; u.mode = 'idle'; } return 'attack'; }
    if (target && target.k === 'r') { for (const u of sel) { if (u.type === 'vil') { u.st = 'gather'; u.res = target; } else { u.st = 'move'; u.mx = target.x; u.my = target.y + 20; } } return 'gather'; }
    if (target && target.k === 'b' && target.team === 0) {
      for (const u of sel) { if (u.type !== 'vil') { u.st = 'move'; u.mx = target.x; u.my = target.y + target.h / 2 + 20; continue; }
        if (target.prog < 1 || target.hp < target.max) { u.st = 'build'; u.bt = target; }
        else if (target.type === 'farm') { u.st = 'gather'; u.res = target; }
        else if (u.carryN && (target.type === 'tc' || target.type === 'store')) u.st = 'return';
        else if (GARRISON[target.type] && this.bellOn) { u.st = 'garrison'; u.gb = target; }
        else { u.st = 'move'; u.mx = wx; u.my = target.y + target.h / 2 + 10; } }
      return 'build'; }
    const army = sel.filter(u => u.type !== 'vil'), civ = sel.filter(u => u.type === 'vil');
    if (army.length >= 3) {     // battle formation: melee in the front ranks, archers behind, monks at the rear, facing the march
      const cx = army.reduce((a, u) => a + u.x, 0) / army.length, cy = army.reduce((a, u) => a + u.y, 0) / army.length;
      let dx = wx - cx, dy = wy - cy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L; const px = -dy, py = dx;
      const rank = u => u.type === 'cav' ? 0 : u.type === 'samurai' || u.type === 'spear' ? 1 : u.type === 'archer' ? 2 : 3;
      const sorted = [...army].sort((a, b) => rank(a) - rank(b)), cols = Math.max(3, Math.ceil(Math.sqrt(army.length * 2.2))), gap = 22, slots = [];
      sorted.forEach((u, i) => { const r = Math.floor(i / cols), c = i % cols, inRow = Math.min(cols, sorted.length - r * cols);
        slots.push([wx + px * (c - (inRow - 1) / 2) * gap - dx * r * gap, wy + py * (c - (inRow - 1) / 2) * gap - dy * r * gap]); });
      for (let r = 0; r * cols < sorted.length; r++) {       // within each rank, keep left-to-right order so files don't cross
        const row = sorted.slice(r * cols, r * cols + cols).sort((a, b) => (a.x * px + a.y * py) - (b.x * px + b.y * py));
        row.forEach((u, i) => { const [sx, sy] = slots[r * cols + i]; u.st = 'move'; u.mx = sx; u.my = sy; u.mode = 'idle'; u.path = null; u.formFace = Math.atan2(dy, dx); }); }
    }
    const rest = army.length >= 3 ? civ : sel, n = rest.length, cols = Math.ceil(Math.sqrt(n));
    rest.forEach((u, i) => { u.st = 'move'; u.mx = wx + ((i % cols) - (cols - 1) / 2) * 18; u.my = wy + (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * 18; u.mode = 'idle'; u.path = null; });
    return 'move';
  }
  canPlace(type, x, y) {
    const t = BT[type];
    if (x - t.w / 2 < 10 || y - t.h / 2 < 10 || x + t.w / 2 > WW - 10 || y + t.h / 2 > WH - 10) return false;
    for (const b of this.bld) if (Math.abs(b.x - x) < (b.w + t.w) / 2 + 4 && Math.abs(b.y - y) < (b.h + t.h) / 2 + 4) return false;
    const f = { x, y, w: t.w, h: t.h }; for (const r of this.rs) if (rectDist(f, r.x, r.y) < r.r) return false;
    if (Math.hypot((x - LAKE.x) / (LAKE.rx + t.w / 2 + 10), (y - LAKE.y) / (LAKE.ry + t.h / 2 + 10)) < 1) return false;
    for (let yy = y - t.h / 2; yy <= y + t.h / 2; yy += t.h / 2) for (let xx = x - t.w / 2; xx <= x + t.w / 2; xx += t.w / 2) if (!this.isExplored(xx, yy)) return false;
    if (this.owner(x, y) !== 1) return false;          // only inside your own borders
    return true;
  }
  placeBuilding(type, x, y, builders) {
    if (!this.ageOk(type)) return 'age'; if (this.owner(x, y) !== 1) return 'border';
    if (!this.canPlace(type, x, y)) return 'blocked'; if (!this.afford(COST[type])) return 'cost';
    this.pay(COST[type]); const b = this.addB(0, type, x, y, false);
    for (const u of builders) if (u.type === 'vil' && !u.dead) { u.st = 'build'; u.bt = b; u.path = null; }
    return b;
  }
  train(b, t) {
    if (!this.ageOk(t)) return 'Requires the ' + AGES[AGE_REQ[t]].name;
    if (this.pop() >= this.popCap()) return 'Population limit reached. Build houses.';
    if (!this.afford(COST[t])) return 'Not enough resources';
    if (b.q.length >= 5) return 'Queue is full';
    this.pay(COST[t]); b.q.push(t); return null;
  }
  research(b, k) {
    if (!this.ageOk(k)) return 'Requires the ' + AGES[AGE_REQ[k]].name;
    if (b.rk || this.bld.some(x => x.rk === k)) return 'Already researching';
    if (!this.afford(TECH[k].cost)) return 'Not enough resources';
    this.pay(TECH[k].cost); b.rk = k; b.rt = 0; return null;
  }
  trade(kind, sell) {
    const p = this.price[kind];
    if (sell) { if (this.res[kind] < 100) return 'You need 100 ' + kind; this.res[kind] -= 100; this.res.gold += Math.round(70 * p); this.price[kind] = Math.max(.4, p * .93); }
    else { const c = Math.round(130 * p); if (this.res.gold < c) return 'Not enough gold'; this.res.gold -= c; this.res[kind] += 100; this.price[kind] = Math.min(3, p * 1.07); }
    this.ev.sfx('trade'); return null;
  }
  bell(on) {
    this.bellOn = on;
    if (on) { const spots = this.bld.filter(b => b.team === 0 && b.prog >= 1 && GARRISON[b.type]); if (!spots.length) return;
      const load = new Map(spots.map(b => [b, b.gar.length]));
      for (const u of this.units) if (u.team === 0 && u.type === 'vil') { let best = null, bd = 1e9;
        for (const b of spots) { const d = rectDist(b, u.x, u.y); if (load.get(b) < GARRISON[b.type] && d < bd && d < 900) { bd = d; best = b; } }
        if (best) { load.set(best, load.get(best) + 1); u.st = 'garrison'; u.gb = best; u.path = null; } }
      this.ev.sfx('bell'); this.ev.toast('The bell rings! Villagers take shelter and shoot from the walls.', 'gold'); }
    else { for (const b of this.bld) if (b.gar.length) this.release(b); for (const u of this.units) if (u.st === 'garrison') u.st = 'idle'; this.ev.toast('All clear. Back to work.', 'good'); }
    this.ev.refresh();
  }
  enter(u, b) {
    if (b.gar.length >= GARRISON[b.type]) { u.st = 'idle'; return; }
    b.gar.push(u); u.inside = b; u.path = null; this.units = this.units.filter(x => x !== u); this.ev.hide(u, true); this.ev.refresh();
  }
  release(b) {
    for (const u of b.gar) { if (u.dead) continue; u.inside = null; u.x = b.x + (Math.random() - .5) * b.w * .6; u.y = b.y + b.h / 2 + 12; u.st = 'idle'; this.units.push(u); this.ev.hide(u, false); }
    b.gar = []; this.ev.refresh();
  }
  // ------------------------------------------------------------ save / load
  serialize() {
    const U = u => ({ id: u.id, team: u.team, type: u.type, x: u.x, y: u.y, hp: u.hp, max: u.max, mode: u.mode, kills: u.kills, rank: u.rank, boss: u.boss, g: u.g, carry: u.carry, carryN: u.carryN });
    const units = [...this.units, ...this.bld.flatMap(b => b.gar.map(u => ({ ...u, x: b.x, y: b.y + b.h / 2 + 12 })))];
    let ex = ''; for (let i = 0; i < this.explored.length; i++) ex += this.explored[i] ? '1' : '0';
    return { v: 1, saved: Date.now(), t: this.t, res: this.res, wave: this.wave, nextWave: this.nextWave, nextGuard: this.nextGuard, diffKey: this.diffKey, age: this.age, raid: this.raid,
      tech: this.tech.map(s => [...s]), stats: this.stats, price: this.price, bellOn: false, wonder: this.wonder && { id: this.wonder.b.id, t: this.wonder.t }, explored: ex,
      units: units.map(U), bld: this.bld.map(b => ({ id: b.id, team: b.team, type: b.type, x: b.x, y: b.y, hp: b.hp, max: b.max, prog: b.prog, q: b.q, qt: b.qt, rk: b.rk, rt: b.rt, ageT: b.ageT })),
      rs: this.rs.map(r => ({ kind: r.kind, x: r.x, y: r.y, amt: r.amt, v: r.v })), soc: this.soc.serialize() };
  }
  load(d) {
    Object.assign(this, { t: d.t, res: d.res, wave: d.wave, nextWave: d.nextWave, nextGuard: d.nextGuard, age: d.age, raid: { ...RAID_DEFAULT, ...d.raid }, stats: d.stats, price: d.price });
    this.diffKey = d.diffKey; this.diff = DIFF[d.diffKey] || DIFF.normal; this.tech = d.tech.map(a => new Set(a));
    for (let i = 0; i < this.explored.length; i++) this.explored[i] = d.explored[i] === '1' ? 1 : 0; this.exploredDirty = true;
    const byId = new Map();
    for (const b of d.bld) { const nb = this.addB(b.team, b.type, b.x, b.y, b.prog >= 1); Object.assign(nb, { hp: b.hp, max: b.max, prog: b.prog, q: b.q || [], qt: b.qt || 0, rk: b.rk, rt: b.rt || 0, ageT: b.ageT ?? null }); byId.set(b.id, nb); }
    for (const r of d.rs) { const nr = this.addR(r.kind, r.x, r.y); nr.amt = r.amt; nr.v = r.v; }
    for (const u of d.units) { const nu = this.addU(u.team, u.type, u.x, u.y, u.mode, u.boss); Object.assign(nu, { hp: u.hp, max: u.max, kills: u.kills, rank: u.rank, g: u.g, carry: u.carry, carryN: u.carryN || 0 }); if (u.mode === 'raid') nu.st = 'raid'; }
    if (d.wonder) { const b = byId.get(d.wonder.id); if (b) this.wonder = { b, t: d.wonder.t }; }
    this.soc.load(d.soc, byId);
  }
}
