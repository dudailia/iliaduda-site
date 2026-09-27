import { program, toLinear } from '@/lib/gl'
import { EASE_OUT } from '@/lib/ease'
import { FILL, KEY, LIGHT, LINE_FLIP, RAMP, STOPS, UP_LIGHT } from '@/lib/surface/look'
import { amplitudeOf, lineReveal } from '@/lib/surface/sequence'
import { params } from '@/lib/surface/shock'
import { DOMAIN, iv, type Params } from '@/lib/surface/ssvi'
import {
  apply, camera, EXPIRY_TICKS, eye, H, kOfU, LABELS, mvp, NOTES, POST, STRIKE_TICKS, SWAY_PERIOD, tOfV, uOfX, V0, V1,
  vOfZ, VOL_TICKS, wx, wy, wz, XW, ZW, fu, fv, type M4,
} from '@/lib/surface/view'
import type { Palette, Renderer, RGB, StageEnv } from '@/components/stage/useStage'
import { LINE_FS, LINE_VS, surfaceFS, surfaceVS } from './shaders'

/**
 * Fig. 1 of the IV paper, live. Raw WebGL2: one grid drawn from gl_VertexID
 * (no vertex buffer; the vertex shader places every vertex from the SSVI
 * parameters), four wall strips, and lines as screen-space quads: the axes, and
 * the smiles at the ticked expiries, which hang in the air while the surface
 * forms. The HTML labels and notes are projected with the same matrix every
 * frame, so they ride the surface as it rises.
 *
 * On a first visit the surface forms and takes one shock (lib/surface/
 * sequence.ts); after that it rests at calm, drifting, leaning with the
 * reader, and the shock is the reader's: the slider sets it, and the surface
 * follows on a short spring. Every frame's parameters are a complete SSVI
 * surface, and the readouts are written from the same parameters in the same
 * frame (`sync`), so a number never lags the picture.
 */

export interface Probe {
  k: number
  T: number
}

export interface Sim {
  /** The pinned reading point, and the one under the mouse (wins while there). */
  probe: Probe
  hover: Probe | null
  /** Something the reader changed: draw the next frame even when nothing moves. */
  dirty: boolean
}

export interface Hooks {
  sim: Sim
  /** The signature's phases while it waits or plays; null once it is over, or on a visit without one. */
  sequence(): { lines: number; rise: number; labels: number; shock: number; relax: number } | null
  /** A drawn frame took this long: the signature's clock moves on it. */
  tick(dtMs: number): void
  /** The shock the reader has set: 0 is calm, 1 a full shock, up to SIZE_MAX. */
  level(): number
  /** Paused: the drift, the lean and the signature hold; the reader can still read and turn it. */
  paused(): boolean
  /** The reader's lean, −1…1 each way, from the pointer or the tilt. */
  lean(): { x: number; y: number }
  /** A click or tap pinned the reading point here. */
  onPin(p: Probe): void
  labels(): readonly (HTMLElement | null)[]
  labelLayer(): HTMLElement | null
  notes(): readonly (HTMLElement | null)[]
  dot(): HTMLElement | null
  sync(p: Params): void
}

/** Grid vertices per side and wall segments, by quality level. */
const GRID = [40, 96, 168, 256] as const
/** Points along each hanging smile. */
const SMILE_N = 96
/** How far the reader's lean turns the surface, radians: in yaw, and in pitch. */
const LEAN = { yaw: 0.06, pitch: 0.03 } as const

// ── colour ───────────────────────────────────────────────────────────────────

function oklab(c: RGB): [number, number, number] {
  const r = toLinear(c[0]), g = toLinear(c[1]), b = toLinear(c[2])
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
const mixv = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [
  a[0]! + (b[0]! - a[0]!) * t,
  a[1]! + (b[1]! - a[1]!) * t,
  a[2]! + (b[2]! - a[2]!) * t,
]

// ── matrices ─────────────────────────────────────────────────────────────────

function invert(a: M4): M4 | null {
  const inv = new Float32Array(16)
  inv[0] = a[5]! * a[10]! * a[15]! - a[5]! * a[11]! * a[14]! - a[9]! * a[6]! * a[15]! + a[9]! * a[7]! * a[14]! + a[13]! * a[6]! * a[11]! - a[13]! * a[7]! * a[10]!
  inv[4] = -a[4]! * a[10]! * a[15]! + a[4]! * a[11]! * a[14]! + a[8]! * a[6]! * a[15]! - a[8]! * a[7]! * a[14]! - a[12]! * a[6]! * a[11]! + a[12]! * a[7]! * a[10]!
  inv[8] = a[4]! * a[9]! * a[15]! - a[4]! * a[11]! * a[13]! - a[8]! * a[5]! * a[15]! + a[8]! * a[7]! * a[13]! + a[12]! * a[5]! * a[11]! - a[12]! * a[7]! * a[9]!
  inv[12] = -a[4]! * a[9]! * a[14]! + a[4]! * a[10]! * a[13]! + a[8]! * a[5]! * a[14]! - a[8]! * a[6]! * a[13]! - a[12]! * a[5]! * a[10]! + a[12]! * a[6]! * a[9]!
  inv[1] = -a[1]! * a[10]! * a[15]! + a[1]! * a[11]! * a[14]! + a[9]! * a[2]! * a[15]! - a[9]! * a[3]! * a[14]! - a[13]! * a[2]! * a[11]! + a[13]! * a[3]! * a[10]!
  inv[5] = a[0]! * a[10]! * a[15]! - a[0]! * a[11]! * a[14]! - a[8]! * a[2]! * a[15]! + a[8]! * a[3]! * a[14]! + a[12]! * a[2]! * a[11]! - a[12]! * a[3]! * a[10]!
  inv[9] = -a[0]! * a[9]! * a[15]! + a[0]! * a[11]! * a[13]! + a[8]! * a[1]! * a[15]! - a[8]! * a[3]! * a[13]! - a[12]! * a[1]! * a[11]! + a[12]! * a[3]! * a[9]!
  inv[13] = a[0]! * a[9]! * a[14]! - a[0]! * a[10]! * a[13]! - a[8]! * a[1]! * a[14]! + a[8]! * a[2]! * a[13]! + a[12]! * a[1]! * a[10]! - a[12]! * a[2]! * a[9]!
  inv[2] = a[1]! * a[6]! * a[15]! - a[1]! * a[7]! * a[14]! - a[5]! * a[2]! * a[15]! + a[5]! * a[3]! * a[14]! + a[13]! * a[2]! * a[7]! - a[13]! * a[3]! * a[6]!
  inv[6] = -a[0]! * a[6]! * a[15]! + a[0]! * a[7]! * a[14]! + a[4]! * a[2]! * a[15]! - a[4]! * a[3]! * a[14]! - a[12]! * a[2]! * a[7]! + a[12]! * a[3]! * a[6]!
  inv[10] = a[0]! * a[5]! * a[15]! - a[0]! * a[7]! * a[13]! - a[4]! * a[1]! * a[15]! + a[4]! * a[3]! * a[13]! + a[12]! * a[1]! * a[7]! - a[12]! * a[3]! * a[5]!
  inv[14] = -a[0]! * a[5]! * a[14]! + a[0]! * a[6]! * a[13]! + a[4]! * a[1]! * a[14]! - a[4]! * a[2]! * a[13]! - a[12]! * a[1]! * a[6]! + a[12]! * a[2]! * a[5]!
  inv[3] = -a[1]! * a[6]! * a[11]! + a[1]! * a[7]! * a[10]! + a[5]! * a[2]! * a[11]! - a[5]! * a[3]! * a[10]! - a[9]! * a[2]! * a[7]! + a[9]! * a[3]! * a[6]!
  inv[7] = a[0]! * a[6]! * a[11]! - a[0]! * a[7]! * a[10]! - a[4]! * a[2]! * a[11]! + a[4]! * a[3]! * a[10]! + a[8]! * a[2]! * a[7]! - a[8]! * a[3]! * a[6]!
  inv[11] = -a[0]! * a[5]! * a[11]! + a[0]! * a[7]! * a[9]! + a[4]! * a[1]! * a[11]! - a[4]! * a[3]! * a[9]! - a[8]! * a[1]! * a[7]! + a[8]! * a[3]! * a[5]!
  inv[15] = a[0]! * a[5]! * a[10]! - a[0]! * a[6]! * a[9]! - a[4]! * a[1]! * a[10]! + a[4]! * a[2]! * a[9]! + a[8]! * a[1]! * a[6]! - a[8]! * a[2]! * a[5]!
  const det = a[0]! * inv[0]! + a[1]! * inv[4]! + a[2]! * inv[8]! + a[3]! * inv[12]!
  if (Math.abs(det) < 1e-12) return null
  for (let i = 0; i < 16; i++) inv[i] = inv[i]! / det
  return inv
}

// ── the renderer ─────────────────────────────────────────────────────────────

export function make(env: StageEnv, hooks: Hooks): Renderer {
  const { gl, canvas } = env
  const sim = hooks.sim
  // The software tier (a CPU rasteriser) gets the light shader variant.
  const lite = env.tier === 'software'
  const surf = program(gl, surfaceVS(lite), surfaceFS(lite))
  const line = program(gl, LINE_VS, LINE_FS)
  const progs = [surf, line]

  let palette: Palette = env.palette
  let q = 0
  let n = GRID[0] as number
  let index: WebGLBuffer | null = null
  let count = 0
  const emptyVao = gl.createVertexArray()
  const surfVao = gl.createVertexArray()

  const buildGrid = (side: number) => {
    const idx = side * side > 65535 ? new Uint32Array((side - 1) * (side - 1) * 6) : new Uint16Array((side - 1) * (side - 1) * 6)
    let p = 0
    for (let j = 0; j < side - 1; j++)
      for (let i = 0; i < side - 1; i++) {
        const a = j * side + i, b = a + 1, c = a + side, d = c + 1
        idx[p++] = a; idx[p++] = c; idx[p++] = b
        idx[p++] = b; idx[p++] = c; idx[p++] = d
      }
    gl.bindVertexArray(surfVao)
    if (index) gl.deleteBuffer(index)
    index = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW)
    gl.bindVertexArray(null)
    n = side
    count = idx.length
  }
  buildGrid(n)
  const indexType = () => (n * n > 65535 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT)

  // Lines are screen-space quads: 6 vertices a segment, each A, B and (end, side).
  const CORNERS = [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]] as const
  const writeSegs = (out: Float32Array, segs: readonly (readonly number[])[]) => {
    let o = 0
    for (const s of segs)
      for (const [e, side] of CORNERS) {
        out.set([s[0]!, s[1]!, s[2]!, s[3]!, s[4]!, s[5]!, e, side], o)
        o += 8
      }
    return segs.length * 6
  }
  const lineVao = (buf: WebGLBuffer) => {
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    for (const [loc, size, off] of [[0, 3, 0], [1, 3, 12], [2, 2, 24]] as const) {
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 32, off)
    }
    gl.bindVertexArray(null)
    return vao
  }

  // Axis lines: strike and expiry ticks on the floor, the volatility post and its ticks.
  const axis: number[][] = []
  for (const K of STRIKE_TICKS) axis.push([wx(Math.log(K)), 0, ZW, wx(Math.log(K)), 0, ZW + 0.05])
  for (const [T] of EXPIRY_TICKS) axis.push([XW, 0, wz(T), XW + 0.05, 0, wz(T)])
  const px = POST[0] + 0.004, pz = POST[1] - 0.004
  axis.push([px, 0, pz, px, wy(1), pz])
  for (const v of VOL_TICKS) axis.push([px, wy(v), pz, px + 0.04, wy(v), pz])
  const axisData = new Float32Array(axis.length * 6 * 8)
  const axisCount = writeSegs(axisData, axis)
  const axisBuf = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, axisBuf)
  gl.bufferData(gl.ARRAY_BUFFER, axisData, gl.STATIC_DRAW)
  const axisVao = lineVao(axisBuf)

  // The smiles at the ticked expiries: they hang where the surface will be, and the sheet rises into them.
  const smileData = new Float32Array(EXPIRY_TICKS.length * (SMILE_N - 1) * 6 * 8)
  const smileBuf = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, smileBuf)
  gl.bufferData(gl.ARRAY_BUFFER, smileData.byteLength, gl.DYNAMIC_DRAW)
  const smileVao = lineVao(smileBuf)
  let smileCount = 0
  let smileKey = ''
  const buildSmiles = (p: Params, lines: number) => {
    const key = `${p.s0},${p.s1},${p.kappa},${p.rho},${p.eta},${lines}`
    if (key === smileKey) return
    smileKey = key
    const segs: number[][] = []
    for (const [T] of EXPIRY_TICKS) {
      const shown = lineReveal(lines, fv(T)) * (SMILE_N - 1)
      let prev: number[] | null = null
      for (let i = 0; i <= Math.ceil(shown); i++) {
        const u = Math.min(i, shown) / (SMILE_N - 1)
        const k = kOfU(u)
        const pt = [wx(k), wy(iv(p, k, T)) + 0.008, wz(T)]
        if (prev) segs.push([...prev, ...pt])
        prev = pt
      }
    }
    smileCount = writeSegs(smileData, segs)
    gl.bindBuffer(gl.ARRAY_BUFFER, smileBuf)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, smileData, 0, smileCount * 8)
  }

  // ── state ──────────────────────────────────────────────────────────────────
  let w = 1, h = 1, cssW = 1, cssH = 1
  let swayT = 0
  let resized = true
  let drawnOnce = false
  let draws = 0
  let inv: M4 | null = null
  /** The shock shown: the signature's, or the reader's level followed on a short spring (ω = 12/s). */
  const shock = { x: 0, v: 0 }
  let lastParams: Params = params(0)
  /** Drag offset of the orbit and the reader's lean, on critically damped springs back to their targets. */
  const spring = { yaw: 0, pitch: 0, vy: 0, vp: 0, ty: 0, tp: 0 }
  const lean = { yaw: 0, pitch: 0, vy: 0, vp: 0 }
  let drag: { id: number; x: number; y: number; moved: number; t: number; rawYaw: number; rawPitch: number } | null = null

  // ── input ──────────────────────────────────────────────────────────────────
  const pick = (clientX: number, clientY: number): Probe | null => {
    if (!inv) return null
    const r = canvas.getBoundingClientRect()
    const nx = ((clientX - r.left) / r.width) * 2 - 1
    const ny = 1 - ((clientY - r.top) / r.height) * 2
    const a = apply(inv, nx, ny, -1), b = apply(inv, nx, ny, 1)
    const P0 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]] as const
    const P1 = [b[0] / b[3], b[1] / b[3], b[2] / b[3]] as const
    const at = (t: number) => [P0[0] + (P1[0] - P0[0]) * t, P0[1] + (P1[1] - P0[1]) * t, P0[2] + (P1[2] - P0[2]) * t] as const
    const above = (x: number, y: number, z: number) => {
      if (Math.abs(x) > XW || Math.abs(z) > ZW) return null
      return y - wy(iv(lastParams, kOfU(uOfX(x)), tOfV(vOfZ(z))))
    }
    let prevT = 0, prevAbove: number | null = null
    const steps = 300
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const p = at(t)
      const d = above(p[0], p[1], p[2])
      if (d !== null && prevAbove !== null && prevAbove > 0 && d <= 0) {
        let lo = prevT, hi = t
        for (let i = 0; i < 20; i++) {
          const mid = (lo + hi) / 2
          const m = at(mid)
          const dm = above(m[0], m[1], m[2])
          if (dm !== null && dm > 0) lo = mid
          else hi = mid
        }
        const m = at((lo + hi) / 2)
        return { k: kOfU(uOfX(m[0])), T: tOfV(vOfZ(m[2])) }
      }
      prevAbove = d
      prevT = t
    }
    return null
  }

  const onDown = (e: PointerEvent) => {
    if (drag) return
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: e.timeStamp, rawYaw: spring.yaw, rawPitch: spring.pitch }
    canvas.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      drag.moved += Math.abs(dx) + Math.abs(dy)
      drag.x = e.clientX
      drag.y = e.clientY
      if (drag.moved > 4) {
        // The surface follows the hand 1:1 while dragging, easing into soft limits (tanh) instead of stopping
        // dead, and the hand's speed is kept so the release carries it.
        const dtS = Math.max(1e-3, (e.timeStamp - drag.t) / 1000)
        drag.t = e.timeStamp
        drag.rawYaw -= dx * 0.006
        const yaw = 0.9 * Math.tanh(drag.rawYaw / 0.9)
        spring.vy = spring.vy * 0.6 + ((yaw - spring.yaw) / dtS) * 0.4
        spring.yaw = yaw
        // Touch turns only: a vertical swipe belongs to the page.
        if (e.pointerType !== 'touch') {
          drag.rawPitch += dy * 0.004
          const pitch = 0.1 + 0.4 * Math.tanh((drag.rawPitch - 0.1) / 0.4)
          spring.vp = spring.vp * 0.6 + ((pitch - spring.pitch) / dtS) * 0.4
          spring.pitch = pitch
        }
      }
      return
    }
    if (e.pointerType === 'mouse') {
      sim.hover = pick(e.clientX, e.clientY)
      sim.dirty = true
    }
  }
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    const click = drag.moved <= (e.pointerType === 'touch' ? 8 : 4)
    drag = null
    // Hand the orbit back: the spring carries it home from wherever it was let go.
    spring.ty = 0
    spring.tp = 0
    if (click) {
      const hit = pick(e.clientX, e.clientY)
      if (hit) {
        sim.probe = hit
        sim.hover = null
        sim.dirty = true
        // The page's own probe follows, so the next arrow key steps from here, not from where it was.
        hooks.onPin(hit)
      }
    }
  }
  const onCancel = () => {
    drag = null
    spring.ty = 0
    spring.tp = 0
  }
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && !drag) {
      sim.hover = null
      sim.dirty = true
    }
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onCancel)
  canvas.addEventListener('pointerleave', onLeave)

  // ── uniforms ───────────────────────────────────────────────────────────────
  const setShared = (prog: typeof surf, p: Params, m: M4, rise: number) => {
    gl.uniform4f(prog.u('uP'), p.s0, p.s1, p.kappa, p.rho)
    gl.uniform2f(prog.u('uQ'), p.eta, p.gamma)
    gl.uniform4f(prog.u('uDom'), DOMAIN.kMin, DOMAIN.kMax, Math.sqrt(DOMAIN.tMin), Math.sqrt(DOMAIN.tMax))
    gl.uniform3f(prog.u('uW'), XW, ZW, H)
    gl.uniform2f(prog.u('uV'), V0, V1)
    gl.uniform1f(prog.u('uRise'), rise)
    gl.uniformMatrix4fv(prog.u('uMVP'), false, m)
  }
  const setLook = (prog: typeof surf, e: [number, number, number], probe: Probe | null) => {
    const wash = oklab(palette.wash), ind = oklab(palette.indigo), ink = oklab(palette.ink), paper = oklab(palette.paper)
    const top = palette.dark ? mixv(ind, ink, STOPS.nightTop) : ind
    gl.uniform3fv(prog.u('uLo'), mixv(wash, ind, STOPS.lo))
    gl.uniform3fv(prog.u('uMid'), mixv(wash, ind, STOPS.mid))
    gl.uniform3fv(prog.u('uTop'), top)
    gl.uniform3fv(prog.u('uInk'), ink)
    gl.uniform3fv(prog.u('uPaper'), paper)
    gl.uniform2f(prog.u('uRamp'), RAMP.lo, RAMP.hi)
    gl.uniform1f(prog.u('uFlip'), LINE_FLIP)
    gl.uniform3fv(prog.u('uKey'), KEY)
    gl.uniform3fv(prog.u('uFill'), FILL)
    gl.uniform3f(prog.u('uLight'), LIGHT.ambient, LIGHT.key, LIGHT.fill)
    gl.uniform1f(prog.u('uUp'), UP_LIGHT)
    gl.uniform3fv(prog.u('uEye'), e)
    gl.uniform1f(prog.u('uSpec'), q === 0 ? 0 : palette.dark ? 0.16 : 0.1)
    gl.uniform1f(prog.u('uAOk'), q === 0 ? 0 : 1.6)
    gl.uniform3f(prog.u('uProbe'), probe ? fu(probe.k) : -1, probe ? Math.min(0.995, fv(probe.T)) : -1, probe ? 1 : 0)
  }

  const place = (el: HTMLElement | null, m: M4, x: number, y: number, z: number) => {
    if (!el) return
    const c = apply(m, x, y, z)
    const sx = ((c[0] / c[3]) * 0.5 + 0.5) * cssW
    const sy = (1 - ((c[1] / c[3]) * 0.5 + 0.5)) * cssH
    el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`
  }

  return {
    frame(_t, dt) {
      if (!progs.every((p) => p.ready())) return false
      const paused = hooks.paused()
      const ph = hooks.sequence()
      const step = Math.min(dt, 1 / 30)

      // Springs: the drag's (ω = 7/s) and the lean's (ω = 5/s), critically damped, semi-implicit Euler.
      const W = 7
      if (!drag || drag.moved <= 4) {
        spring.vy += (W * W * (spring.ty - spring.yaw) - 2 * W * spring.vy) * step
        spring.vp += (W * W * (spring.tp - spring.pitch) - 2 * W * spring.vp) * step
        spring.yaw += spring.vy * step
        spring.pitch += spring.vp * step
      }
      const leaning = paused ? null : hooks.lean()
      const LW = 5
      const ly = leaning ? -LEAN.yaw * leaning.x : lean.yaw, lp = leaning ? -LEAN.pitch * leaning.y : lean.pitch
      lean.vy += (LW * LW * (ly - lean.yaw) - 2 * LW * lean.vy) * step
      lean.vp += (LW * LW * (lp - lean.pitch) - 2 * LW * lean.vp) * step
      lean.yaw += lean.vy * step
      lean.pitch += lean.vp * step

      // The shock: the signature's while it plays; after it, the reader's level on a quick spring (ω = 12/s).
      let x: number
      if (ph) {
        x = amplitudeOf(ph)
        shock.x = x
        shock.v = 0
      } else {
        const SW = 12
        shock.v += (SW * SW * (hooks.level() - shock.x) - 2 * SW * shock.v) * step
        shock.x += shock.v * step
        x = shock.x
      }
      const moving =
        !!drag ||
        Math.abs(spring.yaw) + Math.abs(spring.pitch) + Math.abs(spring.vy) + Math.abs(spring.vp) > 1e-4 ||
        Math.abs(lean.vy) + Math.abs(lean.vp) > 1e-5 ||
        Math.abs(shock.v) > 1e-5 ||
        Math.abs(hooks.level() - shock.x) > 1e-4
      // Unpaused, it drifts, so every frame is drawn; paused, only a change is.
      if (drawnOnce && paused && !moving && !sim.dirty && !resized) return true
      sim.dirty = false
      resized = false

      const rise = ph ? EASE_OUT(ph.rise) : 1
      const lines = ph ? ph.lines : 1
      const labelsK = ph ? EASE_OUT(ph.labels) : 1
      const p = params(Math.max(0, x))
      lastParams = p
      const cam = camera(Math.sin((2 * Math.PI * swayT) / SWAY_PERIOD), spring.yaw + lean.yaw, spring.pitch + lean.pitch)
      const m = mvp(cam, cssW / cssH)
      inv = invert(m)
      const e = eye(cam)
      const probe = sim.hover ?? sim.probe

      gl.viewport(0, 0, w, h)
      const bg = palette.paper
      gl.clearColor(bg[0], bg[1], bg[2], 1)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.enable(gl.DEPTH_TEST)
      gl.disable(gl.CULL_FACE)

      // Surface, then the walls, from one program; pushed back a little so the smiles on it stay in front.
      gl.enable(gl.POLYGON_OFFSET_FILL)
      gl.polygonOffset(1, 2)
      surf.use()
      setShared(surf, p, m, rise)
      setLook(surf, e, rise > 0.98 ? probe : null)
      gl.uniform1i(surf.u('uMode'), 0)
      gl.uniform1i(surf.u('uN'), n)
      gl.bindVertexArray(surfVao)
      gl.drawElements(gl.TRIANGLES, count, indexType(), 0)
      gl.uniform1i(surf.u('uMode'), 1)
      gl.uniform1i(surf.u('uM'), n - 1)
      gl.bindVertexArray(emptyVao)
      // Only walls that face the camera can be seen: front, right, back, left.
      const facing = [e[2] > ZW, e[0] > XW, e[2] < -ZW, e[0] < -XW]
      for (let edge = 0; edge < 4; edge++) {
        if (!facing[edge]) continue
        gl.uniform1i(surf.u('uEdge'), edge)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, n * 2)
      }
      gl.disable(gl.POLYGON_OFFSET_FILL)

      // Lines: the axes, and the smiles at the ticked expiries.
      line.use()
      gl.uniformMatrix4fv(line.u('uMVP'), false, m)
      gl.uniform2f(line.u('uPx'), 2 / cssW, 2 / cssH)
      gl.uniform1f(line.u('uWidth'), 1)
      gl.uniform3fv(line.u('uColor'), palette.graphite)
      gl.bindVertexArray(axisVao)
      gl.drawArrays(gl.TRIANGLES, 0, axisCount)
      buildSmiles(p, lines)
      if (smileCount) {
        gl.uniform3fv(line.u('uColor'), palette.graphite)
        gl.bindVertexArray(smileVao)
        gl.drawArrays(gl.TRIANGLES, 0, smileCount)
      }
      gl.bindVertexArray(null)

      // Labels, notes and the reading point ride the same projection; the labels arrive with the sheet.
      const els = hooks.labels()
      LABELS.forEach((l, i) => place(els[i] ?? null, m, l.at[0], l.at[1], l.at[2]))
      const layer = hooks.labelLayer()
      if (layer) layer.style.opacity = labelsK.toFixed(3)
      const notes = hooks.notes()
      NOTES.forEach((nt, i) => place(notes[i] ?? null, m, wx(nt.k), wy(iv(p, nt.k, nt.T)) * rise, wz(nt.T)))
      const dot = hooks.dot()
      place(dot, m, wx(probe.k), wy(iv(p, probe.k, probe.T)) * rise, wz(probe.T))
      // The reading point arrives with the labels, once the sheet is up to be read.
      if (dot) dot.style.opacity = labelsK.toFixed(3)

      hooks.sync(p)
      drawnOnce = true
      // For the specs and ?debug=1: frames drawn.
      canvas.dataset.draws = String(++draws)
      // The clocks move after the frame, so the first frame is the poster's moment exactly.
      if (!paused) {
        hooks.tick(dt * 1000)
        swayT += dt
      }
      return true
    },
    resize(bw, bh, cw, ch) {
      w = bw
      h = bh
      cssW = cw
      cssH = ch
      resized = true
    },
    setQuality(level) {
      q = level
      const side = GRID[Math.max(0, Math.min(3, level))]!
      if (side !== n) buildGrid(side)
      resized = true
    },
    setPalette(p) {
      palette = p
      sim.dirty = true
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onCancel)
      canvas.removeEventListener('pointerleave', onLeave)
      for (const p of progs) gl.deleteProgram(p.program)
      if (index) gl.deleteBuffer(index)
      gl.deleteBuffer(axisBuf)
      gl.deleteBuffer(smileBuf)
      gl.deleteVertexArray(surfVao)
      gl.deleteVertexArray(axisVao)
      gl.deleteVertexArray(smileVao)
      gl.deleteVertexArray(emptyVao)
    },
  }
}
