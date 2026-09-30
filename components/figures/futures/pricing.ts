import { RNG } from '@/lib/futures/glsl'
import { FINE, FINE_PER, fineWidth } from '@/lib/futures/hist'
import { CAP_LOG2, Estimator, GROUPS, HIST, MODEL, discount, stepCoefficients } from '@/lib/futures/mc'
import { FULLSCREEN_VS, disposeTarget, drawFullscreen, program, target, type GL, type Program, type Target } from '@/lib/gl'

/**
 * The pricing job, on the GPU, with no float render target anywhere, so it
 * runs on every WebGL2 device, iPhones included.
 *
 * A fragment shader over a W×W grid simulates one path per fragment, 64 exact
 * log-space steps each, and writes (payoff, payoff², S_T, 1) as the raw bits of
 * four floats into a 32-bit integer target. Four-by-four summing passes read
 * the bits back as floats, add them and write bits again, down to one texel per
 * batch. Where the paths end is counted too, by additive blending into an
 * eight-bit target: each path adds exactly one to one byte, its hits spread
 * over 256 rows so that no byte can reach 255 before, every 8 batches, the
 * counts are carried into 32-bit integers, four fine bins to a texel.
 *
 * Results come back through pixel-pack buffers and fences, never a stalling
 * readPixels, and are summed in float64 on the CPU. As many batches run per
 * frame as the frame budget allows: the count grows while fences come back
 * within a frame or two and backs off when they do not.
 */

export const CAP = 2 ** CAP_LOG2
const MAXB = 64
/** Rows the eight-bit counts spread over, and batches between carries: at the narrowest volatility a byte averages about 100 of its 255. */
const ROWS = 256
const PER_CARRY = 8
// Pricing is governed by its own fences, so above the software tier it is not
// tied to the drawing quality: a phone that draws fewer paths can still price
// as fast as its GPU allows.
const GRID = [64, 256, 256, 256] as const
const BATCHES = [1, 48, 64, 64] as const
/** Pack-buffer pairs in flight: each is written once per fence and read once after it signals. */
const RING = 4

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
`

const KERNEL_FS = `${HEAD}${RNG}
uniform uint uOffset; uniform int uW; uniform float uDrift, uVol, uS0, uK;
out uvec4 o;
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
  o = floatBitsToUint(vec4(p, p * p, s, 1.0));
}`

const REDUCE_FS = `${HEAD}
uniform usampler2D uSrc; uniform ivec2 uSize; uniform ivec2 uOrigin;
out uvec4 o;
void main() {
  ivec2 b = (ivec2(gl_FragCoord.xy) - uOrigin) * 4;
  vec4 s = vec4(0.0);
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    ivec2 p = b + ivec2(x, y);
    if (p.x < uSize.x && p.y < uSize.y) s += uintBitsToFloat(texelFetch(uSrc, p, 0));
  }
  o = floatBitsToUint(s);
}`

// One point per path, on the fine bin its price at expiry falls in (lib/futures/hist.ts's fineBin), in one of the rows.
const SCATTER_VS = `${HEAD}
uniform usampler2D uSrc; uniform int uW;
void main() {
  float s = uintBitsToFloat(texelFetch(uSrc, ivec2(gl_VertexID % uW, gl_VertexID / uW), 0).b);
  float b = floor((s - ${HIST.lo.toFixed(1)}) / ${fineWidth});
  float row = float(gl_VertexID % ${ROWS});
  gl_PointSize = 1.0;
  gl_Position = (b < 0.0 || b >= ${FINE}.0) ? vec4(2.0, 2.0, 2.0, 1.0)
    : vec4((b + 0.5) / ${FINE}.0 * 2.0 - 1.0, (row + 0.5) / ${ROWS}.0 * 2.0 - 1.0, 0.0, 1.0);
}`

const SCATTER_FS = `${HEAD}
out vec4 o;
void main() { o = vec4(1.0 / 255.0, 0.0, 0.0, 0.0); }`

// Texel b of the integer histogram holds the counts of fine bins 4b … 4b+3: bin b's four quarters.
const CARRY_FS = `${HEAD}
uniform usampler2D uAcc; uniform sampler2D uHits;
out uvec4 o;
void main() {
  int b = int(gl_FragCoord.x);
  uvec4 c = texelFetch(uAcc, ivec2(b, 0), 0);
  for (int k = 0; k < ${FINE_PER}; k++) {
    uint n = 0u;
    for (int r = 0; r < ${ROWS}; r++) n += uint(texelFetch(uHits, ivec2(b * ${FINE_PER} + k, r), 0).r * 255.0 + 0.5);
    c[k] += n;
  }
  o = c;
}`

export interface Clock {
  /** Frames drawn so far. */
  frameNo: number
  /** Smoothed frame interval, and the display's own, in seconds. */
  dtEma: number
  vsync: number
  /** Seconds since the renderer started. */
  now: number
}

export interface Pricer {
  /** Its programs, which the renderer waits on before its first frame. */
  readonly programs: Program[]
  readonly est: Estimator
  /** The current run's fine histogram, once a readback of it has landed (`ready`). */
  readonly fine: Uint32Array
  /** A readback of the current run has landed since the run began. */
  ready(): boolean
  /** Paths simulated and read back in the current run; when it reached the cap, or 0. */
  readonly runPaths: number
  readonly doneAt: number
  readonly runStart: number
  /** Paths per second over the last half second. */
  rate(): number
  /** The run the next batches belong to; bump it to start again from nothing. */
  gen: number
  setQuality(q: number): void
  setParams(sigma: number, strike: number): void
  /** Queue this frame's batches. */
  price(): void
  /** Read back what has finished. Returns whether new numbers for the current run arrived. */
  collect(): boolean
  /** Reached a log-spaced count since the last call: the convergence trace wants a point. */
  marked(): boolean
  /** For ?debug=1: the grid side, the batches allowed this frame, and what a readback costs this thread. */
  info(): { grid: number; batches: number; readMs: number }
  dispose(): void
}

export function createPricer(gl: GL, clock: Clock, phone: boolean): Pricer {
  const P = {
    kernel: program(gl, FULLSCREEN_VS, KERNEL_FS),
    reduce: program(gl, FULLSCREEN_VS, REDUCE_FS),
    scatter: program(gl, SCATTER_VS, SCATTER_FS),
    carry: program(gl, FULLSCREEN_VS, CARRY_FS),
  }
  const empty = gl.createVertexArray()

  let q = 2
  let W = 0
  let grid: Target | null = null
  let chain: Target[] = []
  const results = target(gl, MAXB, 1, 'rgba32ui')
  const hits = target(gl, FINE, ROWS, 'rgba8')
  const acc = [target(gl, HIST.bins, 1, 'rgba32ui'), target(gl, HIST.bins, 1, 'rgba32ui')]
  let cur = 0
  let uncarried = 0

  let sigma: number = MODEL.sigma
  let strike: number = MODEL.strike
  let runGen = -1
  let offset = 0
  let B = 1
  let readMs = 0
  const est = new Estimator(discount())

  const buffer = (bytes: number) => {
    const b = gl.createBuffer()!
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b)
    // DYNAMIC_COPY, not a READ usage: Chromium keeps a "shadow copy" of READ
    // buffers that, measured in Chrome 154 on ANGLE/Metal, made no read cheaper
    // and logged a performance warning on every reuse.
    gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.DYNAMIC_COPY)
    return b
  }
  type Pair = { sums: WebGLBuffer; hist: WebGLBuffer }
  const pbos: Pair[] = Array.from({ length: RING }, () => ({ sums: buffer(MAXB * 16), hist: buffer(HIST.bins * 16) }))
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
  const free = pbos.slice()
  const pending: { sync: WebGLSync; pbo: Pair; batches: number; gen: number; at: number; seen: number }[] = []
  const sumsU = new Uint32Array(MAXB * 4)
  const sumsF = new Float32Array(sumsU.buffer)
  const fine = new Uint32Array(FINE)
  let fineGen = -1
  let runStart = 0, runPaths = 0, doneAt = 0
  let rateT = 0, rateN = 0, rate = 0
  let mark = 4096
  let marked = false

  const bind = (t: Target, x = 0, w = t.w, h = t.h) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
    gl.viewport(x, 0, w, h)
  }
  const tex = (unit: number, t: Target) => {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, t.tex)
  }

  function buildGrid() {
    const w = GRID[q]!
    if (w === W) return
    disposeTarget(gl, grid)
    chain.forEach((t) => disposeTarget(gl, t))
    W = w
    grid = target(gl, W, W, 'rgba32ui')
    chain = []
    let s = W
    while (Math.ceil(s / 4) > 1) {
      s = Math.ceil(s / 4)
      chain.push(target(gl, s, s, 'rgba32ui'))
    }
    // A new batch size starts a new run, so every batch in a run is the same size.
    self.gen++
  }

  /** Move the eight-bit counts into the integer histogram and clear them. */
  function carry() {
    if (!uncarried) return
    const src = acc[cur]!, dst = acc[1 - cur]!
    bind(dst)
    P.carry.use()
    tex(0, src)
    tex(1, hits)
    gl.uniform1i(P.carry.u('uAcc'), 0)
    gl.uniform1i(P.carry.u('uHits'), 1)
    drawFullscreen(gl)
    cur = 1 - cur
    bind(hits)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    uncarried = 0
  }

  function restartRun() {
    runGen = self.gen
    offset = 0
    est.reset()
    runStart = clock.now
    runPaths = 0
    doneAt = 0
    rateT = clock.now
    rateN = 0
    // `rate` is kept: the device is as fast as it was a moment ago.
    B = Math.min(B, BATCHES[q]!)
    // Integer targets are cleared with clearBuffer: gl.clear leaves them undefined.
    gl.bindFramebuffer(gl.FRAMEBUFFER, acc[cur]!.fbo)
    gl.clearBufferuiv(gl.COLOR, 0, new Uint32Array(4))
    bind(hits)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    uncarried = 0
    fineGen = -1
    mark = 4096
  }

  const self: Pricer = {
    programs: Object.values(P),
    est,
    fine,
    gen: 0,
    ready: () => fineGen === self.gen,
    get runPaths() {
      return runPaths
    },
    get doneAt() {
      return doneAt
    },
    get runStart() {
      return runStart
    },
    rate() {
      if (clock.now - rateT > 0.5) {
        // A window with no readbacks (idle, or a run just restarted) keeps the last rate.
        if (rateN > 0) rate = rateN / (clock.now - rateT)
        rateT = clock.now
        rateN = 0
      }
      return rate
    },
    setQuality(level) {
      q = Math.max(0, Math.min(3, level))
      buildGrid()
      B = Math.min(B, BATCHES[q]!)
    },
    setParams(s, k) {
      if (s === sigma && k === strike) return
      sigma = s
      strike = k
      self.gen++
    },
    price() {
      if (!grid) return
      if (runGen !== self.gen) restartRun()
      if (offset >= CAP || !free.length) return
      const { drift, vol } = stepCoefficients(sigma)
      const n = Math.min(B, BATCHES[q]!, (CAP - offset) / (W * W))
      gl.disable(gl.BLEND)
      gl.disable(gl.DITHER)
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
            bind(results, b, 1, 1)
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
        // Count where they end: one exact increment of one byte per path.
        bind(hits)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE)
        P.scatter.use()
        tex(0, grid)
        gl.uniform1i(P.scatter.u('uSrc'), 0)
        gl.uniform1i(P.scatter.u('uW'), W)
        gl.bindVertexArray(empty)
        gl.drawArrays(gl.POINTS, 0, W * W)
        gl.disable(gl.BLEND)
        offset += W * W
        if (++uncarried >= PER_CARRY) carry()
      }
      carry()
      // Read both back without waiting: into a pack buffer, fenced.
      const pbo = free.shift()!
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo.sums)
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, results.fbo)
      gl.readPixels(0, 0, n, 1, gl.RGBA_INTEGER, gl.UNSIGNED_INT, 0)
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo.hist)
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, acc[cur]!.fbo)
      gl.readPixels(0, 0, HIST.bins, 1, gl.RGBA_INTEGER, gl.UNSIGNED_INT, 0)
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
      if (sync) pending.push({ sync, pbo, batches: n, gen: self.gen, at: clock.frameNo, seen: 0 })
      else free.push(pbo)
    },
    collect() {
      let fresh = false
      while (pending.length) {
        const r = pending[0]!
        if (!r.seen) {
          if (gl.getSyncParameter(r.sync, gl.SYNC_STATUS) !== gl.SIGNALED) {
            // The GPU is more than a few frames behind: ask for less.
            if (clock.frameNo - r.at > RING + 1) B = Math.max(1, Math.floor(B * 0.7))
            break
          }
          r.seen = clock.frameNo
        }
        // Read one frame after the fence is seen, never in the frame that wrote.
        if (clock.frameNo <= r.seen) break
        pending.shift()
        const t0 = performance.now()
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, r.pbo.sums)
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, sumsU)
        const current = r.gen === self.gen
        if (current) {
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, r.pbo.hist)
          gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, fine)
        }
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
        gl.deleteSync(r.sync)
        free.push(r.pbo)
        // What the read cost this thread. Some drivers make a mapped read wait
        // for the whole queue, however long ago the fence passed; when that
        // happens the page is paying for the GPU's backlog, so the backlog shrinks.
        const cost = performance.now() - t0
        readMs = readMs * 0.7 + cost * 0.3
        // The governor: more batches while fences come back before the ring
        // runs out and frames hold the display's rate; fewer the moment they do
        // not. On a desktop GPU read cost is judged against the frame; on a
        // phone the main thread is the scarce thing, so the limits are absolute
        // and small (a slow CPU turns a few milliseconds into a long task).
        const lag = r.seen - r.at
        const budget = clock.vsync * 1000
        const [grow, shrink, cut] = phone ? [0.6, 1.2, 4] : [budget * 0.45, budget * 0.6, budget]
        if (clock.dtEma > clock.vsync * 1.25 || cost > cut) B = Math.max(1, Math.floor(B * 0.6))
        else if (readMs > shrink) B = Math.max(1, B - 1)
        else if (lag < RING && clock.dtEma < clock.vsync * 1.08 && readMs < grow) B = Math.min(BATCHES[q]!, B + 1)
        if (!current) continue
        let paths = 0
        for (let b = 0; b < r.batches; b++) {
          const i = b * 4
          est.add(sumsF[i]!, sumsF[i + 1]!, sumsF[i + 2]!, sumsF[i + 3]!)
          paths += sumsF[i + 3]!
        }
        fineGen = self.gen
        fresh = true
        runPaths += paths
        rateN += paths
        if (est.n >= CAP && !doneAt) doneAt = clock.now
        // Log-spaced counts too, so the convergence trace has its early points.
        if (est.n >= mark) {
          while (mark <= est.n) mark *= 1.25
          marked = true
        }
      }
      return fresh
    },
    marked() {
      const m = marked
      marked = false
      return m
    },
    info: () => ({ grid: W, batches: B, readMs }),
    dispose() {
      for (const p of self.programs) gl.deleteProgram(p.program)
      for (const t of [grid, results, hits, ...acc, ...chain]) disposeTarget(gl, t)
      for (const b of pbos) {
        gl.deleteBuffer(b.sums)
        gl.deleteBuffer(b.hist)
      }
      for (const r of pending) gl.deleteSync(r.sync)
      gl.deleteVertexArray(empty)
    },
  }
  self.setQuality(q)
  return self
}
