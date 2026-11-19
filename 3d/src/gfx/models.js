// Procedural Japanese architecture and nature, merged into vertex-coloured meshes.
import * as THREE from 'three';
import { piece, merge, roofGeo } from './geo.js';
import { BT, TEAMC, S } from '../game/data.js';

const G = THREE;
const STONE = 0x847e72, PLASTER = 0xcfc7b4, BEAM = 0x3e2a1c, WOOD = 0x6e4c32, TILE = 0x3d424e, THATCH = 0x9a8152, COPPER = 0x4d7566, VERM = 0xb3392b, GOLD = 0xd9a93a, DARK = 0x1c1a18;
const cache = new Map();

const box = (w, h, d, c, p, o = {}) => piece(new G.BoxGeometry(w, h, d), c, { p, jit: .05, ...o });
const cyl = (rt, rb, h, c, p, o = {}) => piece(new G.CylinderGeometry(rt, rb, h, o.seg || 10), c, { p, ...o });
// two sheets: tiled top plus a darker underside a little lower, so eaves read as thick
const roof = (w, d, h, c, y, o = {}) => merge([piece(roofGeo(w, d, h, o.over ?? .6, o.lift ?? .35), c, { p: [0, y, o.z || 0], jit: .06 }),
  piece(roofGeo(w, d, h * .96, (o.over ?? .6) - .05, o.lift ?? .35), new G.Color(c).multiplyScalar(.45).getHex(), { p: [0, y - .22, o.z || 0] })]);
// plaster wall with dark timber frame
function wall(P, w, h, d, y, { posts = 4, color = PLASTER } = {}) {
  P.push(box(w, h, d, color, [0, y + h / 2, 0], { ao: .25 }));
  for (let i = 0; i <= posts; i++) { const x = -w / 2 + i * w / posts; for (const z of [d / 2, -d / 2]) P.push(box(.14, h, .08, BEAM, [x, y + h / 2, z])); }
  for (let i = 0; i <= 2; i++) for (const s of [1, -1]) P.push(box(.08, h, .14, BEAM, [s * w / 2, y + h / 2, -d / 2 + i * d / 2]));
  P.push(box(w + .1, .14, d + .1, BEAM, [0, y + h - .07, 0]), box(w + .1, .12, d + .1, BEAM, [0, y + .06, 0]));
}
function windows(P, Gl, w, d, y, n, front = true) {
  for (let i = 0; i < n; i++) { const x = -w / 2 + (i + .5) * w / n;
    P.push(box(.42, .5, .04, DARK, [x, y, d / 2 + .03]));
    Gl.push(box(.36, .44, .02, 0xffffff, [x, y, d / 2 + .05]));
    if (!front) { P.push(box(.42, .5, .04, DARK, [x, y, -d / 2 - .03])); } }
}

export function buildingGeo(type) {
  if (cache.has(type)) return cache.get(type);
  const t = BT[type], W = t.w * S, D = t.h * S, P = [], Gl = [], flags = [];
  switch (type) {
    case 'tc': {
      P.push(piece(new G.CylinderGeometry(.82, 1, 3.4, 4, 3), STONE, { p: [0, 1.7, 0], r: [0, Math.PI / 4, 0], s: [W * .72, 1, D * .72], jit: .12, ao: .35 }));
      const tiers = [[.74, .74, 3.4, 3.0, 1.9], [.54, .56, 7.9, 2.6, 1.7], [.36, .4, 12.0, 2.4, 2.1]];
      for (const [fw, fd, y, h, rh] of tiers) {
        wall(P, W * fw, h, D * fd, y, { posts: 5 });
        windows(P, Gl, W * fw * .8, D * fd, y + h * .55, 4, false);
        P.push(roof(W * fw + .3, D * fd + .3, rh, TILE, y + h, { over: .9, lift: .55 }));
        P.push(box(W * fw * .7, .22, .22, 0x2a2d35, [0, y + h + rh - .05, 0]));
      }
      for (const s of [1, -1]) P.push(piece(new G.ConeGeometry(.16, .7, 6), GOLD, { p: [s * W * .2, 16.8, 0], r: [0, 0, s * .4] }));
      P.push(box(3.0, 2.6, 1.4, BEAM, [0, 1.3, D * .5 + .3]), box(2.2, 2.1, .1, DARK, [0, 1.05, D * .5 + 1.05]));
      for (let k = 1; k < 4; k++) P.push(piece(new G.CylinderGeometry(.82 + (1 - .82) * (1 - k / 4) + .004, .82 + (1 - .82) * (1 - k / 4) + .004, .04, 4), 0x6e685e, { p: [0, k * .85, 0], r: [0, Math.PI / 4, 0], s: [W * .72, 1, D * .72] }));
      flags.push([W * .42, 0, D * .42], [-W * .42, 0, D * .42]);
      break; }
    case 'house': {
      P.push(box(W * .9, .35, D * .9, STONE, [0, .17, 0], { jit: .15 }));
      wall(P, W * .82, 2.1, D * .78, .35, { posts: 3, color: 0xc9b48e });
      P.push(roof(W * .86, D * .82, 2.6, THATCH, 2.45, { over: .55, lift: .12 }), box(W * .5, .25, .3, 0x5a4a32, [0, 5.0, 0]));
      P.push(box(.9, 1.6, .06, DARK, [W * .12, 1.15, D * .39 + .04]));
      Gl.push(box(.5, .4, .02, 0xffffff, [-W * .2, 1.5, D * .39 + .06]));
      P.push(piece(new G.CylinderGeometry(.35, .35, .5, 10), 0x6b5232, { p: [-W * .45, .25, D * .35] }));      // water barrel
      break; }
    case 'farm': {
      for (const [x, z, w, d] of [[0, D / 2, W, .5], [0, -D / 2, W, .5], [W / 2, 0, .5, D], [-W / 2, 0, .5, D], [0, 0, .35, D]]) P.push(box(w, .3, d, 0x6a5232, [x, .1, z], { jit: .1 }));
      P.push(box(W - .4, .06, D - .4, 0x4a5a48, [0, .02, 0]));
      for (let i = 0; i < 8; i++) for (let k = 0; k < 8; k++) { const x = -W / 2 + .7 + i * (W - 1.4) / 7, z = -D / 2 + .7 + k * (D - 1.4) / 7;
        for (let b = 0; b < 3; b++) P.push(piece(new G.ConeGeometry(.05, .55 + Math.random() * .2, 3), b ? 0x6f9a3a : 0x89ad48, { p: [x + (b - 1) * .07, .32, z + (b % 2) * .05], r: [(Math.random() - .5) * .4, 0, (Math.random() - .5) * .4] })); }
      P.push(box(.15, 1.2, .15, WOOD, [W / 2 - .3, .6, D / 2 - .3]), piece(new G.ConeGeometry(.35, .3, 10), 0xcdb070, { p: [W / 2 - .3, 1.25, D / 2 - .3] }));  // scarecrow
      break; }
    case 'store': {
      P.push(box(W * .85, .9, D * .8, 0x2a2826, [0, .45, 0], { jit: .1 }));
      wall(P, W * .82, 2.4, D * .77, .9, { posts: 2 });
      P.push(roof(W * .86, D * .8, 1.6, TILE, 3.3, { over: .5, lift: .25 }));
      P.push(box(1.2, 1.7, .1, 0x2a2826, [0, 1.25, D * .39 + .05]), box(W * .7, .16, .04, TEAMC[0], [0, 3.1, D * .39 + .03]));
      for (let i = 0; i < 4; i++) P.push(piece(new G.CylinderGeometry(.28, .28, .55, 10), 0x7a5a38, { p: [-W * .4 + i * .65, .28, D * .5 + .3], ao: .3 }));
      break; }
    case 'barracks': {
      P.push(box(W * .92, .4, D * .9, STONE, [0, .2, 0], { jit: .12 }));
      wall(P, W * .84, 2.5, D * .7, .4, { posts: 7, color: 0xd9ccb0 });
      for (let i = 0; i <= 7; i++) P.push(cyl(.1, .1, 2.5, BEAM, [-W * .42 + i * W * .84 / 7, 1.65, D * .42]));
      P.push(roof(W * .88, D * .9, 2.2, TILE, 2.9, { over: .6, lift: .3 }));
      P.push(box(2.4, .1, .1, WOOD, [W * .3, 1.4, D * .5 + .2]));
      for (let i = 0; i < 6; i++) P.push(cyl(.015, .015, 2.6, 0x4a3220, [W * .3 - 1 + i * .4, 1.3, D * .5 + .25], { r: [.15, 0, 0], seg: 5 }));
      flags.push([W * .48, 0, D * .48], [-W * .48, 0, D * .48]);
      break; }
    case 'tower': {
      P.push(piece(new G.CylinderGeometry(.85, 1, 2.2, 4), STONE, { p: [0, 1.1, 0], r: [0, Math.PI / 4, 0], s: [W * .72, 1, D * .72], jit: .15, ao: .3 }));
      for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) P.push(cyl(.14, .16, 5.2, BEAM, [x * W * .3, 4.8, z * D * .3], { r: [z * .06, 0, -x * .06] }));
      for (let k = 0; k < 2; k++) for (const s of [1, -1]) P.push(box(W * .62, .1, .1, BEAM, [0, 3.6 + k * 1.8, s * D * .3], { r: [0, 0, k ? .5 : -.5] }));
      P.push(box(W * .85, .25, D * .85, WOOD, [0, 7.4, 0]));
      wall(P, W * .78, 1.5, D * .78, 7.5, { posts: 2, color: 0xd8ccb0 });
      windows(P, Gl, W * .5, D * .78, 8.35, 2, false);
      P.push(roof(W * .8, D * .8, 1.7, TILE, 9.0, { over: .5, lift: .35 }));
      flags.push([W * .3, 9.2, D * .3]);
      break; }
    case 'smith': {
      P.push(box(W * .9, .3, D * .9, STONE, [0, .15, 0]));
      wall(P, W * .8, 2.4, D * .75, .3, { posts: 4, color: 0x8a6e52 });
      P.push(box(1.1, 6.4, 1.1, 0x6e6a62, [W * .3, 3.2, -D * .1], { jit: .2, ao: .3 }));
      P.push(roof(W * .85, D * .8, 2.0, 0x4a4038, 2.7, { over: .5, lift: .2 }));
      P.push(box(1.8, 1.4, .1, DARK, [-W * .1, 1.0, D * .38 + .05])); Gl.push(box(1.4, .7, .05, 0xffffff, [-W * .1, .8, D * .38 + .1]));
      P.push(box(.5, .3, .3, 0x3a3a40, [-W * .35, .65, D * .5 + .3]), box(.3, .5, .2, 0x3a3a40, [-W * .35, .25, D * .5 + .3]));
      break; }
    case 'temple': {
      P.push(box(W, .9, D, STONE, [0, .45, 0], { jit: .12 }), box(2.4, .45, 1.2, STONE, [0, .22, D / 2 + .5]));
      P.push(box(W * .78, 2.9, D * .66, 0xd8c8a0, [0, 2.35, 0], { ao: .3 }));
      for (let i = 0; i < 6; i++) for (const z of [D * .38, -D * .38]) P.push(cyl(.16, .18, 3.1, VERM, [-W * .43 + i * W * .86 / 5, 2.45, z]));
      P.push(roof(W * .95, D * .85, 2.9, COPPER, 4.0, { over: 1.2, lift: .7 }), box(W * .55, .3, .3, 0x2f4a40, [0, 6.95, 0]));
      P.push(box(W * .3, 1.0, D * .25, VERM, [0, 7.4, 0]), roof(W * .34, D * .3, 1.3, COPPER, 7.9, { over: .4, lift: .3 }));
      Gl.push(box(W * .5, 1.4, .02, 0xffffff, [0, 2.0, D * .33 + .02]));
      for (const s of [1, -1]) P.push(cyl(.17, .2, 3.4, VERM, [s * 1.6, 1.7, D / 2 + 2.2]));                       // torii gate
      P.push(box(4.6, .28, .35, 0x1e1a18, [0, 3.45, D / 2 + 2.2]), box(3.8, .2, .25, VERM, [0, 2.9, D / 2 + 2.2]));
      for (const s of [1, -1]) P.push(piece(new G.CylinderGeometry(.22, .3, 1.3, 6), STONE, { p: [s * W * .48, .65, D / 2 + 1], jit: .1 }));   // stone lanterns
      flags.push([-W * .5, 0, D * .5]);
      break; }
    case 'stable': {
      P.push(box(W, .2, D, 0x7a6a50, [0, .1, 0]));
      P.push(box(W * .9, 2.2, .15, WOOD, [0, 1.3, -D * .38]));
      for (let i = 0; i <= 5; i++) { const x = -W * .45 + i * W * .9 / 5; P.push(cyl(.1, .12, 2.6, BEAM, [x, 1.3, D * .3]), box(.08, 1.2, D * .6, WOOD, [x, .8, -.05])); }
      P.push(roof(W * .92, D * .8, 1.8, 0x6a5236, 2.5, { over: .5, lift: .15, z: -.2 }));
      for (let i = 0; i < 3; i++) P.push(piece(new G.CylinderGeometry(.45, .45, .9, 10), 0xd9b860, { p: [W * .4 - i * .5, .45, D * .55], r: [0, 0, Math.PI / 2], jit: .1 }));
      for (let i = 0; i < 9; i++) P.push(cyl(.06, .06, 1.1, WOOD, [-W * .5 + i * W / 8, .55, D * .6 + .4], { seg: 5 }));
      P.push(box(W, .07, .07, WOOD, [0, .8, D * .6 + .4]), box(W, .07, .07, WOOD, [0, .45, D * .6 + .4]));
      flags.push([-W * .5, 0, D * .3]);
      break; }
    case 'market': {
      P.push(box(W, .12, D, 0xa08a62, [0, .06, 0]));
      P.push(box(3, 2.4, 2.6, PLASTER, [0, 1.3, -D * .25], { ao: .3 })); P.push(roof(3, 2.6, 1.3, TILE, 2.5, { over: .4, z: -D * .25 }));
      for (const [x, z] of [[-W * .3, D * .2], [W * .3, D * .2], [0, D * .32]]) {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(cyl(.05, .05, 2, WOOD, [x + sx * 1.1, 1, z + sz * .7], { seg: 5 }));
        P.push(box(2.2, .7, 1.2, 0x8a6a42, [x, .35, z]));
        for (let i = 0; i < 6; i++) P.push(box(2.4 / 6, .05, 1.7, i % 2 ? 0xf0e8d6 : TEAMC[0], [x - 1.2 + (i + .5) * .4, 2.05, z], { r: [.18, 0, 0] }));
        for (let i = 0; i < 5; i++) P.push(piece(new G.SphereGeometry(.12, 8, 6), [0xb0262e, 0xe8b93a, 0x7fb04a, 0xd9762a, 0x8a5a2b][i], { p: [x - .8 + i * .4, .78, z + .2] }));
      }
      for (let i = 0; i < 4; i++) P.push(piece(new G.CylinderGeometry(.3, .3, .6, 10), 0x6b4a2a, { p: [W * .45, .3, -D * .45 + i * .7], ao: .3 }));
      flags.push([W * .48, 0, D * .48]);
      break; }
    case 'ranch': {
      P.push(box(W - .4, .04, D - .4, 0x6a7a3a, [0, .02, 0], { jit: .15 }));                      // grazed paddock
      const posts = (x0, z0, x1, z1, n) => { for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; P.push(cyl(.07, .08, 1.2, WOOD, [x, .6, z], { seg: 6 })); }
        const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0); for (const y of [.45, .95]) P.push(box(L, .07, .07, 0x7a5a38, [(x0 + x1) / 2, y, (z0 + z1) / 2], { r: [0, -a, 0] })); };
      posts(-W / 2, -D / 2, W / 2, -D / 2, 10); posts(-W / 2, -D / 2, -W / 2, D / 2, 8); posts(W / 2, -D / 2, W / 2, D / 2, 8);
      posts(-W / 2, D / 2, -1.4, D / 2, 5); posts(1.4, D / 2, W / 2, D / 2, 5);                   // gate gap on the south side
      P.push(box(4.2, 2.6, 3.2, 0x8a6a48, [-W / 2 + 2.6, 1.3, -D / 2 + 2.2], { ao: .3 })); P.push(roof(4.2, 3.2, 1.6, THATCH, 2.6, { over: .4, lift: .1, z: -D / 2 + 2.2 }).translate(-W / 2 + 2.6, 0, 0));
      P.push(box(1.2, 1.6, .08, DARK, [-W / 2 + 2.6, .8, -D / 2 + 3.82]));
      P.push(box(2.2, .4, .5, 0x5a4a38, [W / 2 - 2, .2, D / 2 - 1.5]), box(2.0, .05, .4, 0x4a6a8a, [W / 2 - 2, .39, D / 2 - 1.5]));          // water trough
      for (let i = 0; i < 4; i++) P.push(piece(new G.CylinderGeometry(.45, .45, .9, 10), 0xd9b860, { p: [W / 2 - 1.2 - i * 1, .45, -D / 2 + 1.2], r: [0, 0, Math.PI / 2], jit: .1 }));
      break; }
    case 'pagoda': {
      P.push(box(W, .9, D, STONE, [0, .45, 0], { jit: .12 }));
      let y = .9;
      for (let i = 0; i < 5; i++) { const f = 1 - i * .13, bw = W * .62 * f, h = 2.1 - i * .12;
        P.push(box(bw, h, bw, VERM, [0, y + h / 2, 0], { ao: .2 }));
        for (const s of [1, -1]) { P.push(box(bw * .35, h * .55, .05, DARK, [0, y + h * .5, s * bw / 2])); Gl.push(box(bw * .3, h * .45, .02, 0xffffff, [0, y + h * .5, s * (bw / 2 + .03)])); }
        P.push(roof(bw + .4, bw + .4, 1.0, TILE, y + h, { over: 1.0 - i * .1, lift: .45 }));
        y += h + .95; }
      P.push(cyl(.08, .1, 4.2, GOLD, [0, y + 1.6, 0]));
      for (let i = 0; i < 9; i++) P.push(piece(new G.TorusGeometry(.22 - i * .012, .04, 6, 14), GOLD, { p: [0, y + .4 + i * .32, 0], r: [Math.PI / 2, 0, 0] }));
      break; }
  }
  const out = { geo: merge(P), glow: Gl.length ? merge(Gl) : null, flags, h: { ranch: 4.4, tc: 17, house: 5.3, farm: 1, store: 5, barracks: 5.4, tower: 11, smith: 6.4, temple: 9.3, stable: 4.4, market: 3.8, pagoda: 22 }[type] };
  cache.set(type, out); return out;
}
// team-coloured band so the same model reads as yours or theirs
export function teamTrimGeo(type, team) {
  const key = 'trim' + type + team; if (cache.has(key)) return cache.get(key);
  const t = BT[type], W = t.w * S, D = t.h * S, c = TEAMC[team];
  const y = { ranch: 1.0, tc: 3.45, house: 2.5, farm: .32, store: 3.15, barracks: 2.95, tower: 7.6, smith: 2.75, temple: 3.85, stable: 2.3, market: .2, pagoda: 1.0 }[type];
  const fw = { ranch: 1.0, tc: .76, house: .84, farm: 1.02, store: .84, barracks: .86, tower: .8, smith: .82, temple: .8, stable: .9, market: 1.0, pagoda: 1.0 }[type];
  if (type === 'farm' || type === 'market' || type === 'pagoda' || type === 'ranch') { const g = merge([piece(new G.BoxGeometry(.6, .6, .6), c, { p: [W / 2 - .3, .3, D / 2 - .3] })]); cache.set(key, g); return g; }   // marker post only
  const g = merge([piece(new G.BoxGeometry(W * fw, .16, D * fw * .95), c, { p: [0, y, 0] })]);
  cache.set(key, g); return g;
}

// ---------------------------------------------------------------- nature
const rnd = (a, b) => a + Math.random() * (b - a);
function trunk(P, pts, r0, r1, c) {
  const curve = new G.CatmullRomCurve3(pts.map(p => new G.Vector3(...p)));
  const tg = new G.TubeGeometry(curve, 10, 1, 6), pos = tg.attributes.position, uv = tg.attributes.uv;
  for (let i = 0; i < pos.count; i++) { const u = uv.getX(i), pt = curve.getPoint(u), r = r0 + (r1 - r0) * u; pos.setXYZ(i, pt.x + (pos.getX(i) - pt.x) * r, pt.y + (pos.getY(i) - pt.y) * r, pt.z + (pos.getZ(i) - pt.z) * r); }
  tg.computeVertexNormals(); P.push(piece(tg, c, { ao: .3 }));
}
const blob = (r, c, p, s = [1, 1, 1], det = 1) => piece(new G.IcosahedronGeometry(r, det), c, { p, s, jit: .14, sn: true });
export function treeGeo(kind) {
  const key = 'tree' + kind; if (cache.has(key)) return cache.get(key);
  const P = [];
  if (kind === 'pine') {          // Japanese black pine: leaning trunk, flat cloud-pads of needles
    const lean = rnd(-.6, .6);
    trunk(P, [[0, 0, 0], [lean * .3, 2, .1], [lean, 4.2, -.2], [lean * 1.2, 6.2, 0]], .28, .1, 0x4a3628);
    for (const [x, y, z, r] of [[lean * 1.2, 6.6, 0, 1.5], [lean - 1.4, 4.8, .4, 1.2], [lean + 1.5, 5.4, -.5, 1.25], [lean * .4 - .4, 3.6, 1.1, 1.0], [lean + .6, 7.4, .2, .95]]) {
      trunk(P, [[lean * (y / 6.2), y - .5, 0], [x, y, z]], .09, .05, 0x4a3628);
      P.push(blob(r, 0x2c4527, [x, y + .15, z], [1.3, .5, 1.3]), blob(r * .8, 0x3a5a30, [x, y + .45, z], [1.2, .45, 1.2]));
    }
  } else if (kind === 'cedar') {  // sugi: tall straight conical crown
    trunk(P, [[0, 0, 0], [0, 4, 0], [0, 10, 0]], .32, .12, 0x5a3a28);
    for (let i = 0; i < 6; i++) { const y = 2.6 + i * 1.25, r = 1.9 - i * .28; P.push(piece(new G.ConeGeometry(r, 2.2, 9), i % 2 ? 0x27402a : 0x2f4c30, { p: [rnd(-.1, .1), y + 1, rnd(-.1, .1)], jit: .12, sn: true })); }
  } else {                         // maple / sakura: broad rounded crown
    const leaf = kind === 'sakura' ? [0xf0b8cc, 0xe79ab5, 0xf6cad8] : kind === 'maple' ? [0x4e7c34, 0x5e8c3c, 0x6f9a45] : [0xc4542a, 0xd9762a, 0xb03a22];
    trunk(P, [[0, 0, 0], [.2, 1.8, 0], [.1, 3.4, .1]], .26, .12, kind === 'sakura' ? 0x3a2a24 : 0x4a3628);
    for (const [x, z, a] of [[1.3, .2, 1], [-1.2, .4, 1], [.2, -1.2, 1]]) trunk(P, [[.1, 3.0, .1], [x * .6, 3.8, z * .6], [x, 4.4, z]], .1, .05, 0x4a3628);
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, d = i ? rnd(.9, 1.6) : 0; P.push(blob(rnd(1.0, 1.4), leaf[i % 3], [Math.cos(a) * d, 4.6 + rnd(-.4, .8), Math.sin(a) * d], [1, .8, 1])); }
  }
  const g = merge(P); cache.set(key, g); return g;
}
export function stumpGeo() { if (cache.has('stump')) return cache.get('stump'); const g = merge([cyl(.3, .36, .45, 0x4a3628, [0, .22, 0], { seg: 9 }), cyl(.29, .29, .02, 0xc9a77a, [0, .46, 0], { seg: 9 })]); cache.set('stump', g); return g; }
function rockPiece(r, c, p, s) { const g = new G.DodecahedronGeometry(r, 1), pos = g.attributes.position; for (let i = 0; i < pos.count; i++) { const k = 1 + (Math.sin(pos.getX(i) * 9.1 + pos.getZ(i) * 5.3) * .12); pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k); } g.computeVertexNormals(); return piece(g, c, { p, s, jit: .1, ao: .4 }); }
export function goldGeo() {
  if (cache.has('gold')) return cache.get('gold');
  const P = [rockPiece(1.0, 0x7d776b, [0, .4, 0], [1.3, .8, 1.1]), rockPiece(.6, 0x8a8478, [.9, .25, .4], [1, .8, 1]), rockPiece(.5, 0x6e685e, [-.8, .2, -.3], [1, .8, 1])];
  for (let i = 0; i < 9; i++) P.push(piece(new G.OctahedronGeometry(rnd(.12, .22)), i % 3 ? 0xf2c84b : 0xffe680, { p: [rnd(-1, 1), rnd(.4, 1.1), rnd(-.6, .7)], r: [rnd(0, 3), rnd(0, 3), 0] }));
  const g = merge(P); cache.set('gold', g); return g;
}
export function bushGeo() {
  if (cache.has('bush')) return cache.get('bush');
  const P = []; for (let i = 0; i < 5; i++) P.push(blob(rnd(.45, .65), [0x355a2a, 0x426b30][i % 2], [rnd(-.5, .5), rnd(.4, .7), rnd(-.5, .5)], [1, .8, 1]));
  for (let i = 0; i < 26; i++) P.push(piece(new G.SphereGeometry(.07, 6, 4), 0xb0141e, { p: [rnd(-.75, .75), rnd(.3, 1.05), rnd(-.75, .75)] }));
  const g = merge(P); cache.set('bush', g); return g;
}
export function rockGeo(i) { const key = 'rock' + i; if (cache.has(key)) return cache.get(key); const g = merge([rockPiece(.5 + i * .25, [0x7d776b, 0x8a8478, 0x6e685e][i % 3], [0, .15, 0], [1.2, .7, 1])]); cache.set(key, g); return g; }
export function grassGeo() {
  if (cache.has('grass')) return cache.get('grass');
  const P = [];
  for (let b = 0; b < 7; b++) {
    const g = new G.BufferGeometry(), a = b / 7 * Math.PI + rnd(0, .4), h = rnd(.35, .7), w = .05, ox = rnd(-.15, .15), oz = rnd(-.15, .15), bend = rnd(-.12, .12);
    const cx = Math.cos(a) * w, cz = Math.sin(a) * w;
    const v = new Float32Array([ox - cx, 0, oz - cz, ox + cx, 0, oz + cz, ox + bend, h, oz + bend * .5]);
    g.setAttribute('position', new G.BufferAttribute(v, 3)); g.computeVertexNormals();
    const n = g.attributes.normal; for (let i = 0; i < 3; i++) n.setXYZ(i, 0, 1, 0);       // up-facing normals: grass lit like the ground
    const pc = piece(g, 0xffffff), col = pc.attributes.color;
    for (let i = 0; i < 3; i++) { const k = i === 2 ? 1 : .42; col.setXYZ(i, k, k, k); }   // dark root, bright tip; hue comes from instance colour
    P.push(pc);
  }
  const g = merge(P); cache.set('grass', g); return g;
}
// nobori war banner texture per team
export function bannerTex(team) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 160; const x = c.getContext('2d');
  x.fillStyle = '#' + new G.Color(TEAMC[team]).getHexString(); x.fillRect(0, 0, 64, 160);
  x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, 0, 64, 10); x.fillRect(0, 150, 64, 10);
  x.fillStyle = '#f3ead7'; x.beginPath(); x.arc(32, 48, 18, 0, 7); x.fill();
  x.fillStyle = '#' + new G.Color(TEAMC[team]).getHexString(); x.beginPath(); x.arc(32, 48, 8, 0, 7); x.fill();
  x.fillStyle = '#f3ead7'; for (let i = 0; i < 3; i++) x.fillRect(26, 84 + i * 22, 12, 12);
  const t = new G.CanvasTexture(c); t.colorSpace = G.SRGBColorSpace; return t;
}
