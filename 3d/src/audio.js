// Procedural WebAudio: sound effects, distance attenuation, rain bed and koto-style ambient music.
const GAP = { swing: 60, kick: 50, slash: 50, boom: 400, chop: 110, mine: 110, hammer: 150, arrow: 70, hit: 60, clash: 70, heal: 200, train: 200, select: 80, order: 80, collapse: 300, timber: 250, trade: 60 };
export const Snd = {
  ctx: null, master: null, on: true, last: {},
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { this.on = localStorage.getItem('aos3d_mute') !== '1'; } catch (e) {}
    this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.on ? .5 : 0;
    const comp = this.ctx.createDynamicsCompressor(); this.master.connect(comp).connect(this.ctx.destination);
    const n = this.ctx.sampleRate; this.nb = this.ctx.createBuffer(1, n * 2, n); const d = this.nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // reverb hall: battle sounds ring out across the valley
    const ir = this.ctx.createBuffer(2, n * 2.4, n); for (let ch = 0; ch < 2; ch++) { const b = ir.getChannelData(ch); for (let i = 0; i < b.length; i++) b[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / b.length, 3.2); }
    this.rev = this.ctx.createConvolver(); this.rev.buffer = ir; this.revIn = this.ctx.createGain(); this.revIn.gain.value = .55; this.revIn.connect(this.rev).connect(this.master);
    // gritty waveshaper for shouted voices
    this.grit = new Float32Array(256).map((_, i) => { const x = i / 128 - 1; return Math.tanh(x * 3.2); });
    this.voices = 0; this.drumT = 0; this.step = 0; this.ambT = 0;
  },
  send(node, amt) { if (!amt) return; const sg = this.ctx.createGain(); sg.gain.value = amt; node.connect(sg).connect(this.revIn); },
  toggle() { this.on = !this.on; if (this.master) this.master.gain.value = this.on ? .5 : 0; try { localStorage.setItem('aos3d_mute', this.on ? '0' : '1'); } catch (e) {} return this.on; },
  tone(f, dur, o = {}) { const c = this.ctx; if (!c) return; const t = c.currentTime + (o.delay || 0), os = c.createOscillator(), g = c.createGain();
    os.type = o.type || 'sine'; os.frequency.setValueAtTime(f, t); if (o.slide) os.frequency.exponentialRampToValueAtTime(Math.max(20, f * o.slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime((o.vol || .2) * this.v, t + (o.attack || .005)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    os.connect(g).connect(this.master); this.send(g, o.rev); os.start(t); os.stop(t + dur + .05); },
  noise(dur, o = {}) { const c = this.ctx; if (!c) return; const t = c.currentTime + (o.delay || 0), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.nb; f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.freq || 1000, t); if (o.slide) f.frequency.exponentialRampToValueAtTime((o.freq || 1000) * o.slide, t + dur); f.Q.value = o.q || 1;
    g.gain.setValueAtTime((o.vol || .2) * this.v, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f).connect(g).connect(this.master); this.send(g, o.rev); s.start(t, Math.random()); s.stop(t + dur + .05); },
  // formant voice: a buzzing glottal source through vowel resonances, pitch-contoured and distorted for a shout
  voice(kind, pitch = 1, vol = 1) {
    const c = this.ctx; if (!c || !this.on || vol < .06 || this.voices > 5) return;
    const t = c.currentTime + Math.random() * .03, V = {
      kiai: { dur: .5, f0: [170, 250, 140], vow: [[320, 2200], [800, 1250], [760, 1150]], noise: .25, amp: .5 },
      yell: { dur: .8, f0: [150, 210, 190, 120], vow: [[800, 1250], [780, 1200], [700, 1100]], noise: .2, amp: .45 },
      grunt: { dur: .22, f0: [120, 95], vow: [[420, 900], [380, 820]], noise: .45, amp: .45 },
      hurt: { dur: .4, f0: [210, 280, 150], vow: [[650, 1100], [500, 900]], noise: .35, amp: .45 },
      die: { dur: 1.25, f0: [230, 200, 140, 85], vow: [[800, 1250], [700, 1100], [500, 900]], noise: .3, amp: .5 },
      neigh: { dur: .9, f0: [420, 760, 600, 380], vow: [[500, 2300], [700, 1800], [450, 1600]], noise: .2, amp: .3, vib: 28 },
    }[kind]; if (!V) return;
    this.voices++; setTimeout(() => this.voices--, V.dur * 1000);
    const end = t + V.dur, osc = c.createOscillator(), sh = c.createWaveShaper(), out = c.createGain(), nz = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain();
    osc.type = 'sawtooth'; V.f0.forEach((f, i) => osc.frequency[i ? 'linearRampToValueAtTime' : 'setValueAtTime'](f * pitch * (1 + (Math.random() - .5) * .06), t + V.dur * i / (V.f0.length - 1) * .9));
    if (V.vib || kind === 'die') { const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = V.vib || 7; lg.gain.value = (V.vib ? 40 : 8) * pitch; lfo.connect(lg).connect(osc.frequency); lfo.start(t); lfo.stop(end); }
    sh.curve = this.grit; osc.connect(sh);
    for (let k = 0; k < 2; k++) { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = k ? 9 : 6; V.vow.forEach((fv, i) => bp.frequency[i ? 'linearRampToValueAtTime' : 'setValueAtTime'](fv[k], t + V.dur * i / (V.vow.length - 1) * .8));
      const bg = c.createGain(); bg.gain.value = k ? .55 : 1; sh.connect(bp).connect(bg).connect(out); }
    nz.buffer = this.nb; nf.type = 'bandpass'; nf.frequency.value = 1800; nf.Q.value = .8; ng.gain.value = V.noise; nz.connect(nf).connect(ng).connect(out);
    const amp = V.amp * vol * .9; out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(amp, t + .02); out.gain.setValueAtTime(amp, end - V.dur * .35); out.gain.exponentialRampToValueAtTime(.0001, end);
    out.connect(this.master); this.send(out, .35);
    osc.start(t); osc.stop(end + .05); nz.start(t, Math.random()); nz.stop(end + .05);
  },
  // taiko war drums and distant battle din, swelling with how much fighting is going on (0..1)
  battle(intensity, dt) {
    if (!this.ctx || !this.on) return;
    this.bi = (this.bi || 0) + (intensity - (this.bi || 0)) * Math.min(1, dt * 1.5); const I = this.bi; if (I < .03) return;
    this.drumT -= dt; if (this.drumT <= 0) { const beat = 60 / 96 / 2; this.drumT += beat; const st = this.step++ % 16, PAT = [1, 0, 0, .5, 1, 0, .6, 0, 1, 0, 0, .5, 1, .7, .8, .9];
      const a = PAT[st]; this.v = I * .9;
      if (a) { this.tone(58, .7, { vol: .5 * a, slide: .55, rev: .4 }); this.tone(116, .25, { vol: .12 * a, slide: .6 }); this.noise(.12, { vol: .18 * a, freq: 300, type: 'lowpass', rev: .3 }); }
      if (st % 4 === 2) this.noise(.05, { vol: .1, freq: 3500, q: 2, rev: .2 }); }                                // rim click
    this.ambT -= dt; if (this.ambT <= 0) { this.ambT = .25 + Math.random() * .6 / (I + .2); this.v = I * .35;      // far-off clashes and shouts
      if (Math.random() < .55) { const f = 2200 + Math.random() * 1600; this.tone(f, .5, { type: 'triangle', vol: .04, rev: .9 }); this.tone(f * 1.48, .35, { vol: .02, rev: .9 }); }
      else this.voice(Math.random() < .5 ? 'yell' : 'kiai', .8 + Math.random() * .4, I * .25); }
  },
  pluck(f, delay, vol) { this.tone(f, 1.6, { type: 'triangle', vol, delay, attack: .002 }); this.tone(f * 2, .5, { vol: vol * .35, delay, attack: .002 }); this.tone(f * 3.01, .25, { vol: vol * .12, delay, attack: .002 }); },
  scale: [293.66, 311.13, 392, 440, 466.16, 587.33, 622.25, 784, 880],
  v: 1,
  // vol: 0..1 distance attenuation from the caller
  play(k, vol = 1) {
    if (!this.ctx || !this.on || vol < .03) return;
    const now = performance.now(); if (now - (this.last[k] || 0) < (GAP[k] || 40)) return; this.last[k] = now; this.v = vol;
    const S = this.scale;
    switch (k) {
      case 'chop': this.noise(.09, { vol: .25, freq: 800, q: 2 }); this.tone(150, .1, { type: 'triangle', vol: .14, slide: .6 }); break;
      case 'mine': this.tone(2200, .14, { type: 'triangle', vol: .05 }); this.tone(3300, .1, { vol: .035 }); this.noise(.05, { vol: .1, freq: 3000 }); break;
      case 'hammer': this.tone(900, .07, { type: 'square', vol: .025 }); this.noise(.05, { vol: .1, freq: 1500 }); break;
      case 'arrow': this.noise(.2, { vol: .1, freq: 2600, slide: .4, q: 3 }); break;
      case 'hit': this.noise(.1, { vol: .2, freq: 400 }); this.tone(110, .1, { vol: .12, slide: .5 }); break;
      case 'clash': { const f = 2100 + Math.random() * 500;      // ringing steel on steel: inharmonic partials with a long tail
        for (const [m, v, d] of [[1, .07, .9], [1.59, .05, .7], [2.43, .04, .55], [3.7, .025, .4]]) this.tone(f * m, d, { type: 'sine', vol: v, rev: .45 });
        this.noise(.05, { vol: .25, freq: 5000, q: 1.5 }); this.tone(140, .12, { vol: .15, slide: .5 }); break; }
      case 'swing': this.noise(.28, { vol: .22, freq: 3200, slide: .25, q: 2.5, attack: .05 }); break;
      case 'slash': this.noise(.12, { vol: .3, freq: 900, q: .8 }); this.tone(95, .16, { vol: .3, slide: .45 }); this.noise(.3, { vol: .08, freq: 400, type: 'lowpass', rev: .3 }); break;
      case 'kick': this.tone(85, .22, { vol: .55, slide: .4 }); this.noise(.07, { vol: .35, freq: 1200, q: .7 }); this.tone(45, .3, { vol: .25, slide: .6, rev: .3 }); break;
      case 'boom': this.tone(42, 1.6, { vol: .6, slide: .5, rev: .8 }); this.noise(1.2, { vol: .3, freq: 220, type: 'lowpass', slide: .3, rev: .7 }); this.tone(1200, .9, { type: 'sine', vol: .03, slide: .3, rev: .9 }); break;
      case 'heal': this.tone(880, .35, { vol: .04 }); this.tone(1320, .4, { vol: .03, delay: .08 }); break;
      case 'select': this.tone(660, .06, { type: 'triangle', vol: .05 }); break;
      case 'order': this.tone(440, .07, { type: 'triangle', vol: .05 }); this.tone(587, .07, { type: 'triangle', vol: .04, delay: .05 }); break;
      case 'click': this.tone(1200, .04, { type: 'triangle', vol: .04 }); break;
      case 'train': this.pluck(S[5], 0, .08); this.pluck(S[8], .1, .07); break;
      case 'built': [0, 2, 3, 5, 7].forEach((i, n) => this.pluck(S[i], n * .09, .08)); break;
      case 'rank': [3, 5, 8].forEach((i, n) => this.pluck(S[i], n * .07, .08)); break;
      case 'collapse': this.noise(1.4, { vol: .35, freq: 400, type: 'lowpass', slide: .3 }); this.tone(50, 1.1, { vol: .3, slide: .5 }); break;
      case 'timber': this.tone(190, .5, { type: 'sawtooth', vol: .02, slide: .55 }); this.noise(.45, { vol: .3, freq: 300, type: 'lowpass', delay: .1 }); this.tone(60, .35, { vol: .22, slide: .5, delay: .1 }); break;
      case 'trade': this.tone(1800, .09, { type: 'triangle', vol: .05 }); this.tone(2400, .12, { type: 'triangle', vol: .045, delay: .07 }); break;
      case 'alarm': for (const d of [0, .5]) { this.tone(523, 1.2, { vol: .1, delay: d }); this.tone(523 * 2.76, .6, { vol: .03, delay: d }); } break;
      case 'bell': for (const d of [0, .7, 1.4]) { this.tone(392, 1.6, { vol: .12, delay: d }); this.tone(392 * 2.76, .8, { vol: .035, delay: d }); this.tone(196, 1.8, { vol: .06, delay: d }); } break;
      case 'raid': for (const d of [0, .35, .7, .85, 1.2]) { this.tone(70, .5, { vol: .45, slide: .5, delay: d }); this.noise(.2, { vol: .25, freq: 250, type: 'lowpass', delay: d }); }
        this.tone(110, 1.4, { type: 'sawtooth', vol: .05, attack: .25, delay: 1.5 }); this.tone(165, 1.3, { type: 'sawtooth', vol: .035, attack: .25, delay: 1.55 }); break;
      case 'win': [0, 2, 3, 5, 7, 8, 7].forEach((i, n) => this.pluck(S[i], n * .18, .1)); break;
      case 'lose': [5, 4, 2, 1, 0].forEach((i, n) => this.pluck(S[i] / 2, n * .3, .1)); break;
    }
  },
  rain(v) { if (!this.ctx) return;
    if (!this.rg) { const s = this.ctx.createBufferSource(); s.buffer = this.nb; s.loop = true; const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500;
      this.rg = this.ctx.createGain(); this.rg.gain.value = 0; s.connect(f).connect(this.rg).connect(this.master); s.start(); }
    this.rg.gain.setTargetAtTime(v * .12, this.ctx.currentTime, .6); },
  phrase() { if (!this.ctx || !this.on) return; this.v = 1; let i = 2 + Math.floor(Math.random() * 4), t = 0; const n = 4 + Math.floor(Math.random() * 5);
    for (let k = 0; k < n; k++) { i = Math.max(0, Math.min(this.scale.length - 1, i + Math.floor(Math.random() * 5) - 2));
      this.pluck(this.scale[i], t, .04); if (Math.random() < .2) this.pluck(this.scale[i] / 2, t, .025); t += Math.random() < .3 ? .8 : .42; } },
};
