// Sun, moon, sky dome, atmospheric fog, image-based lighting and rain.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { DAY } from '../game/data.js';
import { clamp, lerp } from '../game/util.js';

export class Atmosphere {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene;
    this.sky = new Sky(); this.sky.scale.setScalar(4000); scene.add(this.sky);
    const u = this.sky.material.uniforms; u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = .004; u.mieDirectionalG.value = .82;
    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.2); this.sun.castShadow = true;
    const sc = this.sun.shadow; sc.mapSize.set(2048, 2048); sc.camera.near = 1; sc.camera.far = 400; sc.bias = -.0004; sc.normalBias = .04;
    this.shadowSpan = 55; Object.assign(sc.camera, { left: -55, right: 55, top: 55, bottom: -55 });
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a5236, 1.1); scene.add(this.hemi);
    scene.fog = new THREE.Fog(0xb8c8d8, 180, 700);
    this.pmrem = new THREE.PMREMGenerator(renderer); this.envT = 0; this.skyScene = new THREE.Scene(); this.skyClone = new Sky(); this.skyClone.scale.setScalar(1000); this.skyScene.add(this.skyClone);
    this.night = 0; this.sunDir = new THREE.Vector3();
    this.rain = this.makeRain(scene);
    this.nightDome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, fog: false, uniforms: { opacity: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform float opacity; varying vec3 vP; void main(){ float h = clamp(vP.y, 0., 1.); vec3 c = mix(vec3(.16,.22,.38), vec3(.03,.05,.13), pow(h, .5)); gl_FragColor = vec4(c, opacity); }' }));
    Object.defineProperty(this.nightDome.material, 'opacity', { get() { return this.uniforms.opacity.value; }, set(v) { if (this.uniforms) this.uniforms.opacity.value = v; } });
    this.nightDome.renderOrder = -1; scene.add(this.nightDome);
    const sp = new Float32Array(2400 * 3); for (let i = 0; i < 2400; i++) { const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y) * .9 + .1; v.normalize().multiplyScalar(1400); sp.set([v.x, v.y, v.z], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xe8eeff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })); scene.add(this.stars);
  }
  makeRain(scene) {
    const N = 5000, g = new THREE.BufferGeometry(), p = new Float32Array(N * 6);
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d8f0, transparent: true, opacity: .35, depthWrite: false }));
    m.frustumCulled = false; m.visible = false; scene.add(m);
    const seeds = Array.from({ length: N }, () => [Math.random() * 140 - 70, Math.random() * 60, Math.random() * 140 - 70]);
    return { m, p, seeds, N };
  }
  // t: game seconds; wet: 0..1 rain intensity; focus: camera target
  update(t, wet, focus, dt, snowy = 0) {
    const ph = (t % DAY) / DAY, a = ph * Math.PI * 2 + .45;             // game starts mid-morning
    const el = Math.sin(a), az = a * .6 + .8;
    this.sunDir.set(Math.cos(az) * Math.cos(Math.asin(el) * .9), el, Math.sin(az) * .6 + .35).normalize();
    const day = clamp(el * 3 + .25, 0, 1), dusk = clamp(1 - Math.abs(el) * 4, 0, 1) * (el > -.15 ? 1 : 0);
    this.night = 1 - day;
    const u = this.sky.material.uniforms; u.sunPosition.value.copy(this.sunDir); u.rayleigh.value = lerp(1.6, 3.2, dusk) * (1 - wet * .5); u.turbidity.value = 6 + wet * 10;
    // light follows the sun by day and a cold moon by night
    const lightDir = el > -.05 ? this.sunDir : this.sunDir.clone().multiplyScalar(-1).setY(.6).normalize();
    this.sun.position.copy(focus).addScaledVector(lightDir, 160); this.sun.target.position.copy(focus);
    // night is moonlit, not black: a bright cool moon plus blue ambient keeps the valley readable
    this.sun.color.setHSL(lerp(.6, .08, day) + dusk * -.02, lerp(.35, .55, dusk), lerp(.78, .82, day));
    this.sun.intensity = (lerp(1.5, 3.2, day) - dusk * .8) * (1 - wet * .5);
    this.hemi.intensity = lerp(.95, 1.05, day) * (1 - wet * .2);
    this.hemi.color.setHSL(lerp(.62, .58, day), lerp(.45, .5, day), lerp(.6, .78, day)); this.hemi.groundColor.setHSL(lerp(.62, .12, day), .25, lerp(.2, .3, day));
    const fogC = new THREE.Color().setHSL(lerp(.62, .57, day) - dusk * .5, lerp(.4, .3, day) + dusk * .2, lerp(.2, .74, day) - wet * .15 + dusk * .05);
    this.scene.fog.color.copy(fogC); this.scene.fog.near = lerp(180, 60, wet); this.scene.fog.far = lerp(700, 300, wet);
    this.renderer.toneMappingExposure = lerp(.78, .62, day) * (1 - wet * .15) + .05;
    // starry deep-blue sky replaces the near-black scattering dome at night
    this.stars.material.opacity = clamp((this.night - .35) * 1.6, 0, 1); this.stars.position.copy(focus);
    this.nightDome.material.opacity = clamp((this.night - .2) * 1.3, 0, .92); this.nightDome.position.copy(focus);
    this.sky.visible = true;
    // refresh image-based lighting now and then (reflections on water, metal and lacquer)
    if ((this.envT -= dt) <= 0) { this.envT = 4; const cu = this.skyClone.material.uniforms; for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) cu[k].value = u[k].value; cu.sunPosition.value.copy(this.sunDir);
      const rt = this.pmrem.fromScene(this.skyScene, 0, .1, 1000); if (this.envRT) this.envRT.dispose(); this.envRT = rt; this.scene.environment = rt.texture; this.scene.environmentIntensity = lerp(.4, .55, day) * (this.envBoost || 1); }
    // rain streaks around the camera focus
    // winter turns rain into slow drifting snow
    const r = this.rain, snow = snowy > .5; r.m.visible = wet > .05; r.m.material.opacity = (snow ? .9 : .35) * wet; r.m.material.color.set(snow ? 0xffffff : 0xc8d8f0);
    if (r.m.visible) { const fall = t * (snow ? 3.2 : 38), len = snow ? .07 : 1.1;
      for (let i = 0; i < r.N; i++) { const [sx, sy, sz] = r.seeds[i], y = 60 - ((sy + fall) % 60), x = focus.x + sx - y * .15, z = focus.z + sz, o = i * 6;
        const sw = snow ? Math.sin(t * 1.3 + i) * .6 : 0; r.p[o] = x + sw; r.p[o + 1] = y; r.p[o + 2] = z; r.p[o + 3] = x + sw + (snow ? .05 : .12); r.p[o + 4] = y + len; r.p[o + 5] = z + (snow ? .05 : 0); }
      r.m.geometry.attributes.position.needsUpdate = true; }
  }
}
