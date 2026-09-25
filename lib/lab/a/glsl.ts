import { MODEL, SALT } from './mc'

/**
 * The generator and the step, in GLSL. The same arithmetic as ./mc.ts, line
 * for line: pcg4d on (id, group, seed, salt), the top 23 bits as a uniform,
 * Box–Muller on both branches. tests/lab-a.test.ts checks the constants here
 * against the CPU mirror.
 */
export const RNG = `
const uint SEED = ${MODEL.seed}u;
const uint SALT = ${SALT}u;
uvec4 pcg4d(uvec4 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  v ^= v >> 16u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  return v;
}
float unit(uint h) { return (float(h >> 9u) + 0.5) * (1.0 / 8388608.0); }
vec4 normals4(uint id, uint g) {
  uvec4 h = pcg4d(uvec4(id, g, SEED, SALT));
  float r0 = sqrt(-2.0 * log(unit(h.x)));
  float t0 = 6.283185307179586 * unit(h.y);
  float r1 = sqrt(-2.0 * log(unit(h.z)));
  float t1 = 6.283185307179586 * unit(h.w);
  return vec4(r0 * cos(t0), r0 * sin(t0), r1 * cos(t1), r1 * sin(t1));
}
`
