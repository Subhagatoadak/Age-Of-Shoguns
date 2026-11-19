// The living town: calendar, families, townsfolk daily life, livestock, wildlife, happiness, taxes,
// births, ageing, deaths, migration, festivals and a chronicle. Pure simulation (no rendering).
import { YEAR_LEN, START_YEAR, START_MONTH, MONTHS, SEASONS, HOUSE_CAP, CASTLE_CAP, FAMILY_NAMES, MALE_NAMES, FEMALE_NAMES, TAX, FESTIVAL, FORESTS, LAKE, WW, WH } from './data.js';
import { clamp, rectDist } from './util.js';

const pick = a => a[Math.floor(Math.random() * a.length)];
// a first name not already used in this family
const freshName = (list, fam, cits) => { const used = new Set(cits.filter(c => c.fam === fam).map(c => c.name)), free = list.filter(n => !used.has(n)); return pick(free.length ? free : list); };
const MONTH_LEN = YEAR_LEN / 12;
const ordinal = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

export class Society {
  constructor(w) {
    this.w = w; this.cits = []; this.animals = []; this.families = []; this.log = [];
    this.happy = 62; this.tax = 1; this.monthT = 0; this.monthIdx = 0; this.festT = 0; this.festBoost = 0; this.lostThisMonth = 0;
    this.lastTax = 0; this.lastFood = 0; this.births = 0; this.deaths = 0;
  }
  // ------------------------------------------------------------ calendar
  get month() { return (START_MONTH + this.monthIdx) % 12; }
  get year() { return START_YEAR + Math.floor((START_MONTH + this.monthIdx) / 12); }
  get season() { return Math.floor(this.month / 3); }
  // continuous season position 0..4 (0 = start of spring) for smooth visual blending
  get seasonPos() { return ((this.month + this.monthT / MONTH_LEN) / 3) % 4; }
  dateStr(short) { return short ? `${SEASONS[this.season]} ${this.year}` : `${ordinal(this.month + 1)} month (${MONTHS[this.month]}), ${SEASONS[this.season]} ${this.year}`; }
  chronicle(text, tone = 'info', toast = true) { this.log.unshift({ date: this.dateStr(true), text }); if (this.log.length > 60) this.log.length = 60; if (toast) this.w.ev.toast(text, tone); this.w.ev.chronicle(); }
  // ------------------------------------------------------------ people
  homes() { return this.w.bld.filter(b => b.team === 0 && b.prog >= 1 && (b.type === 'house' || b.type === 'tc')); }
  cap(b) { return b.type === 'tc' ? CASTLE_CAP : HOUSE_CAP; }
  residents(b) { return this.cits.filter(c => c.home === b); }
  addCit(o) {
    const c = { id: this.w.nid++, k: 'c', team: 0, type: 'cit', x: o.x, y: o.y, face: 0, mv: false, st: 'idle', waitT: Math.random() * 4, hp: 30, max: 30, ...o };
    this.cits.push(c); this.w.ev.spawn(c); return c;
  }
  newFamily(home, from, kids = 0) {
    const fam = { id: this.w.nid++, name: pick(FAMILY_NAMES), home }; this.families.push(fam);
    const at = from || { x: home.x, y: home.y + home.h / 2 + 10 };
    const man = this.addCit({ gender: 'm', age: 20 + Math.random() * 14, fam, home, name: pick(MALE_NAMES), x: at.x, y: at.y });
    const wife = this.addCit({ gender: 'f', age: 18 + Math.random() * 12, fam, home, name: pick(FEMALE_NAMES), x: at.x + 12, y: at.y + 6 });
    for (let i = 0; i < kids; i++) { const g = Math.random() < .5 ? 'm' : 'f'; this.addCit({ gender: g, age: 2 + Math.random() * 9, fam, home, name: freshName(g === 'm' ? MALE_NAMES : FEMALE_NAMES, fam, this.cits), x: at.x - 10, y: at.y + 10 }); }
    if (from) for (const c of [man, wife]) { c.st = 'walk'; c.dest = { x: home.x, y: home.y + home.h / 2 + 8 }; }
    return fam;
  }
  start() {
    const tc = this.w.bld.find(b => b.team === 0 && b.type === 'tc');
    this.newFamily(tc, null, 2);
    this.chronicle('The ' + this.families[0].name + ' family settles in the valley.', 'good', false);
    // wild deer roam the forests; chickens peck around homes
    for (const [fx, fy, , fr] of FORESTS.slice(0, 7)) for (let i = 0; i < 3; i++) this.addAnimal('deer', fx + (Math.random() - .5) * fr, fy + (Math.random() - .5) * fr, { cx: fx, cy: fy, r: fr * 1.2 });
    for (let i = 0; i < 3; i++) this.addAnimal('chicken', tc.x - 70 + i * 12, tc.y + 80, { cx: tc.x - 60, cy: tc.y + 85, r: 40 });
  }
  addAnimal(kind, x, y, pen, home) { const a = { id: this.w.nid++, k: 'a', kind, type: kind, x, y, face: Math.random() * 6.28, mv: false, st: 'idle', waitT: Math.random() * 3, pen, home }; this.animals.push(a); this.w.ev.spawn(a); return a; }
  // a new building: houses invite families, ranches get a herd, houses get chickens
  built(b) {
    if (b.team !== 0) return;
    if (b.type === 'house') {
      const edge = { x: 60, y: 1850 };                                   // newcomers arrive along the south road
      this.w.later(4 + Math.random() * 6, () => { if (!this.w.alive(b)) return; const fam = this.newFamily(b, edge, Math.random() < .4 ? 1 : 0); this.chronicle(`The ${fam.name} family moves into a new house.`, 'good'); });
      for (let i = 0; i < 2; i++) this.addAnimal('chicken', b.x - 20 + i * 14, b.y + b.h / 2 + 18, { cx: b.x, cy: b.y + b.h / 2 + 22, r: 26 }, b);
    }
    if (b.type === 'ranch') { for (let i = 0; i < 5; i++) this.addAnimal('cow', b.x + (Math.random() - .5) * b.w * .6, b.y + (Math.random() - .5) * b.h * .6, { cx: b.x, cy: b.y, r: Math.min(b.w, b.h) * .42, box: b }, b);
      this.chronicle('Cattle graze at the new ranch.', 'good'); }
  }
  lost(b) {   // building destroyed: residents become homeless and look for space, animals are lost
    for (const c of this.cits) if (c.home === b) { const h = this.homes().find(x => this.residents(x).length < this.cap(x)); c.home = h || null; }
    for (const a of this.animals) if (a.home === b) this.killAnimal(a);
  }
  killAnimal(a) { a.dead = true; this.animals = this.animals.filter(x => x !== a); this.w.ev.remove(a); }
  removeCit(c, why) { c.dead = true; this.cits = this.cits.filter(x => x !== c); this.w.ev.remove(c); }
  // turn an adult townsperson into a controllable villager (costs population space, no food)
  recruit() {
    const w = this.w; if (w.pop() >= w.popCap()) return 'Population limit reached. Build houses.';
    const c = this.cits.filter(c => c.age >= 15 && c.age < 50 && !c.inside).sort((a, b) => b.age - a.age)[0]; if (!c) return 'No adults free to recruit';
    this.removeCit(c); const u = w.addU(0, 'vil', c.x, c.y); u.g = c.gender; u.name = c.name + ' ' + c.fam.name; this.chronicle(`${u.name} joins the workforce.`, 'info', false); w.ev.refresh(); return null;
  }
  festival() {
    const w = this.w, t = w.bld.find(b => b.team === 0 && b.type === 'temple' && b.prog >= 1);
    if (!t) return 'Build a temple to hold a festival'; if (this.festT > 0) return 'A festival is already under way'; if (!w.afford(FESTIVAL.cost)) return 'Not enough resources';
    w.pay(FESTIVAL.cost); this.festT = FESTIVAL.time; this.festAt = t; this.festBoost = 22;
    for (const c of this.cits) if (!c.inside) { c.st = 'walk'; c.task = 'festival'; const a = Math.random() * 6.28, r = 50 + Math.random() * 40; c.dest = { x: t.x + Math.cos(a) * r, y: t.y + t.h / 2 + 30 + Math.sin(a) * r * .5 }; }
    this.chronicle('The town gathers at the temple for the summer matsuri!', 'gold'); w.ev.sfx('bell'); return null;
  }
  // ------------------------------------------------------------ per-tick
  step(dt) {
    const w = this.w;
    this.monthT += dt; if (this.monthT >= MONTH_LEN) { this.monthT -= MONTH_LEN; this.monthIdx++; this.newMonth(); }
    if (this.festT > 0) { this.festT -= dt; if (this.festT <= 0) { for (const c of this.cits) if (c.task === 'festival') { c.task = null; c.st = 'idle'; } this.chronicle('The festival lanterns are put away.', 'info', false); } }
    const night = w.night || 0, danger = w.units.filter(u => u.team === 1 && u.mode === 'raid');
    for (const c of this.cits) this.life(c, dt, night, danger);
    for (const a of this.animals) this.graze(a, dt);
  }
  life(c, dt, night, danger) {
    const w = this.w;
    if (!c.home || c.home.dead) { const h = this.homes().find(x => this.residents(x).length < this.cap(x)); c.home = h || null; if (!h) { c.st = 'walk'; c.dest = { x: 60, y: 1850 }; c.leaving = true; } }
    // raiders near: run home and bar the door
    const threat = danger.some(u => Math.hypot(u.x - c.x, u.y - c.y) < 380);
    if (threat && c.home && !c.inside && c.task !== 'shelter') { c.task = 'shelter'; c.st = 'walk'; c.dest = { x: c.home.x, y: c.home.y + c.home.h / 2 + 6 }; c.run = true; }
    if (c.inside) { if ((!threat && night < .5 && c.task !== 'sleep') || (c.task === 'sleep' && night < .35) || (c.task === 'shelter' && !threat)) { c.inside = false; c.task = null; c.st = 'idle'; c.waitT = Math.random() * 3; c.run = false; w.ev.hide(c, false); } return; }
    if (c.st === 'walk') {
      const spd = c.run ? 2.2 : c.age < 13 ? 1.25 : c.age > 60 ? .7 : 1;
      if (this.walk(c, c.dest.x, c.dest.y, dt, spd)) {
        if (c.leaving) { this.removeCit(c); return; }
        if (c.task === 'shelter' || c.task === 'sleep') { c.inside = true; w.ev.hide(c, true); return; }
        c.st = 'stay'; c.waitT = c.task === 'festival' ? 9999 : 6 + Math.random() * 12; c.face = c.faceTo != null ? c.faceTo : c.face; }
      return; }
    c.work = c.task === 'festival' ? 'dance' : c.task === 'field' ? 'farm' : c.task === 'chat' ? 'talk' : c.task === 'play' ? null : null;
    if ((c.waitT -= dt) > 0) return;
    // choose the next errand of the day
    if (night > .55 && c.home) { c.task = 'sleep'; c.st = 'walk'; c.dest = { x: c.home.x, y: c.home.y + c.home.h / 2 + 6 }; return; }
    const B = w.bld.filter(b => b.team === 0 && b.prog >= 1), r = Math.random();
    let tgt = null, task = 'stroll';
    if (c.age < 13) { task = 'play'; const h = c.home || B[0]; tgt = { x: h.x + (Math.random() - .5) * 120, y: h.y + h.h / 2 + 20 + Math.random() * 60 }; }
    else if (r < .25) { const m = B.filter(b => b.type === 'market' || b.type === 'store'); if (m.length) { const b = pick(m); task = 'market'; tgt = { x: b.x + (Math.random() - .5) * b.w, y: b.y + b.h / 2 + 12 + Math.random() * 14 }; } }
    else if (r < .4) { const t = B.filter(b => b.type === 'temple'); if (t.length) { const b = pick(t); task = 'pray'; tgt = { x: b.x + (Math.random() - .5) * 30, y: b.y + b.h / 2 + 30 }; c.faceTo = -Math.PI / 2; } }
    else if (r < .58 && c.gender === 'm') { const f = B.filter(b => b.type === 'farm'); if (f.length) { const b = pick(f); task = 'field'; tgt = { x: b.x + (Math.random() - .5) * b.w * .7, y: b.y + (Math.random() - .5) * b.h * .7 }; } }
    else if (r < .78) { const o = pick(this.cits); if (o && o !== c && !o.inside && o.age >= 13) { task = 'chat'; tgt = { x: o.x + 14, y: o.y }; } }
    if (!tgt) { const h = pick(B) || c.home; tgt = { x: h.x + (Math.random() - .5) * (h.w + 80), y: h.y + h.h / 2 + 16 + Math.random() * 50 }; }
    c.task = task; c.st = 'walk'; c.dest = tgt; c.run = false; if (task !== 'pray') c.faceTo = null;
  }
  walk(c, x, y, dt, mul) {
    const w = this.w, d = Math.hypot(x - c.x, y - c.y); if (d < 6) { c.mv = false; return true; }
    const sp = 26 * mul * dt, was = [c.x, c.y]; w.moveTo(c, x, y, 5, dt, null); // pathfinding shared with units
    const moved = Math.hypot(c.x - was[0], c.y - was[1]); if (moved > 0) { const k = Math.min(1, sp / moved); c.x = was[0] + (c.x - was[0]) * k; c.y = was[1] + (c.y - was[1]) * k; }
    for (const b of w.bld) { if (b.type === 'farm') continue; const hw = b.w / 2 + 3, hh = b.h / 2 + 3, dx = c.x - b.x, dy = c.y - b.y;    // step around walls
      if (Math.abs(dx) < hw && Math.abs(dy) < hh) { const px = hw - Math.abs(dx), py = hh - Math.abs(dy); if (px < py) c.x += Math.sign(dx || 1) * px; else c.y += Math.sign(dy || 1) * py; } }
    c.mv = true; return false;
  }
  graze(a, dt) {
    const w = this.w; a.mv = false;
    if (a.kind === 'deer') { const u = w.units.find(u => Math.hypot(u.x - a.x, u.y - a.y) < 140);     // startle and bolt from people
      if (u) { const ang = Math.atan2(a.y - u.y, a.x - u.x); a.dest = { x: clamp(a.x + Math.cos(ang) * 200, 20, WW - 20), y: clamp(a.y + Math.sin(ang) * 200, 20, WH - 20) }; a.run = true; a.st = 'walk'; } }
    if (a.st === 'walk') { const d = Math.hypot(a.dest.x - a.x, a.dest.y - a.y), sp = (a.kind === 'deer' ? (a.run ? 75 : 18) : a.kind === 'cow' ? 7 : 12) * dt;
      if (d < 4) { a.st = 'idle'; a.run = false; a.waitT = 3 + Math.random() * 9; return; }
      a.x += (a.dest.x - a.x) / d * Math.min(sp, d); a.y += (a.dest.y - a.y) / d * Math.min(sp, d); a.face = Math.atan2(a.dest.y - a.y, a.dest.x - a.x); a.mv = true;
      if (Math.hypot((a.x - LAKE.x) / LAKE.rx, (a.y - LAKE.y) / LAKE.ry) < 1.05) { a.st = 'idle'; a.waitT = 1; } return; }
    if ((a.waitT -= dt) > 0) return;
    const p = a.pen, ang = Math.random() * 6.28, r = Math.sqrt(Math.random()) * p.r;
    a.dest = { x: p.cx + Math.cos(ang) * r * (p.box ? p.box.w / p.box.h : 1), y: p.cy + Math.sin(ang) * r }; a.st = 'walk';
  }
  // ------------------------------------------------------------ the month turns
  newMonth() {
    const w = this.w, adults = this.cits.filter(c => c.age >= 15), soldiers = w.units.filter(u => u.team === 0 && u.type !== 'vil').length;
    // food: townsfolk and soldiers eat; ranches and the harvest feed the town
    const winter = this.season === 3, herd = this.animals.filter(a => a.kind === 'cow').length;
    const ranchFood = herd * (winter ? 3 : 6), harvest = this.season === 2 ? w.bld.filter(b => b.team === 0 && b.type === 'farm' && b.prog >= 1).length * 25 : 0;
    const eat = Math.round(this.cits.length * .9 + soldiers * .5);
    w.res.food += ranchFood + harvest - eat; this.lastFood = ranchFood + harvest - eat;
    const starving = w.res.food < 0; if (starving) w.res.food = 0;
    if (harvest) this.chronicle(`Autumn harvest: the rice paddies yield ${harvest} food.`, 'good');
    // taxes
    const T = TAX[this.tax], gold = Math.round(adults.length * T.gold * (.5 + this.happy / 100)); w.res.gold += gold; this.lastTax = gold;
    // happiness drifts toward what life is like here
    const has = t => w.bld.some(b => b.team === 0 && b.type === t && b.prog >= 1);
    const crowd = this.homes().some(h => this.residents(h).length > this.cap(h)) ? -6 : 0;
    const target = clamp(52 + (has('temple') ? 10 : 0) + (has('market') ? 7 : 0) + T.mood + (starving ? -30 : w.res.food > 200 ? 6 : 0) + this.festBoost + w.age * 3 + crowd - Math.min(24, this.lostThisMonth * 3) - (this.raidedThisMonth ? 8 : 0), 0, 100);
    this.happy += (target - this.happy) * .35; this.festBoost = Math.max(0, this.festBoost - 8); this.lostThisMonth = 0; this.raidedThisMonth = false;
    // life and death
    for (const c of [...this.cits]) {
      const was = c.age; c.age += 1 / 12;
      if (was < 15 && c.age >= 15) this.chronicle(`${c.name} ${c.fam.name} comes of age.`, 'info', false);
      if (c.age > 58 && Math.random() < (c.age - 58) / 260) { this.deaths++; this.removeCit(c); this.chronicle(`${c.name} ${c.fam.name} passes away peacefully, aged ${Math.floor(c.age)}.`, 'info'); }
    }
    if (!starving && this.happy > 42) for (const fam of this.families) {
      const m = this.cits.filter(c => c.fam === fam), wife = m.find(c => c.gender === 'f' && c.age >= 18 && c.age <= 40), man = m.find(c => c.gender === 'm' && c.age >= 18);
      if (!wife || !man || !fam.home || fam.home.dead || this.residents(fam.home).length >= this.cap(fam.home)) continue;
      if (Math.random() < .12 + (this.happy - 50) / 400) { const g = Math.random() < .5 ? 'm' : 'f', n = freshName(g === 'm' ? MALE_NAMES : FEMALE_NAMES, fam, this.cits);
        this.addCit({ gender: g, age: 0, fam, home: fam.home, name: n, x: fam.home.x, y: fam.home.y + fam.home.h / 2 + 8 }); this.births++;
        this.chronicle(`A ${g === 'm' ? 'son' : 'daughter'}, ${n}, is born to the ${fam.name} family.`, 'good'); }
    }
    // migration follows the mood of the town
    const free = this.homes().find(h => this.residents(h).length + 2 <= this.cap(h) && !this.families.some(f => f.home === h && this.cits.some(c => c.fam === f)));
    if (this.happy > 68 && free && Math.random() < .5) { const fam = this.newFamily(free, { x: 60, y: 1850 }, Math.random() < .5 ? 1 : 0); this.chronicle(`Word of a prosperous town spreads: the ${fam.name} family arrives.`, 'good'); }
    if (this.happy < 25 && this.families.length > 1 && Math.random() < .4) { const fam = pick(this.families.slice(1)); for (const c of this.cits.filter(c => c.fam === fam)) { c.leaving = true; c.st = 'walk'; c.dest = { x: 60, y: 1850 }; c.inside = false; w.ev.hide(c, false); }
      this.chronicle(`Unhappy with their lot, the ${fam.name} family leaves the valley.`, 'bad'); }
    if (this.month === 0) this.chronicle(`A new year begins: ${this.year}.`, 'gold');
    if (this.month % 3 === 0) this.w.ev.season(this.season);
    if (starving) this.chronicle('The granaries are empty. The town goes hungry!', 'bad');
    w.ev.refresh();
  }
  stats() {
    const c = this.cits, adults = c.filter(x => x.age >= 15 && x.age < 58);
    return { total: c.length, men: adults.filter(x => x.gender === 'm').length, women: adults.filter(x => x.gender === 'f').length, children: c.filter(x => x.age < 15).length, elders: c.filter(x => x.age >= 58).length,
      families: this.families.filter(f => c.some(x => x.fam === f)).length, cattle: this.animals.filter(a => a.kind === 'cow').length, housing: this.homes().reduce((a, h) => a + this.cap(h), 0) };
  }
  // ------------------------------------------------------------ save / load
  serialize() {
    return { happy: this.happy, tax: this.tax, monthT: this.monthT, monthIdx: this.monthIdx, log: this.log, births: this.births, deaths: this.deaths, festBoost: this.festBoost,
      families: this.families.map(f => ({ id: f.id, name: f.name, home: f.home && f.home.id })),
      cits: this.cits.map(c => ({ gender: c.gender, age: c.age, name: c.name, fam: c.fam.id, home: c.home && c.home.id, x: c.x, y: c.y })) };
  }
  load(d, byId) {
    Object.assign(this, { happy: d.happy, tax: d.tax, monthT: d.monthT, monthIdx: d.monthIdx, log: d.log || [], births: d.births || 0, deaths: d.deaths || 0, festBoost: d.festBoost || 0 });
    const fams = new Map(d.families.map(f => [f.id, { id: f.id, name: f.name, home: byId.get(f.home) || null }])); this.families = [...fams.values()];
    for (const c of d.cits) { const fam = fams.get(c.fam) || this.families[0]; this.addCit({ gender: c.gender, age: c.age, name: c.name, fam, home: byId.get(c.home) || null, x: c.x, y: c.y }); }
    const tc = this.w.bld.find(b => b.team === 0 && b.type === 'tc');
    for (const [fx, fy, , fr] of FORESTS.slice(0, 7)) for (let i = 0; i < 3; i++) this.addAnimal('deer', fx + (Math.random() - .5) * fr, fy + (Math.random() - .5) * fr, { cx: fx, cy: fy, r: fr * 1.2 });
    for (const b of this.w.bld) if (b.team === 0 && b.prog >= 1) { if (b.type === 'ranch') for (let i = 0; i < 5; i++) this.addAnimal('cow', b.x, b.y, { cx: b.x, cy: b.y, r: Math.min(b.w, b.h) * .42, box: b }, b);
      if (b.type === 'house') for (let i = 0; i < 2; i++) this.addAnimal('chicken', b.x, b.y + b.h / 2 + 18, { cx: b.x, cy: b.y + b.h / 2 + 22, r: 26 }, b); }
    if (tc) for (let i = 0; i < 3; i++) this.addAnimal('chicken', tc.x - 70, tc.y + 80, { cx: tc.x - 60, cy: tc.y + 85, r: 40 });
  }
}
