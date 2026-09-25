/**
 * The surface's shaders. The vertex shader evaluates SSVI itself from the
 * current parameters — nine evaluations per vertex, for the position, a
 * finite-difference normal and a curvature term — so the breathing is the
 * formula on every frame, not a mesh interpolated between key frames.
 */

const SSVI = `
uniform vec4 uP;   // s0, s1, kappa, rho
uniform vec2 uQ;   // eta, gamma
uniform vec4 uDom; // kMin, kMax, sqrt(tMin), sqrt(tMax)
uniform vec3 uW;   // half-width, half-depth, height
uniform vec2 uV;   // vol at floor, vol at height
float theta(float T) {
  float a = uP.x * uP.x, b = uP.y * uP.y;
  return b * T + (a - b) * (1.0 - exp(-uP.z * T)) / uP.z;
}
float ivAt(vec2 uv) {
  float k = mix(uDom.x, uDom.y, uv.x);
  float s = max(mix(uDom.z, uDom.w, uv.y), 0.05);
  float T = s * s;
  float th = theta(T);
  float f = uQ.x / (pow(th, uQ.y) * pow(1.0 + th, 1.0 - uQ.y));
  float r = uP.w;
  float a = f * k + r;
  float w = 0.5 * th * (1.0 + r * f * k + sqrt(a * a + 1.0 - r * r));
  return sqrt(w / T);
}
float hOf(float v) { return (v - uV.x) / (uV.y - uV.x) * uW.z; }
vec3 worldAt(vec2 uv) { return vec3((uv.x * 2.0 - 1.0) * uW.x, hOf(ivAt(uv)), (uv.y * 2.0 - 1.0) * uW.y); }
`

/**
 * One vertex shader for the surface grid (uMode 0) and the four wall strips
 * (uMode 1), so there is one program to compile rather than two. LITE — the
 * software-rasteriser tier — takes a forward-difference normal (three
 * evaluations instead of nine) and no curvature term: a software JIT compiles
 * it in a fraction of the time.
 */
export const surfaceVS = (lite: boolean) => `#version 300 es
${lite ? '#define LITE' : ''}
precision highp float;
${SSVI}
uniform int uMode; uniform int uN; uniform int uEdge; uniform int uM;
uniform mat4 uMVP;
out vec3 vPos; out vec3 vN; out float vIv; out float vAO; out vec2 vUV;
void main() {
  vec2 uv; vec3 p; float v;
  if (uMode == 0) {
    int i = gl_VertexID % uN;
    int j = gl_VertexID / uN;
    uv = vec2(float(i), float(j)) / float(uN - 1);
    v = ivAt(uv);
    p = vec3((uv.x * 2.0 - 1.0) * uW.x, hOf(v), (uv.y * 2.0 - 1.0) * uW.y);
#ifdef LITE
    const float e = 0.006;
    vec3 dx = worldAt(uv + vec2(e, 0.0)) - p;
    vec3 dz = worldAt(uv + vec2(0.0, e)) - p;
    vAO = 0.0;
#else
    const float e = 0.004;
    vec3 dx = worldAt(uv + vec2(e, 0.0)) - worldAt(uv - vec2(e, 0.0));
    vec3 dz = worldAt(uv + vec2(0.0, e)) - worldAt(uv - vec2(0.0, e));
    const float E = 0.06;
    vAO = hOf(ivAt(uv + vec2(E, 0.0))) + hOf(ivAt(uv - vec2(E, 0.0))) + hOf(ivAt(uv + vec2(0.0, E))) + hOf(ivAt(uv - vec2(0.0, E))) - 4.0 * p.y;
#endif
    vN = normalize(cross(dz, dx));
    vIv = v;
  } else {
    int seg = gl_VertexID / 2;
    bool top = (gl_VertexID % 2) == 1;
    float s = float(seg) / float(uM);
    uv = uEdge == 0 ? vec2(s, 1.0) : uEdge == 1 ? vec2(1.0, 1.0 - s) : uEdge == 2 ? vec2(1.0 - s, 0.0) : vec2(0.0, s);
    v = ivAt(uv);
    p = vec3((uv.x * 2.0 - 1.0) * uW.x, top ? hOf(v) : 0.0, (uv.y * 2.0 - 1.0) * uW.y);
    vIv = top ? v : uV.x;
    vN = uEdge == 0 ? vec3(0.0, 0.0, 1.0) : uEdge == 1 ? vec3(1.0, 0.0, 0.0) : uEdge == 2 ? vec3(0.0, 0.0, -1.0) : vec3(-1.0, 0.0, 0.0);
    vAO = 0.0;
  }
  vUV = uv; vPos = p;
  gl_Position = uMVP * vec4(p, 1.0);
}`

/**
 * Colour by volatility on an oklab ramp of the site's tokens, iso-volatility
 * contours every five points (tens heavier), the reading point's smile and
 * term lines, then key + fill + ambient (darkened in concave valleys) and a
 * small specular, lit in linear light.
 */
export const surfaceFS = (lite: boolean) => `#version 300 es
${lite ? '#define LITE' : ''}
precision highp float;
in vec3 vPos; in vec3 vN; in float vIv; in float vAO; in vec2 vUV;
uniform vec3 uLo, uMid, uTop, uInk, uPaper; // oklab
uniform vec2 uRamp; uniform float uFlip;
uniform vec3 uKey, uFill, uLight; uniform float uUp;
uniform vec3 uEye; uniform float uSpec; uniform float uAOk;
uniform vec3 uProbe; // u, v, on
out vec4 o;
vec3 lin(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  float l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
             -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
             -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
vec3 srgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hair(float f, float w) {
  float d = abs(fract(f + 0.5) - 0.5) / max(fwidth(f), 1e-5);
  return 1.0 - clamp(d - w, 0.0, 1.0);
}
void main() {
  float t = clamp((vIv - uRamp.x) / (uRamp.y - uRamp.x), 0.0, 1.0);
  vec3 lab = t < 0.5 ? mix(uLo, uMid, t / 0.5) : mix(uMid, uTop, (t - 0.5) / 0.5);
  vec3 to = t < uFlip ? uInk : uPaper;
  float f = vIv * 20.0;
  float n = floor(f + 0.5);
  bool major = mod(n, 2.0) < 0.5;
  float line = hair(f, major ? 0.5 : 0.15) * step(3.5, f);
  lab = mix(lab, mix(lab, to, major ? 0.42 : 0.22), line);
  if (uProbe.z > 0.5) {
    vec2 d = abs(vUV - uProbe.xy) / max(fwidth(vUV), vec2(1e-5));
    float pl = max(1.0 - clamp(d.y - 0.35, 0.0, 1.0), 1.0 - clamp(d.x - 0.35, 0.0, 1.0));
    lab = mix(lab, to, pl * 0.7);
  }
  vec3 N = normalize(vN);
#ifdef LITE
  float dif = (uLight.x + uLight.y * max(dot(N, uKey), 0.0) + uLight.z * max(dot(N, uFill), 0.0)) / uUp;
  vec3 c = lin(lab) * dif;
#else
  float ao = 1.0 - clamp(vAO * uAOk, 0.0, 0.3);
  float dif = (uLight.x * ao + uLight.y * max(dot(N, uKey), 0.0) + uLight.z * max(dot(N, uFill), 0.0)) / uUp;
  vec3 V = normalize(uEye - vPos);
  vec3 Hh = normalize(uKey + V);
  float sp = pow(max(dot(N, Hh), 0.0), 56.0) * uSpec;
  vec3 c = lin(lab) * dif + vec3(sp);
#endif
  o = vec4(srgb(c), 1.0);
}`

/** The floor: paper, with a soft contact shadow under the solid. */
export const FLOOR_VS = `#version 300 es
precision highp float;
uniform mat4 uMVP; uniform vec2 uHalf;
out vec2 vXZ;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * 2.0 - 1.0;
  vXZ = c * (uHalf + 0.9);
  gl_Position = uMVP * vec4(vXZ.x, -0.002, vXZ.y, 1.0);
}`

export const FLOOR_FS = `#version 300 es
precision highp float;
in vec2 vXZ;
uniform vec2 uHalf; uniform vec3 uPaperL;
out vec4 o;
float box(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
vec3 srgb(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  float d = box(vXZ - vec2(0.05, -0.04), uHalf);
  float sh = 0.09 * (1.0 - smoothstep(-0.12, 0.3, d));
  o = vec4(srgb(uPaperL * (1.0 - sh)), 1.0);
}`

/** Lines with a width in CSS pixels: each segment is a screen-space quad. */
export const LINE_VS = `#version 300 es
precision highp float;
in vec3 aA; in vec3 aB; in vec2 aS;
uniform mat4 uMVP; uniform vec2 uPx; uniform float uWidth;
void main() {
  vec4 A = uMVP * vec4(aA, 1.0), B = uMVP * vec4(aB, 1.0);
  vec2 a = A.xy / A.w, b = B.xy / B.w;
  vec2 dir = normalize((b - a) / uPx);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec4 P = mix(A, B, aS.x);
  P.xy += nrm * aS.y * uWidth * 0.5 * uPx * P.w;
  gl_Position = P;
}`

export const LINE_FS = `#version 300 es
precision highp float;
uniform vec3 uColor;
out vec4 o;
void main() { o = vec4(uColor, 1.0); }`
