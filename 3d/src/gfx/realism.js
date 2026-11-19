// Realistic mode. Everything in this file is gated by one switch (Realism.set): when it is off the game
// renders exactly as the classic version (shader branches skip on a uniform, extra passes are disabled,
// extra meshes are hidden and the animation layer is detached).
//
// What it adds when on:
//  - post: ground-truth ambient occlusion (GTAO), height fog with sun in-scattering, depth of field in the
//    battle cam, SMAA, colour grade with vignette and film grain, AgX tone mapping
//  - shadows: 4096 map fitted to the zoom level and snapped to texels (no shimmer while panning)
//  - surfaces: procedural tiling detail + bump on ground, rock, buildings and foliage; wet ground in rain
//  - water: real planar reflections on the lake
//  - scene: denser grass, pebbles, ferns, wildflowers, leaf litter
//  - animation: foot IK on slopes, momentum lean and banking, breathing, head look-at and glances,
//    hit knockback, death slides, footprints and dust kicked up by feet
import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { WW, WH, S, LAKE, FORESTS } from '../game/data.js';
import { height, lakeE, roadDist, WATER_Y } from './terrain.js';
import { shared, bldMat, piece, merge, withFog } from './geo.js';
import { grassGeo, rockGeo, bushGeo } from './models.js';
import { makeRng, clamp, lerp } from '../game/util.js';

const U = { real: { value: 0 }, wet: { value: 0 }, detail: { value: null } };
const BASES = [[520, 1480], [2480, 440]];
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

// ---------------------------------------------------------------- tiling detail texture
// R grass blades and clumps, G soil with pebbles, B layered rock, A large-scale variation.
// Built from periodic noise so it tiles without seams; each channel is normalised to mean .5.
function detailTexture(N = 512) {
  const rng = makeRng(17);
  const lattice = (px, py) => { const L = new Float32Array(px * py); for (let i = 0; i < L.length; i++) L[i] = rng(); return { px, py, L }; };
  const vn = (o, x, y) => { const fx = x * o.px, fy = y * o.py, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const i0 = ix % o.px, j0 = iy % o.py, i1 = (i0 + 1) % o.px, j1 = (j0 + 1) % o.py, L = o.L;
    const a = L[j0 * o.px + i0], b = L[j0 * o.px + i1], c = L[j1 * o.px + i0], d = L[j1 * o.px + i1]; return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
  const oct = [2, 4, 8, 16, 32, 64, 128].map(p => lattice(p, p));
  const fbm = (x, y, from, n) => { let s = 0, amp = .5, tot = 0; for (let k = from; k < from + n; k++) { s += vn(oct[k], x, y) * amp; tot += amp; amp *= .55; } return s / tot; };
  const blades = [lattice(160, 20), lattice(20, 160)], strata = lattice(8, 48);
  // periodic cellular noise for pebbles
  const G = 22, pts = Array.from({ length: G * G }, () => [rng(), rng(), .5 + rng() * .5]);
  const cell = (x, y) => { const cx = Math.floor(x * G), cy = Math.floor(y * G); let best = 9, h = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const gx = cx + dx, gy = cy + dy, p = pts[((gy % G + G) % G) * G + ((gx % G + G) % G)];
      const d = Math.hypot((gx + p[0]) / G - x, (gy + p[1]) / G - y) * G; if (d < best) { best = d; h = p[2]; } }
    return Math.max(0, 1 - best / .5) * h; };
  const ch = [0, 1, 2, 3].map(() => new Float32Array(N * N));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    ch[0][i] = fbm(u, v, 2, 4) * .5 + (vn(blades[0], u, v) * .5 + vn(blades[1], u, v) * .5) * .35 + vn(oct[6], u, v) * .15;
    ch[1][i] = fbm(u, v, 1, 5) * .6 + Math.pow(cell(u, v), .7) * .4;
    const r = fbm(u, v, 1, 5); ch[2][i] = (1 - Math.abs(r * 2 - 1)) * .55 + vn(strata, u + r * .15, v) * .3 + vn(oct[5], u, v) * .15;
    ch[3][i] = fbm(u, v, 0, 3);
  }
  const data = new Uint8Array(N * N * 4);
  ch.forEach((c, k) => { let m = 0, s = 0; for (const x of c) m += x; m /= c.length; for (const x of c) s += (x - m) * (x - m); s = Math.sqrt(s / c.length) || 1;
    for (let i = 0; i < c.length; i++) data[i * 4 + k] = clamp(.5 + (c[i] - m) / s * .17, 0, 1) * 255; });
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; return t;
}

// ---------------------------------------------------------------- surface detail shader patches
const PARS = `uniform float uReal; uniform float uRealWet; uniform sampler2D uDetail; float aosH = 0.0;
vec3 aosBump(vec3 p, vec3 n, vec2 dh, float fd) { vec3 sx = normalize(dFdx(p)), sy = normalize(dFdy(p)); vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * fd; vec3 g = sign(det) * (dh.x * r1 + dh.y * r2); return normalize(abs(det) * n - g); }
vec4 aosTri(vec3 p, vec3 n, float s) { vec3 w = pow(abs(n), vec3(4.0)); w /= dot(w, vec3(1.0));
  return texture2D(uDetail, p.zy * s) * w.x + texture2D(uDetail, p.xz * s) * w.y + texture2D(uDetail, p.xy * s) * w.z; }
`;
const COLOR = {
  ground: `if (uReal > 0.5) {
    vec3 wn = normalize(vFowN); float fade = 1.0 - smoothstep(70.0, 240.0, length(vViewPosition));
    vec4 d1 = texture2D(uDetail, vFowPos.xz * 0.23), d2 = texture2D(uDetail, vFowPos.xz * 0.043 + 0.37), tr = aosTri(vFowPos, wn, 0.11);
    vec3 c = diffuseColor.rgb;
    float soil = clamp((c.r - c.g) * 9.0 + 0.35, 0.0, 1.0);
    float grey = 1.0 - clamp((abs(c.r - c.g) + abs(c.g - c.b)) * 14.0, 0.0, 1.0);
    float rock = clamp(smoothstep(0.82, 0.62, wn.y) + grey * 0.5, 0.0, 1.0);
    float det = mix(mix(mix(d1.r, d2.r, 0.35), mix(d1.g, d2.g, 0.35), soil), tr.b, rock);
    diffuseColor.rgb *= mix(1.0, 0.5 + det, 0.75 * fade + 0.2) * (0.88 + d2.a * 0.24);
    diffuseColor.rgb *= 1.0 - uRealWet * 0.3 * clamp(wn.y, 0.0, 1.0);
    aosH = det * fade * (1.0 + rock); }`,
  bld: `if (uReal > 0.5) {
    vec3 wn = normalize(vFowN); float fade = 1.0 - smoothstep(40.0, 160.0, length(vViewPosition));
    vec4 t1 = aosTri(vFowPos, wn, 0.6), t2 = aosTri(vFowPos, wn, 0.07);
    float det = mix(t1.g, t1.b, 0.5);
    diffuseColor.rgb *= mix(1.0, 0.72 + det * 0.56, 0.8 * fade) * (0.9 + t2.a * 0.2);
    diffuseColor.rgb *= 1.0 - uRealWet * 0.2 * clamp(wn.y, 0.0, 1.0);
    aosH = det * fade * 0.6; }`,
  leaf: `if (uReal > 0.5) {
    float fade = 1.0 - smoothstep(40.0, 170.0, length(vViewPosition));
    vec4 t = texture2D(uDetail, vFowPos.xz * 0.9 + vFowPos.y * 0.37);
    diffuseColor.rgb *= mix(1.0, 0.7 + t.r * 0.6, fade) * (0.92 + t.a * 0.16);
    aosH = t.r * fade * 0.5; }`,
};
const BUMP = { ground: 1.6, bld: 1.1, leaf: .8 };
function realify(mat, kind) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    prev && prev.call(mat, sh, r);
    sh.uniforms.uReal = U.real; sh.uniforms.uRealWet = U.wet; sh.uniforms.uDetail = U.detail;
    sh.fragmentShader = PARS + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + COLOR[kind])
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        if (uReal > 0.5) { roughnessFactor = clamp(roughnessFactor * (0.85 + aosH * 0.3), 0.04, 1.0);
          roughnessFactor = mix(roughnessFactor, 0.3, uRealWet * clamp(normalize(vFowN).y, 0.0, 1.0) * 0.7); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uReal > 0.5) normal = aosBump(-vViewPosition, normal, vec2(dFdx(aosH), dFdy(aosH)) * ${BUMP[kind].toFixed(2)}, faceDirection);`);
  };
  mat.customProgramCacheKey = () => (key ? key.call(mat) : '') + 'real' + kind;
  mat.needsUpdate = true;
  return mat;
}

// ---------------------------------------------------------------- post-processing shaders
const FS_HEAD = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FogShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, projInv: { value: null }, camWorld: { value: null }, camPos: { value: null },
    fogColor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() }, density: { value: .004 }, falloff: { value: .07 }, baseH: { value: 0 } },
  vertexShader: FS_HEAD,
  fragmentShader: `uniform sampler2D tDiffuse, tDepth; uniform mat4 projInv, camWorld; uniform vec3 camPos, fogColor, sunDir, sunColor; uniform float density, falloff, baseH; varying vec2 vUv;
  void main() { vec4 c = texture2D(tDiffuse, vUv); float d = texture2D(tDepth, vUv).x;
    if (d >= 0.99999) { gl_FragColor = c; return; }
    vec4 v = projInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w; vec3 wp = (camWorld * vec4(v.xyz, 1.0)).xyz;
    vec3 ray = wp - camPos; float dist = length(ray); if (dist > 1200.0) { gl_FragColor = c; return; }
    vec3 rd = ray / dist; float k = falloff, ry = rd.y;
    // the mist starts 30 m out so the foreground stays crisp; the remaining path is integrated through exponential height fog
    float s0 = min(dist, 30.0), seg = dist - s0; float y0 = camPos.y + ry * s0 - baseH;
    float amt = density * exp(-y0 * k) * (abs(ry) > 1e-4 ? (1.0 - exp(-ry * seg * k)) / (ry * k) : seg);
    float f = clamp(1.0 - exp(-max(amt, 0.0)), 0.0, 0.55);
    vec3 fc = fogColor * 0.7 + sunColor * pow(max(dot(rd, sunDir), 0.0), 8.0) * 0.35;
    gl_FragColor = vec4(mix(c.rgb, fc, f), c.a); }`,
};
const DofShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, near: { value: .1 }, far: { value: 3000 }, focus: { value: 10 }, range: { value: 4 }, maxBlur: { value: 8 }, texel: { value: new THREE.Vector2() } },
  vertexShader: FS_HEAD,
  fragmentShader: `uniform sampler2D tDiffuse, tDepth; uniform float near, far, focus, range, maxBlur; uniform vec2 texel; varying vec2 vUv;
  float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
  float cocAt(float z) { return clamp(abs(z - focus) / range - 0.15, 0.0, 1.0) * maxBlur; }
  void main() { float z = lin(texture2D(tDepth, vUv).x), coc = cocAt(z);
    if (coc < 0.5) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
    vec4 acc = vec4(0.0); float ws = 0.0;
    for (int i = 0; i < 24; i++) { float a = float(i) * 2.39996, r = sqrt((float(i) + 0.5) / 24.0); vec2 o = vec2(cos(a), sin(a)) * r * coc * texel;
      float zs = lin(texture2D(tDepth, vUv + o).x), w = zs < z ? clamp(cocAt(zs) / coc, 0.0, 1.0) : 1.0;
      acc += texture2D(tDiffuse, vUv + o) * w; ws += w; }
    gl_FragColor = acc / max(ws, 0.001); }`,
};
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, sat: { value: 1.14 }, contrast: { value: 1.1 }, vig: { value: .85 }, grain: { value: .022 },
    shadowTint: { value: new THREE.Vector3(-.012, .002, .02) }, highTint: { value: new THREE.Vector3(.022, .01, -.012) } },
  vertexShader: FS_HEAD,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, sat, contrast, vig, grain; uniform vec3 shadowTint, highTint; varying vec2 vUv;
  void main() { vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb; float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, sat); col = (col - 0.5) * contrast + 0.5;
    col += shadowTint * (1.0 - smoothstep(0.0, 0.5, l)) + highTint * smoothstep(0.5, 1.0, l);
    vec2 d = vUv - 0.5; col *= 1.0 - dot(d, d) * vig;
    float n = fract(sin(dot(vUv * vec2(12.9898, 78.233) + fract(uTime), vec2(1.0, 1.7))) * 43758.5453); col += (n - 0.5) * grain;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a); }`,
};

// ---------------------------------------------------------------- animation layer (foot IK, momentum, breathing, gaze, footprints)
const POSE = ['hips', 'spine', 'chest', 'neck', 'head', 'uArmL', 'uArmR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const FL = new THREE.Vector3(), FR = new THREE.Vector3(), HL = new THREE.Vector3(), HR = new THREE.Vector3();
class AnimFX {
  constructor(scene, view) {
    this.view = view; this.t = 0; this.dry = true; this.snow = 0;
    const g = new THREE.CircleGeometry(.07, 10).rotateX(-Math.PI / 2).scale(1, 1, 1.75);
    this.pmax = 900; this.prints = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: false }), this.pmax);
    this.prints.count = 0; this.prints.frustumCulled = false; this.prints.renderOrder = 2; this.pAge = new Float32Array(this.pmax).fill(99); this.pNext = 0; this.pCol = new THREE.Color();
    for (let i = 0; i < this.pmax; i++) { this.prints.setMatrixAt(i, M4.makeScale(0, 0, 0)); this.prints.setColorAt(i, this.pCol.setRGB(1, 1, 1)); }
    scene.add(this.prints);
  }
  pre(v) { if (v.rb) for (const [o, q, p] of v.rb) { o.quaternion.copy(q); o.position.copy(p); } }
  restoreAll() { for (const v of this.view.views.values()) if (v.rb) { this.pre(v); v.rb = null; } }
  save(v) { const j = v.rig.j; if (!v.rb) v.rb = POSE.filter(n => j[n]).map(n => [j[n], new THREE.Quaternion(), new THREE.Vector3()]); for (const e of v.rb) { e[1].copy(e[0].quaternion); e[2].copy(e[0].position); } }
  body(e, v, dt, cav) {
    const r = v.root; if (!r.visible || !v.rig || v.dead) return;
    const dcam = r.position.distanceTo(this.view.camPos || r.position); if (dcam > 95) return;
    const j = v.rig.j; this.save(v);
    // momentum: lean into speed and acceleration, bank into turns
    if (dt > 0) { const lp = v.lp || (v.lp = { x: r.position.x, z: r.position.z, yaw: v.yaw, sp: 0 });
      const sp = Math.hypot(r.position.x - lp.x, r.position.z - lp.z) / dt, acc = (sp - lp.sp) / dt, yr = angDiff(lp.yaw, v.yaw) / dt;
      const lean = clamp(sp * .028, 0, .13) + clamp(acc * .008, -.05, .07), bank = clamp(-yr * .05, -.13, .13) * Math.min(1, sp / 2);
      v.lean = lerp(v.lean || 0, lean, Math.min(1, dt * 6)); v.bank = lerp(v.bank || 0, bank, Math.min(1, dt * 6));
      lp.x = r.position.x; lp.z = r.position.z; lp.yaw = v.yaw; lp.sp = lerp(lp.sp, sp, Math.min(1, dt * 10)); }
    j.spine.rotation.x += (v.lean || 0) * (cav ? .5 : 1); j.spine.rotation.z += v.bank || 0;
    // breathing
    const ph = this.t * 1.55 + (e.id || 0) * 1.7, br = Math.sin(ph) * (v.lean > .05 ? .012 : .022);
    j.chest.rotation.x -= br; j.uArmL.rotation.z += br * .5; j.uArmR.rotation.z -= br * .5;
    // gaze: look at the current target, otherwise glance around now and then
    let want; const tg = e.tgt;
    if (tg && !tg.dead && tg.x != null) want = angDiff(v.yaw, Math.atan2(tg.x - e.x, tg.y - e.y));
    else { if ((v.glT = (v.glT ?? Math.random() * 3) - dt) <= 0) { v.glT = 2 + Math.random() * 4; v.glA = Math.random() < .35 ? 0 : (Math.random() - .5) * (e.mv ? .5 : 1.3); } want = v.glA || 0; }
    v.look = lerp(v.look || 0, clamp(want, -1.1, 1.1), Math.min(1, dt * 5)); j.head.rotation.y += v.look * .62; if (j.neck) j.neck.rotation.y += v.look * .3;
    if (cav) return;
    // foot IK: plant each foot on the slope under it, drop the hips for the lower foot, bend the higher leg
    r.updateMatrixWorld(true);
    j.footL.getWorldPosition(FL); j.footR.getWorldPosition(FR); j.thighL.getWorldPosition(HL); j.thighR.getWorldPosition(HR);
    const g0 = r.position.y, gL = height(FL.x / S, FL.z / S), gR = height(FR.x / S, FR.z / S);
    const w = 1 - clamp((Math.min(FL.y, FR.y) - g0 - .2) / .3, 0, 1);
    const k = Math.min(1, dt * 14 || 1); v.ikL = lerp(v.ikL || 0, clamp(gL - g0, -.5, .5), k); v.ikR = lerp(v.ikR || 0, clamp(gR - g0, -.5, .5), k);
    const drop = Math.max(0, -Math.min(v.ikL, v.ikR)) * w, sc = r.scale.y || 1;
    if (drop > .002) j.hips.position.y -= drop / sc;
    for (const [th, sh, ft, H, F, d] of [[j.thighL, j.shinL, j.footL, HL, FL, v.ikL], [j.thighR, j.shinR, j.footR, HR, FR, v.ikR]]) {
      const lift = (d + drop) * w; if (lift < .005) continue;
      const h = Math.max(.25, H.y - F.y), a = Math.acos(clamp((h - lift) / h, .35, 1));
      th.rotation.x -= a; sh.rotation.x += a * 2; ft.rotation.x -= a; }
    // footprints and dust on heel strike (walk clip: left foot lands at phase 0, right at .5)
    const wa = v.actions.walk;
    if (wa && v.cur.r === wa && dt > 0 && dcam < 75) { const dur = wa.getClip().duration, p = (wa.time % dur) / dur, pp = v.fph ?? p;
      if (p < pp) this.step(FL, v.yaw); else if (pp < .5 && p >= .5) this.step(FR, v.yaw); v.fph = p; }
  }
  step(F, yaw) {
    const g = height(F.x / S, F.z / S); if (g < WATER_Y + .05) return; const i = this.pNext; this.pNext = (i + 1) % this.pmax;
    this.prints.setMatrixAt(i, M4.compose(V1.set(F.x, g + .03, F.z), Q.setFromAxisAngle(UP, yaw), V2.set(1, 1, 1))); this.pAge[i] = 0;
    this.prints.count = Math.max(this.prints.count, i + 1); this.prints.instanceMatrix.needsUpdate = true;
    if (this.dry && Math.random() < .4) this.view.fx.emit('dust', F.x, g + .05, F.z, 1);
  }
  onHit(e, src, v, melee) {
    if (e.k !== 'u' || !src || src.x == null) return; const dx = e.x - src.x, dy = e.y - src.y, l = Math.hypot(dx, dy) || 1;
    v.kd = [dx / l, dy / l]; if (melee && v.root) { v.root.position.x += dx / l * .16; v.root.position.z += dy / l * .16; }
  }
  dying(v, dt) {
    if (!v.kd || v.t > 1.2) return; const sp = 2.6 * Math.exp(-v.t * 4.5) * (v.e.boss ? .6 : 1), r = v.root.position;
    r.x += v.kd[0] * sp * dt; r.z += v.kd[1] * sp * dt; r.y = height(r.x / S, r.z / S);
    if (!v.thud && v.t > .55) { v.thud = true; if (this.dry) this.view.fx.emit('dust', r.x, r.y + .15, r.z, 5); }
  }
  update(dt, t, wet, snow) {
    this.t = t; this.dry = wet < .15 && snow < .3; this.snow = snow;
    const life = 26, dark = snow > .5 ? [.78, .8, .86] : wet > .2 ? [.62, .58, .54] : [.76, .7, .64], c = this.pCol; let ch = false;
    for (let i = 0; i < this.prints.count; i++) { const a = this.pAge[i]; if (a > life) continue; this.pAge[i] = a + dt; const f = Math.min(1, a / life) ** .7;
      this.prints.setColorAt(i, c.setRGB(lerp(dark[0], 1, f), lerp(dark[1], 1, f), lerp(dark[2], 1, f))); ch = true; }
    if (ch) this.prints.instanceColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- the switch
export class Realism {
  constructor(game) {
    this.g = game; this.on = false; this.span = 55; this.frame = 0;
    const q = new URLSearchParams(location.search);
    this.tm = { aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping, agx: THREE.AgXToneMapping }[q.get('tm')] ?? THREE.AgXToneMapping;
    U.detail.value = detailTexture();
    realify(game.terrain.mesh.material, 'ground'); realify(bldMat, 'bld'); realify(game.view.treeMat, 'leaf');
    this.anim = new AnimFX(game.scene, game.view);
    this.scatter = this.buildScatter();
    this.water = this.buildWater();
    // extra scatter must clear under new buildings, like the classic grass
    const gr = game.terrain.grass, clear = gr.clearRect.bind(gr); gr.clearRect = b => { clear(b); this.clearRect(b); };
  }
  // ------------------------------------------------------------ post chain: Render, GTAO, Fog, DoF, Bloom, Output, SMAA, Grade
  setupPost(composer) {
    const g = this.g, cam = g.camera, pr = g.renderer.getPixelRatio();
    const gtao = this.gtao = new GTAOPass(g.scene, cam, innerWidth * pr, innerHeight * pr);
    gtao.updateGtaoMaterial({ radius: 2.6, distanceExponent: 1.4, thickness: 3, scale: 1.5, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
    gtao.blendIntensity = 1;
    const k = devicePixelRatio > 1.3 ? .5 : .75, ss = gtao.setSize.bind(gtao); gtao.setSize = (w, h) => ss(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))); gtao.setSize(innerWidth * pr, innerHeight * pr);
    const fog = this.fog = new ShaderPass(FogShader); Object.assign(fog.uniforms, { projInv: { value: cam.projectionMatrixInverse }, camWorld: { value: cam.matrixWorld }, camPos: { value: cam.position } });
    fog.uniforms.tDepth.value = gtao.depthTexture;
    const dof = this.dof = new ShaderPass(DofShader); dof.uniforms.tDepth.value = gtao.depthTexture;
    composer.insertPass(gtao, 1); composer.insertPass(fog, 2); composer.insertPass(dof, 3);
    this.smaa = new SMAAPass(innerWidth * pr, innerHeight * pr); composer.addPass(this.smaa);
    this.grade = new ShaderPass(GradeShader); composer.addPass(this.grade);
    this.composer = composer;
  }
  // ------------------------------------------------------------ lake with planar reflections
  buildWater() {
    const t = this.g.terrain, old = t.water;
    const w = new Water(new THREE.PlaneGeometry(LAKE.rx * 2.8 * S, LAKE.ry * 2.8 * S), { textureWidth: 512, textureHeight: 512, waterNormals: old.tex, sunDirection: new THREE.Vector3(0, 1, 0), sunColor: 0xffffff, waterColor: 0x1a3a4c, distortionScale: 1.4, fog: true, alpha: 1 });
    w.rotation.x = -Math.PI / 2; w.position.set(LAKE.x * S, WATER_Y, LAKE.y * S); w.visible = false; w.material.uniforms.size.value = 7;
    const m = w.material; m.uniforms.fowTex = shared.fowTex;
    m.fragmentShader = m.fragmentShader.replace('void main() {', 'uniform sampler2D fowTex;\nvoid main() {').replace('#include <fog_fragment>', `#include <fog_fragment>
      { vec2 fuv = vec2(worldPosition.x / ${(WW * S).toFixed(1)}, worldPosition.z / ${(WH * S).toFixed(1)});
        float ex = (fuv.x < 0.0 || fuv.y < 0.0 || fuv.x > 1.0 || fuv.y > 1.0) ? 1.0 : texture2D(fowTex, fuv).r;
        gl_FragColor.rgb *= mix(0.16, 1.0, smoothstep(0.05, 0.95, ex)); }`);
    // the mirror is rendered once per frame (the AO normal pass would otherwise trigger it a second time)
    const ob = w.onBeforeRender; w.onBeforeRender = (...a) => { if (w._f === this.frame) return; w._f = this.frame; ob.apply(w, a); };
    this.g.scene.add(w); return w;
  }
  // ------------------------------------------------------------ ground scatter
  buildScatter() {
    const rng = makeRng(31), g = this.g, list = [];
    const ok = (x, y, road = 22) => x > 4 && y > 4 && x < WW - 4 && y < WH - 4 && lakeE(x, y) > 1.15 && roadDist(x, y) > road && !BASES.some(([bx, by]) => Math.hypot(x - bx, y - by) < 95);
    const forestNear = (x, y) => { let best = 0; for (const [fx, fy, , fr] of FORESTS) best = Math.max(best, 1 - Math.hypot(x - fx, y - fy) / (fr * 1.4)); return best; };
    const add = (geo, mat, n, place, opts = {}) => {
      const im = new THREE.InstancedMesh(geo, mat, n), pts = [], c = new THREE.Color(); let k = 0;
      for (let tries = 0; k < n && tries < n * 8; tries++) { const x = rng() * WW, y = rng() * WH, r = place(x, y); if (!r) continue;
        const s = r.s, rot = rng() * 6.28; im.setMatrixAt(k, M4.compose(V1.set(x * S, height(x, y) + (r.dy || 0), y * S), Q.setFromAxisAngle(UP, rot), V2.set(s, s * (r.sy || 1), s)));
        if (r.c) im.setColorAt(k, c.setHSL(...r.c)); pts.push(x, y); k++; }
      im.count = k; im.castShadow = !!opts.cast; im.receiveShadow = true; im.computeBoundingSphere(); im.visible = false; g.scene.add(im);
      const e = { im, pts, k }; list.push(e); return e;
    };
    // denser, varied grass (shares the classic grass material: wind, seasons, fog of war)
    this.grass = add(grassGeo(), g.terrain.grass.mesh.material, 26000, (x, y) => ok(x, y, 20) && rng() < .35 + forestNear(x, y) * .4 && { s: .35 + rng() * .6, sy: .7 + rng() * .8, dy: -.02, c: [.19 + rng() * .08, .3 + rng() * .2, .25 + rng() * .14] });
    // pebbles along the road, the lake shore and the foothills
    this.pebbles = add(rockGeo(0), bldMat, 3000, (x, y) => { if (lakeE(x, y) < 1.04 || BASES.some(([bx, by]) => Math.hypot(x - bx, y - by) < 70)) return null; const rd = roadDist(x, y), le = lakeE(x, y);
      const p = (rd > 12 && rd < 45 ? .7 : 0) + (le > 1.05 && le < 1.5 ? .7 : 0) + .06; return rng() < p && { s: .05 + rng() * .16, sy: .6 + rng() * .6, dy: -.02 }; });
    // ferns and undergrowth at the forest edges
    this.ferns = add(bushGeo(), g.view.treeMat, 1100, (x, y) => ok(x, y) && rng() < forestNear(x, y) * 1.4 && { s: .25 + rng() * .35, sy: .6 + rng() * .5, dy: -.05 }, { cast: true });
    // wildflowers in the open meadows
    const fl = []; for (let i = 0; i < 3; i++) { const a = i * 2.1, r = .07; fl.push(piece(new THREE.CylinderGeometry(.006, .008, .3, 3), 0x4a6a30, { p: [Math.cos(a) * r, .15, Math.sin(a) * r] }), piece(new THREE.IcosahedronGeometry(.045, 0), 0xffffff, { p: [Math.cos(a) * r, .31, Math.sin(a) * r], s: [1, .55, 1] })); }
    const flMat = withFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }), { wind: 1.2 });
    const HUES = [[.0, .0, .95], [.13, .85, .62], [.75, .45, .62], [.95, .6, .7], [.58, .5, .62]];
    this.flowers = add(merge(fl), flMat, 3500, (x, y) => ok(x, y) && forestNear(x, y) < .3 && rng() < .45 && { s: .8 + rng() * .6, dy: -.02, c: HUES[Math.floor(rng() * HUES.length)] });
    // leaf litter under and around the woods
    const lit = merge([piece(new THREE.CircleGeometry(.08, 5).rotateX(-Math.PI / 2), 0xffffff, { p: [0, .02, 0] })]);
    this.litter = add(lit, withFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, side: THREE.DoubleSide }), { ground: true }), 3500,
      (x, y) => ok(x, y, 14) && rng() < forestNear(x, y) * 1.6 && { s: .7 + rng() * .9, dy: .01, c: [.05 + rng() * .07, .45 + rng() * .25, .2 + rng() * .14] });
    this.scatterList = list; return list;
  }
  clearRect(b) { const zero = M4.makeScale(0, 0, 0); for (const { im, pts, k } of this.scatterList) { let ch = false;
    for (let i = 0; i < k; i++) { const x = pts[i * 2], y = pts[i * 2 + 1]; if (Math.abs(x - b.x) < b.w / 2 + 6 && Math.abs(y - b.y) < b.h / 2 + 6) { im.setMatrixAt(i, zero); ch = true; } }
    if (ch) im.instanceMatrix.needsUpdate = true; } }
  // ------------------------------------------------------------ on / off
  set(on) {
    const g = this.g; this.on = on; U.real.value = on ? 1 : 0;
    for (const p of [this.gtao, this.fog, this.smaa, this.grade]) if (p) p.enabled = on; if (this.dof) this.dof.enabled = false;
    this.water.visible = on; g.terrain.water.mesh.visible = !on;
    for (const e of this.scatterList) e.im.visible = on;
    this.anim.prints.visible = on; if (!on) this.anim.restoreAll(); g.view.real = on ? this.anim : null;
    if (!on) g.renderer.toneMapping = THREE.ACESFilmicToneMapping; g.atmo.envBoost = on ? 1.3 : 1; g.atmo.envT = 0;
    if (!on) { const sc = g.atmo.sun.shadow; this.span = 55; Object.assign(sc.camera, { left: -55, right: 55, top: 55, bottom: -55 }); sc.camera.updateProjectionMatrix(); }
    this.fixShadowSize();
    try { localStorage.setItem('aos3d_real', on ? '1' : '0'); } catch (e) {}
    const b = document.getElementById('btn-real'); if (b) { b.textContent = on ? 'Realistic' : 'Classic'; b.classList.toggle('on', on); }
    return on;
  }
  fixShadowSize() { const sc = this.g.atmo.sun.shadow, want = this.on ? 4096 : this.g.quality ? 2048 : 1024; if (sc.mapSize.x !== want) { sc.mapSize.set(want, want); sc.map?.dispose(); sc.map = null; } }
  // ------------------------------------------------------------ per frame, after the sky has placed the sun
  update(dt) {
    this.frame++; if (!this.on) return;
    const g = this.g, a = g.atmo, w = g.world, sun = a.sun, sc = sun.shadow, snow = shared.snow.value / .95;
    this.fixShadowSize();
    // exposure: AgX reads darker than ACES at the same setting
    g.renderer.toneMapping = this.tm;
    g.renderer.toneMappingExposure *= this.tm === THREE.AgXToneMapping ? 1.3 : this.tm === THREE.NeutralToneMapping ? 1.1 : 1;
    // shadow frustum follows zoom, then snaps to whole texels in light space so edges do not crawl while panning
    const span = g.director.active ? 55 : clamp(g.cam.dist * .8, 28, 110);
    if (Math.abs(span - this.span) > .25) { this.span = span; Object.assign(sc.camera, { left: -span, right: span, top: span, bottom: -span }); sc.camera.updateProjectionMatrix(); }
    const z = V1.subVectors(sun.position, sun.target.position).normalize(), x = V2.crossVectors(UP, z).normalize(), y = V3.crossVectors(z, x), tex = this.span * 2 / sc.mapSize.x, tp = sun.target.position;
    const da = tp.dot(x) % tex, db = tp.dot(y) % tex; V4.copy(x).multiplyScalar(-da).addScaledVector(y, -db); tp.add(V4); sun.position.add(V4);
    // wet surfaces
    U.wet.value = lerp(U.wet.value, snow > .5 ? 0 : clamp(w.wet * 1.3, 0, 1), Math.min(1, dt * .5));
    // height fog: thicker at dawn, dusk, night and in rain
    const f = this.fog.uniforms, el = a.sunDir.y, dusk = clamp(1 - Math.abs(el) * 4, 0, 1);
    f.fogColor.value.copy(g.scene.fog.color); f.sunDir.value.copy(a.sunDir); f.sunColor.value.copy(sun.color).multiplyScalar(el > -.05 ? .5 * (1 - w.wet) : 0);
    f.density.value = .0016 * (1 + dusk * 1.8 + a.night * 1.2 + w.wet * 2.2); f.falloff.value = .06; f.baseH.value = 0;
    // depth of field only in the battle cam, focused on the duel
    const d = this.dof; d.enabled = g.director.active;
    if (d.enabled) { const u = d.uniforms, c = g.director.center; u.near.value = g.camera.near; u.far.value = g.camera.far;
      u.focus.value = g.camera.position.distanceTo(V1.set(c.x, height(c.x / S, c.z / S) + 1.1, c.z)); u.range.value = 3 + u.focus.value * .25;
      const pr = g.renderer.getPixelRatio(); u.texel.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr)); u.maxBlur.value = 7 * pr; }
    this.grade.uniforms.uTime.value = performance.now() / 1000;
    // lake follows the sun
    const wu = this.water.material.uniforms; wu.time.value += dt * .5; wu.sunDirection.value.copy(z); wu.sunColor.value.copy(sun.color).multiplyScalar(sun.intensity / 3.2);
    // scatter follows the seasons
    this.grass.im.visible = g.terrain.grass.mesh.visible; this.flowers.im.visible = snow < .4 && shared.autumn.value < .5;
    this.anim.update(dt, performance.now() / 1000, w.wet, snow);
  }
}
