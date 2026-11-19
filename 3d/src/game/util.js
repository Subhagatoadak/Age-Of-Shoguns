export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const fmt = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
export const costStr = c => Object.entries(c).map(([k, v]) => v + ' ' + k).join(', ');
export function rectDist(b, x, y) {
  const dx = Math.max(b.x - b.w / 2 - x, 0, x - (b.x + b.w / 2)), dy = Math.max(b.y - b.h / 2 - y, 0, y - (b.y + b.h / 2));
  return Math.hypot(dx, dy);
}
// deterministic RNG so the map is the same every game
export function makeRng(seed) { let s = seed; const r = () => (s = (s * 16807) % 2147483647, (s - 1) / 2147483646); r.range = (a, b) => a + r() * (b - a); return r; }

// 2D simplex noise (Stefan Gustavson, public domain), seeded
export function makeNoise(seed = 1) {
  const rng = makeRng(seed), p = new Uint8Array(512), perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]], F2 = .5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  const n2 = (x, y) => {
    const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * G2, x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1, x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2, ii = i & 255, jj = j & 255;
    const c = (gx, gy, xx, yy) => { let tt = .5 - xx * xx - yy * yy; if (tt < 0) return 0; tt *= tt; const g = G[gx % 8]; return tt * tt * (g[0] * xx + g[1] * yy); };
    return 70 * (c(p[ii + p[jj]], 0, x0, y0) + c(p[ii + i1 + p[jj + j1]], 0, x1, y1) + c(p[ii + 1 + p[jj + 1]], 0, x2, y2));
  };
  n2.fbm = (x, y, oct = 4) => { let a = 0, amp = .5, f = 1; for (let o = 0; o < oct; o++) { a += amp * n2(x * f, y * f); f *= 2; amp *= .5; } return a; };
  return n2;
}
