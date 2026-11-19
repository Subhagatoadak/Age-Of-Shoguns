import * as THREE from 'three';
import { WW, WH, S, LAKE, ROAD, FORESTS, NW, NH } from '../game/data.js';
import { makeNoise, clamp, makeRng } from '../game/util.js';
import { withFog, shared } from './geo.js';
import { grassGeo } from './models.js';

const noise = makeNoise(7), smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const BASES = [[520, 1480], [2480, 440]];
export const WATER_Y = -.35;

function roadDist(x, y) {
  let best = 1e9;
  for (let i = 0; i < ROAD.length - 1; i++) { const [ax, ay] = ROAD[i], [bx, by] = ROAD[i + 1], dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t)); }
  return best + noise(x / 60, y / 60) * 6;
}
const lakeE = (x, y) => Math.hypot((x - LAKE.x) / LAKE.rx, (y - LAKE.y) / LAKE.ry);
// terrain height in metres at logic coordinates (x, y)
export function height(x, y) {
  let h = noise.fbm(x / 900, y / 900, 4) * 3.2 + noise(x / 240, y / 240) * .5;
  for (const [bx, by] of BASES) h *= 1 - smooth(320, 140, Math.hypot(x - bx, y - by)) * .85;   // level ground for the castles
  const e = lakeE(x, y); if (e < 1.6) h = h * smooth(.85, 1.25, e) + (-2.8) * (1 - smooth(.85, 1.25, e));
  h -= (1 - smooth(10, 40, roadDist(x, y))) * .12;
  const out = Math.max(-x, x - WW, -y, y - WH, 0);                                                   // mountains ring the valley
  if (out > 0 || Math.min(x, y, WW - x, WH - y) < 120) { const m = smooth(-80, 520, out), ridge = 1 - Math.abs(noise(x / 520, y / 520)); h += m * (10 + ridge * ridge * 34 + noise.fbm(x / 160, y / 160, 3) * 6); }
  return h;
}
const col = h => new THREE.Color(h);
const CG = [col(0x56742f), col(0x6a8a39), col(0x8a9a4e), col(0x3d5a26)], CDIRT = col(0x8f7a52), CROAD = col(0xa38b60), CSAND = col(0xc4b083), CWET = col(0x7d7258),
  CROCK = col(0x77736a), CSNOW = col(0xeef2f5), CFOREST = col(0x34492a), CMUD = col(0x4a4a3a);

export function buildTerrain(scene) {
  const X0 = -800, Y0 = -800, X1 = WW + 800, Y1 = WH + 800, segX = 260, segY = 200;
  const geo = new THREE.PlaneGeometry((X1 - X0) * S, (Y1 - Y0) * S, segX, segY); geo.rotateX(-Math.PI / 2);
  geo.translate(((X0 + X1) / 2) * S, 0, ((Y0 + Y1) / 2) * S);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) / S, y = pos.getZ(i) / S; pos.setY(i, height(x, y)); }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / S, y = pos.getZ(i) / S, h = pos.getY(i), slope = 1 - nrm.getY(i);
    const n1 = noise(x / 300, y / 300), n2 = noise(x / 70 + 9, y / 70);
    c.copy(CG[1]).lerp(CG[0], clamp(n1 * .8 + .4, 0, 1)).lerp(CG[2], clamp(n2 * .6 - .1, 0, .6));
    for (const [fx, fy, , fr] of FORESTS) { const d = Math.hypot(x - fx, y - fy); if (d < fr * 1.3) c.lerp(CFOREST, (1 - smooth(fr * .4, fr * 1.3, d)) * .75); }
    for (const [bx, by] of BASES) c.lerp(CDIRT, (1 - smooth(60, 190, Math.hypot(x - bx, y - by))) * .35 * (n2 * .5 + .7));
    c.lerp(CROAD, 1 - smooth(14, 34, roadDist(x, y)));
    const e = lakeE(x, y); if (e < 1.35) { c.lerp(CSAND, 1 - smooth(1.12, 1.32, e)); if (e < 1.1) c.lerp(CWET, 1 - smooth(1.0, 1.1, e)); if (e < 1.0) c.lerp(CMUD, .8); }
    c.lerp(CROCK, smooth(.18, .42, slope) * .9 + smooth(9, 18, h) * .5);
    c.lerp(CSNOW, smooth(30, 40, h + n2 * 4) * smooth(.1, .5, nrm.getY(i)));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // fine detail texture (grain, clumps) tiled over the vertex colours
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'), img = g.createImageData(256, 256), dn = makeNoise(3);
  for (let yy = 0; yy < 256; yy++) for (let xx = 0; xx < 256; xx++) { const v = 205 + dn.fbm(xx / 18, yy / 18, 3) * 70 + (Math.random() - .5) * 26, o = (yy * 256 + xx) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = clamp(v, 120, 255); img.data[o + 3] = 255; }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(160, 120); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mesh = new THREE.Mesh(geo, withFog(new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: .95, metalness: 0 }), { ground: true, border: true }));
  mesh.receiveShadow = true; scene.add(mesh);
  // fog of war texture (one texel per nav cell)
  const fowData = new Uint8Array(NW * NH), fowTex = new THREE.DataTexture(fowData, NW, NH, THREE.RedFormat);
  fowTex.magFilter = fowTex.minFilter = THREE.LinearFilter; fowTex.needsUpdate = true; shared.fowTex.value = fowTex;
  const terData = new Uint8Array(NW * NH), terTex = new THREE.DataTexture(terData, NW, NH, THREE.RedFormat); terTex.magFilter = terTex.minFilter = THREE.LinearFilter; terTex.needsUpdate = true; shared.terTex.value = terTex;
  return { mesh, fowData, fowTex, terData, terTex, water: buildWater(scene), grass: buildGrass(scene) };
}

// lake: glossy water with two scrolling procedural normal maps, reflecting the sky environment
function buildWater(scene) {
  const n = makeNoise(11), cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'), img = g.createImageData(256, 256);
  const hgt = (x, y) => n.fbm(x / 22, y / 22, 3) + n(x / 7, y / 7) * .25;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1), v = new THREE.Vector3(-dx * 3, -dy * 3, 1).normalize(), o = (y * 256 + x) * 4;
    img.data[o] = (v.x * .5 + .5) * 255; img.data[o + 1] = (v.y * .5 + .5) * 255; img.data[o + 2] = (v.z * .5 + .5) * 255; img.data[o + 3] = 255; }
  g.putImageData(img, 0, 0);
  const nt = new THREE.CanvasTexture(cv); nt.wrapS = nt.wrapT = THREE.RepeatWrapping; nt.repeat.set(6, 4);
  const mat = withFog(new THREE.MeshStandardMaterial({ color: 0x1d4058, roughness: .06, metalness: .1, normalMap: nt, normalScale: new THREE.Vector2(.35, .35), transparent: true, opacity: .9 }));
  const w = new THREE.Mesh(new THREE.PlaneGeometry(LAKE.rx * 2.8 * S, LAKE.ry * 2.8 * S, 1, 1), mat);
  w.rotation.x = -Math.PI / 2; w.position.set(LAKE.x * S, WATER_Y, LAKE.y * S); w.receiveShadow = true; scene.add(w);
  return { mesh: w, tex: nt, update(t) { nt.offset.set(t * .006, t * .004); } };
}

// instanced grass clumps with wind; clumps under new buildings are hidden
function buildGrass(scene) {
  const rng = makeRng(5), N = 22000, mesh = new THREE.InstancedMesh(grassGeo(), withFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), { wind: 1.2, ground: true }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), pts = [];
  let k = 0;
  for (let tries = 0; k < N && tries < N * 4; tries++) {
    const x = rng() * WW, y = rng() * WH;
    if (lakeE(x, y) < 1.18 || roadDist(x, y) < 26) continue;
    if (BASES.some(([bx, by]) => Math.hypot(x - bx, y - by) < 90)) continue;
    const dens = noise(x / 160, y / 160) * .5 + .6; if (rng() > dens) continue;
    const sc = .5 + rng() * .55;
    p.set(x * S, height(x, y) - .02, y * S); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28); s.set(sc, sc * (.8 + rng() * .5), sc);
    mesh.setMatrixAt(k, m.compose(p, q, s)); c.setHSL(.2 + rng() * .06, .38 + rng() * .18, .28 + rng() * .12); mesh.setColorAt(k, c); pts.push(x, y); k++;
  }
  mesh.count = k; mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return { mesh, clearRect(b) { let ch = false; for (let i = 0; i < k; i++) { const x = pts[i * 2], y = pts[i * 2 + 1]; if (Math.abs(x - b.x) < b.w / 2 + 6 && Math.abs(y - b.y) < b.h / 2 + 6) { mesh.setMatrixAt(i, zero); ch = true; } } if (ch) mesh.instanceMatrix.needsUpdate = true; } };
}
export { lakeE, roadDist };
