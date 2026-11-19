import * as THREE from 'three';
import { WW, WH, S, LAKE, UT, BT, COST, TECH, TRAIN, REQ, BUILD_LIST, GARRISON, DIFF, NW, NH, AGES, AGE_REQ, TAX, FESTIVAL, RAID_DEFAULT, MONTHS } from '../game/data.js';
import { fmt, costStr } from '../game/util.js';
import { height } from '../gfx/terrain.js';
import { Snd } from '../audio.js';

const $ = s => document.querySelector(s);
const KEYS = 'ZXCVBNMJKLYUIO';
const ICON = { food: '🍙', wood: '🪵', gold: '🪙' };

export class Hud {
  constructor(game) {
    this.g = game; this.w = game.world; this.hot = []; this.bars = []; this.floats = [];
    this.mobile = matchMedia('(max-width: 700px)').matches;
    $('#btn-idle').onclick = () => this.idle(); $('#btn-army').onclick = () => this.army();
    $('#btn-speed').onclick = () => this.cycleSpeed();
    $('#btn-town').onclick = () => this.toggleTown(); $('#btn-settings').onclick = () => this.settings(); $('#btn-save').onclick = () => { game.save(); this.toast('Game saved: ' + this.w.soc.dateStr(), 'good'); };
    $('#btn-zin').onclick = () => game.cam.zoom(.75); $('#btn-zout').onclick = () => game.cam.zoom(1.33);
    $('#btn-cine').onclick = () => this.setCine(game.director.toggle()); this.setCine(game.director.on, true); $('#btn-pause').onclick = () => this.togglePause();
    $('#btn-sound').onclick = e => { e.target.textContent = Snd.toggle() ? 'Sound' : 'Muted'; };
    $('#btn-real').onclick = () => game.toggleRealism();
    $('#btn-quality').onclick = e => { e.target.textContent = game.toggleQuality() ? 'High' : 'Low'; };
    $('#btn-sound').textContent = (() => { try { return localStorage.getItem('aos3d_mute') === '1' ? 'Muted' : 'Sound'; } catch (e) { return 'Sound'; } })();
    for (const b of document.querySelectorAll('#top button')) b.addEventListener('pointerdown', () => { Snd.init(); Snd.play('click'); });
    this.mm = $('#minimap'); this.mmx = this.mm.getContext('2d'); this.mmBg = this.paintMinimapBg(); this.mmT = 0;
    const jump = e => { const r = this.mm.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * WW, y = (e.clientY - r.top) / r.height * WH;
      if (e.button === 2 && this.g.sel.length) { this.g.order(x, y, null); return; } this.g.cam.focus(x * S, y * S); };
    this.mm.addEventListener('pointerdown', e => { e.stopPropagation(); this.mmDrag = true; jump(e); });
    this.mm.addEventListener('pointermove', e => { if (this.mmDrag && e.buttons & 1) jump(e); });
    addEventListener('pointerup', () => this.mmDrag = false);
    this.mm.addEventListener('contextmenu', e => e.preventDefault());
    this.layer = $('#overlay');
    const topH = () => document.documentElement.style.setProperty('--topH', $('#top').offsetHeight + 'px'); topH(); addEventListener('resize', topH); setTimeout(topH, 500);
  }
  // ------------------------------------------------------------ minimap
  paintMinimapBg() {
    const c = document.createElement('canvas'); c.width = 300; c.height = 200; const x = c.getContext('2d'), img = x.createImageData(300, 200);
    for (let j = 0; j < 200; j++) for (let i = 0; i < 300; i++) { const wx = i * 10, wy = j * 10, h = height(wx, wy), o = (j * 300 + i) * 4;
      const lake = Math.hypot((wx - LAKE.x) / LAKE.rx, (wy - LAKE.y) / LAKE.ry) < 1.02;
      const [r, g, b] = lake ? [52, 96, 130] : h > 6 ? [120, 116, 104] : [86 + h * 6, 118 + h * 4, 58];
      img.data.set([r, g, b, 255], o); }
    x.putImageData(img, 0, 0); return c;
  }
  drawMinimap() {
    const m = this.mmx, W = this.mm.width, H = this.mm.height, w = this.w, kx = W / WW, ky = H / WH;
    m.drawImage(this.mmBg, 0, 0, W, H);
    m.fillStyle = 'rgba(8,10,6,.82)'; const cw = W / NW, ch = H / NH;
    for (let j = 0; j < NH; j++) for (let i = 0; i < NW; i++) if (!w.explored[j * NW + i]) m.fillRect(i * cw, j * ch, cw + .6, ch + .6);
    for (const r of w.rs) if (r.kind !== 'tree' && w.isExplored(r.x, r.y)) { m.fillStyle = r.kind === 'gold' ? '#f2c84b' : r.kind === 'fish' ? '#9fd8ff' : '#d8323c'; m.fillRect(r.x * kx - 1.5, r.y * ky - 1.5, 3, 3); }
    for (const b of w.bld) if (b.team === 0 || w.isExplored(b.x, b.y)) { m.fillStyle = b.team ? '#d8443a' : '#3f7ae0'; m.fillRect((b.x - b.w / 2) * kx, (b.y - b.h / 2) * ky, Math.max(3, b.w * kx), Math.max(3, b.h * ky)); }
    for (const u of w.units) if (u.team === 0 || w.isExplored(u.x, u.y)) { m.fillStyle = u.team ? '#ff7a6e' : '#a8c8ff'; m.fillRect(u.x * kx - 1.2, u.y * ky - 1.2, 2.6, 2.6); }
    if (this.pings) { const now = performance.now(); this.pings = this.pings.filter(p => now - p.t < 2500);
      for (const p of this.pings) { const f = ((now - p.t) % 800) / 800; m.strokeStyle = p.c; m.globalAlpha = 1 - f; m.lineWidth = 2; m.beginPath(); m.arc(p.x * kx, p.y * ky, 4 + f * 14, 0, 7); m.stroke(); m.globalAlpha = 1; } }
    const q = this.g.cam.groundQuad(); if (q) { m.strokeStyle = '#fff'; m.lineWidth = 1.2; m.beginPath(); q.forEach(([x, y], i) => i ? m.lineTo(x / S * kx, y / S * ky) : m.moveTo(x / S * kx, y / S * ky)); m.closePath(); m.stroke(); }
  }
  ping(x, y, c) { (this.pings || (this.pings = [])).push({ x, y, c, t: performance.now() }); }
  // ------------------------------------------------------------ panel
  refresh() {
    const g = this.g, w = this.w, btns = []; this.hot = [];
    const add = (label, sub, fn, ok = true) => { const i = btns.length, key = !this.mobile && i < KEYS.length ? KEYS[i] : '';
      btns.push(`<button class="act${ok ? '' : ' off'}" data-i="${i}"><b>${label}</b>${key ? `<kbd>${key}</kbd>` : ''}${sub ? `<small>${sub}</small>` : ''}</button>`); this.hot[i] = fn; };
    const toast = m => this.toast(m, 'bad');
    let title = '', info = '';
    if (g.place) { title = 'Place ' + BT[g.place].name.toLowerCase(); info = this.mobile ? 'Tap a spot, tap again to confirm.' : 'Click a clear, explored spot. Right-click or Esc cancels.'; add('Cancel', null, () => { g.setPlace(null); }); }
    else if (g.sel.length) {
      const v = g.sel.filter(u => u.type === 'vil').length, m = g.sel.length - v;
      title = g.sel.length === 1 ? (g.sel[0].boss ? 'Ronin warlord' : UT[g.sel[0].type].name) : [v ? v + ' villager' + (v > 1 ? 's' : '') : '', m ? m + ' soldier' + (m > 1 ? 's' : '') : ''].filter(Boolean).join(', ');
      info = this.unitInfo();
      if (v) for (const t of BUILD_LIST) { const need = REQ[t], ageLock = !w.ageOk(t), lock = ageLock || (need && !w.hasB(need));
        add(BT[t].name, ageLock ? 'needs ' + AGES[AGE_REQ[t]].name : lock ? 'needs ' + BT[need].name.toLowerCase() : costStr(COST[t]), () => {
          if (ageLock) return toast('Advance to the ' + AGES[AGE_REQ[t]].name + ' at your castle first');
          if (lock) return toast('Build a ' + BT[need].name.toLowerCase() + ' first');
          if (t === 'pagoda' && w.bld.some(b => b.team === 0 && b.type === 'pagoda')) return toast('Only one Great Pagoda may be raised');
          if (!w.afford(COST[t])) return toast('Not enough resources for a ' + BT[t].name.toLowerCase());
          g.setPlace(t); }, !lock && w.afford(COST[t])); }
      add('Stop', null, () => { for (const u of g.sel) { u.st = 'idle'; u.hx = u.x; u.hy = u.y; u.path = null; } });
    } else if (g.selB) {
      const b = g.selB; title = (b.team ? 'Enemy ' : '') + BT[b.type].name; info = this.bldInfo();
      if (b.team === 0 && b.prog >= 1) {
        if (b.type === 'tc') { const nx = AGES[w.age + 1];
          if (nx) add(b.ageT != null ? 'Advancing… ' + Math.floor(b.ageT / nx.time * 100) + '%' : 'Advance to the ' + nx.name, costStr(nx.cost) + ' · +' + nx.pop + ' population, new buildings and units', () => { const err = w.advanceAge(b); if (err) toast(err); this.refresh(); }, b.ageT == null && w.afford(nx.cost)); }
        if (b.type === 'temple') add(w.soc.festT > 0 ? 'Festival under way' : 'Hold a matsuri festival', costStr(FESTIVAL.cost) + ' · the town gathers, happiness rises', () => { const err = w.soc.festival(); if (err) toast(err); this.refresh(); }, w.soc.festT <= 0 && w.afford(FESTIVAL.cost));
        if (b.type === 'house' || b.type === 'tc') add('Recruit a villager', 'an adult of the town takes up tools', () => { const err = w.soc.recruit(); if (err) toast(err); this.refresh(); });
        for (const t of TRAIN[b.type] || []) { const need = REQ[t], ageLock = !w.ageOk(t), lock = ageLock || (need && !w.hasB(need));
          add('Train ' + UT[t].name.toLowerCase(), ageLock ? 'needs ' + AGES[AGE_REQ[t]].name : lock ? 'needs ' + BT[need].name.toLowerCase() : costStr(COST[t]), () => { if (ageLock) return toast('Requires the ' + AGES[AGE_REQ[t]].name); if (lock) return toast('Build a ' + BT[need].name.toLowerCase() + ' first'); const err = w.train(b, t); if (err) toast(err); this.refresh(); }, !lock && w.afford(COST[t])); }
        for (const [k, T] of Object.entries(TECH)) if (T.at === b.type && !w.tech[0].has(k)) { const busy = w.bld.some(x => x.rk === k), al = !w.ageOk(k);
          if (al) { add(T.name, 'needs ' + AGES[AGE_REQ[k]].name, () => toast('Requires the ' + AGES[AGE_REQ[k]].name), false); continue; }
          add((busy ? 'Researching ' : '') + T.name, costStr(T.cost) + ' · ' + T.desc, () => { const err = w.research(b, k); if (err) this.toast(err, 'info'); this.refresh(); }, !busy && !b.rk && w.afford(T.cost)); }
        if (b.type === 'market') for (const k of ['wood', 'food']) {
          add('Sell 100 ' + k, '+' + Math.round(70 * w.price[k]) + ' gold', () => { const err = w.trade(k, true); if (err) toast(err); this.refresh(); }, w.res[k] >= 100);
          add('Buy 100 ' + k, Math.round(130 * w.price[k]) + ' gold', () => { const err = w.trade(k, false); if (err) toast(err); this.refresh(); }, w.res.gold >= Math.round(130 * w.price[k])); }
        if (b.type === 'tc') add(w.bellOn ? 'All clear' : 'Ring the town bell', w.bellOn ? 'villagers return to work' : 'villagers shelter and shoot', () => w.bell(!w.bellOn));
        else if (GARRISON[b.type] && b.gar.length) add('Release villagers', b.gar.length + ' sheltered', () => w.release(b));
      }
    } else if (g.selC) { const c = g.selC, fam = w.soc.cits.filter(x => x.fam === c.fam && x !== c);
      title = c.name + ' ' + c.fam.name; info = `${Math.floor(c.age)} years old · ${c.age < 15 ? (c.gender === 'f' ? 'daughter' : 'son') : c.age >= 58 ? 'elder' : c.gender === 'f' ? 'townswoman' : 'townsman'} of the ${c.fam.name} family · ${({ market: 'at the market', pray: 'praying at the temple', field: 'tending the paddies', chat: 'chatting with a neighbour', play: 'playing', festival: 'dancing at the festival', sleep: 'asleep', shelter: 'sheltering from raiders' })[c.task] || 'out and about'}` + (fam.length ? ' · family: ' + fam.map(x => x.name).join(', ') : '');
    } else { title = 'Your village'; info = 'Select villagers to gather and build. Destroy the enemy castle in the north-east, or raise a Great Pagoda and hold it, to win.'; }
    $('#p-title').textContent = title; $('#p-info').textContent = info;
    const acts = $('#p-acts'); acts.innerHTML = btns.join('');
    acts.querySelectorAll('button').forEach(b => b.onpointerdown = e => { e.stopPropagation(); Snd.init(); Snd.play('click'); this.hot[+b.dataset.i](); });
  }
  unitInfo() { const s = this.g.sel; if (s.length !== 1) return this.mobile ? 'Tap the map to move, or tap a target.' : 'Right-click to move or attack. Shift+drag adds a box. Ctrl+1–9 saves a group.'; const u = s[0];
    return 'HP ' + Math.ceil(u.hp) + '/' + Math.ceil(u.max) + (u.carryN ? ' · carrying ' + u.carryN + ' ' + u.carry : '') + ' · ' + u.st + (u.kills ? ' · ' + u.kills + ' kills ' + '★'.repeat(u.rank) : '') + (u.type === 'monk' ? ' · heals nearby allies' : ''); }
  bldInfo() { const b = this.g.selB, w = this.w.wonder;
    return 'HP ' + Math.ceil(b.hp) + '/' + Math.ceil(b.max) + (b.prog < 1 ? ' · building ' + Math.floor(b.prog * 100) + '%' : '') + (b.q.length ? ' · training ' + b.q.map(t => UT[t].name.toLowerCase()).join(', ') : '')
      + (b.rk ? ' · researching ' + TECH[b.rk].name + ' ' + Math.floor(b.rt / TECH[b.rk].time * 100) + '%' : '') + (b.type === 'temple' ? ' · units nearby heal' : '')
      + (b.gar.length ? ' · ' + b.gar.length + '/' + GARRISON[b.type] + ' sheltered (+arrows)' : '') + (w && w.b === b ? ' · victory in ' + fmt(Math.max(0, w.t)) : '')
      + (b.team === 0 && TRAIN[b.type] && b.prog >= 1 ? ' · right-click the map to set a rally point' : ''); }
  // ------------------------------------------------------------ per frame
  update(dt) {
    const w = this.w, g = this.g;
    this.tick = (this.tick || 0) - dt;
    if (this.tick <= 0) { this.tick = .25;
      for (const k of ['food', 'wood', 'gold']) $('#r-' + k).textContent = Math.floor(w.res[k]);
      document.documentElement.style.setProperty('--topH', $('#top').offsetHeight + 'px');
      const so = w.soc; $('#r-date').textContent = MONTHS[so.month] + ', ' + ['Spring', 'Summer', 'Autumn', 'Winter'][so.season] + ' ' + so.year; $('#r-age').textContent = AGES[w.age].short + ' Age';
      $('#r-people').textContent = so.cits.length; $('#r-happy').textContent = Math.round(so.happy); $('#r-mood').style.background = so.happy > 65 ? '#6fd36f' : so.happy > 40 ? '#e8c46a' : '#e0533f';
      if (this.townOpen && (this.townT = (this.townT || 0) - 1) <= 0) { this.townT = 4; this.renderTown(); }
      $('#r-pop').textContent = w.pop() + '/' + w.popCap(); $('#r-clock').textContent = fmt(w.t);
      const ban = $('#banner'); if (w.over) ban.textContent = ''; else if (w.wonder) { ban.textContent = 'Great Pagoda: victory in ' + fmt(Math.max(0, w.wonder.t)); ban.className = 'gold'; }
      else { const r = w.nextWave - w.t; ban.textContent = 'Raid ' + (w.wave + 1) + ' in ' + fmt(Math.max(0, r)) + (w.speed > 1 ? ' · ' + w.speed + 'x' : '') + (w.raining ? ' · rain' : ''); ban.className = r < 15 ? 'warn' : ''; }
      if (g.sel.length === 1 && !g.place) $('#p-info').textContent = this.unitInfo(); else if (g.selB && !g.place) $('#p-info').textContent = this.bldInfo();
      Snd.rain(w.paused ? 0 : w.wet);
      document.querySelectorAll('#p-acts .act').forEach(b => {});
    }
    if ((this.mmT -= dt) <= 0) { this.mmT = .2; this.drawMinimap(); }
    this.updateBars(); this.updateFloats(dt);
  }
  project(v) { const p = v.clone().project(this.g.camera); if (p.z > 1) return null; return [(p.x * .5 + .5) * innerWidth, (-p.y * .5 + .5) * innerHeight]; }
  updateBars() {
    const g = this.g, w = this.w, list = [];
    for (const u of w.units) if (u.sel || u.hp < u.max || u.boss) list.push(u);
    for (const b of w.bld) if (b === g.selB || b.hp < b.max || b.prog < 1 || b.q.length || b.rk) list.push(b);
    let i = 0;
    for (const e of list) { if (i >= 160) break; const a = g.view.anchor(e); if (!a) continue; const p = this.project(a); if (!p) continue;
      let el = this.bars[i]; if (!el) { el = document.createElement('div'); el.className = 'hb'; el.innerHTML = '<i></i><u></u>'; this.layer.appendChild(el); this.bars[i] = el; }
      const f = Math.max(0, e.hp / e.max), wide = e.k === 'b' ? 56 : e.boss ? 46 : 26;
      el.style.display = 'block'; el.style.transform = `translate(${p[0] - wide / 2}px, ${p[1]}px)`; el.style.width = wide + 'px';
      const bar = el.firstChild; bar.style.width = (e.k === 'b' && e.prog < 1 ? e.prog : f) * 100 + '%'; bar.style.background = e.k === 'b' && e.prog < 1 ? '#8fd0ff' : f > .5 ? '#5fd35f' : f > .25 ? '#f2c84b' : '#e0533f';
      const q = el.lastChild; const prog = e.k === 'b' ? (e.q.length ? e.qt / UT[e.q[0]].train : e.rk ? e.rt / TECH[e.rk].time : 0) : 0; q.style.width = prog * 100 + '%'; q.style.display = prog ? 'block' : 'none'; q.style.background = e.rk && !e.q.length ? '#ffa040' : '#8fd0ff';
      el.dataset.rank = e.k === 'u' && e.rank ? '★'.repeat(e.rank) : ''; i++; }
    for (; i < this.bars.length; i++) this.bars[i].style.display = 'none';
  }
  float(x, y, text) { const el = document.createElement('div'); el.className = 'float'; el.textContent = text; this.layer.appendChild(el); this.floats.push({ el, pos: new THREE.Vector3(x * S, height(x, y) + 4, y * S), t: 0 }); }
  updateFloats(dt) { for (const f of this.floats) { f.t += dt; const p = this.project(f.pos.clone().setY(f.pos.y + f.t * 2)); if (p) f.el.style.transform = `translate(${p[0]}px, ${p[1]}px) translate(-50%, -50%)`; f.el.style.opacity = Math.min(1, 2.2 - f.t * 1.4); if (f.t > 1.6) f.el.remove(); }
    this.floats = this.floats.filter(f => f.t <= 1.6); }
  toast(msg, tone = 'info') { const el = document.createElement('div'); el.className = 'toast ' + tone; el.textContent = msg; $('#toasts').prepend(el); setTimeout(() => el.classList.add('out'), 3200); setTimeout(() => el.remove(), 3800);
    const all = $('#toasts').children; for (let i = 3; i < all.length; i++) all[i].remove(); }
  // ------------------------------------------------------------ buttons & dialogs
  // ------------------------------------------------------------ the town: people, mood, taxes, chronicle
  toggleTown() { this.townOpen = !this.townOpen; $('#town').classList.toggle('show', this.townOpen); if (this.townOpen) this.renderTown(); }
  renderTown() {
    const w = this.w, so = w.soc, st = so.stats(), bar = (v, c) => `<div class="meter"><i style="width:${v}%;background:${c}"></i></div>`;
    $('#town').innerHTML = `<header><h3>The town</h3><button id="town-x">✕</button></header>
      <p class="date">${so.dateStr()} · ${AGES[w.age].name}</p>
      <div class="grid"><span>People</span><b>${st.total} <small>/ ${st.housing} housing</small></b><span>Men · women</span><b>${st.men} · ${st.women}</b><span>Children · elders</span><b>${st.children} · ${st.elders}</b>
        <span>Families</span><b>${st.families}</b><span>Workers · soldiers</span><b>${w.units.filter(u => u.team === 0 && u.type === 'vil').length} · ${w.units.filter(u => u.team === 0 && u.type !== 'vil').length}</b><span>Cattle</span><b>${st.cattle}</b>
        <span>Born · died</span><b>${so.births} · ${so.deaths}</b></div>
      <h4>Happiness ${Math.round(so.happy)}</h4>${bar(so.happy, so.happy > 65 ? '#6fd36f' : so.happy > 40 ? '#e8c46a' : '#e0533f')}
      <p class="dim">Temples, markets, festivals, full granaries and light taxes please the people. Hunger, heavy taxes, raids and losses anger them. Happy towns grow; unhappy families leave.</p>
      <h4>Taxes</h4><div class="seg">${TAX.map((t, i) => `<button data-tax="${i}" class="${so.tax === i ? 'on' : ''}">${t.name}</button>`).join('')}</div>
      <p class="dim">Last month: ${so.lastTax >= 0 ? '+' : ''}${so.lastTax} gold in taxes · food ${so.lastFood >= 0 ? '+' : ''}${so.lastFood} (eaten by the town and garrison, grown by cattle and the autumn harvest)</p>
      <div class="row"><button id="town-recruit">Recruit a villager</button><button id="town-fest">Hold a festival</button></div>
      <h4>Chronicle</h4><ol class="log">${so.log.map(l => `<li><time>${l.date}</time>${l.text}</li>`).join('')}</ol>`;
    $('#town-x').onclick = () => this.toggleTown();
    $('#town').querySelectorAll('[data-tax]').forEach(b => b.onclick = () => { so.tax = +b.dataset.tax; this.renderTown(); });
    $('#town-recruit').onclick = () => { const e = so.recruit(); if (e) this.toast(e, 'bad'); this.renderTown(); };
    $('#town-fest').onclick = () => { const e = so.festival(); if (e) this.toast(e, 'bad'); this.renderTown(); };
  }
  // ------------------------------------------------------------ settings: raid timing and options
  settings(from) {
    const w = this.w, r = w.raid, wasPaused = w.paused; w.paused = true;
    const mins = v => v == null ? 'auto' : (v / 60).toFixed(v % 60 ? 1 : 0) + ' min';
    const first = r.first ?? w.diff.first, gap = r.gap;
    this.dialog('Settings', `<div class="set">
      <label><input type="checkbox" id="s-on" ${r.on ? 'checked' : ''}> Enemy raids</label>
      <label>First raid after <output id="o-first">${mins(first)}</output><input type="range" id="s-first" min="60" max="1200" step="30" value="${first}"></label>
      <label>Time between raids <output id="o-gap">${mins(gap)}</output><input type="range" id="s-gap" min="0" max="900" step="30" value="${gap ?? 0}"><small>far left = automatic (raids come faster each time)</small></label>
      <label>Raid size <output id="o-size">${Math.round(r.size * 100)}%</output><input type="range" id="s-size" min=".5" max="2.5" step=".1" value="${r.size}"></label>
      ${from ? '' : `<p class="dim">Next raid ${r.on ? 'in ' + Math.max(0, Math.round((w.nextWave - w.t) / 60 * 10) / 10) + ' min' : 'paused'} · raids survived ${w.wave}</p>`}
      <label><input type="checkbox" id="s-cine" ${this.g.director.on ? 'checked' : ''}> Cinematic battle camera</label></div>`,
      [['Apply', null, () => {
        const on = $('#s-on').checked, f = +$('#s-first').value, gp = +$('#s-gap').value, sz = +$('#s-size').value;
        const firstChanged = f !== first; Object.assign(r, { on, first: f, gap: gp > 0 ? gp : null, size: sz });
        if (!from && w.wave === 0 && firstChanged) w.nextWave = Math.max(w.t + 20, f); else if (!from && gp > 0) w.nextWave = Math.min(w.nextWave, w.t + gp);
        if ($('#s-cine').checked !== this.g.director.on) this.setCine(this.g.director.toggle());
        try { localStorage.setItem('aos3d_raids', JSON.stringify(r)); } catch (e) {}
        w.paused = from ? true : wasPaused; this.toast('Settings saved', 'good'); from && from(); }],
       ...(from ? [] : [['Send a raid now', 'for practice', () => { w.nextWave = w.t; w.paused = wasPaused; }]]),
       ['Cancel', null, () => { w.paused = from ? true : wasPaused; from && from(); }]]);
    for (const [id, out, f] of [['s-first', 'o-first', v => mins(+v)], ['s-gap', 'o-gap', v => +v > 0 ? mins(+v) : 'auto'], ['s-size', 'o-size', v => Math.round(v * 100) + '%']]) $('#' + id).oninput = e => $('#' + out).textContent = f(e.target.value);
  }
  idle() { const g = this.g, idle = this.w.units.filter(u => u.team === 0 && u.type === 'vil' && u.st === 'idle'); if (!idle.length) return this.toast('No idle villagers', 'info');
    this.ii = ((this.ii || 0) + 1) % idle.length; const u = idle[this.ii]; g.select([u]); g.cam.focus(u.x * S, u.y * S); }
  army() { const g = this.g, a = this.w.units.filter(u => u.team === 0 && u.type !== 'vil'); if (!a.length) return this.toast('No soldiers yet. Build a barracks.', 'info');
    g.select(a); g.cam.focus(a.reduce((s, u) => s + u.x, 0) / a.length * S, a.reduce((s, u) => s + u.y, 0) / a.length * S); }
  setCine(on, quiet) { $('#btn-cine').classList.toggle('on', on); $('#btn-cine').textContent = on ? 'Battle cam ●' : 'Battle cam'; if (!quiet) this.toast(on ? 'Cinematic battle camera on: raids will be filmed up close (T)' : 'Battle camera off', 'info'); }
  togglePause() { if (this.modal) return; this.w.paused = !this.w.paused; $('#btn-pause').textContent = this.w.paused ? 'Resume' : 'Pause'; }
  cycleSpeed() { this.w.speed = this.w.speed % 3 + 1; $('#btn-speed').textContent = this.w.speed + 'x'; }
  dialog(title, body, buttons) {
    const d = $('#dialog'); d.innerHTML = `<div class="card"><h1>${title}</h1><div class="body">${body}</div><div class="row">${buttons.map((b, i) => `<button data-i="${i}"><b>${b[0]}</b>${b[1] ? `<small>${b[1]}</small>` : ''}</button>`).join('')}</div></div>`;
    d.classList.add('show'); this.modal = true;
    d.querySelectorAll('button').forEach(b => b.onclick = () => { Snd.init(); Snd.play('click'); d.classList.remove('show'); this.modal = false; buttons[+b.dataset.i][2](); });
  }
  intro() {
    const bests = Object.entries(DIFF).map(([k, d]) => { try { const v = +localStorage.getItem('aos3d_best_' + k); return v ? d.name + ' ' + fmt(v) : ''; } catch (e) { return ''; } }).filter(Boolean);
    this.dialog('Age of Shoguns', `<p>Build your village in the valley, raise an army and destroy the enemy castle in the north-east, or raise a Great Pagoda and hold it for three minutes.</p>
      <ul><li>The years turn from 1560 through spring blossom, summer, red autumn and winter snow. Families move into your houses, children are born and grow up, elders pass on.</li>
      <li>Keep the town fed and happy (Town panel): taxes, festivals, temples and markets. Advance through four ages at your castle. Build only inside your borders.</li>
      <li>Villagers gather wood, gold, berries and lake fish, farm rice, raise cattle and build.</li><li>Samurai need a blacksmith, riders a stable; temple monks heal. Spears beat cavalry.</li>
      <li>Ring the town bell at your castle to shelter villagers; trade at the market.</li>
      ${this.mobile ? '<li>Drag to move the map, pinch to zoom and rotate, tap to select and command.</li>' : '<li><b>Drag the map</b> to move around (it glides when you let go). Wheel or +/− zooms, Q/E or middle-drag rotates, WASD pans.</li><li>Click selects, Shift+drag box-selects, right-click commands.</li><li>During raids the <b>battle cam</b> films the duels up close; T toggles it. Panel actions Z X C…, Ctrl+1–9 groups, Space last alert, H castle, . idle, G army, F speed, P pause.</li>'}</ul>
      ${bests.length ? '<p class="dim">Best victories: ' + bests.join(' · ') + '</p>' : ''}<p class="dim">Choose your difficulty:</p>`,
      [...(this.g.hasSave() ? [['Continue', 'saved ' + this.g.saveAge(), () => this.g.continueGame()]] : []), ...Object.entries(DIFF).map(([k, d]) => [d.name, d.blurb, () => this.g.start(k)]), ['Raid settings…', 'timing and size', () => this.settings(() => this.intro())]]);
  }
  end(win, how) {
    const w = this.w, S2 = w.stats; let best = '';
    if (win) try { const k = 'aos3d_best_' + w.diffKey, prev = +localStorage.getItem(k) || 0; if (!prev || w.t < prev) { localStorage.setItem(k, String(w.t)); best = '<p class="gold">New best time on ' + w.diff.name + '!</p>'; } else best = '<p class="dim">Best on ' + w.diff.name + ': ' + fmt(prev) + '</p>'; } catch (e) {}
    Snd.play(win ? 'win' : 'lose');
    const msg = !win ? 'Your castle has burned. The raiders hold the valley.' : how === 'pagoda' ? 'The Great Pagoda has stood for three minutes. The province bows to your shogunate.' : 'The enemy castle has fallen. The province is yours.';
    setTimeout(() => this.dialog(win ? 'Victory' : 'Defeat', `<p>${msg}</p><table><tr><td>Time</td><td>${fmt(w.t)} · ${w.diff.name}</td></tr><tr><td>Raids survived</td><td>${w.wave}</td></tr><tr><td>Enemies slain</td><td>${S2.kills}</td></tr><tr><td>Units lost</td><td>${S2.lost}</td></tr><tr><td>Units trained</td><td>${S2.trained}</td></tr><tr><td>Buildings raised</td><td>${S2.built}</td></tr><tr><td>Resources gathered</td><td>${Math.floor(S2.gathered)}</td></tr></table>${best}`,
      [['Play again', null, () => location.reload()]]), 1800);
  }
}
