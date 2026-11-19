// Opening sequence: a world globe that turns to Japan and dives toward the valley where the game is played.
import * as THREE from 'three';
import { makeNoise, clamp, lerp } from '../game/util.js';

const R = 10, TARGET = { lat: 35.6, lon: 138.6 };        // Kai Province, beneath Mount Fuji
// high-resolution overlay of the Japanese archipelago so the final dive stays crisp
async function japanDecal() {
  const land = await fetch('/world-land.json').then(r => r.json()), L0 = 126, L1 = 150, B0 = 28, B1 = 46, W = 1536, H = Math.round(W * (B1 - B0) / (L1 - L0) * 1.25);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), n = makeNoise(21);
  const xy = (lon, lat) => [(lon - L0) / (L1 - L0) * W, (B1 - lat) / (B1 - B0) * H];
  const path = (ctx, poly) => { ctx.beginPath(); for (let i = 0; i < poly.length; i += 2) { const [x, y] = xy(poly[i], poly[i + 1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
  // the Japanese islands only (polygons wholly inside the box), never the mainland
  const near = land.polys.filter(p => { for (let i = 0; i < p.length; i += 2) if (p[i] < 128.5 || p[i] > L1 || p[i + 1] < 30 || p[i + 1] > B1) return false; return true; });
  g.lineJoin = 'round'; for (const [w, a] of [[22, .14], [10, .25], [4, .4]]) { g.strokeStyle = `rgba(70,140,170,${a})`; g.lineWidth = w; for (const p of near) { path(g, p); g.stroke(); } }
  const mask = document.createElement('canvas'); mask.width = W; mask.height = H; const mg = mask.getContext('2d'); mg.fillStyle = '#fff';
  for (const p of near) { path(mg, p); mg.fill(); }
  const md = mg.getImageData(0, 0, W, H).data, img = g.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; if (md[o + 3] < 128) continue; const m = n.fbm(x / 70, y / 70, 4), hi = Math.max(0, m) * 1.6, k = 1 + n(x / 9, y / 9) * .12;
    const [r, gg, b] = hi > .6 ? [128, 126, 112] : hi > .35 ? [80, 100, 60] : [72, 106, 54]; d[o] = r * k; d[o + 1] = gg * k; d[o + 2] = b * k; d[o + 3] = 255; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, e = Math.min(x, y, W - 1 - x, H - 1 - y) / 40; if (e < 1) d[o + 3] *= Math.max(0, e); }   // feather the edges
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const phi = (L0 + 180) / 360 * Math.PI * 2, th = (90 - B1) / 180 * Math.PI;
  const geo = new THREE.SphereGeometry(R * 1.0008, 96, 72, phi, (L1 - L0) / 360 * Math.PI * 2, th, (B1 - B0) / 180 * Math.PI);
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: .95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
}
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export function latLon(lat, lon, r = R) {
  const phi = (lon + 180) / 360 * Math.PI * 2, th = (90 - lat) / 180 * Math.PI;
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(th), r * Math.cos(th), r * Math.sin(phi) * Math.sin(th));
}

async function paintEarth() {
  const W = 2048, H = 1024, land = await fetch('/world-land.json').then(r => r.json());
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const rough = document.createElement('canvas'); rough.width = W / 2; rough.height = H / 2; const rg = rough.getContext('2d');
  const sea = g.createLinearGradient(0, 0, 0, H); sea.addColorStop(0, '#16304a'); sea.addColorStop(.5, '#0f3a5e'); sea.addColorStop(1, '#16304a');
  g.fillStyle = sea; g.fillRect(0, 0, W, H); rg.fillStyle = '#1a1a1a'; rg.fillRect(0, 0, W / 2, H / 2);
  const path = (ctx, poly, k) => { ctx.beginPath(); for (let i = 0; i < poly.length; i += 2) { const x = (poly[i] + 180) / 360 * W * k, y = (90 - poly[i + 1]) / 180 * H * k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
  g.lineJoin = 'round';                           // continental shelves: soft light water around every coast
  for (const [w, a] of [[14, .18], [6, .3], [2.5, .45]]) { g.strokeStyle = `rgba(70,140,170,${a})`; g.lineWidth = w; for (const p of land.polys) { path(g, p, 1); g.stroke(); } }
  const mask = document.createElement('canvas'); mask.width = W; mask.height = H; const mg = mask.getContext('2d'); mg.fillStyle = '#fff';
  for (const p of land.polys) { path(mg, p, 1); mg.fill(); }
  const md = mg.getImageData(0, 0, W, H).data, img = g.getImageData(0, 0, W, H), d = img.data, n = makeNoise(4);
  for (let y = 0; y < H; y++) { const lat = 90 - y / H * 180, al = Math.abs(lat);
    for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; if (md[o + 3] < 128) continue;
      const lon = x / W * 360 - 180, nn = n(x / 60, y / 60) * .7 + n(x / 15, y / 15) * .3;
      const band = Math.max(0, 1 - Math.abs(al - 24) / 11), dry = band * ((lon > -18 && lon < 62) || (lon > 112 && lon < 145 && lat < 0) || (lon > -118 && lon < -100 && lat > 0) ? 1 : .25) + nn * .45 > .55;
      const [r, gg, b] = al > 70 + nn * 6 || lat < -62 ? [228, 234, 240] : al > 55 ? [92, 104, 82] : dry && nn > -.25 ? [196, 168, 116] : al < 15 ? [46, 88, 42] : [74, 104, 56];
      const k = 1 + nn * .25; d[o] = r * k; d[o + 1] = gg * k; d[o + 2] = b * k; } }
  g.putImageData(img, 0, 0);
  rg.fillStyle = '#e6e6e6'; for (const p of land.polys) { path(rg, p, .5); rg.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { tex, rough: new THREE.CanvasTexture(rough) };
}
function cloudTex() {
  const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), img = g.createImageData(W, H), n = makeNoise(9);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = n.fbm(x / 90, y / 70, 5) + .1, a = clamp((v - .05) * 3.2, 0, 1) * 255, o = (y * W + x) * 4; img.data.set([255, 255, 255, a], o); }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

export class Intro {
  constructor(renderer) { this.renderer = renderer; this.t = 0; this.done = false; this.ready = false; }
  async load() {
    const s = this.scene = new THREE.Scene(); s.background = new THREE.Color(0x020308);
    this.cam = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, .01, 2000);
    const { tex, rough } = await paintEarth();
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 80), new THREE.MeshStandardMaterial({ map: tex, roughnessMap: rough, roughness: 1, metalness: 0 })); s.add(this.earth);
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.008, 96, 48), new THREE.MeshStandardMaterial({ map: cloudTex(), transparent: true, opacity: .55, depthWrite: false })); s.add(this.clouds);
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.07, 96, 48), new THREE.ShaderMaterial({ side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.); vP = mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vP; void main(){ float f = pow(clamp(1.0 - abs(dot(normalize(-vP), vN)) , 0., 1.), 2.2); gl_FragColor = vec4(vec3(.35,.6,1.) * f * 1.6, f); }' })); s.add(this.atmo);
    const sp = new Float32Array(9000); for (let i = 0; i < sp.length; i += 3) { const v = new THREE.Vector3().randomDirection().multiplyScalar(600); sp.set([v.x, v.y, v.z], i); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); s.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.3, sizeAttenuation: false })));
    this.sun = new THREE.DirectionalLight(0xfff4e0, 3.2); s.add(this.sun, new THREE.HemisphereLight(0x8fb0ff, 0x050608, .3));
    this.japan = await japanDecal(); s.add(this.japan);
    // marker over Kai Province
    this.target = latLon(TARGET.lat, TARGET.lon); const tn = this.target.clone().normalize();
    this.pin = new THREE.Mesh(new THREE.RingGeometry(.06, .09, 32), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.pin.position.copy(tn.clone().multiplyScalar(R * 1.012)); this.pin.lookAt(tn.clone().multiplyScalar(R * 2)); s.add(this.pin);
    this.startDir = latLon(18, 20).normalize(); this.endDir = tn;
    this.cap = document.getElementById('intro-cap'); this.ready = true;
  }
  caption(html) { if (this.capHtml === html) return; this.capHtml = html; this.cap.classList.remove('show'); setTimeout(() => { this.cap.innerHTML = html; if (html) this.cap.classList.add('show'); }, 350); }
  update(dt) {
    if (!this.ready || this.done) return;
    this.t += dt; const t = this.t;
    this.clouds.rotation.y += dt * .01; this.earth.rotation.y = 0;
    // flight path: orbit from Africa/Europe to Japan, closing in, then dive steeply onto Kai
    const a = ease(clamp((t - 1) / 7, 0, 1)), dive = ease(clamp((t - 8) / 5, 0, 1));
    const dir = new THREE.Vector3().copy(this.startDir).lerp(this.endDir, a).normalize();
    const dist = lerp(lerp(42, 26, a), R + 2.6, dive);
    const tilt = new THREE.Vector3(0, -1, 0).projectOnPlane(dir).normalize().multiplyScalar(dive * .22);     // approach from the south, looking north
    this.cam.position.copy(dir).add(tilt).normalize().multiplyScalar(dist);
    const look = new THREE.Vector3().lerpVectors(new THREE.Vector3(), this.target, dive);
    this.cam.up.set(0, 1, 0); this.cam.lookAt(look);
    this.sun.position.copy(this.cam.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), .7).add(new THREE.Vector3(0, 8, 0));     // keep the view in daylight
    this.atmo.visible = dist > R * 1.08; this.clouds.material.opacity = .55 * (1 - dive * .7);
    this.pin.material.opacity = clamp((t - 5) / 1.5, 0, 1) * (1 - clamp((t - 11.5) / 1, 0, 1)); this.pin.scale.setScalar(1 + Math.sin(t * 4) * .15 + dive * 1.5);
    this.caption(t < 4 ? '<b>The year 1560</b><span>The world is vast, and old empires turn.</span>' : t < 8.5 ? '<b>日本 · Japan</b><span>The Sengoku period: an age of warring states.</span>' : t < 12.6 ? '<b>Kai Province</b><span>A quiet valley beneath Mount Fuji. Your clan has come to claim it.</span>' : '');
    const fade = clamp((t - 12) / 1.2, 0, 1); document.getElementById('intro-fade').style.opacity = fade;
    if (t > 13.4) this.finish();
  }
  finish() { if (this.done) return; this.done = true; this.caption(''); document.getElementById('intro-skip').remove(); this.onDone && this.onDone(); }
  resize() { if (this.cam) { this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); } }
}
