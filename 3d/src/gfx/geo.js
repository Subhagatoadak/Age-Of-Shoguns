import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WW, WH, S } from '../game/data.js';

const C = new THREE.Color(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), SC = new THREE.Vector3();

// one coloured primitive, baked to vertex colours so whole models merge into a single draw call.
// opts.ao darkens toward the bottom of the piece (cheap baked ambient occlusion); opts.jit adds colour noise.
export function piece(geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], ao = 0, jit = 0, sn = false } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  g.applyMatrix4(M4.compose(V.set(...p), Q.setFromEuler(E.set(...r)), SC.set(...s)));
  C.set(color);
  const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3);
  let y0 = Infinity, y1 = -Infinity; if (ao) for (let i = 0; i < n; i++) { const y = pos.getY(i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let i = 0; i < n; i += 3) {             // per-triangle jitter keeps faces crisp
    const j = jit ? 1 + (Math.random() - .5) * jit : 1;
    for (let k = i; k < i + 3 && k < n; k++) {
      const a = ao ? 1 - ao * (1 - (pos.getY(k) - y0) / (y1 - y0 || 1)) : 1;
      col[k * 3] = C.r * j * a; col[k * 3 + 1] = C.g * j * a; col[k * 3 + 2] = C.b * j * a;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (sn) { const nn = g.attributes.normal; for (let i = 0; i < n; i++) { V.set(pos.getX(i) - p[0], (pos.getY(i) - p[1]) * 1.6, pos.getZ(i) - p[2]).normalize(); nn.setXYZ(i, V.x, V.y, V.z); } }  // soft foliage lighting
  return g;
}
export const merge = parts => { const g = mergeGeometries(parts.filter(Boolean), false); g.computeBoundingSphere(); return g; };

// ---------------------------------------------------------------- shared shader hooks
export const shared = { time: { value: 0 }, fowTex: { value: null }, wind: { value: 1 }, snow: { value: 0 }, autumn: { value: 0 }, terTex: { value: null } };
// darken anything standing in unexplored land (fog of war); scenery outside the playable map stays lit
// ground: autumn turns greens golden; border: draw national borders (terrain only); snow settles on upward faces everywhere
export function withFog(mat, { wind = 0, ground = false, border = false } = {}) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.fowTex = shared.fowTex; sh.uniforms.uTime = shared.time; sh.uniforms.uWind = shared.wind; sh.uniforms.uSnow = shared.snow; sh.uniforms.uAutumn = shared.autumn; sh.uniforms.terTex = shared.terTex;
    sh.vertexShader = 'varying vec3 vFowPos;\nvarying vec3 vFowN;\nuniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      ${wind === 'flag' ? `{ float fx = max(position.x, 0.0); float ph = uTime * 5.0 + fx * 4.0 + modelMatrix[3][0] * 0.37 + modelMatrix[3][2] * 0.23;
        transformed.z += sin(ph) * fx * 0.16 * (0.6 + 0.4 * uWind); transformed.y += sin(ph * 0.7) * fx * 0.03; }` : wind ? `{ vec4 ip = vec4(0.0,0.0,0.0,1.0);
        #ifdef USE_INSTANCING
          ip = instanceMatrix * ip;
        #endif
        float h = max(position.y, 0.0) * ${wind.toFixed(3)};
        float ph = uTime * 1.7 + ip.x * 0.21 + ip.z * 0.17;
        transformed.x += sin(ph) * h * h * 0.05 * uWind + sin(ph * 2.7) * h * 0.012 * uWind;
        transformed.z += cos(ph * 0.8) * h * h * 0.03 * uWind; }` : ''}
      ${wind === 'flag' ? '' : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        vFowPos = (modelMatrix * wp).xyz;
        vec3 wn = objectNormal;
        #ifdef USE_INSTANCING
          wn = mat3(instanceMatrix) * wn;
        #endif
        vFowN = normalize(mat3(modelMatrix) * wn); }`);
    sh.fragmentShader = 'varying vec3 vFowPos;\nvarying vec3 vFowN;\nuniform float uTime;\nuniform sampler2D fowTex;\nuniform sampler2D terTex;\nuniform float uSnow;\nuniform float uAutumn;\nfloat fowHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat fowNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(fowHash(i), fowHash(i + vec2(1., 0.)), f.x), mix(fowHash(i + vec2(0., 1.)), fowHash(i + vec2(1., 1.)), f.x), f.y); }\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 dc = diffuseColor.rgb;
        ${ground ? `float green = clamp((dc.g - max(dc.r, dc.b)) * 6.0, 0.0, 1.0); dc = mix(dc, vec3(dc.g * 1.05, dc.g * .78, dc.b * .45), green * uAutumn);` : ''}
        float up = clamp(normalize(vFowN).y, 0.0, 1.0), n = fowNoise(vFowPos.xz * .9) * .2 + fowNoise(vFowPos.xz * .12) * .45;
        float snow = uSnow * smoothstep(.45, .8, up) * smoothstep(.15, .55, uSnow * 1.1 + n - .3);
        dc = mix(dc, vec3(.9, .93, .97), clamp(snow, 0.0, 1.0)); diffuseColor.rgb = dc; }`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
      ${border ? `{ vec2 tuv = vec2(vFowPos.x / ${(WW * S).toFixed(1)}, vFowPos.z / ${(WH * S).toFixed(1)});
        if (tuv.x > 0.0 && tuv.y > 0.0 && tuv.x < 1.0 && tuv.y < 1.0) {
          vec2 px = vec2(1.0 / 150.0, 1.0 / 100.0); float c = texture2D(terTex, tuv).r;
          float e = 0.0; for (int i = 0; i < 4; i++) { vec2 o = i == 0 ? vec2(px.x, 0.) : i == 1 ? vec2(-px.x, 0.) : i == 2 ? vec2(0., px.y) : vec2(0., -px.y); e = max(e, abs(texture2D(terTex, tuv + o * .7).r - c)); }
          float own = c > .75 ? 2.0 : c > .25 ? 1.0 : 0.0, nb = 0.0; for (int i = 0; i < 4; i++) { vec2 o = i == 0 ? vec2(px.x, 0.) : i == 1 ? vec2(-px.x, 0.) : i == 2 ? vec2(0., px.y) : vec2(0., -px.y); nb = max(nb, texture2D(terTex, tuv + o * .7).r); }
          float side = own > 0.0 ? own : (nb > .75 ? 2.0 : 1.0); vec3 tc = side > 1.5 ? vec3(1., .32, .22) : vec3(.35, .62, 1.);
          float line = smoothstep(.05, .5, e) * (.55 + .45 * sin(uTime * 2.0 + vFowPos.x * .4 + vFowPos.z * .4));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, tc, line * .55) + tc * (own > 0.0 ? .025 : 0.0); } }` : ''}
      { vec2 fuv = vec2(vFowPos.x / ${(WW * S).toFixed(1)}, vFowPos.z / ${(WH * S).toFixed(1)});
        float ex = (fuv.x < 0.0 || fuv.y < 0.0 || fuv.x > 1.0 || fuv.y > 1.0) ? 1.0 : texture2D(fowTex, fuv).r;
        gl_FragColor.rgb *= mix(0.16, 1.0, smoothstep(0.05, 0.95, ex)); }`);
  };
  mat.customProgramCacheKey = () => 'fow' + wind + ground + border;
  return mat;
}
export const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: .04 });
export const bldMat = withFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86, metalness: .02, side: THREE.DoubleSide }));
export const glowMat = withFog(new THREE.MeshStandardMaterial({ color: 0x15100a, emissive: 0xffa040, emissiveIntensity: 0, roughness: 1 }));

// ---------------------------------------------------------------- Japanese hip roof with concave slopes and upturned eaves
export function roofGeo(w, d, h, over = .6, lift = .35, seg = 16) {
  const W = w / 2 + over, Dd = d / 2 + over, ridge = Math.max(0, (w - d) / 2);
  const g = new THREE.PlaneGeometry(2, 2, seg, seg), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getY(i), x = u * W, z = v * Dd;
    const mx = Math.max(0, Math.abs(x) - ridge) / (W - ridge), mz = Math.abs(z) / Dd, m = Math.min(1, Math.max(mx, mz));
    const corner = Math.pow(Math.min(mx, mz), 3) * Math.pow(m, 6);
    p.setXYZ(i, x, h * Math.pow(1 - m, 1.45) + lift * corner, z);
  }
  g.rotateX(0);  // plane is in XY: we wrote x,z into x,z and y as height directly
  g.computeVertexNormals();
  // make the roof face up (normals from plane winding point toward -z after remap): flip if needed
  const n = g.attributes.normal; let up = 0; for (let i = 0; i < n.count; i++) up += n.getY(i); if (up < 0) { g.index.array.reverse(); g.computeVertexNormals(); }
  return g;
}
