// Skinned human body: one continuous mesh bound to the skeleton, so shoulders, elbows, hips and knees
// bend smoothly. Built from elliptical rings along each limb, with per-ring bone weights blended at joints.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'uArmL', 'fArmL', 'handL', 'uArmR', 'fArmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
const C = new THREE.Color();

// geometry with colour + skin attributes; w = [[bone, weight], ...]
function finish(g, color, wfn) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
  const pos = g.attributes.position, n = pos.count;
  if (!g.attributes.color) { C.set(color); const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.set([C.r, C.g, C.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  if (!g.attributes.skinIndex) { const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const w = wfn(pos.getX(i), pos.getY(i), pos.getZ(i)); w.slice(0, 4).forEach(([b, v], k) => { si[i * 4 + k] = BI[b]; sw[i * 4 + k] = v; }); }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); }
  return g;
}
// a vertical tube through elliptical rings: ring = [y, rx, rz, colour, weights, dx = 0, dz = 0]
function tube(cx, cz, rings, { N = 14, cap0 = true, cap1 = true, open = false } = {}) {
  const pos = [], col = [], si = [], sw = [], idx = [];
  const push = (x, y, z, c, w) => { pos.push(x, y, z); C.set(c); col.push(C.r, C.g, C.b); const ww = w.slice(0, 4); for (let k = 0; k < 4; k++) { si.push(ww[k] ? BI[ww[k][0]] : 0); sw.push(ww[k] ? ww[k][1] : 0); } };
  rings.forEach(([y, rx, rz, c, w, dx = 0, dz = 0]) => { for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; push(cx + dx + Math.cos(a) * rx, y, cz + dz + Math.sin(a) * rz, c, w); } });
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < N; i++) { const a = r * N + i, b = r * N + (i + 1) % N, c2 = a + N, d = b + N; idx.push(a, c2, b, b, c2, d); }
  if (!open) for (const [r, top] of [[0, cap0], [rings.length - 1, cap1]]) { if (!top) continue; const [y, , , c, w, dx = 0, dz = 0] = rings[r], ci = pos.length / 3; push(cx + dx, y, cz + dz, c, w);
    for (let i = 0; i < N; i++) { const a = r * N + i, b = r * N + (i + 1) % N; r === 0 ? idx.push(ci, a, b) : idx.push(ci, b, a); } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx); g.computeVertexNormals();
  // ring winding faces outward when rings go downward; flip if the first ring is below the last
  if (rings[0][0] < rings[rings.length - 1][0]) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.computeVertexNormals(); }
  return g.toNonIndexed();
}
const prim = (geo, color, bone, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) => {
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s)));
  return finish(geo, color, () => [[bone, 1]]);
};
const mix = (a, b, t) => t <= 0 ? [[a, 1]] : t >= 1 ? [[b, 1]] : [[a, 1 - t], [b, t]];

const SKINS = [0xd8a47a, 0xc99470, 0xe0b48c];
const HAIR = 0x16110d;
// clothing scheme per unit type
function scheme(type, team, tc) {
  const dk = new THREE.Color(tc).multiplyScalar(.5).getHex();
  return {
    vil: { top: 0x8a6c48, sleeve: 0x8a6c48, sash: tc, pants: 0x5d4a36, shin: 0xc9b48a, foot: 0x8a7650, forearm: 'skin', pantsTo: .56, sleeveFlare: .075, hakama: false, hair: 'top' },
    spear: { top: tc, sleeve: 0x2e2c2a, sash: dk, pants: 0x34302c, shin: 0xc9b48a, foot: 0x4a3a2a, forearm: 0x2e2c2a, pantsTo: .45, sleeveFlare: .06, hakama: false, hair: 'top' },
    archer: { top: tc, sleeve: 0x6b5a48, sash: dk, pants: 0x4a4038, shin: 0xd8ccb0, foot: 0x4a3a2a, forearm: 'skin', pantsTo: .2, sleeveFlare: .08, hakama: true, hair: 'top' },
    samurai: { top: 0x1c1b22, sleeve: 0x26232c, sash: tc, pants: 0x2a2730, shin: 0x1c1b22, foot: 0x2a2018, forearm: 0x1c1b22, pantsTo: .2, sleeveFlare: .07, hakama: true, hair: 'top' },
    monk: { top: 0xc9c2b0, sleeve: 0xc9c2b0, sash: tc, pants: 0xb8b0a0, shin: 0xb8b0a0, foot: 0x5a4a3a, forearm: 0xc9c2b0, pantsTo: .06, sleeveFlare: .11, hakama: true, hair: 'bald' },
    cav: { top: 0x1c1b22, sleeve: 0x26232c, sash: tc, pants: 0x2a2730, shin: 0x1c1b22, foot: 0x2a2018, forearm: 0x1c1b22, pantsTo: .2, sleeveFlare: .06, hakama: true, hair: 'top' },
    cit: { top: 0x3a4a6a, sleeve: 0x3a4a6a, sash: 0x2a2420, pants: 0x5a4a38, shin: 0xc9b48a, foot: 0x8a7650, forearm: 'skin', pantsTo: .52, sleeveFlare: .07, hakama: false, hair: 'top' },
  }[type];
}

const KIMONO = [0x7a3a5a, 0x34467a, 0x9a5a34, 0x5a6e44, 0x8a2e34, 0x4a3a62];
const MENSWEAR = [0x3a4a6a, 0x6a5238, 0x4a4a48, 0x2f4a40];
export function bodyGeo(type, team, tc, variant = 0, gender = 'm', elder = false) {
  let o = scheme(type, team, tc); const SK = SKINS[variant % 3], parts = [];
  if (type === 'cit' && gender === 'm') { const c = MENSWEAR[variant % MENSWEAR.length]; o = { ...o, top: c, sleeve: c }; }
  if (gender === 'f') { const c = KIMONO[(variant + (type === 'vil' ? 3 : 0)) % KIMONO.length]; o = { ...o, top: c, sleeve: c, pants: c, shin: c, forearm: 'skin', pantsTo: .1, hakama: false, kimono: true, hair: 'bun', sash: type === 'vil' ? tc : 0xd8b860, sleeveFlare: .1 }; }
  o.hairCol = elder ? 0x9c9a96 : 0x16110d;
  // ---- torso: pelvis to shoulders, cloth
  const F = gender === 'f' ? .9 : 1;
  parts.push(tube(0, 0, [
    [1.50, .055, .05, SK, [['neck', .6], ['chest', .4]]],
    [1.46, .14 * F, .09, o.top, [['chest', 1]]],
    [1.42, .195 * F, .11, o.top, [['chest', 1]]],
    [1.34, .19 * F, .12 * (gender === 'f' ? 1.04 : 1), o.top, [['chest', 1]], 0, .01],
    [1.24, .172, .115, o.top, mix('spine', 'chest', .5), 0, .01],
    [1.13, .152, .105, o.top, [['spine', 1]]],
    [1.06, .148, .102, o.sash, mix('hips', 'spine', .6)],
    [0.99, .162, .108, o.sash, mix('hips', 'spine', .2)],
    [0.93, .168, .112, o.pants, [['hips', 1]]],
    [0.85, .15, .1, o.pants, [['hips', 1]]],
  ], { N: 16 }));
  // kimono collar (V) and obi knot
  for (const s of [1, -1]) parts.push(prim(new THREE.BoxGeometry(.018, .22, .012), o.sash === tc ? 0xd8d0bc : o.sash, 'chest', { p: [s * .04, 1.35, .118], r: [0, 0, s * .32] }));
  parts.push(prim(new THREE.BoxGeometry(.09, .06, .03), o.sash, 'spine', { p: [0, 1.03, -.11] }));
  // ---- neck & head
  parts.push(tube(0, .005, [[1.62, .048, .05, SK, [['head', 1]]], [1.55, .05, .052, SK, [['neck', 1]]], [1.48, .056, .056, SK, [['neck', .5], ['chest', .5]]]], { cap0: false, cap1: false, N: 12 }));
  parts.push(headGeo(SK, o));
  // ---- arms (L = +x, R = -x)
  for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
    const x = s * .2, u = 'uArm' + k, f = 'fArm' + k, h = 'hand' + k, fc = o.forearm === 'skin' ? SK : o.forearm;
    parts.push(tube(x, 0, [
      [1.47, .058, .06, o.sleeve, [[u, .75], ['chest', .25]]], [1.39, .056, .055, o.sleeve, [[u, 1]]], [1.29, .049, .049, o.sleeve, [[u, 1]]],
      [1.21, .044, .044, o.sleeve, mix(u, f, .3)], [1.16, .042, .043, fc, mix(u, f, .7)], [1.07, .042, .041, fc, [[f, 1]]],
      [0.97, .032, .028, SK, mix(f, h, .25)], [0.925, .03, .026, SK, [[h, 1]]],
    ], { N: 12 }));
    // wide kosode sleeve hanging from the upper arm
    parts.push(tube(x, -.01, [[1.42, .066, .066, o.sleeve, [[u, 1]]], [1.25, .066 + o.sleeveFlare * .3, .07, o.sleeve, [[u, 1]]], [1.13, .06 + o.sleeveFlare, .055 + o.sleeveFlare * .7, o.sleeve, mix(u, f, .5)]], { N: 12, open: true }));
    // hand: palm, four curled fingers and thumb, posed in a loose grip
    parts.push(prim(new THREE.BoxGeometry(.055, .075, .03), SK, h, { p: [x, .87, .005] }));
    for (let i = 0; i < 4; i++) { const fx = x + s * (-.019 + i * .013); parts.push(prim(new THREE.CapsuleGeometry(.0075, .03, 2, 6), SK, h, { p: [fx, .825, .02], r: [-1.1, 0, 0] })); }
    parts.push(prim(new THREE.CapsuleGeometry(.009, .025, 2, 6), SK, h, { p: [x - s * .03, .86, .025], r: [-.6, 0, s * .6] }));
  }
  // ---- legs
  for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
    const x = s * .095, t = 'thigh' + k, sh = 'shin' + k, ft = 'foot' + k;
    const cl = y => y > o.pantsTo ? o.pants : (y > .1 ? o.shin : SK);
    parts.push(tube(x, 0, [
      [0.93, .095, .1, o.pants, mix('hips', t, .5)], [0.86, .092, .096, o.pants, mix('hips', t, .85)], [0.74, .082, .085, cl(.74), [[t, 1]]], [0.62, .07, .074, cl(.62), [[t, 1]]],
      [0.52, .058, .062, cl(.52), mix(t, sh, .3)], [0.46, .055, .058, cl(.46), mix(t, sh, .6)], [0.4, .056, .06, cl(.4), [[sh, 1]], 0, -.008], [0.31, .058, .062, cl(.31), [[sh, 1]], 0, -.01],
      [0.19, .044, .046, cl(.19), [[sh, 1]]], [0.09, .034, .036, cl(.09), mix(sh, ft, .3)], [0.06, .033, .035, SK, mix(sh, ft, .7)],
    ], { N: 12 }));
    parts.push(prim(new THREE.CapsuleGeometry(.036, .14, 3, 8), SK, ft, { p: [x, .035, .05], r: [Math.PI / 2, 0, 0], s: [1.1, 1, .8] }));
    parts.push(prim(new THREE.BoxGeometry(.085, .014, .24), o.foot, ft, { p: [x, .007, .05] }));       // waraji sandal
    if (o.hakama) parts.push(tube(x, 0, [[0.95, .11, .115, o.pants, mix('hips', t, .5)], [0.6, .125, .13, o.pants, [[t, 1]]], [0.42, .13, .135, o.pants, mix(t, sh, .6)], [o.pantsTo + .05, .135, .14, o.pants, [[sh, 1]]]], { N: 14, open: true }));
    else if (type === 'vil' || type === 'cit') parts.push(tube(x, 0, [[0.93, .1, .105, o.pants, mix('hips', t, .5)], [0.6, .09, .095, o.pants, [[t, 1]]]], { N: 12, open: true }));
  }
  // a woman's kimono falls to the ankles in one wrapped drape
  if (o.kimono) parts.push(tube(0, .005, [[1.0, .17, .13, o.top, [['hips', 1]]], [.7, .19, .15, o.top, [['hips', .6], ['thighL', .2], ['thighR', .2]]], [.35, .19, .155, o.top, [['hips', .3], ['shinL', .35], ['shinR', .35]]], [.08, .18, .15, o.top, [['shinL', .5], ['shinR', .5]]]], { N: 18, open: true }));
  const g = mergeGeometries(parts.map(p => finish(p, 0, () => [['hips', 1]])), false);
  g.computeBoundingSphere(); g.boundingSphere.radius = 1.4; g.boundingSphere.center.set(0, .9, 0);
  return g;
}

function headGeo(SK, o) {
  const P = [], R = .102;
  const sph = new THREE.SphereGeometry(R, 22, 16), p = sph.attributes.position;
  for (let i = 0; i < p.count; i++) {        // sculpt: narrower jaw, defined chin, slight brow and cheekbones
    let x = p.getX(i) * .9, y = p.getY(i) * 1.1, z = p.getZ(i);
    if (y < 0) { const t = -y / (R * 1.1); x *= 1 - .3 * t * t; z *= 1 - .15 * t; if (z > 0) z += t * .012; }
    if (y > .01 && y < .04 && z > .05) z += .006;                       // brow ridge
    if (Math.abs(y + .005) < .02 && Math.abs(x) > .04 && z > .03) z += .004;  // cheekbones
    p.setXYZ(i, x, y, z);
  }
  sph.computeVertexNormals(); P.push(prim(sph, SK, 'head', { p: [0, 1.69, .012] }));
  for (const s of [1, -1]) {
    P.push(prim(new THREE.SphereGeometry(.0125, 10, 8), 0xf2ece0, 'head', { p: [s * .034, 1.706, .1], s: [1.3, .8, .6] }));     // eye white
    P.push(prim(new THREE.SphereGeometry(.0072, 8, 6), 0x2a1a10, 'head', { p: [s * .034, 1.706, .107], s: [1, 1, .6] }));        // iris
    P.push(prim(new THREE.BoxGeometry(.034, .007, .01), o.hairCol || HAIR, 'head', { p: [s * .036, 1.727, .104], r: [-.2, 0, s * -.15] }));       // brow
    P.push(prim(new THREE.SphereGeometry(.016, 8, 6), SK, 'head', { p: [s * .09, 1.692, .005], s: [.45, 1.25, .8] }));             // ear
  }
  P.push(prim(new THREE.ConeGeometry(.013, .04, 4), SK, 'head', { p: [0, 1.688, .113], r: [-.35, Math.PI / 4, 0], s: [1, 1, .9] }));   // nose
  P.push(prim(new THREE.BoxGeometry(.03, .005, .006), 0x6a3a30, 'head', { p: [0, 1.655, .104] }));                                   // mouth
  if (o.hair === 'bun') {                // women: hair swept up into a bun with a comb
    P.push(prim(new THREE.SphereGeometry(R * 1.05, 18, 10, 0, Math.PI * 2, 0, 1.8), o.hairCol, 'head', { p: [0, 1.697, -.004], s: [.95, 1.1, 1.05] }));
    P.push(prim(new THREE.SphereGeometry(.055, 12, 8), o.hairCol, 'head', { p: [0, 1.79, -.07], s: [1.3, .9, 1] }));
    P.push(prim(new THREE.BoxGeometry(.09, .012, .012), 0xd8b860, 'head', { p: [0, 1.8, -.03] }));
  }
  if (o.hair === 'top') {
    const cap = new THREE.SphereGeometry(R * 1.04, 18, 10, 0, Math.PI * 2, 0, 1.75); P.push(prim(cap, o.hairCol || HAIR, 'head', { p: [0, 1.696, .0], s: [.92, 1.08, 1.02] }));
    P.push(prim(new THREE.CylinderGeometry(.014, .016, .07, 8), o.hairCol || HAIR, 'head', { p: [0, 1.81, -.01], r: [Math.PI / 2 - .2, 0, 0] }));   // chonmage topknot
  }
  return mergeGeometries(P, false);
}
