import type { Palette, Renderer, StageEnv } from '@/components/stage/useStage'
import { EASE_IN_OUT, EASE_OUT } from '@/lib/ease'
import { project, viewProjection, type M4, type V3 } from '@/lib/futures/flight'
import { RNG } from '@/lib/futures/glsl'
import { CAP_LOG2, Estimator, GROUPS, HIST, MODEL, binWidth, discount, stepCoefficients } from '@/lib/futures/mc'
import { BURST, type Phases } from '@/lib/futures/sequence'
import { AXIS, HLEN, HX0, LABELS, PY, TICKS, TICK_CLEAR, X0, X1, ZW, wy } from '@/lib/futures/world'
import { FULLSCREEN_VS, disposeTarget, drawFullscreen, program, target, type GL, type Program, type Tier, type Target } from '@/lib/gl'
import { LABEL } from './Poster'

/**
 * A million futures, live. Raw WebGL2.
 *
 * Two jobs share one context. The pricing job runs a fragment shader over a
 * W×W grid, one path per fragment, 64 exact log-space steps each, and writes
 * (payoff, payoff², S_T, 1). Four-by-four summing passes reduce the grid to
 * one texel per batch; the terminal prices are also scattered, with additive
 * blending, into a histogram. Results come back through a pixel-pack buffer
 * and a fence, never a stalling readPixels, and are summed in float64 on the
 * CPU. As many batches run per frame as the frame budget allows: the count
 * grows while fences come back within a frame or two and backs off when they
 * do not.
 *
 * The drawing job shows a few thousand fixed members of the same ensemble —
 * the same generator, the same ids the poster draws the first ninety of — as
 * line strips accumulated into a float density buffer (paths that finish above
 * the strike in one channel, the rest in another), bloomed, and composited into
 * the site palette: a glow at night, ink absorbed into paper by day.
 *
 * The signature sequence (lib/futures/sequence.ts) drives the reveal: each
 * strand's front eases out of today on a golden-ratio stagger; the histogram
 * rises as the GPU's own counts land; the counts become payoff × probability;
 * the price appears. Pricing restarts when the sequence does, so the numbers
 * really are converging while the reader watches. Then the figure falls still,
 * and moves again only when the reader acts: nothing on the site loops by
 * itself. A still frame is not redrawn: frames are drawn only while something
 * is changing.
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
  /** Where the flight is, 0 being the composed frame. */
  camera: () => number
  /** A frame was drawn, taking this long: the clocks that move only on drawn frames advance. */
  tick: (dtMs: number) => void
  onStats: (s: Stats) => void
  /** The sequence's first frame is on screen. */
  onSequenceFrame: () => void
}

export interface FuturesRenderer extends Renderer {
  setParams(sigma: number, strike: number): void
  /** A strike under the pointer, drawn but not priced; null returns to the committed one. */
  preview(strike: number | null): void
  /** The price under a point on the canvas, on the expiry plane, or null. */
  priceAt(clientX: number, clientY: number): number | null
  /** Fade the futures out over `ms`, then call `then`: how Replay clears the page before the burst. */
  fadeOut(ms: number, then: () => void): void
}

export const CAP = 2 ** CAP_LOG2
const MAXB = 64
/**
 * Strands drawn, fixed for the device: a quality step changes resolution and
 * bloom, never the number of futures on screen, so nothing pops in or out.
 */
const STRANDS: Record<Tier, number> = { software: 320, low: 900, mid: 2048, high: 4096 }
// Pricing is governed by its own fences, so above the software tier it is
// not tied to the drawing quality: a phone that draws fewer strands can still
// price as fast as its GPU allows.
const GRID = [64, 256, 256, 256] as const
const BATCHES = [1, 48, 64, 64] as const
/** The stage area the gains are tuned at (the lg stage, 710 × 404). A smaller stage packs the same futures tighter. */
const REF_AREA = 710 * 404

// ── shaders ──────────────────────────────────────────────────────────────────

const HEAD = `#version 300 es
precision highp float;
precision highp int;
`

const KERNEL_FS = `${HEAD}${RNG}
uniform uint uOffset; uniform int uW; uniform float uDrift, uVol, uS0, uK;
out vec4 o;
void main() {
  ivec2 f = ivec2(gl_FragCoord.xy);
  uint id = uOffset + uint(f.y * uW + f.x);
  float x = 0.0;
  for (uint g = 0u; g < ${GROUPS}u; g++) {
    vec4 z = normals4(id, g);
    x += 4.0 * uDrift + uVol * (z.x + z.y + z.z + z.w);
  }
  float s = uS0 * exp(x);
  float p = max(s - uK, 0.0);
  o = vec4(p, p * p, s, 1.0);
}`

const REDUCE_FS = `${HEAD}
uniform sampler2D uSrc; uniform ivec2 uSize; uniform ivec2 uOrigin;
out vec4 o;
void main() {
  ivec2 b = (ivec2(gl_FragCoord.xy) - uOrigin) * 4;
  vec4 s = vec4(0.0);
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    ivec2 p = b + ivec2(x, y);
    if (p.x < uSize.x && p.y < uSize.y) s += texelFetch(uSrc, p, 0);
  }
  o = s;
}`

const SCATTER_VS = `${HEAD}
uniform sampler2D uSrc; uniform int uW; uniform float uLo, uBin; uniform int uBins;
out float vPay;
void main() {
  vec4 s = texelFetch(uSrc, ivec2(gl_VertexID % uW, gl_VertexID / uW), 0);
  float b = floor((s.b - uLo) / uBin);
  vPay = s.r;
  gl_PointSize = 1.0;
  gl_Position = (b < 0.0 || b >= float(uBins)) ? vec4(2.0, 2.0, 2.0, 1.0) : vec4((b + 0.5) / float(uBins) * 2.0 - 1.0, 0.0, 0.0, 1.0);
}`

const SCATTER_FS = `${HEAD}
in float vPay; out vec4 o;
void main() { o = vec4(1.0, vPay, 0.0, 0.0); }`

// One fragment per (strand, step): the log return of ensemble member i up to
// that step. Member i is the same path lib/futures/mc.ts's path(i) gives.
const PATH_FS = `${HEAD}${RNG}
uniform int uN, uH; uniform float uDrift, uVol;
out vec4 o;
void main() {
  ivec2 f = ivec2(gl_FragCoord.xy);
  int block = f.x / 65;
  int j = f.x - block * 65;
  int i = block * uH + f.y;
  if (i >= uN) { o = vec4(0.0); return; }
  uint id = uint(i);
  float x = 0.0;
  for (int g = 0; g < ${GROUPS}; g++) {
    int rem = j - g * 4;
    if (rem <= 0) break;
    vec4 z = normals4(id, uint(g));
    vec4 m = vec4(greaterThan(vec4(rem), vec4(0.0, 1.0, 2.0, 3.0)));
    x += uDrift * dot(m, vec4(1.0)) + uVol * dot(m, z);
  }
  o = vec4(x, 0.0, 0.0, 1.0);
}`

// Where strand i is and how much of it is showing. Its front eases out of
// today on the burst's golden-ratio stagger, on a quintic — the power curve
// closest to the site's cubic-bezier(0.23, 1, 0.32, 1). Outside the sequence
// uBurst is 1 and every path is whole.
const STRAND = `
uniform sampler2D uPath; uniform int uN, uH; uniform float uK, uS0, uGain, uBurst;
uniform mat4 uVP;
float lr(int i, int j) { return texelFetch(uPath, ivec2((i / uH) * 65 + j, i % uH), 0).r; }
struct St { vec3 p; float reveal; float front; bool pays; };
St strand(int i, float jWant) {
  St s;
  float u = clamp((uBurst - fract(float(i) * 0.618034) * ${BURST.launch.toFixed(3)}) / ${BURST.front.toFixed(3)}, 0.0, 1.0);
  float v = 1.0 - u;
  s.reveal = 1.0 - v * v * v * v * v;
  s.front = s.reveal * 64.0;
  float jj = min(jWant, s.front);
  int j0 = int(floor(jj));
  int j1 = min(j0 + 1, 64);
  float x = mix(lr(i, j0), lr(i, j1), jj - float(j0));
  float t = jj / 64.0;
  float S = uS0 * exp(x);
  // Depth only: a Gaussian lane per strand, so the cloud's cross-section is soft.
  uvec4 h = pcg4d(uvec4(uint(i), 65535u, SEED, SALT));
  float lane = clamp(sqrt(-2.0 * log(unit(h.x))) * cos(6.2831853 * unit(h.y)), -2.5, 2.5);
  s.p = vec3(${X0.toFixed(3)} + ${(X1 - X0).toFixed(3)} * t, (S - uS0) * ${PY}, lane * ${(ZW * 0.45).toFixed(3)} * sqrt(t));
  s.pays = uS0 * exp(lr(i, 64)) > uK;
  return s;
}`

const LINE_VS = `${HEAD}${RNG}${STRAND}
out float vW; flat out int vPays;
void main() {
  int i = gl_VertexID / 128;
  int v = gl_VertexID - i * 128;
  int seg = v / 2;
  St s = strand(i, float(seg + (v & 1)));
  vPays = s.pays ? 1 : 0;
  vW = float(seg) < s.front ? uGain : 0.0;
  gl_Position = uVP * vec4(s.p, 1.0);
}`

// A head rides each front while it travels, and is gone once the path is whole.
const HEAD_VS = `${HEAD}${RNG}${STRAND}
uniform float uSize;
out float vW; flat out int vPays;
void main() {
  St s = strand(gl_VertexID, 64.0);
  vPays = s.pays ? 1 : 0;
  vW = uGain * 4.5 * step(0.001, s.reveal) * (1.0 - smoothstep(0.97, 1.0, s.reveal));
  gl_PointSize = uSize;
  gl_Position = uVP * vec4(s.p, 1.0);
}`

const DENSITY_FS = `${HEAD}
in float vW; flat in int vPays; uniform float uPoint;
out vec4 o;
void main() {
  float w = vW;
  if (uPoint > 0.5) w *= 1.0 - smoothstep(0.15, 0.5, length(gl_PointCoord - 0.5));
  o = vPays == 1 ? vec4(w, 0.0, 0.0, 0.0) : vec4(0.0, w, 0.0, 0.0);
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

// Night: the density glows toward the palette's indigo, dimmer than the lab's,
// so the densest cores stay lavender rather than washing out to white.
// Day: ink on paper. Each strand absorbs light — Beer–Lambert, in linear light,
// with absorption per unit of density set from the token's colour — and the
// total depth saturates (at most 1.2 units, shared between the two inks in
// proportion), so where every future crosses, at today, the paper goes deep
// indigo-slate, never black, and keeps its hue. The bloom is a faint shadow of
// the crowd.
const COMPOSITE_FS = `${HEAD}
in vec2 vUv;
uniform sampler2D uDen, uB1, uB2;
uniform vec3 uPaper, uInk, uGraphite, uIndigo, uWash;
uniform float uDark, uBloom, uTone, uFade;
out vec4 o;
vec3 lin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec2 d = texture(uDen, vUv).rg * uFade;
  vec2 b = uBloom > 0.5 ? (texture(uB1, vUv).rg * 0.7 + texture(uB2, vUv).rg * 1.1) * uFade : vec2(0.0);
  if (uDark > 0.5) {
    b *= 0.78;
    float pays = 1.0 - exp(-uTone * d.r);
    float not_ = 1.0 - exp(-uTone * d.g);
    float halo = 1.0 - exp(-1.4 * (b.r + 0.4 * b.g));
    vec3 c = mix(uPaper, uWash, halo);
    c = mix(c, uGraphite, not_ * 0.7);
    c = mix(c, uIndigo, pays);
    c += uIndigo * 0.18 * (1.0 - exp(-1.2 * b.r));
    c = mix(c, uInk, 0.15 * smoothstep(0.5, 1.0, 1.0 - exp(-uTone * 0.08 * d.r)));
    o = vec4(min(c, vec3(1.0)), 1.0);
  } else {
    vec3 P = lin(uPaper);
    vec3 aPay = -log(clamp(lin(uIndigo) / P, vec3(1e-3), vec3(1.0)));
    vec3 aNot = -log(clamp(lin(uGraphite) / P, vec3(1e-3), vec3(1.0)));
    float dp = uTone * d.r + 0.06 * b.r;
    float dn = 0.55 * uTone * d.g + 0.03 * b.g;
    float s = dp + dn;
    float k = s > 1e-4 ? 1.2 * (1.0 - exp(-s / 1.2)) / s : 1.0;
    vec3 tau = (aPay * dp + aNot * dn) * k;
    o = vec4(srgb(P * exp(-tau)), 1.0);
  }
}`

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
function spring(s: { x: number; v: number }, target: number, dt: number, omega: number) {
  const d = s.x - target
  const e = Math.exp(-omega * dt)
  const c = s.v + omega * d
  s.x = target + (d + c * dt) * e
  s.v = (s.v - omega * c * dt) * e
}
/** Whether a spring has arrived; if it has, it is put exactly there, so a still figure stays still. */
function arrived(s: { x: number; v: number }, target: number, eps: number) {
  if (Math.abs(s.x - target) > eps || Math.abs(s.v) > eps * 10) return false
  s.x = target
  s.v = 0
  return true
}

/** Where the flight turns the histogram into payoff: once it faces expiry (lib/futures/flight.ts keys). */
const flightMorph = (p: number) => EASE_IN_OUT(clamp01((p - 0.8) / 0.14))
/** Labels step aside while the camera is in among the futures. */
const outside = (p: number) => 1 - smooth(0.24, 0.34, p) + smooth(0.68, 0.78, p)

type SeqState = 'none' | 'pending' | 'playing' | 'done'

// ── the renderer ─────────────────────────────────────────────────────────────

export function createRenderer(env: StageEnv, o: Options): FuturesRenderer {
  const gl: GL = env.gl
  gl.getExtension('EXT_color_buffer_float')
  gl.getExtension('EXT_float_blend')
  gl.getExtension('OES_texture_float_linear')

  const P = {
    kernel: program(gl, FULLSCREEN_VS, KERNEL_FS),
    reduce: program(gl, FULLSCREEN_VS, REDUCE_FS),
    scatter: program(gl, SCATTER_VS, SCATTER_FS),
    path: program(gl, FULLSCREEN_VS, PATH_FS),
    line: program(gl, LINE_VS, DENSITY_FS),
    head: program(gl, HEAD_VS, DENSITY_FS),
    down: program(gl, FULLSCREEN_VS, DOWN_FS),
    blur: program(gl, FULLSCREEN_VS, BLUR_FS),
    composite: program(gl, FULLSCREEN_VS, COMPOSITE_FS),
    flat: program(gl, FLAT_VS, FLAT_FS),
  }
  const programs: Program[] = Object.values(P)
  let ready = false

  const empty = gl.createVertexArray()
  const flatVao = gl.createVertexArray()!
  const flatBuf = gl.createBuffer()!
  let flatBound = false

  let palette: Palette = env.palette
  let q = 2
  /** A quality step asked for while the sequence plays waits until it is over. */
  let pendingQ: number | null = null
  let W = 0
  let chain: Target[] = []
  let grid: Target | null = null
  const results = target(gl, MAXB, 1, { float: 'f32' })
  const hist = target(gl, HIST.bins, 1, { float: 'f32' })
  const pathN = STRANDS[env.tier]
  const pathH = Math.min(pathN, 1024)
  // R32F, one channel: 65 steps per strand, strands in columns of pathH.
  const pathT = target(gl, 65 * Math.ceil(pathN / pathH), pathH, { float: 'f32', channels: 1 })
  let den: Target | null = null
  let bl: Target[] = []
  let cw = 1, ch = 1, cssW = 1, cssH = 1

  // Pricing state
  let sigma: number = MODEL.sigma, strike: number = MODEL.strike
  let previewK: number | null = null
  let gen = 0, runGen = -1
  let offset = 0
  const est = new Estimator(discount())
  let B = 1
  let frameNo = 0
  let dtEma = 1 / 60
  // The display's own frame interval, learned: the shortest smoothed frame seen,
  // relaxing slowly so a change of display is picked up.
  let vsync = 1 / 60
  const phone = env.tier !== 'high'
  let readMs = 0
  // A ring of pack-buffer pairs: one for the batch sums, one for the
  // histogram. Each buffer is written once per fence and read once after it
  // has signalled. Usage is DYNAMIC_COPY, not a READ usage: Chromium keeps a
  // "shadow copy" of READ buffers that, measured in Chrome 154 on ANGLE/Metal,
  // made no read cheaper and logged a performance warning on every reuse.
  const RING = 4
  const buffer = (bytes: number) => {
    const b = gl.createBuffer()!
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b)
    gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.DYNAMIC_COPY)
    return b
  }
  type Pair = { sums: WebGLBuffer; hist: WebGLBuffer }
  const pbos: Pair[] = Array.from({ length: RING }, () => ({ sums: buffer(MAXB * 16), hist: buffer(HIST.bins * 16) }))
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
  const free = pbos.slice()
  const pending: { sync: WebGLSync; pbo: Pair; batches: number; gen: number; at: number; seen: number }[] = []
  const readBuf = new Float32Array(MAXB * 4)
  const histData = new Float32Array(HIST.bins * 4)
  let histGen = -1
  // Normalised bar lengths: the counts, and what each bin pays (count × payoff).
  const barC = new Float32Array(HIST.bins)
  const barG = new Float32Array(HIST.bins)
  // What is on screen, easing toward those: a new run's first batch is noisy.
  const cLen = new Float32Array(HIST.bins)
  const gLen = new Float32Array(HIST.bins)
  let barsReady = false
  let barsMoving = true
  let runStart = 0, runPaths = 0, doneAt = 0
  let rateT = 0, rateN = 0, rate = 0
  let statsAt = 0
  let histAt = -1
  let mark = 4096
  let now = 0

  // Visual state
  const sig = { x: sigma, v: 0 }
  const kv = { x: strike, v: 0 }
  const prog = { x: 0, v: 0 }
  const morph = { x: 0, v: 0 }
  let vp: M4 = new Float32Array(16)
  let seq: SeqState = 'none'
  let ph: Phases | null = null
  let lastCam = 0
  let returning = false
  let fade: { t: number; ms: number; then: () => void } | null = null
  let fadeMul = 1
  let firstFrame = true
  /** Something changed that a still frame does not show yet. */
  let dirty = true
  let fresh = false
  let draws = 0

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
    show: (p: number) => number
    side: -1 | -0.5 | 0
    vside: -1 | -0.5 | 0
    w: number
    h: number
    text: string
    data: boolean
  }
  const labels: Label[] = []
  const label = (text: string, cls: string, at: () => V3, show: (p: number) => number, data = false) => {
    const el = document.createElement('span')
    el.textContent = text
    el.className = `${LABEL} left-0 top-0 ${cls}`
    el.style.opacity = '0'
    o.labels.appendChild(el)
    const side = cls.includes('-translate-x-full') ? -1 : cls.includes('-translate-x-1/2') ? -0.5 : 0
    const vside = cls.includes('-translate-y-full') ? -1 : cls.includes('-translate-y-1/2') ? -0.5 : 0
    labels.push({ el, at, show, side, vside, w: -1, h: -1, text: '', data })
    return el
  }
  const at2 = (a: readonly number[]): V3 => [a[0]!, a[1]!, 0]
  const inSeq = () => seq === 'pending' || seq === 'playing'
  const landing = () => (inSeq() ? EASE_OUT(ph!.landing) : 1)
  // Today stays named until the camera turns to expiry, where it leaves the frame.
  label(`Today · $${MODEL.s0}`, LABELS.today.cls, () => at2(LABELS.today.at), (p) => 1 - smooth(0.5, 0.6, p))
  label('One year out', LABELS.expiry.cls, () => at2(LABELS.expiry.at), outside)
  for (const s of TICKS) label(`$${s}`, LABELS.tick.cls, () => [LABELS.tick.x, wy(s), 0], (p) => (Math.abs(s - kv.x) < TICK_CLEAR ? 0 : outside(p)))
  // The strike stays named through the whole flight: it is what the colours mean.
  const strikeEl = label('', LABELS.strike.cls, () => [LABELS.strike.x0, wy(kv.x), 0], () => 1)
  // One label for the histogram. Its words change halfway through the morph,
  // and it dips to nothing there, so one text never crossfades into another.
  const histEl = label('Where the paths end', `${LABELS.hist.cls} text-ink`, () => at2(LABELS.hist.at), (p) =>
    outside(p) * landing() * smooth(0.02, 0.22, Math.abs(2 * morph.x - 1)),
    true,
  )
  let histText = 0
  // The climax: the payoff bars, averaged and discounted, are the call's price.
  // The number is the live Monte Carlo estimate, not a restatement of the formula.
  const valueEl = label('', `${LABELS.value.cls} text-indigo`, () => [LABELS.value.x, wy(kv.x - LABELS.value.below), 0], (p) =>
    est.n > 0 ? outside(p) * smooth(0.55, 1, morph.x) * (inSeq() ? EASE_OUT(clamp01(ph!.price / 0.24)) : 1) : 0,
    true,
  )
  let valueText = ''
  const setStrikeText = () => (strikeEl.textContent = `Strike $${Math.round(kv.x)}`)
  setStrikeText()

  // ── resources that depend on quality and size ──

  function buildGrid() {
    const w = GRID[q]!
    if (w === W) return
    disposeTarget(gl, grid)
    chain.forEach((t) => disposeTarget(gl, t))
    W = w
    grid = target(gl, W, W, { float: 'f32' })
    chain = []
    let s = W
    while (Math.ceil(s / 4) > 1) {
      s = Math.ceil(s / 4)
      chain.push(target(gl, s, s, { float: 'f32' }))
    }
    // A new batch size starts a new run, so every batch in a run is the same size.
    gen++
  }

  function applyQuality(level: number) {
    q = Math.max(0, Math.min(3, level))
    buildGrid()
    B = Math.min(B, BATCHES[q]!)
    dirty = true
  }

  function buildScreen() {
    disposeTarget(gl, den)
    bl.forEach((t) => disposeTarget(gl, t))
    const scale = Math.min(1.5, cw / Math.max(1, cssW))
    const dw = Math.max(1, Math.round(cssW * scale)), dh = Math.max(1, Math.round(cssH * scale))
    den = target(gl, dw, dh, { float: 'f16', linear: true })
    const h2 = [Math.max(1, dw >> 1), Math.max(1, dh >> 1)] as const
    const h4 = [Math.max(1, dw >> 2), Math.max(1, dh >> 2)] as const
    const h8 = [Math.max(1, dw >> 3), Math.max(1, dh >> 3)] as const
    bl = [
      target(gl, h2[0], h2[1], { float: 'f16', linear: true }),
      target(gl, h4[0], h4[1], { float: 'f16', linear: true }),
      target(gl, h4[0], h4[1], { float: 'f16', linear: true }),
      target(gl, h8[0], h8[1], { float: 'f16', linear: true }),
      target(gl, h8[0], h8[1], { float: 'f16', linear: true }),
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

  // ── pricing ──

  function price() {
    if (!grid) return
    if (runGen !== gen) {
      runGen = gen
      offset = 0
      est.reset()
      runStart = now
      runPaths = 0
      doneAt = 0
      rateT = now
      rateN = 0
      // `rate` is kept: the device is as fast as it was a moment ago.
      B = Math.min(B, BATCHES[q]!)
      bind(hist)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      histGen = -1
      histAt = -1
      mark = 4096
    }
    if (offset >= CAP || !free.length) return
    const { drift, vol } = stepCoefficients(sigma)
    const n = Math.min(B, BATCHES[q]!, (CAP - offset) / (W * W))
    gl.disable(gl.BLEND)
    for (let b = 0; b < n; b++) {
      // Simulate W×W paths.
      bind(grid)
      P.kernel.use()
      gl.uniform1ui(P.kernel.u('uOffset'), offset)
      gl.uniform1i(P.kernel.u('uW'), W)
      gl.uniform1f(P.kernel.u('uDrift'), drift)
      gl.uniform1f(P.kernel.u('uVol'), vol)
      gl.uniform1f(P.kernel.u('uS0'), MODEL.s0)
      gl.uniform1f(P.kernel.u('uK'), strike)
      drawFullscreen(gl)
      // Sum them, four by four, into this batch's texel of `results`.
      P.reduce.use()
      gl.uniform1i(P.reduce.u('uSrc'), 0)
      let src: Target = grid
      for (let c = 0; c <= chain.length; c++) {
        const last = c === chain.length
        if (last) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, results.fbo)
          gl.viewport(b, 0, 1, 1)
          gl.uniform2i(P.reduce.u('uOrigin'), b, 0)
        } else {
          bind(chain[c]!)
          gl.uniform2i(P.reduce.u('uOrigin'), 0, 0)
        }
        tex(0, src)
        gl.uniform2i(P.reduce.u('uSize'), src.w, src.h)
        drawFullscreen(gl)
        if (!last) src = chain[c]!
      }
      // Scatter the terminal prices into the histogram.
      bind(hist)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE)
      P.scatter.use()
      tex(0, grid)
      gl.uniform1i(P.scatter.u('uSrc'), 0)
      gl.uniform1i(P.scatter.u('uW'), W)
      gl.uniform1f(P.scatter.u('uLo'), HIST.lo)
      gl.uniform1f(P.scatter.u('uBin'), binWidth)
      gl.uniform1i(P.scatter.u('uBins'), HIST.bins)
      gl.bindVertexArray(empty)
      gl.drawArrays(gl.POINTS, 0, W * W)
      gl.disable(gl.BLEND)
      offset += W * W
    }
    // Read both back without waiting: into a pack buffer, fenced.
    const pbo = free.shift()!
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo.sums)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, results.fbo)
    gl.readPixels(0, 0, n, 1, gl.RGBA, gl.FLOAT, 0)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo.hist)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, hist.fbo)
    gl.readPixels(0, 0, HIST.bins, 1, gl.RGBA, gl.FLOAT, 0)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    if (sync) pending.push({ sync, pbo, batches: n, gen, at: frameNo, seen: 0 })
    else free.push(pbo)
  }

  function collect() {
    while (pending.length) {
      const r = pending[0]!
      if (!r.seen) {
        if (gl.getSyncParameter(r.sync, gl.SYNC_STATUS) !== gl.SIGNALED) {
          // The GPU is more than a few frames behind: ask for less.
          if (frameNo - r.at > RING + 1) B = Math.max(1, Math.floor(B * 0.7))
          break
        }
        r.seen = frameNo
      }
      // Read one frame after the fence is seen, never in the frame that wrote.
      if (frameNo <= r.seen) break
      pending.shift()
      const t0 = performance.now()
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, r.pbo.sums)
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, readBuf)
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, r.pbo.hist)
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, histData)
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
      gl.deleteSync(r.sync)
      free.push(r.pbo)
      // What the read cost this thread. Some drivers make a mapped read wait
      // for the whole queue, however long ago the fence passed; when that
      // happens the page is paying for the GPU's backlog, so the backlog shrinks.
      const cost = performance.now() - t0
      readMs = readMs * 0.7 + cost * 0.3
      // The governor: more batches while fences come back before the ring runs out
      // and frames hold the display's rate; fewer the moment they do not.
      const lag = r.seen - r.at
      // Read cost limits. On a desktop GPU it is judged against the frame:
      // under half of it, with frames at the display's rate, is fine. On a
      // phone the main thread is the scarce thing, so the limits are absolute
      // and small (a slow CPU turns a few milliseconds into a long task).
      const budget = vsync * 1000
      const [grow, shrink, cut] = phone ? [0.6, 1.2, 4] : [budget * 0.45, budget * 0.6, budget]
      if (dtEma > vsync * 1.25 || cost > cut) B = Math.max(1, Math.floor(B * 0.6))
      else if (readMs > shrink) B = Math.max(1, B - 1)
      else if (lag < RING && dtEma < vsync * 1.08 && readMs < grow) B = Math.min(BATCHES[q]!, B + 1)
      if (r.gen !== gen) continue
      let paths = 0
      for (let b = 0; b < r.batches; b++) {
        const i = b * 4
        est.add(readBuf[i]!, readBuf[i + 1]!, readBuf[i + 2]!, readBuf[i + 3]!)
        paths += readBuf[i + 3]!
      }
      histGen = gen
      fresh = true
      runPaths += paths
      rateN += paths
      if (est.n >= CAP && !doneAt) doneAt = now
      // Report at log-spaced counts too, so the convergence trace has its early points.
      if (est.n >= mark) {
        while (mark <= est.n) mark *= 1.25
        report(true)
      }
    }
  }

  /** The option's price from the histogram at a strike the GPU has not priced: approximate, and labelled so. */
  function binnedPrice(K: number) {
    let n = 0, s = 0
    for (let b = 0; b < HIST.bins; b++) {
      const c = histData[b * 4]!
      n += c
      s += c * Math.max(HIST.lo + (b + 0.5) * binWidth - K, 0)
    }
    return n ? (discount() * s) / n : NaN
  }

  function report(force = false) {
    const narrow = cssW < 520
    const v =
      previewK != null && histGen === gen
        ? `Call at $${Math.round(kv.x)}: about $${binnedPrice(kv.x).toFixed(2)}`
        : est.n > 0
          ? narrow
            ? `Call price: $${est.mean.toFixed(2)}`
            : `Call price, the average discounted payoff: $${est.mean.toFixed(2)}`
          : ''
    if (v !== valueText) valueEl.textContent = valueText = v
    if (now - rateT > 0.5) {
      // A window with no readbacks (idle, or a run just restarted) keeps the last rate.
      if (rateN > 0) rate = rateN / (now - rateT)
      rateT = now
      rateN = 0
    }
    if (!force && now - statsAt < 0.1) return
    statsAt = now
    const done = !!doneAt
    // The histogram goes out once a second, and once more when the run completes.
    let h: Stats['hist'] = null
    if (histGen === gen && (now - histAt > 1 || (done && histAt < doneAt))) {
      histAt = now
      const counts: number[] = []
      const payoff: number[] = []
      for (let b = 0; b < HIST.bins; b++) {
        counts.push(histData[b * 4]!)
        payoff.push(histData[b * 4 + 1]!)
      }
      h = { counts, payoff }
    }
    o.onStats({
      n: est.n,
      mean: est.mean,
      se: est.se,
      forward: est.forward,
      rate: done ? runPaths / Math.max(1e-3, doneAt - runStart) : rate,
      done,
      hist: h,
    })
  }

  // ── drawing ──

  function drawStrands() {
    if (!den) return
    const inS = inSeq()
    const burst = inS ? ph!.burst : 1
    const { drift, vol } = stepCoefficients(sig.x)
    gl.disable(gl.BLEND)
    bind(pathT)
    P.path.use()
    gl.uniform1i(P.path.u('uN'), pathN)
    gl.uniform1i(P.path.u('uH'), pathH)
    gl.uniform1f(P.path.u('uDrift'), drift)
    gl.uniform1f(P.path.u('uVol'), vol)
    drawFullscreen(gl)

    bind(den)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    const scale = den.w / Math.max(1, cssW)
    // A phone's stage packs the same futures into a fraction of the area, so the gain comes down with it.
    // At night the glow saturates sooner, so it gives up more of its gain.
    const areaK = Math.min(1, (cssW * cssH) / REF_AREA) ** (palette.dark ? 1 : 0.7)
    const gain = ((palette.dark ? 0.2 : 0.155) * Math.sqrt(2048 / pathN) * areaK) / scale
    // Heads only ride the fronts while they travel.
    const passes = burst < 1 ? ([[P.line, 0], [P.head, 1]] as const) : ([[P.line, 0]] as const)
    for (const [p, point] of passes) {
      p.use()
      tex(0, pathT)
      gl.uniform1i(p.u('uPath'), 0)
      gl.uniform1i(p.u('uN'), pathN)
      gl.uniform1i(p.u('uH'), pathH)
      gl.uniform1f(p.u('uK'), kv.x)
      gl.uniform1f(p.u('uS0'), MODEL.s0)
      gl.uniform1f(p.u('uGain'), gain)
      gl.uniform1f(p.u('uBurst'), burst)
      gl.uniform1f(p.u('uPoint'), point)
      gl.uniformMatrix4fv(p.u('uVP'), false, vp)
      gl.bindVertexArray(empty)
      if (point) {
        gl.uniform1f(p.u('uSize'), 3 * scale)
        gl.drawArrays(gl.POINTS, 0, pathN)
      } else gl.drawArrays(gl.LINES, 0, pathN * 128)
    }
    gl.disable(gl.BLEND)

    const bloom = q > 0
    if (bloom) {
      const pass = (p: Program, src: Target, dst: Target, set: () => void) => {
        bind(dst)
        p.use()
        tex(0, src)
        gl.uniform1i(p.u('uSrc'), 0)
        set()
        drawFullscreen(gl)
      }
      const down = (src: Target, dst: Target, th = 0) =>
        pass(P.down, src, dst, () => {
          gl.uniform2f(P.down.u('uTexel'), 1 / src.w, 1 / src.h)
          gl.uniform1f(P.down.u('uThresh'), th)
        })
      const blur = (src: Target, dst: Target, x: number, y: number) => pass(P.blur, src, dst, () => gl.uniform2f(P.blur.u('uDir'), x / src.w, y / src.h))
      down(den, bl[0]!, 0.35)
      down(bl[0]!, bl[1]!)
      blur(bl[1]!, bl[2]!, 1, 0)
      blur(bl[2]!, bl[1]!, 0, 1)
      down(bl[1]!, bl[3]!)
      blur(bl[3]!, bl[4]!, 1.5, 0)
      blur(bl[4]!, bl[3]!, 0, 1.5)
    }

    bind(null)
    P.composite.use()
    tex(0, den)
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
    gl.uniform1f(P.composite.u('uBloom'), bloom ? 1 : 0)
    gl.uniform1f(P.composite.u('uTone'), palette.dark ? 0.9 : 1.1)
    gl.uniform1f(P.composite.u('uFade'), fadeMul)
    gl.bindVertexArray(empty)
    drawFullscreen(gl)
  }

  // Flat overlay: hairlines and bars built on the CPU in clip space, so a
  // line is the same crisp width at every distance.
  const flat: number[] = []
  const rgba = (c: readonly number[], a: number) => [c[0]!, c[1]!, c[2]!, a]
  function tri(a: number[], b: number[], c: number[], col: number[]) {
    flat.push(a[0]!, a[1]!, ...col, b[0]!, b[1]!, ...col, c[0]!, c[1]!, ...col)
  }
  function segment(a: V3, b: V3, px: number, col: number[]) {
    const pa = project(vp, ...a), pb = project(vp, ...b)
    if (pa[2] < 0.05 || pb[2] < 0.05) return
    const dx = (pb[0] - pa[0]) * cw, dy = (pb[1] - pa[1]) * ch
    const l = Math.hypot(dx, dy) || 1
    const nx = (-dy / l) * (px / cw), ny = (dx / l) * (px / ch)
    const A = [pa[0] + nx, pa[1] + ny], Bq = [pa[0] - nx, pa[1] - ny], C = [pb[0] + nx, pb[1] + ny], D = [pb[0] - nx, pb[1] - ny]
    tri(A, Bq, C, col)
    tri(C, Bq, D, col)
  }
  function quad(x0: number, y0: number, x1: number, y1: number, col: number[]) {
    const a = project(vp, x0, y0, 0), b = project(vp, x1, y0, 0), c = project(vp, x1, y1, 0), d = project(vp, x0, y1, 0)
    if (a[2] < 0.05 || b[2] < 0.05 || c[2] < 0.05 || d[2] < 0.05) return
    tri([a[0], a[1]], [b[0], b[1]], [c[0], c[1]], col)
    tri([a[0], a[1]], [c[0], c[1]], [d[0], d[1]], col)
  }

  /** New histogram data, or a previewed strike, gives the bars new targets. */
  function barTargets() {
    let maxC = 0, maxG = 0
    const K = kv.x
    for (let b = 0; b < HIST.bins; b++) {
      const c = histData[b * 4]!
      // While a strike is only previewed, what each bin pays is taken from
      // the counts at that strike, so the bars agree with the line.
      const g = previewK != null ? c * Math.max(HIST.lo + (b + 0.5) * binWidth - K, 0) : histData[b * 4 + 1]!
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

  function drawOverlay(p: number, dt: number) {
    flat.length = 0
    const dpr = cw / Math.max(1, cssW)
    const hair = 0.5 * dpr
    const dark = palette.dark
    // The frame (the expiry axis, its ticks, the strike) never fades: Replay clears only the futures.
    const vis = outside(p)
    segment([X1, wy(AXIS.lo), 0], [X1, wy(AXIS.hi), 0], hair, rgba(palette.graphite, 0.5 * vis))
    for (const s of TICKS) segment([X1 - 0.03, wy(s), 0], [X1, wy(s), 0], hair, rgba(palette.graphite, 0.8 * vis))
    // The histogram. A new run clears the GPU histogram and its first batch
    // is noisy, so the bars on screen ease toward each new target (a 50ms
    // exponential follow) instead of blinking out on every step of a
    // volatility drag; the numbers stay instant.
    if (barsReady) {
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
      // Bars narrower than two pixels are the thin tail: drawn, they read as a dashed stub.
      const pxPerLen = Math.abs(project(vp, HX0 + HLEN, wy(MODEL.s0), 0)[0] - project(vp, HX0, wy(MODEL.s0), 0)[0]) * cssW * 0.5
      const minLen = 2 / Math.max(1, pxPerLen)
      // The context first: the distribution itself, left as a hairline outline
      // once the claim has taken its place, and drawn under it. Bins under half
      // a percent of the tallest are the thin tail; the outline closes to the
      // baseline around them.
      const outlineA = (dark ? 0.6 : 0.55) * w * vis * fadeMul
      if (outlineA > 0.005) {
        const col = rgba(palette.graphite, outlineA)
        let prevX = -1
        for (let b = 0; b < HIST.bins; b++) {
          const lo = HIST.lo + b * binWidth
          const y0 = wy(lo), y1 = wy(lo + binWidth)
          if (cLen[b]! > 0.005) {
            const x = HX0 + HLEN * land * cLen[b]!
            segment([prevX >= 0 ? prevX : HX0, y0, 0], [x, y0, 0], hair, col)
            segment([x, y0, 0], [x, y1, 0], hair, col)
            prevX = x
          } else if (prevX >= 0) {
            segment([prevX, y0, 0], [HX0, y0, 0], hair, col)
            prevX = -1
          }
        }
      }
      // The claim: what each bin pays (indigo), grown out of the counts.
      for (let b = 0; b < HIST.bins; b++) {
        const len = land * ((1 - w) * cLen[b]! + w * gLen[b]!)
        if (len < minLen) continue
        const lo = HIST.lo + b * binWidth
        const pays = lo + binWidth / 2 > kv.x
        const a = ((1 - w) * (pays ? (dark ? 0.62 : 0.5) : dark ? 0.4 : 0.28) + w * 0.95) * fadeMul
        quad(HX0, wy(lo) + 0.0025, HX0 + HLEN * len, wy(lo + binWidth) - 0.0025, rgba(pays ? palette.indigo : palette.graphite, a))
      }
    }
    // The strike: a dashed ink reference line across the expiry region.
    const y = wy(kv.x)
    const x0 = LABELS.strike.x0, x1 = LABELS.strike.x
    const n = 30
    for (let i = 0; i < n; i++) {
      const a = x0 + ((x1 - x0) * i) / n
      segment([a, y, 0], [a + ((x1 - x0) / n) * 0.6, y, 0], 0.75 * dpr, rgba(palette.ink, 0.9))
    }
    if (!flat.length) return
    gl.bindVertexArray(flatVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, flatBuf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(flat), gl.STREAM_DRAW)
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
    gl.drawArrays(gl.TRIANGLES, 0, flat.length / 6)
    gl.disable(gl.BLEND)
    gl.bindVertexArray(null)
  }

  function placeLabels(p: number) {
    for (const l of labels) {
      const a = l.show(p) * (l.data ? fadeMul : 1)
      const [x, y, z] = l.at()
      const s = project(vp, x, y, z)
      const on = a > 0.01 && s[2] > 0.05 && Math.abs(s[0]) < 1.05 && Math.abs(s[1]) < 1.05
      l.el.style.opacity = on ? a.toFixed(3) : '0'
      l.el.style.visibility = on ? 'visible' : 'hidden'
      if (!on) continue
      if (l.text !== l.el.textContent) {
        l.text = l.el.textContent ?? ''
        l.w = l.el.offsetWidth
        l.h = l.el.offsetHeight
      }
      // Kept inside the stage both ways, 4px in, however the camera sits.
      let px = ((s[0] + 1) / 2) * cssW
      const left = px + l.side * l.w
      if (left < 4) px += 4 - left
      else if (left + l.w > cssW - 4) px -= left + l.w - (cssW - 4)
      let py = ((1 - s[1]) / 2) * cssH
      const top = py + l.vside * l.h
      if (top < 4) py += 4 - top
      else if (top + l.h > cssH - 4) py -= top + l.h - (cssH - 4)
      l.el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`
    }
  }

  /** Where the sequence is, from its phases: none, waiting to start, playing, or played. */
  function advanceSequence() {
    ph = o.sequence()
    const prev = seq
    seq = !ph ? 'none' : ph.price >= 1 ? 'done' : ph.burst > 0 ? 'playing' : 'pending'
    if (seq === 'playing' && prev !== 'playing') {
      // A new sequence prices from nothing, so the histogram really fills and
      // the estimate really converges while the reader watches.
      gen++
      o.onSequenceFrame()
    }
    // A quality step held back during the sequence lands once it is over.
    if (!inSeq() && pendingQ != null) {
      applyQuality(pendingQ)
      pendingQ = null
    }
  }

  const r: FuturesRenderer = {
    frame(t, dt) {
      if (!ready) {
        if (!programs.every((p) => p.ready())) return false
        ready = true
      }
      now = t
      frameNo++
      dtEma = dtEma * 0.9 + dt * 0.1
      vsync = Math.min(vsync * 1.0005, Math.max(1 / 240, dtEma))
      o.tick(dt * 1000)
      if (fade) {
        fade.t += dt * 1000
        fadeMul = 1 - EASE_OUT(Math.min(1, fade.t / fade.ms))
        if (fade.t >= fade.ms) {
          const then = fade.then
          fade = null
          then()
        }
      } else fadeMul = 1
      advanceSequence()
      if (firstFrame) {
        firstFrame = false
        // A visit without a sequence opens on the finished picture: payoff bars and the price.
        if (!inSeq()) morph.x = 1
      }
      spring(sig, sigma, dt, 30)
      const k0 = Math.round(kv.x)
      spring(kv, previewK ?? strike, dt, 30)
      if (Math.round(kv.x) !== k0) setStrikeText()
      // Heading home (the flight's return, or a stop) keeps the payoff picture:
      // the story is told on the way out, not unwound on the way back.
      const cam = o.camera()
      if (cam === 0) returning = false
      else if (cam < lastCam - 1e-9) returning = true
      else if (cam > lastCam + 1e-9) returning = false
      lastCam = cam
      spring(prog, cam, dt, 16)
      const p = prog.x
      // The morph: the sequence's own clock while it plays; the flight's once
      // it faces expiry; and the finished payoff picture at rest or on the way home.
      let morphTarget = 1
      if (inSeq()) {
        morph.x = EASE_IN_OUT(ph!.morph)
        morph.v = 0
      } else {
        morphTarget = cam > 0 && !returning ? flightMorph(p) : 1
        spring(morph, morphTarget, dt, 12)
      }

      collect()
      if (fresh && histGen === gen) {
        barTargets()
        barsMoving = true
      }
      fresh = false
      // A still frame is not drawn again: only what is changing is.
      const still =
        !dirty &&
        dt > 0 &&
        !inSeq() &&
        !fade &&
        !barsMoving &&
        cam === 0 &&
        arrived(sig, sigma, 1e-6) &&
        arrived(kv, previewK ?? strike, 1e-3) &&
        arrived(prog, cam, 1e-5) &&
        arrived(morph, morphTarget, 1e-5)
      if (!still) {
        vp = viewProjection(p, cssW / Math.max(1, cssH))
        drawStrands()
        drawOverlay(p, dt)
        const ht = morph.x >= 0.5 ? 1 : 0
        if (ht !== histText) {
          histText = ht
          histEl.textContent = ht ? 'Payoff × how often it happens' : 'Where the paths end'
        }
        placeLabels(p)
        dirty = false
        o.labels.dataset.draws = String(++draws)
      }
      price()
      gl.flush()
      report()
      return true
    },
    resize(w, h, cw2, ch2) {
      cw = w
      ch = h
      cssW = cw2
      cssH = ch2
      buildScreen()
      dirty = true
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
      if (histGen === gen) barTargets()
      dirty = true
    },
    setParams(s, k) {
      if (s === sigma && k === strike) return
      sigma = s
      strike = k
      gen++
      dirty = true
    },
    fadeOut(ms, then) {
      // A second press while the futures are already fading changes nothing.
      if (fade) return
      fade = { t: 0, ms, then }
    },
    priceAt(x, y) {
      const rect = o.labels.getBoundingClientRect()
      const ny = 1 - ((y - rect.top) / rect.height) * 2
      if (x < rect.left || x > rect.right || ny < -1 || ny > 1) return null
      // Screen height rises with price on the expiry plane: bisect for it.
      let lo = 1, hi = 400
      const at = (s: number) => project(vp, X1, wy(s), 0)
      if (at(lo)[2] < 0.05 || at(hi)[2] < 0.05) return null
      if (ny < at(lo)[1] || ny > at(hi)[1]) return null
      for (let i = 0; i < 30; i++) {
        const m = (lo + hi) / 2
        if (at(m)[1] < ny) lo = m
        else hi = m
      }
      return (lo + hi) / 2
    },
    dispose() {
      for (const p of programs) gl.deleteProgram(p.program)
      for (const t of [grid, results, hist, pathT, den, ...chain, ...bl]) disposeTarget(gl, t)
      for (const b of pbos) {
        gl.deleteBuffer(b.sums)
        gl.deleteBuffer(b.hist)
      }
      for (const r of pending) gl.deleteSync(r.sync)
      gl.deleteBuffer(flatBuf)
      gl.deleteVertexArray(flatVao)
      gl.deleteVertexArray(empty)
      o.labels.replaceChildren()
    },
  }
  applyQuality(q)
  return r
}
