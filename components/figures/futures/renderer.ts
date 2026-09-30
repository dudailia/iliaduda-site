import type { Palette, Renderer, StageEnv } from '@/components/stage/useStage'
import { arrived, spring } from '@/lib/stage/spring'
import { EASE_IN_OUT, EASE_OUT } from '@/lib/ease'
import { BAR_D, ZWALL, driftAt, project, restPose, viewProjection, wallPrice, type M4, type Pose, type V3 } from '@/lib/futures/camera'
import { DENSITY_SCALE, densityFormat, glOverride, type Density } from '@/lib/futures/caps'
import { Director, type CamMode } from '@/lib/futures/director'
import { RNG } from '@/lib/futures/glsl'
import { aggregate, binnedPrice } from '@/lib/futures/hist'
import { GROUPS, HIST, MODEL, binWidth, stepCoefficients } from '@/lib/futures/mc'
import { type Phases } from '@/lib/futures/sequence'
import { Stream, burstSlot } from '@/lib/futures/stream'
import { AXIS, HLEN, HX0, LABELS, PY, TICKS, X0, X1, ZW, tickShown, wy } from '@/lib/futures/world'
import { FULLSCREEN_VS, disposeTarget, drawFullscreen, probeHalfFloat, program, renderable, target, type GL, type Program, type Target } from '@/lib/gl'
import type { Tier } from '@/lib/tier'
import { LABEL } from './Poster'
import { CAP, createPricer } from './pricing'

/**
 * A million futures, live, in three dimensions. Raw WebGL2.
 *
 * Two jobs share one context. The pricing job (./pricing.ts) simulates paths
 * a grid at a time and sums them on the GPU, keeping its floats as raw bits in
 * integer targets, so it needs no float render target and runs on a phone.
 *
 * The drawing job shows a few thousand members of the same ensemble, each a
 * ribbon: a triangle strip widened in screen space, with an anti-aliased edge,
 * its width set by its distance from the eye (and its ink held constant as it
 * widens), fading gently with depth and quickly near the eye, so a camera in
 * among them never sees the frame flood. The ribbons add up in a density
 * buffer (paths that finish above the strike in one channel, the rest in
 * another), half float where the device renders and blends it, eight-bit and
 * dithered otherwise (lib/futures/caps.ts); it is bloomed and laid over the
 * scene in the site palette: a glow at night, ink absorbed into paper by day.
 * The terminal histogram stands on the expiry wall as shaded slabs, drawn with
 * depth and multisampling; their front faces are the flat bars of the
 * composed frame, so the poster and the first live frame are one picture.
 *
 * The camera (lib/futures/camera.ts) opens on the composed frame. The
 * signature sequence plays there; once the payoff has appeared it swings into
 * a three-quarter view where time recedes into the scene, and rests there,
 * drifting slowly and following the reader's pointer or tilt, while the
 * stream (lib/futures/stream.ts) keeps launching new futures from today.
 * Pause holds all of it. Fly through leaves the rest and comes back to it.
 */

export interface Stats {
  n: number
  mean: number
  se: number
  forward: number
  /** Paths per second actually simulated and read back. */
  rate: number
  done: boolean
  /** The run's terminal histogram — paths and summed payoff per bin — at most once a second, or null. */
  hist: { counts: number[]; payoff: number[] } | null
}

export interface Options {
  labels: HTMLElement
  /** The signature sequence's phases, or null when this visit has none. */
  sequence: () => Phases | null
  /** Where the flight is, 0 being at rest. */
  camera: () => number
  /** The reader has paused the figure's motion: the stream, the drift, the parallax. */
  paused: () => boolean
  /** Where the reader's pointer or tilt asks the view to lean, each in −1…1. */
  parallax: () => { x: number; y: number }
  /** A frame was drawn, taking this long: the clocks that move only on drawn frames advance. */
  tick: (dtMs: number) => void
  onStats: (s: Stats) => void
  /** The sequence's first frame is on screen. */
  onSequenceFrame: () => void
  /** The still frame is on screen as the first frame is drawn: open on the resting view it shows. */
  atRest?: () => boolean
}

export interface FuturesRenderer extends Renderer {
  setParams(sigma: number, strike: number): void
  /** A strike under the pointer, drawn but not priced; null returns to the committed one. */
  preview(strike: number | null): void
  /** The price under a point on the canvas, on the expiry plane, or null. */
  priceAt(clientX: number, clientY: number): number | null
  /** Clear the futures and bring the camera back to the composed frame, then call `then`: how Replay begins. */
  rewind(then: () => void): void
  /** For ?debug=1: what this renderer chose and how it is running. */
  debug(): Record<string, string | number>
}

export { CAP }
/**
 * Strands drawn, fixed for the device. A quality step changes resolution and
 * bloom, and at the lowest level rests a share of the stream's slots, which
 * leave and return the way every stream path does, so nothing pops.
 */
/** Paused, pricing holds from here: an estimate within about a cent of the formula, a smooth histogram. */
const HOLD_N = 1 << 20
/**
 * Ink by day. Absorption per unit of density; the most the ink may add up to
 * (the core at today stays a deep indigo, not the token's full strength, so
 * the bundle keeps a tone to read into); how far the futures fade toward the
 * wall, which is the recession a 3D picture on paper has in place of a glow;
 * and how much of the soft halo darkens the paper around the core.
 */
const DAY = { tone: 0.8, cap: 0.9, far: 0.35, halo: 0.16 } as const
const STRANDS: Record<Tier, number> = { software: 320, low: 1536, mid: 3072, high: 4096 }
/** The stage area the gains are tuned at (the lg stage, 647 × 576). A smaller stage packs the same futures tighter. */
const REF_AREA = 647 * 576
/** Slots texture width. */
const SW = 1024

// ── shaders ──────────────────────────────────────────────────────────────────

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
`

// One fragment per (slot, step): the log return of the slot's current path up
// to that step. Path id is the same path lib/futures/mc.ts's path(id) gives.
const PATH_FS = `${HEAD}${RNG}
uniform usampler2D uSlots; uniform int uN, uH; uniform float uDrift, uVol;
out uvec4 o;
void main() {
  ivec2 f = ivec2(gl_FragCoord.xy);
  int block = f.x / 65;
  int j = f.x - block * 65;
  int i = block * uH + f.y;
  if (i >= uN) { o = uvec4(0u); return; }
  uint id = texelFetch(uSlots, ivec2(i % ${SW}, i / ${SW}), 0).r;
  float x = 0.0;
  for (int g = 0; g < ${GROUPS}; g++) {
    int rem = j - g * 4;
    if (rem <= 0) break;
    vec4 z = normals4(id, uint(g));
    vec4 m = vec4(greaterThan(vec4(rem), vec4(0.0, 1.0, 2.0, 3.0)));
    x += uDrift * dot(m, vec4(1.0)) + uVol * dot(m, z);
  }
  o = uvec4(floatBitsToUint(x), 0u, 0u, 0u);
}`

// Where slot i's path is at (fractional) step jj, and how much of it shows.
// Depth is a Gaussian lane per path, so the cloud's cross-section is soft.
const STRAND = `
uniform usampler2D uPath, uSlots; uniform int uH; uniform float uK, uS0;
uniform mat4 uVP;
float lr(int i, int j) { return uintBitsToFloat(texelFetch(uPath, ivec2((i / uH) * 65 + j, i % uH), 0).r); }
struct Sl { uint id; float reveal; float opacity; };
Sl slotOf(int i) {
  uvec4 s = texelFetch(uSlots, ivec2(i % ${SW}, i / ${SW}), 0);
  Sl r; r.id = s.r; r.reveal = uintBitsToFloat(s.g); r.opacity = uintBitsToFloat(s.b);
  return r;
}
float lane(uint id) {
  uvec4 h = pcg4d(uvec4(id, 65535u, SEED, SALT));
  return clamp(sqrt(-2.0 * log(unit(h.x))) * cos(6.2831853 * unit(h.y)), -2.5, 2.5);
}
vec3 at(int i, float ln, float jj) {
  int j0 = int(floor(jj));
  int j1 = min(j0 + 1, 64);
  float x = mix(lr(i, j0), lr(i, j1), jj - float(j0));
  float t = jj / 64.0;
  return vec3(${X0.toFixed(3)} + ${(X1 - X0).toFixed(3)} * t, (uS0 * exp(x) - uS0) * ${PY}, ln * ${(ZW * 0.45).toFixed(3)} * sqrt(t));
}`

// A ribbon: two vertices per step, pushed apart across the path's direction on
// screen. Width follows distance from the eye; ink per unit length does not.
const RIBBON_VS = `${HEAD}${RNG}${STRAND}
uniform vec2 uPx; uniform float uWidth, uRef, uFar, uEdge; uniform vec3 uFade;
out float vD; out float vHalf; out float vA; flat out int vPays; flat out uint vId;
void main() {
  int i = gl_InstanceID;
  int v = gl_VertexID;
  int j = v >> 1;
  float side = float(v & 1) * 2.0 - 1.0;
  Sl s = slotOf(i);
  float front = s.reveal * 64.0;
  float ln = lane(s.id);
  bool past = float(j) > front + 0.001;
  float jj = min(float(j), front);
  vec4 c = uVP * vec4(at(i, ln, jj), 1.0);
  vec4 ca = uVP * vec4(at(i, ln, max(jj - 1.0, 0.0)), 1.0);
  vec4 cb = uVP * vec4(at(i, ln, min(jj + 1.0, front)), 1.0);
  vec2 d = (cb.xy / max(cb.w, 1e-3) - ca.xy / max(ca.w, 1e-3)) * uPx;
  float dl = length(d);
  vec2 n = dl > 1e-5 ? vec2(-d.y, d.x) / dl : vec2(0.0, 1.0);
  float depth = max(c.w, 1e-3);
  // In among the futures (a flight), they fade out toward the stage's edges, so the frame never shows as a rectangle.
  vec2 ndc = abs(c.xy / depth);
  float edge = mix(1.0, smoothstep(1.0, 0.8, max(ndc.x, ndc.y)), uEdge);
  float w = clamp(uWidth * uRef / depth, 0.85, 2.6);
  float reach = past ? 0.0 : w * 0.5 + 1.0;
  c.xy += n * side * reach * 2.0 / uPx * c.w;
  vD = side * reach;
  vHalf = w * 0.5;
  float near = smoothstep(uFade.x, uFade.y, depth);
  float far = mix(1.0, uFar, smoothstep(uRef, uFade.z, depth));
  vA = s.opacity * near * far * edge * (1.2 / max(w, 1.2));
  vPays = uS0 * exp(lr(i, 64)) > uK ? 1 : 0;
  vId = s.id;
  gl_Position = c;
}`

// Density is stored × uScale. In an eight-bit buffer each fragment's
// rounding is dithered (by fragment, path and frame), so a faint path still
// adds its share on average instead of rounding away.
const RIBBON_FS = `${HEAD}${RNG}
in float vD; in float vHalf; in float vA; flat in int vPays; flat in uint vId;
uniform float uGain, uScale, uDither; uniform uint uFrame;
out vec4 o;
void main() {
  float cov = 1.0 - smoothstep(vHalf - 0.5, vHalf + 0.5, abs(vD));
  float w = uGain * vA * cov;
  vec4 c = (vPays == 1 ? vec4(w, 0.0, 0.0, 0.0) : vec4(0.0, w, 0.0, 0.0)) * uScale;
  if (uDither > 0.5) {
    uvec4 h = pcg4d(uvec4(uvec2(gl_FragCoord.xy), vId, uFrame));
    c.rg += (vec2(unit(h.x), unit(h.y)) - 0.5) / 255.0;
  }
  o = c;
}`

// A head rides each front while it travels: in the burst, and on each new path of the stream.
const HEAD_VS = `${HEAD}${RNG}${STRAND}
uniform float uSize, uHead; uniform vec3 uFade;
out float vA; flat out int vPays; flat out uint vId;
void main() {
  Sl s = slotOf(gl_VertexID);
  vec4 c = uVP * vec4(at(gl_VertexID, lane(s.id), s.reveal * 64.0), 1.0);
  float travel = smoothstep(0.0, 0.03, s.reveal) * (1.0 - smoothstep(0.92, 1.0, s.reveal));
  vA = s.opacity * travel * uHead * smoothstep(uFade.x, uFade.y, c.w);
  vPays = uS0 * exp(lr(gl_VertexID, 64)) > uK ? 1 : 0;
  vId = s.id;
  gl_PointSize = uSize;
  gl_Position = c;
}`

const HEAD_FS = `${HEAD}
in float vA; flat in int vPays; flat in uint vId;
uniform float uGain, uScale;
out vec4 o;
void main() {
  float w = uGain * vA * (1.0 - smoothstep(0.15, 0.5, length(gl_PointCoord - 0.5)));
  o = (vPays == 1 ? vec4(w, 0.0, 0.0, 0.0) : vec4(0.0, w, 0.0, 0.0)) * uScale;
}`

const DOWN_FS = `${HEAD}
in vec2 vUv; uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThresh;
out vec4 o;
void main() {
  vec2 d = uTexel * 0.5;
  o = max(vec4(0.0), -uThresh + 0.25 * (texture(uSrc, vUv + vec2(-d.x, -d.y)) + texture(uSrc, vUv + vec2(d.x, -d.y)) + texture(uSrc, vUv + vec2(-d.x, d.y)) + texture(uSrc, vUv + vec2(d.x, d.y))));
}`

// Nine-tap Gaussian in five bilinear fetches.
const BLUR_FS = `${HEAD}
in vec2 vUv; uniform sampler2D uSrc; uniform vec2 uDir;
out vec4 o;
void main() {
  vec2 a = uDir * 1.3846153846, b = uDir * 3.2307692308;
  o = texture(uSrc, vUv) * 0.2270270270
    + (texture(uSrc, vUv + a) + texture(uSrc, vUv - a)) * 0.3162162162
    + (texture(uSrc, vUv + b) + texture(uSrc, vUv - b)) * 0.0702702703;
}`

// The futures laid over the scene (paper and the bars), by blending, so the
// bars show through where the futures are thin.
// Night: each layer of the old glow is a mix toward a colour, so over any
// background c it is E + c·T — emitted as (E, T), blended (ONE, SRC_ALPHA).
// Over paper it is the glow as it was: the densest cores stay lavender rather
// than washing out to white.
// Day: ink on paper. Each strand absorbs light — Beer–Lambert, in linear light,
// with absorption per unit of density set from the token's colour — and the
// total depth saturates (at most 0.9 units, shared between the two inks in
// proportion), so where every future crosses, at today, the paper goes deep
// indigo-slate, never black, and keeps its hue. Emitted as the transmittance
// per channel, blended (ZERO, SRC_COLOR): exact over paper, ink over ink on a bar.
const COMPOSITE_FS = `${HEAD}${RNG}
in vec2 vUv;
uniform sampler2D uDen, uB1, uB2;
uniform vec3 uPaper, uInk, uGraphite, uIndigo, uWash;
uniform float uDark, uBloom, uTone, uFade, uScale, uCap, uHalo;
uniform uint uFrame;
out vec4 o;
vec3 lin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec2 d = texture(uDen, vUv).rg / uScale * uFade;
  vec2 b = uBloom > 0.5 ? (texture(uB1, vUv).rg * 0.7 + texture(uB2, vUv).rg * 1.1) / uScale * uFade : vec2(0.0);
  // A half-step of noise on the way out, so the glow's long gradients never band.
  float n = (unit(pcg4d(uvec4(uvec2(gl_FragCoord.xy), uFrame, 7u)).x) - 0.5) / 255.0;
  if (uDark > 0.5) {
    b *= 0.78;
    float pays = 1.0 - exp(-uTone * d.r);
    float not_ = 0.7 * (1.0 - exp(-uTone * d.g));
    float halo = 1.0 - exp(-1.4 * (b.r + 0.4 * b.g));
    // Only the very densest core leans toward (night's light) ink, and a little: more washed the fan out to a pale blob.
    float x = 0.06 * smoothstep(0.5, 1.0, 1.0 - exp(-uTone * 0.08 * d.r));
    vec3 E = uWash * halo;
    float T = 1.0 - halo;
    E = E * (1.0 - not_) + uGraphite * not_;
    T *= 1.0 - not_;
    E = E * (1.0 - pays) + uIndigo * pays;
    T *= 1.0 - pays;
    E += uIndigo * 0.1 * (1.0 - exp(-1.2 * b.r));
    E = E * (1.0 - x) + uInk * x;
    T *= 1.0 - x;
    o = vec4(E + n, T);
  } else {
    vec3 P = lin(uPaper);
    vec3 aPay = -log(clamp(lin(uIndigo) / P, vec3(1e-3), vec3(1.0)));
    vec3 aNot = -log(clamp(lin(uGraphite) / P, vec3(1e-3), vec3(1.0)));
    float dp = uTone * d.r + uHalo * b.r;
    float dn = 0.55 * uTone * d.g + 0.5 * uHalo * b.g;
    float s = dp + dn;
    float k = s > 1e-4 ? uCap * (1.0 - exp(-s / uCap)) / s : 1.0;
    vec3 tau = (aPay * dp + aNot * dn) * k;
    o = vec4(clamp((srgb(P * exp(-tau)) + n) / max(uPaper, vec3(1e-3)), 0.0, 1.0), 1.0);
  }
}`

// The bars: shaded slabs in world space, with depth.
const SOLID_VS = `${HEAD}
in vec3 aPos; in vec4 aCol; uniform mat4 uVP; out vec4 vCol;
void main() { vCol = aCol; gl_Position = uVP * vec4(aPos, 1.0); }`
const SOLID_FS = `${HEAD}
in vec4 vCol; out vec4 o;
void main() { o = vCol; }`

// Hairlines and dashes, built on the CPU in clip space, so a line is the same crisp width at every distance.
const FLAT_VS = `${HEAD}
in vec2 aPos; in vec4 aCol; out vec4 vCol;
void main() { vCol = aCol; gl_Position = vec4(aPos, 0.0, 1.0); }`
const FLAT_FS = `${HEAD}
in vec4 vCol; out vec4 o;
void main() { o = vCol; }`

// ── motion helpers ───────────────────────────────────────────────────────────

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Critically damped spring, solved exactly, so a long frame cannot overshoot. */

/**
 * Vertex data reused frame to frame: the bars and hairlines are rebuilt every
 * frame, and building them in fresh arrays left a phone ~100 kB of garbage a
 * frame to collect, mid-motion.
 */
class Floats {
  a = new Float32Array(1 << 15)
  n = 0
  /** Makes room for `k` more numbers, and returns the array to write them to (it may be a new, larger one). */
  room(k: number): Float32Array {
    if (this.n + k <= this.a.length) return this.a
    const b = new Float32Array(Math.max(this.a.length * 2, this.n + k))
    b.set(this.a)
    this.a = b
    return b
  }
  put6(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.room(6)
    const x = this.a, i = this.n
    x[i] = a; x[i + 1] = b; x[i + 2] = c; x[i + 3] = d; x[i + 4] = e; x[i + 5] = f
    this.n = i + 6
  }
  put7(a: number, b: number, c: number, d: number, e: number, f: number, g: number) {
    this.room(7)
    const x = this.a, i = this.n
    x[i] = a; x[i + 1] = b; x[i + 2] = c; x[i + 3] = d; x[i + 4] = e; x[i + 5] = f; x[i + 6] = g
    this.n = i + 7
  }
  view() {
    return this.a.subarray(0, this.n)
  }
}

/** Where the flight turns the histogram into payoff: once it faces the wall (lib/futures/camera.ts, flightPose). */
const flightMorph = (p: number) => EASE_IN_OUT(clamp01((p - 0.8) / 0.14))

type SeqState = 'none' | 'pending' | 'playing' | 'done'

// ── the renderer ─────────────────────────────────────────────────────────────

/**
 * Why this device cannot run the live figure, or null if it can. Everything it
 * renders to is a WebGL2 core format, so this fails only on a broken driver.
 */
export function cannotRun(gl: GL): 'targets' | null {
  return renderable(gl, 'rgba32ui') && renderable(gl, 'r32ui') && renderable(gl, 'rgba8') ? null : 'targets'
}

export function createRenderer(env: StageEnv, o: Options): FuturesRenderer {
  const gl: GL = env.gl
  gl.disable(gl.DITHER)
  const override = glOverride(location.search)
  const density: Density = densityFormat({ half: override !== 'rgba8' && probeHalfFloat(gl) }, override)
  const dScale = DENSITY_SCALE[density]
  o.labels.dataset.density = density

  const clock = { frameNo: 0, dtEma: 1 / 60, vsync: 1 / 60, now: 0 }
  const pricer = createPricer(gl, clock, env.tier !== 'high')
  const est = pricer.est

  const P = {
    path: program(gl, FULLSCREEN_VS, PATH_FS),
    ribbon: program(gl, RIBBON_VS, RIBBON_FS),
    head: program(gl, HEAD_VS, HEAD_FS),
    down: program(gl, FULLSCREEN_VS, DOWN_FS),
    blur: program(gl, FULLSCREEN_VS, BLUR_FS),
    composite: program(gl, FULLSCREEN_VS, COMPOSITE_FS),
    solid: program(gl, SOLID_VS, SOLID_FS),
    flat: program(gl, FLAT_VS, FLAT_FS),
  }
  const programs: Program[] = [...Object.values(P), ...pricer.programs]
  let ready = false

  const empty = gl.createVertexArray()
  const flatVao = gl.createVertexArray()!
  const flatBuf = gl.createBuffer()!
  const solidVao = gl.createVertexArray()!
  const solidBuf = gl.createBuffer()!
  let flatBound = false
  let solidBound = false

  let palette: Palette = env.palette
  let q = 2
  /** A quality step asked for while the sequence plays waits until it is over. */
  let pendingQ: number | null = null
  const pathN = STRANDS[env.tier]
  const pathH = Math.min(pathN, 1024)
  // One 32-bit channel of float bits: 65 steps per strand, strands in columns of pathH.
  const pathT = target(gl, 65 * Math.ceil(pathN / pathH), pathH, 'r32ui')
  // Each slot's path id and how much of it shows: (id, reveal bits, opacity bits, 0).
  const slotRows = Math.ceil(pathN / SW)
  const slotsT = target(gl, SW, slotRows, 'rgba32ui')
  const slotData = new Uint32Array(SW * slotRows * 4)
  const slotF = new Float32Array(slotData.buffer)
  const stream = new Stream(pathN)
  let den: Target | null = null
  let bl: Target[] = []
  let cw = 1, ch = 1, cssW = 1, cssH = 1

  // Pricing inputs, as committed
  let sigma: number = MODEL.sigma, strike: number = MODEL.strike
  let previewK: number | null = null
  // Normalised bar lengths: the counts, and what each bin pays (count × payoff).
  const barC = new Float32Array(HIST.bins)
  const barG = new Float32Array(HIST.bins)
  // What is on screen, easing toward those: a new run's first batch is noisy.
  const cLen = new Float32Array(HIST.bins)
  const gLen = new Float32Array(HIST.bins)
  let barsReady = false
  let barsMoving = true
  let statsAt = 0
  let histAt = -1

  // Visual state
  const sig = { x: sigma, v: 0 }
  const kv = { x: strike, v: 0 }
  const morph = { x: 0, v: 0 }
  const par = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 } }
  // Focus: facing the wall at the end of a flight, the futures step back so the histogram carries the view. The paths
  // there run close past the eye, and at full strength they would wash the frame and cost a burst of fill.
  const focus = { x: 1, v: 0 }
  /** How much the futures fade toward the stage's edges: only in among them. */
  const edgeK = { x: 0, v: 0 }
  let vp: M4 = new Float32Array(16)
  let pose: Pose | null = null
  let seq: SeqState = 'none'
  let ph: Phases | null = null
  /** The camera's place in the story (lib/futures/director.ts); `cam` and `flightP` are its reading this frame. */
  const director = new Director()
  let cam: CamMode = 'frame'
  let flightP = 0
  let fadeTo: { t: number; ms: number; from: number } | null = null
  let streamT = 0
  let driftT = 0
  /**
   * How fast the figure's own motion runs, 0…1. Pause does not freeze it in a
   * frame: its speed falls to nothing over 240ms (so the paths coast to a stop),
   * and Resume brings it back over 400ms. A linear ramp in speed is an ease-out
   * in position, and a second press retargets from wherever the ramp is.
   */
  let timeK = -1
  let fadeMul = 1
  /** The bloom's weight, 0…1: off at the lowest quality, eased across a step. */
  let bloomK = 1
  /** How far the fade back in has come after a Replay (0…1, eased). */
  let fadeUp = 0
  let firstFrame = true
  /** The one batch priced while the sequence waits has gone out. */
  let warmed = false
  /** An input changed since the last pricing call: the next frame prices, paused or not. */
  let repriced = false
  /**
   * Everything the figure draws and reads has been used once: the first
   * readback is back (or 1.5s have passed). A GPU builds a pipeline the first
   * time it is used, which can hold a frame for a long moment on a phone; the
   * sequence and the settle wait for it, so none of that lands on the motion.
   */
  let warm = false
  let firstAt = -1
  /** Something changed that a still frame does not show yet. */
  let dirty = true
  let draws = 0
  /** Why the last frame was drawn, for ?debug=1: nothing, when it was still. */
  // Why the last frame was drawn, kept as it was and joined only when ?debug=1 reads it.
  let drawnFor: string[] = []
  let refreshedAt = -1

  // Labels
  // `side`/`vside`: which way the label extends from its point (from its
  // translate classes), so it can be kept inside the box; `w`/`h` are measured
  // again only when its words change.
  // `data`: the label belongs to the futures (the histogram's name, the price),
  // so Replay fades it with them; the frame's labels (today, expiry, ticks, the
  // strike) stay.
  type Label = {
    el: HTMLSpanElement
    at: () => V3
    show: () => number
    side: -1 | -0.5 | 0
    vside: -1 | -0.5 | 0 | 1
    w: number
    h: number
    text: string
    data: boolean
    /** The opacity it is drawn at, following its target over 60ms; null until first placed, when it takes it at once. */
    k: number | null
  }
  const labels: Label[] = []
  const label = (text: string, cls: string, at: () => V3, show: () => number, data = false) => {
    const el = document.createElement('span')
    el.textContent = text
    el.className = `${LABEL} left-0 top-0 ${cls}`
    el.style.opacity = '0'
    o.labels.appendChild(el)
    const side = cls.includes('-translate-x-full') ? -1 : cls.includes('-translate-x-1/2') ? -0.5 : 0
    const vside = cls.includes('-translate-y-full') ? -1 : cls.includes('translate-y-full') ? 1 : cls.includes('-translate-y-1/2') ? -0.5 : 0
    labels.push({ el, at, show, side, vside, w: -1, h: -1, text: '', data, k: null })
    return el
  }
  const inSeq = () => seq === 'pending' || seq === 'playing'
  const landing = () => (inSeq() ? EASE_OUT(ph!.landing) : 1)
  /** How far the wall has come out of the flat frame: 0 in the composed frame, 1 at rest. */
  let depthU = 0
  /** How much the labels are with us: 1 but for the middle of a flight. */
  let labelU = 1
  const zEdge = () => ZWALL * depthU
  // Today stays named until the camera is past it.
  label(`Today · $${MODEL.s0}`, LABELS.today.cls, () => [LABELS.today.at[0], LABELS.today.at[1], 0], () => (cam === 'flight' ? 1 - smooth(0.36, 0.42, flightP) : labelU))
  label('One year out', LABELS.expiry.cls, () => [LABELS.expiry.at[0], LABELS.expiry.at[1], zEdge()], () => labelU)
  for (const s of TICKS) label(`$${s}`, LABELS.tick.cls, () => [LABELS.tick.x, wy(s), zEdge()], () => labelU * tickShown(s - kv.x))
  // The strike stays named through the whole flight: it is what the colours mean.
  const strikeEl = label('', LABELS.strike.cls, () => [LABELS.strike.label, wy(kv.x), zEdge()], () => 1)
  // One label for the histogram. Its words change halfway through the morph, through a 3px blur at full opacity (the
  // swap below), so one text never crossfades into another.
  const histEl = label('Where the paths end', `${LABELS.hist.cls} text-ink`, () => [LABELS.hist.at[0], LABELS.hist.at[1], 0], () => labelU * landing(), true)
  let histText = 0
  // The words the histogram is to say, and when their swap began (seconds on the clock; −1: none under way).
  let histWant = 0
  let histSwapAt = -1
  // The swap's blur on the ease-out (the quintic, the power curve closest to the site's ease-out, whose inverse lets
  // a swap turned back mid-way go on from the blur it has): up fast to 3px, the words change, then down fast.
  const quint = (u: number) => 1 - (1 - Math.min(1, Math.max(0, u))) ** 5
  const unQuint = (d: number) => 1 - (1 - Math.min(1, Math.max(0, d))) ** 0.2
  const histBlur = (u: number) => (u < 1 ? quint(u) : u < 2 ? 1 - quint(u - 1) : 0)
  // The climax: the payoff bars, averaged and discounted, are the call's price.
  // The number is the live Monte Carlo estimate, not a restatement of the formula.
  // In the composed frame it stands under the strike line, where the payoff bars are empty; in depth, a point further
  // along the time axis rises on screen, so it moves under the strike's own name on the wall's edge, stacked.
  const valueEl = label('', `${LABELS.value.cls} text-indigo`, () => [LABELS.hist.at[0], LABELS.hist.at[1], 0], () =>
    est.n > 0 || held ? labelU * smooth(0.55, 1, morph.x) * (inSeq() ? EASE_OUT(clamp01(ph!.price / 0.24)) : 1) : 0,
    true,
  )
  let valueText = ''
  /**
   * The last price shown, held through the moment after the reader moves an input and before the new run's first
   * estimate is back, so the claim does not blink out on every step of a drag. The sequence starts from nothing, as
   * its convergence is the point.
   */
  let held = ''
  const setStrikeText = () => (strikeEl.textContent = `Strike $${Math.round(kv.x)}`)
  setStrikeText()

  // ── resources that depend on quality and size ──

  function applyQuality(level: number) {
    q = Math.max(0, Math.min(3, level))
    pricer.setQuality(q)
    dirty = true
  }

  function buildScreen() {
    disposeTarget(gl, den)
    bl.forEach((t) => disposeTarget(gl, t))
    // The density at the canvas's own resolution (the stage caps it at two device pixels per CSS pixel): crisp ribbons.
    const dw = Math.max(1, cw), dh = Math.max(1, ch)
    den = target(gl, dw, dh, density, true)
    const h2 = [Math.max(1, dw >> 1), Math.max(1, dh >> 1)] as const
    const h4 = [Math.max(1, dw >> 2), Math.max(1, dh >> 2)] as const
    const h8 = [Math.max(1, dw >> 3), Math.max(1, dh >> 3)] as const
    bl = [
      target(gl, h2[0], h2[1], density, true),
      target(gl, h4[0], h4[1], density, true),
      target(gl, h4[0], h4[1], density, true),
      target(gl, h8[0], h8[1], density, true),
      target(gl, h8[0], h8[1], density, true),
    ]
  }

  const bind = (t: Target | null, w = t?.w ?? cw, h = t?.h ?? ch) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null)
    gl.viewport(0, 0, w, h)
  }
  const tex = (unit: number, t: Target) => {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, t.tex)
  }

  function report(force = false) {
    // Waiting, the margin claims nothing: no paths are being priced for the reader yet.
    if (seq === 'pending') {
      if (!force && clock.now - statsAt < 0.1) return
      statsAt = clock.now
      o.onStats({ n: 0, mean: 0, se: 0, forward: 0, rate: 0, done: false, hist: null })
      return
    }
    const narrow = cssW < 520
    const now = clock.now
    const v =
      previewK != null && pricer.ready()
        ? `Call at $${Math.round(kv.x)}: about $${binnedPrice(pricer.fine, kv.x).toFixed(2)}`
        : est.n > 0
          ? narrow
            ? `Call price: $${est.mean.toFixed(2)}`
            : `Call price, the average discounted payoff: $${est.mean.toFixed(2)}`
          : inSeq()
            ? ''
            : held
    if (est.n > 0 && previewK == null) held = v
    else if (inSeq()) held = ''
    if (v !== valueText) valueEl.textContent = valueText = v
    const rate = pricer.rate()
    if (!force && now - statsAt < 0.1) return
    statsAt = now
    const doneAt = pricer.doneAt
    const done = !!doneAt
    // The histogram goes out once a second, and once more when the run completes.
    let h: Stats['hist'] = null
    if (pricer.ready() && (now - histAt > 1 || (done && histAt < doneAt))) {
      histAt = now
      h = aggregate(pricer.fine, strike)
    }
    o.onStats({
      n: est.n,
      mean: est.mean,
      se: est.se,
      forward: est.forward,
      rate: done ? pricer.runPaths / Math.max(1e-3, doneAt - pricer.runStart) : rate,
      done,
      hist: h,
    })
  }

  // ── the slots: which path each shows, and how much ──

  /** Write this frame's slots, and return how much ink they carry against a full picture. */
  function writeSlots(): number {
    const active = q === 0 ? Math.round(pathN * 0.6) : pathN
    const burst = inSeq() ? ph!.burst : -1
    let ink = 0
    if (burst < 0) stream.update(streamT, active)
    for (let i = 0; i < pathN; i++) {
      let id: number, reveal: number, opacity: number
      if (burst >= 0) {
        const s = burstSlot(i, burst)
        id = s.id
        reveal = s.reveal
        opacity = 1
      } else {
        id = stream.ids[i]!
        reveal = stream.reveal[i]!
        opacity = stream.opacity[i]!
      }
      const k = i * 4
      slotData[k] = id >>> 0
      slotF[k + 1] = reveal
      slotF[k + 2] = opacity
      ink += reveal * opacity
    }
    gl.bindTexture(gl.TEXTURE_2D, slotsT.tex)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SW, slotRows, gl.RGBA_INTEGER, gl.UNSIGNED_INT, slotData)
    return ink / pathN
  }

  // ── drawing ──

  function drawFutures(ink: number) {
    if (!den) return
    const { drift, vol } = stepCoefficients(sig.x)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    bind(pathT)
    P.path.use()
    tex(0, slotsT)
    gl.uniform1i(P.path.u('uSlots'), 0)
    gl.uniform1i(P.path.u('uN'), pathN)
    gl.uniform1i(P.path.u('uH'), pathH)
    gl.uniform1f(P.path.u('uDrift'), drift)
    gl.uniform1f(P.path.u('uVol'), vol)
    gl.bindVertexArray(empty)
    drawFullscreen(gl)

    bind(den)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    const dpr = den.w / Math.max(1, cssW)
    // A phone's stage packs the same futures into a fraction of the area, so the gain comes down with it; at night the
    // glow saturates sooner, so it gives up more. A stream in motion carries a little less ink than the whole picture
    // the burst ends on, and is lifted by that much, so the weight of the picture holds.
    const areaK = Math.min(1, (cssW * cssH) / REF_AREA) ** (palette.dark ? 1 : 0.7)
    // Seen in depth the paths are looked along, not across, and lie over one another far more than in the composed
    // frame: as the camera swings into depth the gain comes down, so the picture keeps its weight.
    const depthK = 1 - (palette.dark ? 0.62 : 0.4) * depthU
    const gain = ((palette.dark ? 0.17 : 0.13) * Math.sqrt(2048 / pathN) * areaK * depthK * focus.x) / Math.max(0.5, Math.min(1, ink * 1.08))
    // Near and far, from the eye to today and to the wall, for the ribbons' width and fade.
    const eye = pose!.eye
    const dToday = Math.hypot(eye[0] - X0, eye[1], eye[2])
    const dWall = Math.hypot(eye[0] - X1, eye[1], eye[2])
    const ref = Math.min(dToday, dWall)
    const set = (p: Program) => {
      p.use()
      tex(0, pathT)
      tex(1, slotsT)
      gl.uniform1i(p.u('uPath'), 0)
      gl.uniform1i(p.u('uSlots'), 1)
      gl.uniform1i(p.u('uH'), pathH)
      gl.uniform1f(p.u('uK'), kv.x)
      gl.uniform1f(p.u('uS0'), MODEL.s0)
      gl.uniform1f(p.u('uGain'), gain)
      gl.uniform1f(p.u('uScale'), dScale)
      gl.uniformMatrix4fv(p.u('uVP'), false, vp)
      gl.uniform3f(p.u('uFade'), 0.22, 0.85, Math.max(dToday, dWall) * 1.15)
    }
    set(P.ribbon)
    gl.uniform2f(P.ribbon.u('uPx'), den.w / 2, den.h / 2)
    gl.uniform1f(P.ribbon.u('uWidth'), 1.15 * dpr)
    gl.uniform1f(P.ribbon.u('uRef'), ref)
    gl.uniform1f(P.ribbon.u('uFar'), palette.dark ? 0.6 : DAY.far)
    gl.uniform1f(P.ribbon.u('uEdge'), edgeK.x)
    gl.uniform1f(P.ribbon.u('uDither'), density === 'rgba8' ? 1 : 0)
    gl.uniform1ui(P.ribbon.u('uFrame'), clock.frameNo)
    gl.bindVertexArray(empty)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 130, pathN)
    // Heads: bright on the burst's fronts, quieter on the stream's.
    set(P.head)
    gl.uniform1f(P.head.u('uSize'), 3 * dpr)
    gl.uniform1f(P.head.u('uHead'), inSeq() ? 4.5 : 2)
    gl.drawArrays(gl.POINTS, 0, pathN)
    gl.disable(gl.BLEND)

    // The bloom eases in and out across a quality step (about a quarter of a second) rather than switching: its passes
    // run while any of it is left.
    bloomK += ((q > 0 ? 1 : 0) - bloomK) * (1 - Math.exp(-clock.dtEma / 0.08))
    const bloom = bloomK > 0.01
    if (bloom) {
      const pass = (p: Program, src: Target, dst: Target, setU: () => void) => {
        bind(dst)
        p.use()
        tex(0, src)
        gl.uniform1i(p.u('uSrc'), 0)
        setU()
        drawFullscreen(gl)
      }
      const down = (src: Target, dst: Target, th = 0) =>
        pass(P.down, src, dst, () => {
          gl.uniform2f(P.down.u('uTexel'), 1 / src.w, 1 / src.h)
          gl.uniform1f(P.down.u('uThresh'), th)
        })
      const blur = (src: Target, dst: Target, x: number, y: number) => pass(P.blur, src, dst, () => gl.uniform2f(P.blur.u('uDir'), x / src.w, y / src.h))
      down(den, bl[0]!, 0.35 * dScale)
      down(bl[0]!, bl[1]!)
      blur(bl[1]!, bl[2]!, 1, 0)
      blur(bl[2]!, bl[1]!, 0, 1)
      down(bl[1]!, bl[3]!)
      blur(bl[3]!, bl[4]!, 1.5, 0)
      blur(bl[4]!, bl[3]!, 0, 1.5)
    }
  }

  function composite() {
    const bloom = bloomK > 0.01
    bind(null)
    P.composite.use()
    tex(0, den!)
    tex(1, bl[1]!)
    tex(2, bl[3]!)
    gl.uniform1i(P.composite.u('uDen'), 0)
    gl.uniform1i(P.composite.u('uB1'), 1)
    gl.uniform1i(P.composite.u('uB2'), 2)
    gl.uniform3fv(P.composite.u('uPaper'), palette.paper)
    gl.uniform3fv(P.composite.u('uInk'), palette.ink)
    gl.uniform3fv(P.composite.u('uGraphite'), palette.graphite)
    gl.uniform3fv(P.composite.u('uIndigo'), palette.indigo)
    gl.uniform3fv(P.composite.u('uWash'), palette.wash)
    gl.uniform1f(P.composite.u('uDark'), palette.dark ? 1 : 0)
    gl.uniform1f(P.composite.u('uBloom'), bloom ? bloomK : 0)
    // At night a lower tone keeps the dense core indigo, not whitened, so the fan's split at the strike still reads.
    gl.uniform1f(P.composite.u('uTone'), palette.dark ? 0.25 : DAY.tone)
    gl.uniform1f(P.composite.u('uCap'), DAY.cap)
    gl.uniform1f(P.composite.u('uHalo'), DAY.halo)
    gl.uniform1f(P.composite.u('uFade'), fadeMul)
    gl.uniform1f(P.composite.u('uScale'), dScale)
    gl.uniform1ui(P.composite.u('uFrame'), clock.frameNo)
    gl.enable(gl.BLEND)
    if (palette.dark) gl.blendFunc(gl.ONE, gl.SRC_ALPHA)
    else gl.blendFunc(gl.ZERO, gl.SRC_COLOR)
    gl.bindVertexArray(empty)
    drawFullscreen(gl)
    gl.disable(gl.BLEND)
  }

  // The bars, as slabs: each bin a box behind the z = 0 plane, its front face the flat bar of the composed frame.
  const solid = new Floats()
  /** Mixes two colours into `out`, one of the few kept for the bars, so no bar makes colours of its own each frame. */
  const mixInto = (out: Float64Array, a: ArrayLike<number>, b: ArrayLike<number>, t: number) => {
    out[0] = a[0]! + (b[0]! - a[0]!) * t
    out[1] = a[1]! + (b[1]! - a[1]!) * t
    out[2] = a[2]! + (b[2]! - a[2]!) * t
    return out
  }
  const barBase = new Float64Array(3), barTop = new Float64Array(3), barEnd = new Float64Array(3), barLow = new Float64Array(3)
  /**
   * A slab's six faces, as its box's corners (bit 0 the far end in x, bit 1 the top, bit 2 the front), each quad
   * counter-clockwise from outside so back faces are culled, and the tone each is lit in: 0 the base colour, 1 the
   * top, 2 the far end, 3 the back and underside.
   */
  const SLAB_FACES = [4, 5, 7, 6, 6, 7, 3, 2, 5, 1, 3, 7, 0, 4, 6, 2, 1, 0, 2, 3, 0, 1, 5, 4] as const
  const SLAB_TONE = [0, 1, 2, 0, 3, 3] as const
  /** A quad's two triangles, as its corners. */
  const QUAD_TRIS = [0, 1, 2, 0, 2, 3] as const
  /**
   * A bar as a slab behind the z = 0 plane, its front face the flat bar of the composed frame: written straight into
   * the vertex buffer, 36 vertices, without a call a face that would hand each of its numbers over boxed.
   */
  function slab(x0: number, x1: number, y0: number, y1: number, base: Float64Array) {
    const z0 = -2 * BAR_D, z1 = 0
    const dark = palette.dark
    // Lit from above and in front: the top catches the light, the far end and the back fall away from it. The
    // base at the wall takes the front's tone: every bar's base lies in one plane, and shaded apart they stacked
    // into a column that read as a tower rather than a distribution.
    const top = mixInto(barTop, base, dark ? palette.ink : palette.paper, dark ? 0.2 : 0.24)
    const end = mixInto(barEnd, base, dark ? palette.paper : palette.ink, dark ? 0.3 : 0.14)
    const low = mixInto(barLow, base, dark ? palette.paper : palette.ink, dark ? 0.45 : 0.24)
    const a = solid.room(36 * 7)
    let n = solid.n
    for (let f = 0; f < 6; f++) {
      const t = SLAB_TONE[f]!
      const c = t === 0 ? base : t === 1 ? top : t === 2 ? end : low
      const r = c[0]!, g = c[1]!, b = c[2]!
      for (let v = 0; v < 6; v++) {
        const k = SLAB_FACES[f * 4 + QUAD_TRIS[v]!]!
        a[n] = k & 1 ? x1 : x0
        a[n + 1] = k & 2 ? y1 : y0
        a[n + 2] = k & 4 ? z1 : z0
        a[n + 3] = r
        a[n + 4] = g
        a[n + 5] = b
        a[n + 6] = 1
        n += 7
      }
    }
    solid.n = n
  }

  /** New histogram data, or a previewed strike, gives the bars new targets. */
  function barTargets() {
    let maxC = 0, maxG = 0
    // A previewed strike is priced from the same counts, so the bars agree with its line.
    const { counts, payoff } = aggregate(pricer.fine, previewK ?? strike)
    for (let b = 0; b < HIST.bins; b++) {
      const c = counts[b]!
      const g = payoff[b]!
      barC[b] = c
      barG[b] = g
      maxC = Math.max(maxC, c)
      maxG = Math.max(maxG, g)
    }
    for (let b = 0; b < HIST.bins; b++) {
      barC[b] = maxC ? barC[b]! / maxC : 0
      barG[b] = maxG ? barG[b]! / maxG : 0
    }
    barsReady = true
  }

  function drawBars(dt: number) {
    solid.n = 0
    if (barsReady) {
      // A new run clears the GPU histogram and its first batch is noisy, so the
      // bars on screen ease toward each new target (a 50ms exponential follow)
      // instead of blinking out on every step of a volatility drag; the numbers stay instant.
      const follow = 1 - Math.exp(-Math.min(0.1, dt) * 20)
      let delta = 0
      for (let b = 0; b < HIST.bins; b++) {
        const dc = barC[b]! - cLen[b]!, dg = barG[b]! - gLen[b]!
        cLen[b] = cLen[b]! + dc * follow
        gLen[b] = gLen[b]! + dg * follow
        delta = Math.max(delta, Math.abs(dc), Math.abs(dg))
      }
      barsMoving = delta > 5e-4
      const w = morph.x
      const land = landing()
      // Bars shorter than two pixels are the thin tail: drawn, they read as a dashed stub.
      const pxPerLen = Math.abs(project(vp, HX0 + HLEN, 0, 0)[0] - project(vp, HX0, 0, 0)[0]) * cssW * 0.5
      const minLen = 2 / Math.max(1, pxPerLen)
      const dark = palette.dark
      for (let b = 0; b < HIST.bins; b++) {
        const len = land * ((1 - w) * cLen[b]! + w * gLen[b]!)
        if (len < minLen) continue
        const lo = HIST.lo + b * binWidth
        const pays = lo + binWidth / 2 > kv.x
        const a = ((1 - w) * (pays ? (dark ? 0.62 : 0.5) : dark ? 0.4 : 0.28) + w * 0.95) * fadeMul
        // Opaque, so depth sorts them: the ink's strength is mixed into paper instead of blended over it.
        slab(HX0, HX0 + HLEN * len, wy(lo) + 0.0025, wy(lo + binWidth) - 0.0025, mixInto(barBase, palette.paper, pays ? palette.indigo : palette.graphite, a))
      }
    }
    // The first frame builds the bars' pipeline with one slab far off screen, before any bar is due.
    if (!solid.n && !solidBound) slab(1e3, 1e3 + 1, 1e3, 1e3 + 1, mixInto(barBase, palette.paper, palette.paper, 0))
    if (!solid.n) return
    gl.bindVertexArray(solidVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, solidBuf)
    gl.bufferData(gl.ARRAY_BUFFER, solid.view(), gl.STREAM_DRAW)
    if (!solidBound) {
      solidBound = true
      const pl = gl.getAttribLocation(P.solid.program, 'aPos'), cl = gl.getAttribLocation(P.solid.program, 'aCol')
      gl.enableVertexAttribArray(pl)
      gl.vertexAttribPointer(pl, 3, gl.FLOAT, false, 28, 0)
      gl.enableVertexAttribArray(cl)
      gl.vertexAttribPointer(cl, 4, gl.FLOAT, false, 28, 12)
    }
    P.solid.use()
    gl.uniformMatrix4fv(P.solid.u('uVP'), false, vp)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)
    gl.drawArrays(gl.TRIANGLES, 0, solid.n / 7)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.DEPTH_TEST)
    gl.bindVertexArray(null)
  }

  // Flat overlay: hairlines and dashes built on the CPU in clip space, without an array per point.
  const flat = new Floats()
  /**
   * Where pj puts its answer, x and y in clip space and w: a typed array, so the numbers are written as they are
   * rather than boxed afresh for every point of every frame, as a closure's variables would be.
   */
  const S = new Float64Array(3)
  function pj(x: number, y: number, z: number) {
    const m = vp
    const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!
    S[0] = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w
    S[1] = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w
    S[2] = w
  }
  function segment(ax: number, ay: number, az: number, bx: number, by: number, bz: number, px: number, c: readonly number[], opacity: number) {
    pj(ax, ay, az)
    const x0 = S[0]!, y0 = S[1]!, w0 = S[2]!
    pj(bx, by, bz)
    if (w0 < 0.05 || S[2]! < 0.05) return
    const x1 = S[0]!, y1 = S[1]!
    const dx = (x1 - x0) * cw, dy = (y1 - y0) * ch
    const l = Math.hypot(dx, dy) || 1
    const nx = (-dy / l) * (px / cw), ny = (dx / l) * (px / ch)
    const r = c[0]!, g = c[1]!, b = c[2]!
    flat.put6(x0 + nx, y0 + ny, r, g, b, opacity)
    flat.put6(x0 - nx, y0 - ny, r, g, b, opacity)
    flat.put6(x1 + nx, y1 + ny, r, g, b, opacity)
    flat.put6(x1 + nx, y1 + ny, r, g, b, opacity)
    flat.put6(x0 - nx, y0 - ny, r, g, b, opacity)
    flat.put6(x1 - nx, y1 - ny, r, g, b, opacity)
  }
  function dashes(ax: number, ay: number, az: number, bx: number, by: number, bz: number, n: number, px: number, c: readonly number[], opacity: number) {
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 0.6) / n
      segment(ax + (bx - ax) * u0, ay + (by - ay) * u0, az + (bz - az) * u0, ax + (bx - ax) * u1, ay + (by - ay) * u1, az + (bz - az) * u1, px, c, opacity)
    }
  }

  function drawOverlay() {
    flat.n = 0
    const dpr = cw / Math.max(1, cssW)
    const hair = 0.5 * dpr
    const dark = palette.dark
    const z = zEdge()
    const lo = wy(AXIS.lo), hi = wy(AXIS.hi)
    // The frame (the expiry wall, its ticks, the strike) never fades: Replay clears only the futures.
    const vis = labelU
    const g = palette.graphite
    segment(X1, lo, z, X1, hi, z, hair, g, 0.5 * vis)
    if (depthU > 0.01) {
      // The wall: its outline, and a guide across it at each tick, firm enough to carry the eye from a price on the
      // scale to the bar at that price, and still under the outline.
      const a = depthU * vis
      segment(X1, lo, -z, X1, hi, -z, hair, g, 0.32 * a)
      segment(X1, lo, -z, X1, lo, z, hair, g, 0.32 * a)
      segment(X1, hi, -z, X1, hi, z, hair, g, 0.32 * a)
      for (const s of TICKS) segment(X1, wy(s), -z, X1, wy(s), z, hair, g, (dark ? 0.3 : 0.26) * a)
    }
    for (const s of TICKS) segment(X1 - 0.03, wy(s), z, X1, wy(s), z, hair, g, 0.8 * vis)
    // The distribution itself, left as a hairline outline once the claim has
    // taken its place, drawn on the bars' front faces. Bins under half a
    // percent of the tallest are the thin tail; the outline closes to the
    // baseline around them.
    if (barsReady) {
      const outlineA = (dark ? 0.6 : 0.55) * morph.x * vis * fadeMul
      if (outlineA > 0.005) {
        const land = landing()
        let prevX = -1
        for (let b = 0; b < HIST.bins; b++) {
          const blo = HIST.lo + b * binWidth
          const y0 = wy(blo), y1 = wy(blo + binWidth)
          if (cLen[b]! > 0.005) {
            const x = HX0 + HLEN * land * cLen[b]!
            segment(prevX >= 0 ? prevX : HX0, y0, 0, x, y0, 0, hair, g, outlineA)
            segment(x, y0, 0, x, y1, 0, hair, g, outlineA)
            prevX = x
          } else if (prevX >= 0) {
            segment(prevX, y0, 0, HX0, y0, 0, hair, g, outlineA)
            prevX = -1
          }
        }
      }
    }
    // The strike: a dashed ink reference line across the expiry region, and across the wall's depth once it has one.
    const y = wy(kv.x)
    dashes(LABELS.strike.x0, y, 0, LABELS.strike.x, y, 0, 30, 0.75 * dpr, palette.ink, 0.9)
    if (depthU > 0.01) dashes(X1, y, -z, X1, y, z, 12, 0.6 * dpr, palette.ink, 0.55 * depthU)
    if (!flat.n) return
    gl.bindVertexArray(flatVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, flatBuf)
    gl.bufferData(gl.ARRAY_BUFFER, flat.view(), gl.STREAM_DRAW)
    if (!flatBound) {
      flatBound = true
      const pl = gl.getAttribLocation(P.flat.program, 'aPos'), cl = gl.getAttribLocation(P.flat.program, 'aCol')
      gl.enableVertexAttribArray(pl)
      gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 24, 0)
      gl.enableVertexAttribArray(cl)
      gl.vertexAttribPointer(cl, 4, gl.FLOAT, false, 24, 8)
    }
    P.flat.use()
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.drawArrays(gl.TRIANGLES, 0, flat.n / 6)
    gl.disable(gl.BLEND)
    gl.bindVertexArray(null)
  }

  /** Places every label; true while any is still following its opacity, so the next frame is drawn too. */
  function placeLabels(dt: number): boolean {
    let following = false
    // Labels whose text changed are measured first, all together, before any style is written this frame: one
    // layout at most, never one for each label after another's write.
    for (const l of labels)
      if (l.text !== l.el.textContent) {
        l.text = l.el.textContent ?? ''
        l.w = l.el.offsetWidth
        l.h = l.el.offsetHeight
      }
    const follow = 1 - Math.exp(-dt / 0.06)
    for (const l of labels) {
      const [x, y, z] = l.at()
      const s = project(vp, x, y, z)
      // Kept inside the stage both ways, 4px in, however the camera sits.
      const px0 = ((s[0] + 1) / 2) * cssW
      let px = px0
      const left = px + l.side * l.w
      if (left < 4) px += 4 - left
      else if (left + l.w > cssW - 4) px -= left + l.w - (cssW - 4)
      const py0 = ((1 - s[1]) / 2) * cssH
      let py = py0
      const top = py + l.vside * l.h
      if (top < 4) py += 4 - top
      else if (top + l.h > cssH - 4) py -= top + l.h - (cssH - 4)
      // A label whose point has left the frame fades out rather than cutting, by how far the stage's edge has had to
      // hold it back (not by where its point sits: one held just inside, as the price is at the wall's top, reads at
      // full strength). The strike stays named. It fades before it passes the eye, too.
      const held = Math.max(Math.abs(px - px0), Math.abs(py - py0))
      const edge = l.el === strikeEl ? 1 : 1 - smooth(24, 96, held)
      const near = smooth(0.05, 0.25, s[2])
      const a = l.show() * (l.data ? fadeMul : 1) * edge * near
      // Followed over 60ms, so a change of the camera's mode never steps a label's opacity in one frame.
      l.k = l.k === null || Math.abs(a - l.k) < 0.005 ? a : l.k + (a - l.k) * follow
      if (l.k !== a) following = true
      const on = l.k > 0.01
      l.el.style.opacity = on ? l.k.toFixed(3) : '0'
      l.el.style.visibility = on ? 'visible' : 'hidden'
      if (!on) continue
      l.el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`
    }
    return following
  }

  /** Where the sequence is, from its phases: none, waiting to start, playing, or played. */
  function advanceSequence() {
    ph = o.sequence()
    const prev = seq
    seq = !ph ? 'none' : ph.price >= 1 ? 'done' : ph.burst > 0 ? 'playing' : 'pending'
    if (seq === 'playing' && prev !== 'playing') {
      // A new sequence prices from nothing, so the histogram really fills and
      // the estimate really converges while the reader watches.
      pricer.gen++
      o.onSequenceFrame()
    }
    // A quality step held back during the sequence lands once it is over.
    if (!inSeq() && pendingQ != null) {
      applyQuality(pendingQ)
      pendingQ = null
    }
  }

  /**
   * The camera, from the director: the composed frame while the sequence
   * waits and plays, the swing into depth after it, rest (drifting and leaning
   * with the reader), the flight and its way home, and Replay's rewind.
   */
  function moveCamera(dt: number, aspect: number): Pose {
    const rest = restPose(aspect, driftAt(driftT), { x: par.x.x, y: par.y.x })
    const next = director.step({ dt, aspect, rest, flight: o.camera(), sequence: inSeq(), speed: warm ? timeK : 0 })
    cam = director.mode
    depthU = director.depth
    labelU = director.labels
    flightP = director.flightP
    return next
  }

  const r: FuturesRenderer = {
    frame(t, dt) {
      if (!ready) {
        if (!programs.every((p) => p.ready())) return false
        ready = true
      }
      clock.now = t
      clock.frameNo++
      // A redraw with no time between (a resize) says nothing about the display's frame interval.
      if (dt > 0) {
        clock.dtEma = clock.dtEma * 0.9 + dt * 0.1
        // The display's own frame interval, learned: the shortest smoothed frame
        // seen, relaxing slowly so a change of display is picked up.
        clock.vsync = Math.min(clock.vsync * 1.0005, Math.max(1 / 240, clock.dtEma))
      }
      if (firstAt < 0) {
        firstAt = t
        // Replacing the still frame (a late first frame, a context given back), the figure opens where the still
        // stood: asked on the first frame, since the still may have come up after the renderer was made.
        if (o.atRest?.()) director.startAtRest()
      }
      if (!warm && (pricer.ready() || t - firstAt > 1.5)) warm = true
      // The reader's clocks (the sequence, the flight) move on drawn frames; the sequence waits for a warm figure.
      o.tick(warm || !inSeq() ? dt * 1000 : 0)
      if (fadeTo) {
        fadeTo.t += dt * 1000
        // From wherever the picture was (a Replay pressed while it was still coming back in), never from full.
        fadeMul = fadeTo.from * (1 - EASE_OUT(Math.min(1, fadeTo.t / fadeTo.ms)))
        if (fadeTo.t >= fadeTo.ms) fadeTo = null
      } else if (!director.rewinding && fadeMul < 1) {
        // Back in on the same ease-out it went out on, over the same 240ms.
        fadeUp = Math.min(1, fadeUp + dt / 0.24)
        fadeMul = Math.max(fadeMul, EASE_OUT(fadeUp))
      } else fadeUp = 0
      advanceSequence()
      const paused = o.paused()
      if (timeK < 0) timeK = paused ? 0 : 1
      timeK = paused ? Math.max(0, timeK - dt / 0.24) : Math.min(1, timeK + dt / 0.4)
      if (!inSeq() && !director.rewinding) {
        streamT += dt * timeK
        driftT += dt * timeK
      }
      spring(sig, sigma, dt, 30)
      const k0 = Math.round(kv.x)
      spring(kv, previewK ?? strike, dt, 30)
      if (Math.round(kv.x) !== k0) setStrikeText()
      // The reader leans the view, on a critically damped spring (ω 4: a heavy scene that visibly follows, 95% in
      // about 1.2s); paused, it comes to rest where it is, its speed spent on the same spring rather than frozen in a
      // frame and handed back whole on Resume.
      const lean = paused ? { x: par.x.x, y: par.y.x } : o.parallax()
      spring(par.x, lean.x, dt, 4)
      spring(par.y, lean.y, dt, 4)
      const aspect = cssW / Math.max(1, cssH)
      pose = moveCamera(dt, aspect)
      // Alongside the fan the futures step back by half, so the camera is among them without drowning in them; at
      // the wall a little more, and the bars carry the view.
      spring(focus, cam === 'flight' ? 1 - 0.5 * smooth(0.28, 0.45, flightP) - 0.05 * smooth(0.6, 0.8, flightP) : 1, dt, 5)
      spring(edgeK, cam === 'flight' ? smooth(0.2, 0.3, flightP) : 0, dt, 6)
      if (firstFrame) {
        firstFrame = false
        // A visit without a sequence opens on the finished picture: payoff bars and the price.
        if (!inSeq()) morph.x = 1
      }
      // The morph: the sequence's own clock while it plays; the flight's once
      // it faces the wall; and the finished payoff picture at rest or on the way home.
      let morphTarget = 1
      if (inSeq()) {
        morph.x = EASE_IN_OUT(ph!.morph)
        morph.v = 0
      } else {
        morphTarget = cam === 'flight' ? flightMorph(flightP) : 1
        spring(morph, morphTarget, dt, 12)
      }

      if (pricer.collect()) {
        barTargets()
        if (paused) {
          // Paused, the bars do not ease: they take each new count as it lands, redrawn at most once a second, as a
          // table would be refreshed, while the estimate in the margin carries on converging.
          cLen.set(barC)
          gLen.set(barG)
          barsMoving = false
          if (clock.now - refreshedAt > 1) {
            dirty = true
            refreshedAt = clock.now
          }
        } else barsMoving = true
      }
      const markedNow = pricer.marked()
      // A still frame is not drawn again: only what is changing is. At rest the
      // figure moves by itself (the stream and the drift) unless it is paused;
      // paused, the settle into depth holds too. A flight is the reader's, and runs.
      const why: string[] = []
      if (dirty) why.push('changed')
      if (!(dt > 0)) why.push('redraw')
      if (timeK > 0) why.push('moving')
      if (cam === 'flight' || cam === 'return') why.push('flight')
      if (inSeq()) why.push('sequence')
      if (fadeTo || director.rewinding || fadeMul < 1) why.push('replay')
      if (barsMoving) why.push('bars')
      if (!arrived(focus, 1, 1e-4) || !arrived(edgeK, 0, 1e-4)) why.push('focus')
      if (!arrived(sig, sigma, 1e-6) || !arrived(kv, previewK ?? strike, 1e-3)) why.push('inputs')
      if (!arrived(morph, morphTarget, 1e-5)) why.push('morph')
      drawnFor = why
      const still = why.length === 0
      if (!still) {
        vp = viewProjection(pose, aspect)
        const ink = writeSlots()
        drawFutures(ink)
        bind(null)
        gl.clearColor(palette.paper[0], palette.paper[1], palette.paper[2], 1)
        gl.clearDepth(1)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
        drawBars(dt)
        composite()
        drawOverlay()
        // The histogram's words change at the morph's middle through the site's word swap, on the clock, whatever the
        // morph's own speed: out through a 3px blur (120ms), the new words, back in (120ms).
        const ht = morph.x >= 0.5 ? 1 : 0
        if (ht !== histWant) {
          histWant = ht
          // Turned back mid-swap, the blur goes on from where it is: out again toward the other words, or back in to
          // the words already there. `u` runs 0 → 1 blurring out and 1 → 2 blurring in, 120ms each.
          const d = histSwapAt >= 0 ? histBlur((clock.now - histSwapAt) / 0.12) : 0
          const u = histText === ht ? 1 + unQuint(1 - d) : unQuint(d)
          histSwapAt = histText === ht && d === 0 ? -1 : clock.now - u * 0.12
        }
        if (histSwapAt >= 0) {
          const u = (clock.now - histSwapAt) / 0.12
          if (u >= 1 && histText !== histWant) {
            histText = histWant
            histEl.textContent = histText ? 'Payoff × how often it happens' : 'Where the paths end'
          }
          const b = histBlur(u)
          histEl.style.filter = b > 0 ? `blur(${(3 * b).toFixed(2)}px)` : ''
          if (u >= 2) histSwapAt = -1
        }
        dirty = placeLabels(dt) || histSwapAt >= 0
        o.labels.dataset.draws = String(++draws)
        o.labels.dataset.camera = cam
      }
      // Waiting for its reader, the figure prices one batch, which builds and warms everything pricing uses (so the
      // burst does not stall on it), then holds until the sequence restarts the run from nothing. Paused, it holds
      // once it has an estimate worth showing, so the numbers stop with the picture (WCAG 2.2.2).
      // A change to an input always prices once, paused or not: that restarts the run for the new option, so the
      // margin never measures the held estimate of one option against the formula of another.
      if (seq === 'pending' ? !warmed : repriced || !(paused && est.n >= HOLD_N)) {
        pricer.price()
        warmed = true
        repriced = false
      }
      gl.flush()
      report(markedNow)
      // Paused, with nothing to draw, the frame says so: the governor must not read a still figure as spare time and climb.
      return still && paused ? 'idle' : true
    },
    resize(w, h, cw2, ch2) {
      cw = w
      ch = h
      cssW = cw2
      cssH = ch2
      buildScreen()
      dirty = true
    },
    // The display's refresh as the stage's governor learned it (a 30 Hz clock in Low Power Mode, say): the pricing
    // judges its frames by it, so a slow clock is not read as a backlog and the batches do not shrink to one.
    refresh(interval) {
      clock.vsync = Math.max(1 / 240, interval)
    },
    setQuality(level) {
      // Mid-sequence, a new pricing grid would restart the estimate and a
      // bloom switch would change the picture under the reader: it waits.
      if (inSeq()) pendingQ = level
      else applyQuality(level)
    },
    setPalette(p) {
      palette = p
      dirty = true
    },
    preview(k) {
      if (k === previewK) return
      previewK = k
      if (pricer.ready()) barTargets()
      dirty = true
    },
    setParams(s, k) {
      if (s === sigma && k === strike) return
      sigma = s
      strike = k
      pricer.setParams(s, k)
      repriced = true
      dirty = true
    },
    rewind(then) {
      // A second press while it is already on its way back changes nothing.
      if (director.rewinding) return
      director.rewind(() => {
        streamT = 0
        then()
      })
      fadeTo = { t: 0, ms: 240, from: fadeMul }
    },
    priceAt(x, y) {
      const rect = o.labels.getBoundingClientRect()
      const nx = ((x - rect.left) / rect.width) * 2 - 1
      const ny = 1 - ((y - rect.top) / rect.height) * 2
      if (!pose || nx < -1 || nx > 1 || ny < -1 || ny > 1) return null
      // On the wall, where the scale, the strike's line and the bars' base are drawn (lib/futures/camera.ts).
      const aspect = cssW / Math.max(1, cssH)
      const p = wallPrice(pose, aspect, nx, ny, zEdge())
      if (p == null) return null
      // Only near the wall itself: the price's line across the wall, projected, within 40px of the pointer. A pointer
      // resting on today or the paths' middle names no strike (the whole stage once did, and rewrote the price shown).
      const vpm = viewProjection(pose, aspect)
      const px = (z: number) => {
        const c = project(vpm, X1, wy(p), z)
        return [((c[0] + 1) / 2) * rect.width, ((1 - c[1]) / 2) * rect.height] as const
      }
      const [ax, ay] = px(0), [bx, by] = px(zEdge())
      const qx = x - rect.left, qy = y - rect.top
      const L = Math.hypot(bx - ax, by - ay) || 1
      const u = Math.max(0, Math.min(1, ((qx - ax) * (bx - ax) + (qy - ay) * (by - ay)) / (L * L)))
      const far = Math.hypot(qx - (ax + u * (bx - ax)), qy - (ay + u * (by - ay)))
      return far <= 40 ? p : null
    },
    debug() {
      const i = pricer.info()
      // A finished run reports its average, as the readout does, not the idle window after it.
      const rate = pricer.doneAt ? pricer.runPaths / Math.max(1e-3, pricer.doneAt - pricer.runStart) : pricer.rate()
      return {
        density,
        strands: pathN,
        grid: `${i.grid}² paths × ${i.batches} batches a frame`,
        readback: `${i.readMs.toFixed(2)} ms`,
        // The frame interval the pricing judges its batches by (the display's refresh, as the stage learned it).
        clock: `${(clock.vsync * 1000).toFixed(1)} ms`,
        paths: `${est.n.toLocaleString('en-US')}${pricer.doneAt ? ' (complete)' : ''}`,
        rate: rate > 0 ? `${(rate / 1e6).toFixed(1)}M paths/s` : 'measuring',
        camera: cam,
        stream: `${streamT.toFixed(1)} s${o.paused() ? ' (paused)' : ''}`,
        draws: `${draws}${drawnFor.length ? ` · drawing for: ${drawnFor.join(' ')}` : ' · still'}`,
      }
    },
    dispose() {
      for (const p of Object.values(P)) gl.deleteProgram(p.program)
      pricer.dispose()
      for (const t of [pathT, slotsT, den, ...bl]) disposeTarget(gl, t)
      gl.deleteBuffer(flatBuf)
      gl.deleteBuffer(solidBuf)
      gl.deleteVertexArray(flatVao)
      gl.deleteVertexArray(solidVao)
      gl.deleteVertexArray(empty)
      o.labels.replaceChildren()
    },
  }
  applyQuality(q)
  return r
}
