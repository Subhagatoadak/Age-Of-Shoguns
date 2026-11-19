// Skeletal characters: jointed humanoid and horse rigs with keyframed animation clips.
// Rest pose: character faces +Z, arms and legs hang along -Y. Rotation about X swings a limb
// backward (+) or forward (-). Weapons held in the right hand point along the hand's local +Z.
import * as THREE from 'three';
import { piece, merge, vcMat } from './geo.js';
import { TEAMC } from '../game/data.js';
import { bodyGeo, BONES } from './body.js';

const D = Math.PI / 180;
const G = THREE;

// ---------------------------------------------------------------- colour schemes per unit type
const SKIN = 0xd9a77c;
function outfit(type, team) {
  const tc = TEAMC[team], dark = new G.Color(tc).multiplyScalar(.55).getHex();
  switch (type) {
    case 'vil': return { torso: 0x8c6a45, sleeve: 0x8c6a45, sash: tc, leg: 0x5b4632, shin: 0xc9b48a, foot: 0x6b5a3a, hat: 'kasa' };
    case 'spear': return { torso: tc, sleeve: 0x3a3a3a, sash: dark, leg: 0x3a3330, shin: 0xc9b48a, foot: 0x4a3a2a, hat: 'jingasa', armor: true };
    case 'archer': return { torso: tc, sleeve: 0x6b5a48, sash: dark, leg: 0x4a4038, shin: 0xc9b48a, foot: 0x4a3a2a, hat: 'band' };
    case 'samurai': return { torso: 0x1c1b22, sleeve: 0x2a2730, sash: tc, leg: 0x23212a, shin: 0x1c1b22, foot: 0x2a2018, hat: 'kabuto', armor: true, heavy: true };
    case 'cit': return { torso: 0x3a4a6a, sleeve: 0x3a4a6a, sash: tc, leg: 0x5a4a38, hat: null };
    case 'monk': return { torso: 0xc9c2b0, sleeve: 0xc9c2b0, sash: tc, leg: 0xb8b0a0, shin: 0xb8b0a0, foot: 0x5a4a3a, hat: 'hood', robe: true };
    default: return { torso: 0x1c1b22, sleeve: 0x2a2730, sash: tc, leg: 0x23212a, shin: 0x1c1b22, foot: 0x2a2018, hat: 'kabuto', armor: true, heavy: true };
  }
}
const cache = new Map();
const cached = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };
const cap = (r, l) => new G.CapsuleGeometry(r, l, 4, 10);

// ---------------------------------------------------------------- rigid gear bolted to bones (armour, hats, quivers)
function gearGeo(type, team, part) {
  return cached('gear' + type + team + part, () => {
    const o = outfit(type, team), P = [];
    switch (part) {
      case 'hips':
        if (o.robe) P.push(piece(new G.CylinderGeometry(.18, .3, .78, 16, 1, true), o.torso, { p: [0, -.4, 0] }));
        else if (o.heavy) for (let i = 0; i < 7; i++) { const a = (i - 3) * .45; P.push(piece(new G.BoxGeometry(.11, .27, .022), i % 2 ? o.torso : o.sash, { p: [Math.sin(a) * .18, -.13, Math.cos(a) * .13], r: [-.18, a, 0] })); }
        break;
      case 'chest':
        if (o.armor) { for (let i = 0; i < 4; i++) P.push(piece(new G.CylinderGeometry(.205 - i * .004, .2 - i * .004, .065, 16, 1, true), i % 2 ? o.sash : o.torso, { p: [0, -.02 + i * .07, .005], s: [1, 1, .66] }));
          P.push(piece(new G.CylinderGeometry(.2, .19, .2, 16, 1, true, -1.2, 2.4), o.torso, { p: [0, .2, 0], s: [1, 1, .62] })); }
        if (o.heavy) for (const s of [1, -1]) P.push(piece(new G.BoxGeometry(.15, .22, .2), o.sash, { p: [s * .25, .18, 0], r: [0, 0, s * .28] }), piece(new G.BoxGeometry(.155, .04, .205), o.torso, { p: [s * .255, .09, 0], r: [0, 0, s * .28] }));
        if (type === 'archer') { P.push(piece(new G.CylinderGeometry(.05, .045, .55, 8), 0x5a3a20, { p: [-.08, .12, -.16], r: [.25, 0, .35] }));
          for (let i = 0; i < 5; i++) P.push(piece(new G.BoxGeometry(.012, .08, .03), 0xf0eadc, { p: [-.17 + i * .014, .42, -.22], r: [.25, 0, .35] })); }
        if (o.heavy) { P.push(piece(new G.CylinderGeometry(.01, .01, 1.05, 5), 0x3a2a1a, { p: [0, .45, -.16] }));
          P.push(piece(new G.BoxGeometry(.3, .42, .012), o.sash, { p: [.16, .74, -.16] })); P.push(piece(new G.CircleGeometry(.07, 14), 0xf3ead7, { p: [.16, .76, -.152] })); }
        break;
      case 'head':
        if (o.hat === 'kasa') P.push(piece(new G.ConeGeometry(.3, .16, 22), 0xcdb070, { p: [0, .26, 0], jit: .08 }));
        if (o.hat === 'jingasa') { P.push(piece(new G.ConeGeometry(.24, .12, 18), 0x23211f, { p: [0, .25, 0] })); P.push(piece(new G.CircleGeometry(.04, 12), TEAMC[team], { p: [0, .26, .12], r: [-1.1, 0, 0] })); }
        if (o.hat === 'band') P.push(piece(new G.TorusGeometry(.1, .014, 6, 20), 0xf3ead7, { p: [0, .14, .01], r: [Math.PI / 2, 0, 0], s: [.95, 1.05, 1] }));
        if (o.hat === 'kabuto') { P.push(piece(new G.SphereGeometry(.125, 18, 10, 0, 6.3, 0, 1.6), 0x15141a, { p: [0, .13, 0] }));
          P.push(piece(new G.CylinderGeometry(.13, .21, .11, 18, 1, true, Math.PI * .25, Math.PI * 1.5), 0x15141a, { p: [0, .085, -.01] }));
          for (const s of [1, -1]) P.push(piece(new G.BoxGeometry(.02, .17, .01), 0xe8b93a, { p: [s * .05, .3, .11], r: [-.3, 0, -s * .45] }));
        }
        if (o.hat === 'hood') P.push(piece(new G.SphereGeometry(.125, 16, 10, 0, 6.3, 0, 2.25), 0xcfc8b6, { p: [0, .1, -.025] }));
        break;
      case 'shin': if (o.heavy) P.push(piece(new G.BoxGeometry(.1, .26, .03), o.torso, { p: [0, -.22, .05], r: [.05, 0, 0] })); break;
      case 'fArm': if (o.heavy) P.push(piece(new G.CylinderGeometry(.05, .044, .2, 10), 0x15141a, { p: [0, -.13, 0] })); break;
    }
    return P.length ? merge(P) : null;
  });
}
export const skinMat = new G.MeshStandardMaterial({ vertexColors: true, roughness: .74, metalness: 0 });
export const lacquerMat = new G.MeshStandardMaterial({ vertexColors: true, roughness: .34, metalness: .18 });

// ---------------------------------------------------------------- props held or carried
export function propGeo(kind) {
  return cached('prop' + kind, () => {
    const P = [], wood = 0x6b4a2a, steel = 0xc9d0d8;
    switch (kind) {
      case 'katana':
        P.push(piece(new G.BoxGeometry(.03, .032, .24), 0x1a1612, { p: [0, 0, .02] }));
        P.push(piece(new G.CylinderGeometry(.04, .04, .012, 12), 0xb08a3a, { p: [0, 0, .15], r: [Math.PI / 2, 0, 0] }));
        for (let i = 0; i < 6; i++) P.push(piece(new G.BoxGeometry(.008, .028 - i * .002, .13), steel, { p: [0, i * i * .0016, .22 + i * .125], r: [-.04 * i, 0, 0] }));
        break;
      case 'yari':
        P.push(piece(new G.CylinderGeometry(.016, .018, 2.7, 6), 0x4a3220, { p: [0, 0, .35], r: [Math.PI / 2, 0, 0] }));
        P.push(piece(new G.ConeGeometry(.03, .28, 4), steel, { p: [0, 0, 1.84], r: [Math.PI / 2, 0, 0] }));
        break;
      case 'axe':
        P.push(piece(new G.CylinderGeometry(.018, .02, .75, 6), wood, { p: [0, 0, .27], r: [Math.PI / 2, 0, 0] }));
        P.push(piece(new G.BoxGeometry(.02, .15, .11), 0x8a9098, { p: [0, -.08, .58] }));
        break;
      case 'pick':
        P.push(piece(new G.CylinderGeometry(.018, .02, .75, 6), wood, { p: [0, 0, .27], r: [Math.PI / 2, 0, 0] }));
        P.push(piece(new G.CylinderGeometry(.012, .028, .48, 6), 0x7a8088, { p: [0, 0, .6] }));
        break;
      case 'hammer':
        P.push(piece(new G.CylinderGeometry(.015, .017, .38, 6), wood, { p: [0, 0, .12], r: [Math.PI / 2, 0, 0] }));
        P.push(piece(new G.BoxGeometry(.05, .14, .06), 0x5a5048, { p: [0, -.03, .3] }));
        break;
      case 'hoe':
        P.push(piece(new G.CylinderGeometry(.016, .018, 1.2, 6), wood, { p: [0, 0, .45], r: [Math.PI / 2, 0, 0] }));
        P.push(piece(new G.BoxGeometry(.14, .17, .015), 0x7a8088, { p: [0, -.07, 1.04] }));
        break;
      case 'rod':
        P.push(piece(new G.CylinderGeometry(.008, .016, 2.4, 5), 0x8a6a3a, { p: [0, 0, 1.1], r: [Math.PI / 2, 0, 0] }));
        P.push(piece(new G.CylinderGeometry(.002, .002, 1.4, 3), 0xe8e8e8, { p: [0, -.7, 2.3] }));
        break;
      case 'staff':
        P.push(piece(new G.CylinderGeometry(.02, .022, 1.8, 6), 0x4a3220, { p: [0, 0, .5], r: [Math.PI / 2, 0, 0] }));
        P.push(piece(new G.TorusGeometry(.07, .012, 6, 14), 0xc9a24a, { p: [0, 0, 1.45], r: [0, Math.PI / 2, 0] }));
        break;
      case 'basket': P.push(piece(new G.CylinderGeometry(.12, .09, .14, 12), 0xb8955a, { p: [0, -.12, .05] })); P.push(piece(new G.SphereGeometry(.08, 8, 6), 0xb0262e, { p: [0, -.06, .05], s: [1.2, .5, 1.2] })); break;
      case 'bow': {
        const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16, z = -.75 + t * 1.95, bulge = Math.sin(t * Math.PI) * .14 + Math.sin(t * Math.PI * 2) * .025; pts.push(new G.Vector3(0, -bulge, z)); }
        P.push(piece(new G.TubeGeometry(new G.CatmullRomCurve3(pts), 24, .014, 5), 0x3a2414));
        P.push(piece(new G.CylinderGeometry(.003, .003, 1.95, 3), 0xe8e2d0, { p: [0, 0, .225], r: [Math.PI / 2, 0, 0] }));
        break; }
      case 'arrowNock': P.push(piece(new G.CylinderGeometry(.006, .006, .85, 4), 0x8a6a3a, { p: [0, 0, .3], r: [Math.PI / 2, 0, 0] })); break;
      case 'wood': for (let i = 0; i < 3; i++) P.push(piece(new G.CylinderGeometry(.05, .05, .55, 7), 0x7a5532, { p: [(i - 1) * .09, .1 + (i % 2) * .07, -.2], r: [0, 0, Math.PI / 2] })); break;
      case 'gold': P.push(piece(new G.SphereGeometry(.14, 9, 7), 0x8a6a3a, { p: [0, .12, -.2], s: [1, .9, .8] })); P.push(piece(new G.OctahedronGeometry(.05), 0xf2c84b, { p: [.05, .24, -.2] })); break;
      case 'food': P.push(piece(new G.CylinderGeometry(.14, .11, .2, 12), 0xb8955a, { p: [0, .12, -.2] })); P.push(piece(new G.SphereGeometry(.12, 10, 6), 0xb0262e, { p: [0, .2, -.2], s: [1, .4, 1] })); break;
    }
    return merge(P);
  });
}

// ---------------------------------------------------------------- humanoid rig
function J(name, parent, x, y, z) { const j = new G.Object3D(); j.name = name; j.position.set(x, y, z); parent.add(j); return j; }
function M(j, geo, mat = vcMat) { const m = new G.Mesh(geo, mat); m.castShadow = true; j.add(m); return m; }
function B(name, parent, x, y, z) { const b = new G.Bone(); b.name = name; b.position.set(x, y, z); parent.add(b); return b; }

// a skeleton of Bones (same names the clips animate) wearing one skinned body mesh
export function buildHuman(type, team, root = new G.Group(), opt = {}) {
  const j = {};
  j.hips = B('hips', root, 0, .95, 0);
  j.spine = B('spine', j.hips, 0, .08, 0);
  j.chest = B('chest', j.spine, 0, .2, 0);
  j.neck = B('neck', j.chest, 0, .27, 0);
  j.head = B('head', j.neck, 0, .08, 0);
  for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
    j['uArm' + k] = B('uArm' + k, j.chest, s * .2, .22, 0);
    j['fArm' + k] = B('fArm' + k, j['uArm' + k], 0, -.28, 0);
    j['hand' + k] = B('hand' + k, j['fArm' + k], 0, -.26, 0);
    j['thigh' + k] = B('thigh' + k, j.hips, s * .095, -.06, 0);
    j['shin' + k] = B('shin' + k, j['thigh' + k], 0, -.43, 0);
    j['foot' + k] = B('foot' + k, j['shin' + k], 0, -.42, 0);
  }
  const variant = opt.variant ?? Math.floor(Math.random() * 3), g = opt.gender || 'm', key = type + team + variant + g + (opt.elder ? 'e' : '');
  const geo = cached('body' + key, () => bodyGeo(type, team, TEAMC[team], variant, g, opt.elder));
  const body = new G.SkinnedMesh(geo, skinMat); body.castShadow = true; body.frustumCulled = false;
  const skel = new G.Skeleton(BONES.map(n => j[n]));
  root.add(body); root.updateMatrixWorld(true); body.bind(skel);   // bind with the mesh's real world matrix (riders sit inside the horse)
  for (const part of ['hips', 'chest', 'head', 'shin', 'fArm']) for (const k of part === 'shin' || part === 'fArm' ? ['L', 'R'] : ['']) {
    const gg = (type === 'cit' || (g === 'f' && part === 'head' && type !== 'vil')) ? null : gearGeo(type, team, part); if (!gg) continue;
    const mesh = new G.Mesh(gg, outfit(type, team).heavy || part === 'head' ? lacquerMat : vcMat); mesh.castShadow = true; j[part + k].add(mesh); }
  return { root, j, body };
}

// ---------------------------------------------------------------- horse rig
const HC = 0x6b4128, HD = 0x2a1a12;
function horseGeo(part, team) {
  return cached('horse' + part + team, () => {
    const P = [];
    switch (part) {
      case 'body':
        P.push(piece(cap(.36, .95), HC, { r: [Math.PI / 2, 0, 0], s: [.85, 1, 1] }));
        P.push(piece(new G.CylinderGeometry(.37, .37, .62, 14, 1, true, -Math.PI / 2, Math.PI), TEAMC[team], { p: [0, .02, -.02], r: [Math.PI / 2, 0, 0], s: [1.05, 1, 1.02] }));   // saddle cloth draped over the barrel
        P.push(piece(new G.CylinderGeometry(.375, .375, .04, 14, 1, true, -Math.PI / 2, Math.PI), 0xe8b93a, { p: [0, .02, .29], r: [Math.PI / 2, 0, 0], s: [1.05, 1, 1.02] }));
        P.push(piece(new G.BoxGeometry(.36, .14, .45), 0x3a2418, { p: [0, .35, -.02] }));
        break;
      case 'neck': P.push(piece(cap(.17, .5), HC, { p: [0, .3, 0] })); P.push(piece(new G.BoxGeometry(.06, .62, .16), HD, { p: [0, .32, -.14] })); break;
      case 'head': P.push(piece(new G.BoxGeometry(.2, .22, .55), HC, { p: [0, 0, .2] })); P.push(piece(new G.BoxGeometry(.17, .17, .15), 0x4a2c1c, { p: [0, -.03, .45] }));
        for (const s of [1, -1]) P.push(piece(new G.ConeGeometry(.04, .14, 6), HC, { p: [s * .07, .16, .02] }));
        for (const s of [1, -1]) P.push(piece(new G.SphereGeometry(.025, 6, 4), 0x0a0806, { p: [s * .1, .06, .16] }));
        break;
      case 'uLeg': P.push(piece(cap(.085, .32), HC, { p: [0, -.22, 0] })); break;
      case 'lLeg': P.push(piece(cap(.05, .4), HC, { p: [0, -.25, 0] })); P.push(piece(new G.CylinderGeometry(.06, .07, .09, 8), HD, { p: [0, -.5, .01] })); break;
      case 'tail': P.push(piece(new G.ConeGeometry(.09, .75, 7), HD, { p: [0, -.37, 0], r: [Math.PI, 0, 0] })); break;
    }
    return merge(P);
  });
}
export function buildHorse(team, root) {
  const j = {}, g = p => horseGeo(p, team);
  j.hBody = J('hBody', root, 0, 1.28, 0); M(j.hBody, g('body'));
  j.hNeck = J('hNeck', j.hBody, 0, .2, .62); j.hNeck.rotation.x = .5; M(j.hNeck, g('neck'));
  j.hHead = J('hHead', j.hNeck, 0, .62, 0); M(j.hHead, g('head'));
  j.hTail = J('hTail', j.hBody, 0, .12, -.72); M(j.hTail, g('tail'));
  for (const [n, x, z] of [['FL', .2, .5], ['FR', -.2, .5], ['BL', .2, -.5], ['BR', -.2, -.5]]) {
    j['hU' + n] = J('hU' + n, j.hBody, x, -.12, z); M(j['hU' + n], g('uLeg'));
    j['hL' + n] = J('hL' + n, j['hU' + n], 0, -.45, 0); M(j['hL' + n], g('lLeg'));
  }
  return j;
}

// ---------------------------------------------------------------- animation clip construction
const Q = new G.Quaternion(), E = new G.Euler();
function qtrack(name, keys) {
  const times = [], vals = [];
  for (const [t, x = 0, y = 0, z = 0] of keys) { times.push(t); Q.setFromEuler(E.set(x * D, y * D, z * D)); vals.push(Q.x, Q.y, Q.z, Q.w); }
  return new G.QuaternionKeyframeTrack(name + '.quaternion', times, vals);
}
function ptrack(name, keys) { const times = [], vals = []; for (const [t, x, y, z] of keys) { times.push(t); vals.push(x, y, z); } return new G.VectorKeyframeTrack(name + '.position', times, vals); }
const loopKeys = (T, k) => k.map(([t, ...v]) => [t * T, ...v]);
// static hold: same pose at start and end
const hold = (T, pose) => Object.entries(pose).map(([n, v]) => qtrack(n, [[0, ...v], [T, ...v]]));
function clip(name, T, tracks) { return new G.AnimationClip(name, T, tracks.flat()); }

// leg cycle used by walk/run; T seconds per two steps
function legCycle(T, amp = 1) {
  const a = amp;
  return [
    qtrack('thighL', loopKeys(T, [[0, -30 * a], [.25, -5 * a], [.5, 22 * a], [.75, 0], [1, -30 * a]])),
    qtrack('shinL', loopKeys(T, [[0, 6], [.25, 14], [.5, 22 * a], [.75, 70 * a], [1, 6]])),
    qtrack('footL', loopKeys(T, [[0, -12], [.25, 0], [.5, 18], [.75, 5], [1, -12]])),
    qtrack('thighR', loopKeys(T, [[0, 22 * a], [.25, 0], [.5, -30 * a], [.75, -5 * a], [1, 22 * a]])),
    qtrack('shinR', loopKeys(T, [[0, 22 * a], [.25, 70 * a], [.5, 6], [.75, 14], [1, 22 * a]])),
    qtrack('footR', loopKeys(T, [[0, 18], [.25, 5], [.5, -12], [.75, 0], [1, 18]])),
    ptrack('hips', loopKeys(T, [[0, 0, .93, 0], [.25, 0, .97, 0], [.5, 0, .93, 0], [.75, 0, .97, 0], [1, 0, .93, 0]])),
    qtrack('hips', loopKeys(T, [[0, 0, 7 * a, 0], [.5, 0, -7 * a, 0], [1, 0, 7 * a, 0]])),
    qtrack('spine', loopKeys(T, [[0, 6 * a, -4 * a, 0], [.5, 6 * a, 4 * a, 0], [1, 6 * a, -4 * a, 0]])),
    qtrack('head', loopKeys(T, [[0, -4, 3, 0], [.5, -4, -3, 0], [1, -4, 3, 0]])),
  ];
}
const swingArm = (T, side, amp, elbow = -18) => {
  const s = side === 'L' ? 1 : -1;
  return [qtrack('uArm' + side, loopKeys(T, [[0, 24 * s * amp, 0, s * 6], [.5, -24 * s * amp, 0, s * 6], [1, 24 * s * amp, 0, s * 6]])),
    qtrack('fArm' + side, loopKeys(T, [[0, elbow], [.25, elbow - 12], [.5, elbow], [.75, elbow - 12], [1, elbow]]))];
};
// arm poses that carry each weapon style while walking or idling
const CARRY = {
  vil: null,
  spear: { uArmR: [-28, 0, -8], fArmR: [-62, 0, 0], handR: [0, 0, 0] },
  sword: { uArmR: [-10, 0, -10], fArmR: [-22, 0, 0], handR: [62, 0, 0] },
  bow: { uArmL: [-14, 0, 10], fArmL: [-46, 0, 0], handL: [-30, 0, 0] },
  monk: { uArmR: [-22, 0, -8], fArmR: [-58, 0, 0], handR: [-8, 0, 0] },
};
function upper(T, style, amp) {
  const c = CARRY[style], tr = [];
  if (!c || !c.uArmL) tr.push(...swingArm(T, 'L', amp));
  if (!c || !c.uArmR) tr.push(...swingArm(T, 'R', amp));
  if (c) tr.push(...Object.entries(c).map(([n, v]) => qtrack(n, loopKeys(T, [[0, v[0] - 3, v[1], v[2]], [.5, v[0] + 3, v[1], v[2]], [1, v[0] - 3, v[1], v[2]]]))));
  return tr;
}
function idle(style) {
  const T = 3.2, c = CARRY[style] || {};
  const tr = [qtrack('chest', [[0, 0], [1.6, -3], [3.2, 0]]), qtrack('head', [[0, 0, 0], [.9, -2, 14], [1.8, 0, 0], [2.6, 1, -10], [3.2, 0, 0]]),
    ptrack('hips', [[0, 0, .95, 0], [1.6, 0, .94, 0], [3.2, 0, .95, 0]]), qtrack('hips', [[0, 0, 0, 1], [1.6, 0, 0, -1], [3.2, 0, 0, 1]]),
    qtrack('thighL', [[0, -2, 0, 3], [3.2, -2, 0, 3]]), qtrack('thighR', [[0, 3, 0, -4], [3.2, 3, 0, -4]]), qtrack('shinL', [[0, 4], [3.2, 4]]), qtrack('shinR', [[0, 3], [3.2, 3]])];
  if (!c.uArmL) tr.push(qtrack('uArmL', [[0, 2, 0, 5], [1.6, 4, 0, 7], [3.2, 2, 0, 5]]), qtrack('fArmL', [[0, -12], [3.2, -12]]));
  if (!c.uArmR) tr.push(qtrack('uArmR', [[0, 2, 0, -5], [1.6, 4, 0, -7], [3.2, 2, 0, -5]]), qtrack('fArmR', [[0, -12], [3.2, -12]]));
  tr.push(...hold(T, c));
  return clip('idle', T, tr);
}
function walk(style, T = .9) { return clip('walk', T, [...legCycle(T), ...upper(T, style, 1)]); }

// ---- attacks
function swordAttack() {
  const T = 1.0;
  return clip('attack', T, [
    qtrack('uArmR', [[0, -10, 0, -10], [.3, -168, 0, -12], [.45, -82, 0, 6], [.62, -28, 0, 14], [1, -10, 0, -10]]),
    qtrack('fArmR', [[0, -22], [.3, -32], [.45, -8], [.62, -4], [1, -22]]),
    qtrack('handR', [[0, 62], [.3, 38], [.45, 52], [.62, 58], [1, 62]]),
    qtrack('uArmL', [[0, 10, 0, 8], [.3, -150, 0, 18], [.45, -78, 0, -4], [.62, -30, 0, -8], [1, 10, 0, 8]]),
    qtrack('fArmL', [[0, -15], [.3, -45], [.45, -30], [.62, -20], [1, -15]]),
    qtrack('chest', [[0, 0, 0], [.3, -6, 22, 0], [.45, 8, -18, 0], [.62, 12, -26, 0], [1, 0, 0]]),
    qtrack('spine', [[0, 4], [.3, -8], [.45, 16], [.62, 18], [1, 4]]),
    qtrack('thighR', [[0, 0], [.3, 10], [.45, -38], [.7, -32], [1, 0]]), qtrack('shinR', [[0, 4], [.45, 34], [.7, 30], [1, 4]]),
    qtrack('thighL', [[0, 0], [.45, 22], [.7, 18], [1, 0]]), qtrack('shinL', [[0, 4], [.45, 20], [1, 4]]),
    ptrack('hips', [[0, 0, .95, 0], [.3, 0, .95, -.05], [.45, 0, .88, .18], [.7, 0, .88, .15], [1, 0, .95, 0]]),
  ]);
}
function spearAttack() {
  const T = .85;
  return clip('attack', T, [
    qtrack('uArmR', [[0, -28, 0, -8], [.2, -45, 0, -15], [.32, -30, 0, -10], [.45, -78, 0, -4], [.6, -60, 0, -8], [.85, -28, 0, -8]]),
    qtrack('fArmR', [[0, -62], [.2, -55], [.32, -70], [.45, -6], [.6, -30], [.85, -62]]),
    qtrack('handR', [[0, 0], [.2, 78], [.32, 95], [.45, 82], [.6, 80], [.85, 0]]),
    qtrack('uArmL', [[0, 10, 0, 8], [.2, -50, 0, -10], [.45, -70, 0, -12], [.85, 10, 0, 8]]), qtrack('fArmL', [[0, -15], [.2, -70], [.45, -40], [.85, -15]]),
    qtrack('chest', [[0, 0, 0], [.32, 0, 24, 0], [.45, 6, -14, 0], [.85, 0, 0, 0]]), qtrack('spine', [[0, 4], [.45, 14], [.85, 4]]),
    qtrack('thighL', [[0, 0], [.45, -34], [.7, -30], [.85, 0]]), qtrack('shinL', [[0, 4], [.45, 30], [.85, 4]]),
    qtrack('thighR', [[0, 0], [.45, 18], [.85, 0]]),
    ptrack('hips', [[0, 0, .95, 0], [.32, 0, .93, -.08], [.45, 0, .88, .2], [.85, 0, .95, 0]]),
  ]);
}
function bowAttack() {
  const T = 1.5;
  return clip('attack', T, [
    qtrack('uArmL', [[0, -14, 0, 10], [.25, -88, 0, 4], [1.0, -90, 0, 4], [1.25, -88, 0, 4], [1.5, -14, 0, 10]]),
    qtrack('fArmL', [[0, -46], [.25, -4], [1.25, -4], [1.5, -46]]), qtrack('handL', [[0, -30], [.25, -86], [1.25, -86], [1.5, -30]]),
    qtrack('uArmR', [[0, 5, 0, -6], [.25, -86, 0, 6], [.5, -84, 0, 12], [.95, -82, -30, 30], [1.0, -84, 0, 10], [1.5, 5, 0, -6]]),
    qtrack('fArmR', [[0, -15], [.25, -10], [.5, -40], [.95, -140], [1.02, -60], [1.5, -15]]),
    qtrack('chest', [[0, 0, 0], [.25, 0, 30, 0], [1.2, 0, 30, 0], [1.5, 0, 0, 0]]), qtrack('head', [[0, 0, 0], [.25, 0, -28, 0], [1.2, 0, -28, 0], [1.5, 0, 0, 0]]),
    qtrack('thighL', [[0, 0, 0, 0], [.25, -10, 0, 10], [1.2, -10, 0, 10], [1.5, 0]]), qtrack('thighR', [[0, 0, 0, 0], [.25, 8, 0, -12], [1.2, 8, 0, -12], [1.5, 0]]),
    ptrack('hips', [[0, 0, .95, 0], [.25, 0, .92, 0], [1.2, 0, .92, 0], [1.5, 0, .95, 0]]),
  ]);
}
function healCast() {
  const T = 1.1;
  return clip('attack', T, [
    qtrack('uArmR', [[0, -22, 0, -8], [.35, -155, 0, -10], [.75, -150, 0, -10], [1.1, -22, 0, -8]]), qtrack('fArmR', [[0, -58], [.35, -12], [.75, -12], [1.1, -58]]),
    qtrack('handR', [[0, -8], [.35, -20], [1.1, -8]]),
    qtrack('uArmL', [[0, 2, 0, 5], [.35, -70, 0, 30], [.75, -70, 0, 30], [1.1, 2, 0, 5]]), qtrack('fArmL', [[0, -12], [.35, -40], [1.1, -12]]),
    qtrack('head', [[0, 0], [.35, -18], [.75, -18], [1.1, 0]]), qtrack('chest', [[0, 0], [.35, -8], [1.1, 0]]),
  ]);
}
// ---- villager work loops
function chopClip(name, T, top, low, bend) {
  return clip(name, T, [
    qtrack('uArmR', loopKeys(T, [[0, top, 0, -6], [.45, top, 0, -6], [.62, low, 0, 4], [.75, low + 8, 0, 4], [1, top, 0, -6]])),
    qtrack('fArmR', loopKeys(T, [[0, -40], [.45, -40], [.62, -6], [1, -40]])),
    qtrack('handR', loopKeys(T, [[0, 40], [.45, 40], [.62, 66], [1, 40]])),
    qtrack('uArmL', loopKeys(T, [[0, top + 12, 0, 12], [.45, top + 12, 0, 12], [.62, low + 4, 0, -4], [1, top + 12, 0, 12]])),
    qtrack('fArmL', loopKeys(T, [[0, -50], [.62, -16], [1, -50]])),
    qtrack('spine', loopKeys(T, [[0, -4], [.45, -6], [.62, bend], [.8, bend], [1, -4]])),
    qtrack('chest', loopKeys(T, [[0, 0, 16, 0], [.62, 6, -8, 0], [1, 0, 16, 0]])),
    qtrack('thighL', loopKeys(T, [[0, -16, 0, 6], [1, -16, 0, 6]])), qtrack('shinL', loopKeys(T, [[0, 20], [.62, 32], [1, 20]])),
    qtrack('thighR', loopKeys(T, [[0, 14, 0, -6], [.62, 6, 0, -6], [1, 14, 0, -6]])), qtrack('shinR', loopKeys(T, [[0, 10], [.62, 22], [1, 10]])),
    ptrack('hips', loopKeys(T, [[0, 0, .93, 0], [.62, 0, .86, .03], [1, 0, .93, 0]])),
  ]);
}
function buildClip() {
  const T = .55;
  return clip('build', T, [
    qtrack('thighL', [[0, -88, 0, 6], [T, -88, 0, 6]]), qtrack('shinL', [[0, 92], [T, 92]]), qtrack('footL', [[0, -4], [T, -4]]),
    qtrack('thighR', [[0, 4, 0, -10], [T, 4, 0, -10]]), qtrack('shinR', [[0, 98], [T, 98]]), qtrack('footR', [[0, 60], [T, 60]]),
    ptrack('hips', [[0, 0, .52, 0], [T, 0, .52, 0]]), qtrack('spine', [[0, 20], [T, 20]]), qtrack('chest', [[0, 10, 10, 0], [T * .5, 14, 6, 0], [T, 10, 10, 0]]),
    qtrack('uArmR', [[0, -95, 0, -12], [T * .5, -40, 0, -6], [T, -95, 0, -12]]), qtrack('fArmR', [[0, -70], [T * .5, -20], [T, -70]]), qtrack('handR', [[0, 30], [T * .5, 40], [T, 30]]),
    qtrack('uArmL', [[0, -40, 0, 20], [T, -40, 0, 20]]), qtrack('fArmL', [[0, -50], [T, -50]]), qtrack('head', [[0, 20], [T, 20]]),
  ]);
}
function farmClip(name, T) {
  return clip(name, T, [
    qtrack('spine', loopKeys(T, [[0, 38], [.5, 44], [1, 38]])), qtrack('chest', loopKeys(T, [[0, 14, 10, 0], [.5, 16, -10, 0], [1, 14, 10, 0]])),
    qtrack('head', loopKeys(T, [[0, -20], [1, -20]])),
    qtrack('uArmR', loopKeys(T, [[0, -70, 0, -6], [.25, -40, 0, -10], [.5, -60, 0, 4], [.75, -70, 0, -6], [1, -70, 0, -6]])), qtrack('fArmR', loopKeys(T, [[0, -20], [.5, -40], [1, -20]])),
    qtrack('uArmL', loopKeys(T, [[0, -50, 0, 8], [.5, -75, 0, 10], [1, -50, 0, 8]])), qtrack('fArmL', loopKeys(T, [[0, -30], [.5, -15], [1, -30]])),
    qtrack('thighL', loopKeys(T, [[0, -32, 0, 8], [1, -32, 0, 8]])), qtrack('shinL', loopKeys(T, [[0, 40], [1, 40]])),
    qtrack('thighR', loopKeys(T, [[0, -18, 0, -10], [1, -18, 0, -10]])), qtrack('shinR', loopKeys(T, [[0, 30], [1, 30]])),
    ptrack('hips', loopKeys(T, [[0, 0, .82, -.05], [.5, 0, .8, -.05], [1, 0, .82, -.05]])),
  ]);
}
function fishClip() {
  const T = 4;
  return clip('fish', T, [
    qtrack('uArmR', [[0, -48, 0, -6], [2.6, -50, 0, -6], [2.8, -78, 0, -6], [3.2, -46, 0, -6], [4, -48, 0, -6]]), qtrack('fArmR', [[0, -26], [2.8, -45], [4, -26]]), qtrack('handR', [[0, 0], [4, 0]]),
    qtrack('uArmL', [[0, -40, 0, -12], [2.8, -60, 0, -12], [4, -40, 0, -12]]), qtrack('fArmL', [[0, -50], [4, -50]]),
    qtrack('chest', [[0, 0], [2, -2], [4, 0]]), qtrack('head', [[0, -10], [4, -10]]),
    ptrack('hips', [[0, 0, .95, 0], [2, 0, .945, 0], [4, 0, .95, 0]]),
  ]);
}
function dieClip() {
  const T = 1.4;
  return clip('die', T, [
    ptrack('hips', [[0, 0, .95, 0], [.25, 0, .93, -.12], [.6, 0, .6, -.2], [1.0, 0, .32, -.45], [1.4, 0, .18, -.55]]),
    qtrack('hips', [[0, 0], [.25, -12, 0, 4], [.6, -20, 0, 6], [1.0, -70, 0, 8], [1.4, -88, 0, 8]]),
    qtrack('spine', [[0, 0], [.25, -18], [.6, 10], [1.4, -6]]), qtrack('head', [[0, 0], [.25, -25], [.8, 20], [1.4, -10, 25]]),
    qtrack('thighL', [[0, 0], [.6, -60, 0, 8], [1.0, -40, 0, 14], [1.4, -10, 0, 16]]), qtrack('shinL', [[0, 0], [.6, 90], [1.0, 50], [1.4, 12]]),
    qtrack('thighR', [[0, 0], [.6, -40, 0, -8], [1.0, -30, 0, -12], [1.4, -5, 0, -14]]), qtrack('shinR', [[0, 0], [.6, 80], [1.0, 40], [1.4, 18]]),
    qtrack('uArmL', [[0, 0], [.25, -40, 0, 30], [1.0, -120, 0, 60], [1.4, -150, 0, 70]]), qtrack('uArmR', [[0, 0], [.25, -30, 0, -40], [1.0, -100, 0, -70], [1.4, -140, 0, -80]]),
    qtrack('fArmL', [[0, -10], [1.4, -30]]), qtrack('fArmR', [[0, -10], [1.4, -20]]),
  ]);
}
// ---- rider (seated) and horse
function rideClips() {
  const T = .56;
  const seat = { thighL: [-75, 0, 28], thighR: [-75, 0, -28], shinL: [70, 0, 0], shinR: [70, 0, 0], footL: [-10, 0, 0], footR: [-10, 0, 0] };
  const lance = { uArmR: [-36, 0, -10], fArmR: [-50, 0, 0], handR: [76, 0, 0], uArmL: [-40, 0, 14], fArmL: [-50, 0, 0] };
  const ride = clip('ride', T, [...hold(T, seat), ...Object.entries(lance).map(([n, v]) => qtrack(n, loopKeys(T, [[0, ...v], [.5, v[0] + 4, v[1], v[2]], [1, ...v]]))),
    ptrack('hips', loopKeys(T, [[0, 0, .14, 0], [.5, 0, .2, 0], [1, 0, .14, 0]])), qtrack('spine', loopKeys(T, [[0, 10], [.5, 2], [1, 10]]))]);
  const rideIdle = clip('rideIdle', 3, [...hold(3, seat), ...hold(3, { ...lance, handR: [-10, 0, 0] }), ptrack('hips', [[0, 0, .14, 0], [3, 0, .14, 0]]), qtrack('chest', [[0, 0], [1.5, -3], [3, 0]])]);
  const strike = clip('rideAttack', .8, [...hold(.8, seat),
    qtrack('uArmR', [[0, -36, 0, -10], [.2, -20, 0, -20], [.35, -85, 0, -4], [.55, -70, 0, -8], [.8, -36, 0, -10]]), qtrack('fArmR', [[0, -50], [.2, -80], [.35, -4], [.8, -50]]),
    qtrack('handR', [[0, 76], [.35, 86], [.8, 76]]), qtrack('chest', [[0, 0, 0], [.2, 0, 26, 0], [.35, 10, -16, 0], [.8, 0, 0, 0]]), ptrack('hips', [[0, 0, .14, 0], [.8, 0, .14, 0]])]);
  return { ride, rideIdle, rideAttack: strike };
}
function horseClips() {
  const T = .56, legs = [['FL', 0], ['FR', .12], ['BL', .52], ['BR', .64]], tr = [];
  for (const [n, ph] of legs) {
    // shift one gait cycle by the leg's phase, then re-close it so the loop is seamless
    const shift = base => {
      const ks = base.map(([f, v]) => [(f + ph) % 1, v]).sort((a, b) => a[0] - b[0]);
      const first = ks[0], last = ks[ks.length - 1];
      const w = (1 - last[0]) / (1 - last[0] + first[0] || 1), v0 = last[1] + (first[1] - last[1]) * w;
      if (first[0] > 1e-4) ks.unshift([0, v0]);
      ks.push([1, ks[0][1]]); return ks;
    };
    const back = n[0] === 'B';
    tr.push(qtrack('hU' + n, shift([[0, -40], [.35, 32], [.55, 38]]).map(([f, v]) => [f * T, back ? v * .8 : v])),
      qtrack('hL' + n, shift([[0, 8], [.35, 10], [.6, 95], [.85, 40]]).map(([f, v]) => [f * T, back ? -v * .7 : v])));
  }
  tr.push(qtrack('hBody', loopKeys(T, [[0, 4], [.5, -5], [1, 4]])), ptrack('hBody', loopKeys(T, [[0, 0, 1.24, 0], [.3, 0, 1.36, 0], [.5, 0, 1.22, 0], [.8, 0, 1.34, 0], [1, 0, 1.24, 0]])),
    qtrack('hNeck', loopKeys(T, [[0, 38], [.5, 56], [1, 38]])), qtrack('hTail', loopKeys(T, [[0, -30, 0, 8], [.5, -50, 0, -8], [1, -30, 0, 8]])));
  const gallop = clip('gallop', T, tr);
  const still = { hUFL: [0], hUFR: [0], hUBL: [0], hUBR: [0], hLFL: [2], hLFR: [2], hLBL: [-2], hLBR: [-2] };
  const hidle = clip('hIdle', 4, [...hold(4, still), qtrack('hNeck', [[0, 50], [1.5, 62], [2.2, 44], [4, 50]]), qtrack('hHead', [[0, 0], [1.5, 20], [2.2, -6, 10, 0], [4, 0]]),
    qtrack('hTail', [[0, -20, 0, 10], [1, -24, 0, -14], [2, -20, 0, 8], [3, -22, 0, -10], [4, -20, 0, 10]]), ptrack('hBody', [[0, 0, 1.28, 0], [4, 0, 1.28, 0]]), qtrack('hBody', [[0, 0], [4, 0]])]);
  const rear = clip('hRear', .8, [qtrack('hBody', [[0, 0], [.3, -18], [.8, 0]]), ptrack('hBody', [[0, 0, 1.28, 0], [.3, 0, 1.42, -.1], [.8, 0, 1.28, 0]]),
    qtrack('hUFL', [[0, 0], [.3, -70], [.8, 0]]), qtrack('hLFL', [[0, 2], [.3, 100], [.8, 2]]), qtrack('hUFR', [[0, 0], [.35, -60], [.8, 0]]), qtrack('hLFR', [[0, 2], [.35, 90], [.8, 2]]),
    qtrack('hNeck', [[0, 50], [.3, 20], [.8, 50]])]);
  const hdie = clip('hDie', 1.3, [qtrack('hBody', [[0, 0, 0, 0], [.5, 10, 0, 20], [1.3, 0, 0, 82]]), ptrack('hBody', [[0, 0, 1.28, 0], [.5, 0, 1.0, 0], [1.3, 0, .42, 0]]),
    qtrack('hNeck', [[0, 50], [1.3, 80]]), qtrack('hUFL', [[0, 0], [1.3, -30]]), qtrack('hUBL', [[0, 0], [1.3, 25]])]);
  return { gallop, hIdle: hidle, hRear: rear, hDie: hdie };
}

// ---- martial arts: unarmed strikes, sword and spear forms, defence and reactions
const GUARD = { uArmL: [-55, 0, 12], fArmL: [-115, 0, 0], uArmR: [-48, 0, -12], fArmR: [-120, 0, 0], thighL: [-22, 0, 4], shinL: [24, 0, 0], thighR: [16, 0, -4], shinR: [14, 0, 0] };
const guardKeys = (n, t) => [t, ...GUARD[n]];
function punchCombo() {
  const T = .95, k = (n, keys) => qtrack(n, keys);
  return clip('punch', T, [
    k('uArmL', [guardKeys('uArmL', 0), [.14, -90, 0, 4], [.24, -88, 0, 4], [.36, ...GUARD.uArmL], guardKeys('uArmL', T)]), k('fArmL', [guardKeys('fArmL', 0), [.14, -4], [.24, -6], [.36, -115], [T, -115]]),
    k('uArmR', [guardKeys('uArmR', 0), [.36, -48, 0, -12], [.5, -92, 0, -4], [.62, -90, 0, -4], [.76, -48, 0, -12], guardKeys('uArmR', T)]), k('fArmR', [[0, -120], [.36, -120], [.5, -4], [.62, -6], [.76, -120], [T, -120]]),
    k('chest', [[0, 0], [.14, 0, -22, 0], [.3, 0, 0, 0], [.5, 4, 34, 0], [.66, 2, 24, 0], [T, 0]]), k('hips', [[0, 0], [.5, 0, 16, 0], [T, 0]]),
    k('thighL', [guardKeys('thighL', 0), guardKeys('thighL', T)]), k('shinL', [guardKeys('shinL', 0), guardKeys('shinL', T)]),
    k('thighR', [guardKeys('thighR', 0), [.5, 22, -10, -4], guardKeys('thighR', T)]), k('shinR', [guardKeys('shinR', 0), [.5, 20], guardKeys('shinR', T)]),
    ptrack('hips', [[0, 0, .9, 0], [.14, 0, .89, .08], [.5, 0, .88, .14], [T, 0, .9, 0]]),
  ]);
}
function frontKick() {
  const T = .85;
  return clip('kickF', T, [
    ...['uArmL', 'fArmL', 'uArmR', 'fArmR', 'thighL', 'shinL'].map(n => qtrack(n, [guardKeys(n, 0), guardKeys(n, T)])),
    qtrack('thighR', [guardKeys('thighR', 0), [.22, -95, 0, 0], [.38, -88, 0, 0], [.52, -92, 0, 0], [.7, -20, 0, -4], guardKeys('thighR', T)]),
    qtrack('shinR', [guardKeys('shinR', 0), [.22, 115], [.38, 4], [.52, 100], [.7, 30], guardKeys('shinR', T)]), qtrack('footR', [[0, 0], [.38, 40], [.6, 0], [T, 0]]),
    qtrack('spine', [[0, 4], [.38, -16], [.7, 4], [T, 4]]), qtrack('chest', [[0, 0], [.38, -6], [T, 0]]),
    ptrack('hips', [[0, 0, .9, 0], [.38, 0, .94, .1], [.7, 0, .9, .04], [T, 0, .9, 0]]),
  ]);
}
function roundhouse() {
  const T = 1.05;
  return clip('kickR', T, [
    ...['uArmL', 'fArmL', 'fArmR', 'shinL'].map(n => qtrack(n, [guardKeys(n, 0), guardKeys(n, T)])),
    qtrack('uArmR', [guardKeys('uArmR', 0), [.45, -30, 0, -55], [.7, ...GUARD.uArmR], guardKeys('uArmR', T)]),
    qtrack('hips', [[0, 0, 0, 0], [.25, 0, -35, 0], [.45, 0, -95, 0], [.7, 0, -60, 0], [T, 0, 0, 0]]),
    qtrack('chest', [[0, 0], [.25, 0, 10, 0], [.45, 0, 40, -10], [.7, 0, 20, 0], [T, 0]]),
    qtrack('thighR', [guardKeys('thighR', 0), [.25, -70, 0, -25], [.45, -15, 0, -95], [.6, -20, 0, -85], [.8, -40, 0, -20], guardKeys('thighR', T)]),
    qtrack('shinR', [guardKeys('shinR', 0), [.25, 110], [.45, 6], [.6, 40], [.8, 60], guardKeys('shinR', T)]),
    qtrack('thighL', [guardKeys('thighL', 0), [.45, -10, 0, 18], guardKeys('thighL', T)]), qtrack('spine', [[0, 0], [.45, 0, 0, 22], [T, 0]]),
    ptrack('hips', [[0, 0, .9, 0], [.45, 0, .96, 0], [T, 0, .9, 0]]),
  ]);
}
function flyingKick() {
  const T = 1.35;
  return clip('flyKick', T, [
    qtrack('thighL', [[0, -22], [.25, -55], [.55, -100], [.85, -60], [1.05, -50], [T, -22]]), qtrack('shinL', [[0, 24], [.25, 80], [.55, 125], [.85, 60], [1.05, 70], [T, 24]]),
    qtrack('thighR', [[0, 16], [.25, -30], [.55, -88], [.75, -85], [.95, -30], [T, 16]]), qtrack('shinR', [[0, 14], [.25, 70], [.45, 40], [.55, 2], [.75, 4], [.95, 60], [T, 14]]),
    qtrack('uArmL', [[0, -55, 0, 12], [.25, 20, 0, 30], [.55, -40, 0, 70], [.95, -60, 0, 20], [T, -55, 0, 12]]), qtrack('uArmR', [[0, -48, 0, -12], [.25, 20, 0, -30], [.55, -40, 0, -70], [.95, -60, 0, -20], [T, -48, 0, -12]]),
    qtrack('fArmL', [[0, -115], [.55, -40], [T, -115]]), qtrack('fArmR', [[0, -120], [.55, -40], [T, -120]]),
    qtrack('spine', [[0, 4], [.25, 25], [.55, -20], [.95, 15], [T, 4]]), qtrack('hips', [[0, 0], [.55, -10, 0, 0], [T, 0]]),
    ptrack('hips', [[0, 0, .9, 0], [.25, 0, .68, -.1], [.45, 0, 1.45, .35], [.6, 0, 1.65, .75], [.85, 0, 1.15, 1.05], [1.0, 0, .72, 1.0], [T, 0, .9, 0]]),
  ]);
}
function swordH() {
  const T = .95;
  return clip('slashH', T, [
    qtrack('uArmR', [[0, -10, 0, -10], [.3, -70, 0, -75], [.48, -85, 0, 25], [.65, -60, 0, 55], [T, -10, 0, -10]]), qtrack('fArmR', [[0, -22], [.3, -40], [.48, -6], [.65, -10], [T, -22]]),
    qtrack('handR', [[0, 62], [.3, 0, -90, 0], [.48, 0, -90, 0], [.65, 0, -80, 0], [T, 62]]),
    qtrack('uArmL', [[0, 10, 0, 8], [.3, -40, 0, 30], [.5, 0, 0, 60], [T, 10, 0, 8]]),
    qtrack('chest', [[0, 0], [.3, 0, 48, 0], [.48, 0, -30, 0], [.65, 0, -50, 0], [T, 0]]), qtrack('hips', [[0, 0], [.3, 0, 20, 0], [.55, 0, -25, 0], [T, 0]]),
    qtrack('thighL', [[0, 0], [.48, -36, 0, 6], [.7, -30], [T, 0]]), qtrack('shinL', [[0, 4], [.48, 34], [T, 4]]), qtrack('thighR', [[0, 0], [.48, 20, 0, -6], [T, 0]]),
    ptrack('hips', [[0, 0, .95, 0], [.3, 0, .9, -.05], [.48, 0, .84, .22], [.75, 0, .86, .18], [T, 0, .95, 0]]),
  ]);
}
function spinSlash() {
  const T = 1.3, arm = [-85, 0, -60];
  return clip('spin', T, [
    qtrack('hips', [[0, 0, 0, 0], [.25, 0, 40, 0], [.45, 0, -80, 0], [.6, 0, -200, 0], [.78, 0, -320, 0], [.95, 0, -360, 0], [T, 0, -360, 0]]),
    qtrack('uArmR', [[0, -10, 0, -10], [.25, ...arm], [.95, ...arm], [T, -10, 0, -10]]), qtrack('fArmR', [[0, -22], [.25, -4], [.95, -4], [T, -22]]),
    qtrack('handR', [[0, 62], [.25, 0, -90, 0], [.95, 0, -90, 0], [T, 62]]), qtrack('uArmL', [[0, 10, 0, 8], [.3, -20, 0, 75], [.95, -20, 0, 75], [T, 10, 0, 8]]),
    qtrack('thighL', [[0, 0], [.3, -40, 0, 10], [.95, -40, 0, 10], [T, 0]]), qtrack('shinL', [[0, 4], [.3, 60], [.95, 60], [T, 4]]),
    qtrack('thighR', [[0, 0], [.3, 30, 0, -20], [.95, 30, 0, -20], [T, 0]]), qtrack('shinR', [[0, 4], [.3, 40], [.95, 40], [T, 4]]),
    ptrack('hips', [[0, 0, .95, 0], [.3, 0, .72, 0], [.95, 0, .72, 0], [T, 0, .95, 0]]),
  ]);
}
function spearSweep() {
  const T = 1.0;
  return clip('sweep', T, [
    qtrack('uArmR', [[0, -28, 0, -8], [.3, -60, 0, -50], [.55, -75, 0, 30], [T, -28, 0, -8]]), qtrack('fArmR', [[0, -62], [.3, -20], [.55, -10], [T, -62]]),
    qtrack('handR', [[0, 0], [.3, 0, -90, -10], [.55, 0, -90, -10], [T, 0]]), qtrack('uArmL', [[0, 10, 0, 8], [.3, -60, 0, -20], [.55, -50, 0, 40], [T, 10, 0, 8]]),
    qtrack('chest', [[0, 0], [.3, 0, 45, 0], [.55, 0, -45, 0], [T, 0]]), qtrack('hips', [[0, 0], [.3, 0, 25, 0], [.55, 0, -30, 0], [T, 0]]),
    qtrack('thighL', [[0, 0], [.3, -50, 0, 25], [.6, -50, 0, 25], [T, 0]]), qtrack('shinL', [[0, 4], [.3, 90], [.6, 90], [T, 4]]), qtrack('thighR', [[0, 0], [.3, 20, 0, -40], [.6, 20, 0, -40], [T, 0]]),
    ptrack('hips', [[0, 0, .95, 0], [.3, 0, .6, 0], [.6, 0, .6, 0], [T, 0, .95, 0]]),
  ]);
}
function block(style) {
  const T = .55, sword = style === 'sword' || style === 'spear';
  return clip('block', T, [
    qtrack('uArmR', [[0, -10, 0, -10], [.12, sword ? -120 : -95, 0, -20], [.4, sword ? -120 : -95, 0, -20], [T, -10, 0, -10]]), qtrack('fArmR', [[0, -22], [.12, sword ? -50 : -120], [.4, sword ? -50 : -120], [T, -22]]),
    qtrack('handR', [[0, sword ? 62 : 0], [.12, 0, -90, 0], [.4, 0, -90, 0], [T, sword ? 62 : 0]]),
    qtrack('uArmL', [[0, 10, 0, 8], [.12, -110, 0, 20], [.4, -110, 0, 20], [T, 10, 0, 8]]), qtrack('fArmL', [[0, -15], [.12, -60], [.4, -60], [T, -15]]),
    qtrack('spine', [[0, 0], [.12, 10], [.4, 10], [T, 0]]), qtrack('thighL', [[0, 0], [.12, -25], [.4, -25], [T, 0]]), qtrack('shinL', [[0, 4], [.12, 40], [.4, 40], [T, 4]]),
    qtrack('thighR', [[0, 0], [.12, 20], [.4, 20], [T, 0]]), qtrack('shinR', [[0, 4], [.12, 35], [.4, 35], [T, 4]]),
    ptrack('hips', [[0, 0, .95, 0], [.12, 0, .86, -.12], [.4, 0, .86, -.14], [T, 0, .95, 0]]),
  ]);
}
function dodge() {
  const T = .6, s = Math.random() < .5 ? 1 : -1;
  return clip('dodge', T, [
    ptrack('hips', [[0, 0, .95, 0], [.18, s * .45, .78, -.1], [.4, s * .5, .82, -.05], [T, 0, .95, 0]]), qtrack('hips', [[0, 0], [.18, 0, s * 20, s * 14], [T, 0]]),
    qtrack('spine', [[0, 0], [.18, 10, 0, -s * 22], [T, 0]]), qtrack('thighL', [[0, 0], [.18, -40, 0, 20], [T, 0]]), qtrack('shinL', [[0, 4], [.18, 60], [T, 4]]),
    qtrack('thighR', [[0, 0], [.18, -10, 0, -30], [T, 0]]), qtrack('uArmL', [[0, 0], [.18, -60, 0, 50], [T, 0]]), qtrack('uArmR', [[0, 0], [.18, -40, 0, -50], [T, 0]]),
  ]);
}
function hitReact() {
  const T = .6;
  return clip('hitReact', T, [
    ptrack('hips', [[0, 0, .95, 0], [.1, 0, .9, -.18], [.3, 0, .9, -.22], [T, 0, .95, 0]]), qtrack('spine', [[0, 0], [.1, -24, 8, 0], [.3, -14], [T, 0]]),
    qtrack('head', [[0, 0], [.1, -28, -10, 0], [.35, -10], [T, 0]]), qtrack('uArmL', [[0, 0], [.1, -30, 0, 40], [T, 0]]), qtrack('uArmR', [[0, 0], [.1, -20, 0, -45], [T, 0]]),
    qtrack('thighL', [[0, 0], [.1, 18], [.3, 10], [T, 0]]), qtrack('shinL', [[0, 4], [.1, 30], [T, 4]]), qtrack('thighR', [[0, 0], [.1, -24], [T, 0]]), qtrack('shinR', [[0, 4], [.1, 34], [T, 4]]),
  ]);
}
// ---- townsfolk: bon-odori festival dance, animated conversation, prayer
function danceClip() {
  const T = 2.4, k = [];
  k.push(qtrack('uArmL', [[0, -150, 0, 30], [.6, -110, 0, 60], [1.2, -150, 0, 30], [1.8, -110, 0, 60], [T, -150, 0, 30]]), qtrack('fArmL', [[0, -40], [.6, -70], [1.2, -40], [1.8, -70], [T, -40]]));
  k.push(qtrack('uArmR', [[0, -110, 0, -60], [.6, -150, 0, -30], [1.2, -110, 0, -60], [1.8, -150, 0, -30], [T, -110, 0, -60]]), qtrack('fArmR', [[0, -70], [.6, -40], [1.2, -70], [1.8, -40], [T, -70]]));
  k.push(qtrack('hips', [[0, 0, -20, 0], [.6, 0, 20, 0], [1.2, 0, -20, 0], [1.8, 0, 20, 0], [T, 0, -20, 0]]), qtrack('chest', [[0, 0, 10, 0], [.6, 0, -10, 0], [1.2, 0, 10, 0], [1.8, 0, -10, 0], [T, 0, 10, 0]]));
  k.push(qtrack('thighL', [[0, -25], [.3, 0], [.6, 0], [1.2, -25], [1.5, 0], [T, -25]]), qtrack('shinL', [[0, 40], [.3, 5], [1.2, 40], [1.5, 5], [T, 40]]));
  k.push(qtrack('thighR', [[0, 0], [.6, -25], [.9, 0], [1.8, -25], [2.1, 0], [T, 0]]), qtrack('shinR', [[0, 5], [.6, 40], [.9, 5], [1.8, 40], [2.1, 5], [T, 5]]));
  k.push(ptrack('hips', [[0, 0, .93, 0], [.3, 0, .96, 0], [.6, 0, .93, 0], [.9, 0, .96, 0], [1.2, 0, .93, 0], [1.5, 0, .96, 0], [1.8, 0, .93, 0], [2.1, 0, .96, 0], [T, 0, .93, 0]]));
  return clip('dance', T, k);
}
function talkClip() {
  const T = 3.6;
  return clip('talk', T, [qtrack('uArmR', [[0, -10, 0, -8], [.5, -45, 0, -15], [1.1, -30, 0, -25], [1.8, -10, 0, -8], [2.6, -50, 0, -10], [T, -10, 0, -8]]), qtrack('fArmR', [[0, -20], [.5, -90], [1.1, -70], [1.8, -20], [2.6, -100], [T, -20]]),
    qtrack('uArmL', [[0, 2, 0, 6], [1.4, -30, 0, 20], [2.2, 2, 0, 6], [T, 2, 0, 6]]), qtrack('fArmL', [[0, -15], [1.4, -80], [2.2, -15], [T, -15]]),
    qtrack('head', [[0, 0, 0, 0], [.6, 6, 10, 0], [1.4, -4, -8, 3], [2.4, 8, 6, 0], [T, 0, 0, 0]]), qtrack('chest', [[0, 0], [1.2, 0, 8, 0], [2.4, 0, -6, 0], [T, 0]]),
    ptrack('hips', [[0, 0, .95, 0], [1.8, 0, .945, 0], [T, 0, .95, 0]])]);
}
function prayClip() {
  const T = 4;
  return clip('pray', T, [qtrack('uArmL', [[0, -35, 0, -22], [T, -35, 0, -22]]), qtrack('fArmL', [[0, -105, 0, 0], [T, -105, 0, 0]]), qtrack('uArmR', [[0, -35, 0, 22], [T, -35, 0, 22]]), qtrack('fArmR', [[0, -105], [T, -105]]),
    qtrack('spine', [[0, 8], [1.2, 30], [2.6, 30], [T, 8]]), qtrack('head', [[0, 0], [1.2, 18], [2.6, 18], [T, 0]]), ptrack('hips', [[0, 0, .95, 0], [T, 0, .95, 0]])]);
}
// ---- four-legged animals: cattle walk and graze, deer bolt
function quadClips() {
  const T = 1.2, tr = [];
  for (const [n, ph] of [['FL', 0], ['BR', 0], ['FR', .5], ['BL', .5]]) { const o = f => (f + ph) % 1, ks = [[0, -22], [.5, 20]].map(([f, v]) => [o(f), v]).sort((a, b) => a[0] - b[0]);
    const full = ks[0][0] > 0 ? [[0, (ks[0][1] + ks[1][1]) / 2 * 0 + (ks[1][1])], ...ks] : ks; full.push([1, full[0][1]]);
    tr.push(qtrack('hU' + n, full.map(([f, v]) => [f * T, v])), qtrack('hL' + n, [[0, n[0] === 'B' ? -10 : 10], [T * .5, n[0] === 'B' ? -24 : 26], [T, n[0] === 'B' ? -10 : 10]])); }
  tr.push(qtrack('hNeck', [[0, 70], [T * .5, 76], [T, 70]]), ptrack('hBody', [[0, 0, 1.28, 0], [T * .25, 0, 1.31, 0], [T * .5, 0, 1.28, 0], [T * .75, 0, 1.31, 0], [T, 0, 1.28, 0]]), qtrack('hBody', [[0, 0], [T, 0]]),
    qtrack('hTail', [[0, -10, 0, 12], [T * .5, -10, 0, -12], [T, -10, 0, 12]]));
  const walk = clip('qWalk', T, tr);
  const still = { hUFL: [0], hUFR: [0], hUBL: [0], hUBR: [0], hLFL: [2], hLFR: [2], hLBL: [-2], hLBR: [-2] };
  const graze = clip('graze', 5, [...hold(5, still), qtrack('hNeck', [[0, 128], [1.2, 134], [2.4, 126], [3.6, 134], [5, 128]]), qtrack('hHead', [[0, -30], [.6, -15], [1.2, -30], [2.4, -12], [3.2, -30], [5, -30]]),
    qtrack('hTail', [[0, -15, 0, 14], [1.5, -15, 0, -16], [3, -15, 0, 12], [5, -15, 0, 14]]), ptrack('hBody', [[0, 0, 1.28, 0], [5, 0, 1.28, 0]]), qtrack('hBody', [[0, 0], [5, 0]])]);
  return { qWalk: walk, graze };
}
function quadGeo(kind, part) {
  return cached('quad' + kind + part, () => {
    const P = [], cow = kind === 'cow', C1 = cow ? 0xeeeae2 : 0x9a6a3e, C2 = cow ? 0x1c1a18 : 0x7a4e2a;
    switch (part) {
      case 'body': P.push(piece(cap(cow ? .44 : .3, cow ? 1.0 : .8), C1, { r: [Math.PI / 2, 0, 0], s: [cow ? .95 : .85, 1, 1] }));
        if (cow) { for (const [x, y, z, r] of [[.3, .1, .2, .22], [-.32, .05, -.25, .26], [.1, .3, -.4, .2], [-.2, .28, .3, .18]]) P.push(piece(new G.SphereGeometry(r, 10, 8), C2, { p: [x, y, z], s: [1, .8, 1.3] }));
          P.push(piece(new G.SphereGeometry(.14, 10, 8), 0xe8a8a0, { p: [0, -.38, -.35], s: [1, .7, 1] })); }
        else P.push(piece(new G.SphereGeometry(.12, 8, 6), 0xf0ece0, { p: [0, .05, -.62], s: [1, 1.2, .6] }));
        break;
      case 'neck': P.push(piece(cap(cow ? .2 : .12, cow ? .3 : .45), C1, { p: [0, .25, 0] })); break;
      case 'head': P.push(piece(new G.BoxGeometry(cow ? .28 : .16, cow ? .26 : .16, cow ? .5 : .4), C1, { p: [0, 0, .18] }));
        P.push(piece(new G.BoxGeometry(cow ? .24 : .1, cow ? .16 : .09, .12), cow ? 0xd8a090 : 0x3a2a1a, { p: [0, -.05, .44] }));
        for (const s of [1, -1]) { P.push(piece(new G.SphereGeometry(.025, 6, 4), 0x0a0806, { p: [s * (cow ? .14 : .08), .05, .22] }));
          P.push(piece(new G.ConeGeometry(.05, .14, 6), C1, { p: [s * (cow ? .2 : .1), .1, .02], r: [0, 0, s * -1.2] }));
          if (cow) P.push(piece(new G.ConeGeometry(.035, .22, 6), 0xd8ccb0, { p: [s * .16, .2, .04], r: [0, 0, s * -.6] }));
          else { P.push(piece(new G.CylinderGeometry(.012, .018, .4, 5), 0x8a7a5a, { p: [s * .06, .28, -.02], r: [0, 0, s * -.3] })); P.push(piece(new G.CylinderGeometry(.01, .014, .2, 5), 0x8a7a5a, { p: [s * .13, .38, .05], r: [.4, 0, s * -.9] })); } }
        break;
      case 'uLeg': P.push(piece(cap(cow ? .1 : .055, cow ? .26 : .3), C1, { p: [0, -.2, 0] })); break;
      case 'lLeg': P.push(piece(cap(cow ? .065 : .035, cow ? .28 : .38), cow ? C1 : C2, { p: [0, -.22, 0] })); P.push(piece(new G.CylinderGeometry(cow ? .07 : .04, cow ? .08 : .05, .08, 8), 0x2a2018, { p: [0, -.46, 0] })); break;
      case 'tail': P.push(piece(new G.CylinderGeometry(.02, .025, .7, 5), C1, { p: [0, -.35, 0] })); if (cow) P.push(piece(new G.SphereGeometry(.06, 6, 5), C2, { p: [0, -.72, 0], s: [1, 1.6, 1] })); break;
    }
    return merge(P);
  });
}
export function buildQuad(kind, root) {
  const j = {}, g = p => quadGeo(kind, p);
  j.hBody = J('hBody', root, 0, 1.28, 0); M(j.hBody, g('body'));
  j.hNeck = J('hNeck', j.hBody, 0, .2, kind === 'cow' ? .6 : .48); j.hNeck.rotation.x = .9; M(j.hNeck, g('neck'));
  j.hHead = J('hHead', j.hNeck, 0, kind === 'cow' ? .42 : .55, 0); M(j.hHead, g('head'));
  j.hTail = J('hTail', j.hBody, 0, .15, kind === 'cow' ? -.7 : -.55); M(j.hTail, g('tail'));
  for (const [n, x, z] of [['FL', .2, .45], ['FR', -.2, .45], ['BL', .2, -.45], ['BR', -.2, -.45]]) {
    j['hU' + n] = J('hU' + n, j.hBody, x * (kind === 'cow' ? 1.1 : .8), -.14, z * (kind === 'cow' ? 1 : .85)); M(j['hU' + n], g('uLeg'));
    j['hL' + n] = J('hL' + n, j['hU' + n], 0, -.42, 0); M(j['hL' + n], g('lLeg'));
  }
  return j;
}
export function chickenGeo() {
  return cached('chicken', () => merge([piece(new G.SphereGeometry(.13, 10, 8), 0xf0ead8, { p: [0, .2, 0], s: [1, .9, 1.25] }), piece(new G.SphereGeometry(.07, 8, 6), 0xf0ead8, { p: [0, .33, .12] }),
    piece(new G.BoxGeometry(.02, .05, .06), 0xd8202a, { p: [0, .41, .12] }), piece(new G.ConeGeometry(.02, .05, 4), 0xe8b030, { p: [0, .32, .2], r: [Math.PI / 2, 0, 0] }),
    piece(new G.ConeGeometry(.08, .16, 6), 0xd8d0b8, { p: [0, .27, -.15], r: [-.9, 0, 0] }), piece(new G.CylinderGeometry(.01, .01, .1, 4), 0xe8b030, { p: [.04, .05, 0] }), piece(new G.CylinderGeometry(.01, .01, .1, 4), 0xe8b030, { p: [-.04, .05, 0] })]));
}

// melee repertoire by style; the view picks one per swing
export const MOVES = { vil: ['punch', 'kickF', 'kickR', 'flyKick', 'punch'], sword: ['attack', 'slashH', 'spin', 'kickF', 'slashH', 'attack', 'flyKick'], spear: ['attack', 'sweep', 'attack', 'kickF'], bow: ['attack'], monk: ['attack'], rider: ['rideAttack'] };

// clip libraries by style, built once
const LIB = {};
export function clips(style) {
  if (LIB[style]) return LIB[style];
  const c = { idle: idle(style), walk: walk(style), die: dieClip(), hitReact: hitReact(), dodge: dodge(), block: block(style) };
  if (style === 'vil' || style === 'sword' || style === 'spear') Object.assign(c, { punch: punchCombo(), kickF: frontKick(), kickR: roundhouse(), flyKick: flyingKick() });
  if (style === 'sword') Object.assign(c, { slashH: swordH(), spin: spinSlash() });
  if (style === 'spear') c.sweep = spearSweep();
  if (style === 'vil') Object.assign(c, { attack: chopClip('attack', .9, -165, -40, 18), chop: chopClip('chop', 1.0, -165, -40, 18), mine: chopClip('mine', 1.15, -175, -25, 26), build: buildClip(), farm: farmClip('farm', 1.8), pick: farmClip('pick', 1.2), fish: fishClip() });
  if (style === 'sword') c.attack = swordAttack();
  if (style === 'spear') c.attack = spearAttack();
  if (style === 'bow') c.attack = bowAttack();
  if (style === 'monk') c.attack = healCast();
  if (style === 'rider') Object.assign(c, rideClips(), horseClips());
  if (style === 'cit' || style === 'vil') Object.assign(c, { dance: danceClip(), talk: talkClip(), pray: prayClip() });
  if (style === 'cit') c.farm = farmClip('farm', 1.8);
  if (style === 'quad') return (LIB[style] = { ...quadClips(), ...horseClips() });
  return (LIB[style] = c);
}
export const STYLE = { cit: 'cit', vil: 'vil', spear: 'spear', archer: 'bow', samurai: 'sword', monk: 'monk', cav: 'rider' };
