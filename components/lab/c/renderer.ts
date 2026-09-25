import { program, toLinear } from '@/lib/lab/gl'
import { FILL, KEY, LIGHT, LINE_FLIP, RAMP, STOPS, UP_LIGHT } from '@/lib/lab/c/look'
import { amplitude, params } from '@/lib/lab/c/shock'
import { DOMAIN, iv, type Params } from '@/lib/lab/c/ssvi'
import {
  apply, camera, EXPIRY_TICKS, eye, H, kOfU, LABELS, mvp, NOTES, POST, STRIKE_TICKS, SWAY_PERIOD, tOfV, uOfX, V0, V1,
  vOfZ, VOL_TICKS, wx, wy, wz, XW, ZW, fu, fv, type M4,
} from '@/lib/lab/c/view'
import type { Palette, Renderer, RGB, StageEnv } from '../useStage'
import { FLOOR_FS, FLOOR_VS, LINE_FS, LINE_VS, surfaceFS, surfaceVS } from './shaders'

/**
 * The live renderer. Raw WebGL2: one grid drawn from gl_VertexID (no vertex
 * buffer; the vertex shader places every vertex from the SSVI parameters), four
 * wall strips, a floor, and the axis lines as screen-space quads. The HTML
 * labels and notes are projected with the same matrix every frame, so they
 * ride the surface as it rises.
 *
 * The clock that drives the shock lives in `sim`, shared with the component:
 * it only advances when a frame is actually drawn, and the readouts are
 * written from the same parameters in the same frame (`sync`).
 */

export interface Probe {
  k: number
  T: number
}

export interface Sim {
  /** Loop time of the shock, seconds. */
  clock: number
  playing: boolean
  size: number
  /** The pinned reading point, and the one under the mouse (wins while there). */
  probe: Probe
  hover: Probe | null
  /** Something the reader changed: draw the next frame even when paused. */
  dirty: boolean
}

export interface Hooks {
  sim: Sim
  labels(): readonly (HTMLElement | null)[]
  notes(): readonly (HTMLElement | null)[]
  dot(): HTMLElement | null
  sync(p: Params, clock: number): void
}

/** Grid vertices per side and wall segments, by quality level. */
const GRID = [40, 96, 168, 256] as const

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
  const floor = program(gl, FLOOR_VS, FLOOR_FS)
  const line = program(gl, LINE_VS, LINE_FS)
  const progs = [surf, floor, line]

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

  // Axis lines: strike and expiry ticks on the floor, the volatility post and its ticks.
  const segs: [number, number, number, number, number, number][] = []
  for (const K of STRIKE_TICKS) segs.push([wx(Math.log(K)), 0, ZW, wx(Math.log(K)), 0, ZW + 0.05])
  for (const [T] of EXPIRY_TICKS) segs.push([XW, 0, wz(T), XW + 0.05, 0, wz(T)])
  const px = POST[0] + 0.004, pz = POST[1] - 0.004
  segs.push([px, 0, pz, px, wy(1), pz])
  for (const v of VOL_TICKS) segs.push([px, wy(v), pz, px + 0.04, wy(v), pz])
  const lineData = new Float32Array(segs.length * 6 * 8)
  {
    let o = 0
    const corners = [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]] as const
    for (const s of segs)
      for (const [e, side] of corners) {
        lineData.set([s[0], s[1], s[2], s[3], s[4], s[5], e, side], o)
        o += 8
      }
  }
  const lineVao = gl.createVertexArray()
  gl.bindVertexArray(lineVao)
  const lineBuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf)
  gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.STATIC_DRAW)
  let lineAttribs = false
  const bindLineAttribs = () => {
    if (lineAttribs) return
    lineAttribs = true
    gl.bindVertexArray(lineVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf)
    const names = [['aA', 3, 0], ['aB', 3, 12], ['aS', 2, 24]] as const
    for (const [name, size, off] of names) {
      const loc = gl.getAttribLocation(line.program, name)
      if (loc < 0) continue
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 32, off)
    }
    gl.bindVertexArray(null)
  }
  gl.bindVertexArray(null)

  // ── state ──────────────────────────────────────────────────────────────────
  let w = 1, h = 1, cssW = 1, cssH = 1
  let swayT = 0
  let resized = true
  let drawnOnce = false
  let inv: M4 | null = null
  let lastParams: Params = params(amplitude(sim.clock), sim.size)
  /** Drag offset of the orbit, on a critically damped spring back to zero. */
  const spring = { yaw: 0, pitch: 0, vy: 0, vp: 0, ty: 0, tp: 0 }
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
        // The surface follows the hand 1:1 while dragging, easing into soft
        // limits (tanh) instead of stopping dead, and the hand's speed is
        // kept so the release carries it.
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
  const setShared = (prog: typeof surf, p: Params, m: M4) => {
    gl.uniform4f(prog.u('uP'), p.s0, p.s1, p.kappa, p.rho)
    gl.uniform2f(prog.u('uQ'), p.eta, p.gamma)
    gl.uniform4f(prog.u('uDom'), DOMAIN.kMin, DOMAIN.kMax, Math.sqrt(DOMAIN.tMin), Math.sqrt(DOMAIN.tMax))
    gl.uniform3f(prog.u('uW'), XW, ZW, H)
    gl.uniform2f(prog.u('uV'), V0, V1)
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
      bindLineAttribs()

      // Spring: ω = 7/s, critically damped (ζ = 1), semi-implicit Euler.
      const W = 7
      const step = Math.min(dt, 1 / 30)
      // While a drag holds the surface, the hand sets the angle directly;
      // the spring takes over on release, from the hand's own speed.
      if (!drag || drag.moved <= 4) {
        spring.vy += (W * W * (spring.ty - spring.yaw) - 2 * W * spring.vy) * step
        spring.vp += (W * W * (spring.tp - spring.pitch) - 2 * W * spring.vp) * step
        spring.yaw += spring.vy * step
        spring.pitch += spring.vp * step
      }
      const moving = !!drag || Math.abs(spring.yaw) + Math.abs(spring.pitch) + Math.abs(spring.vy) + Math.abs(spring.vp) > 1e-4

      if (drawnOnce && !sim.playing && !moving && !sim.dirty && !resized) return true
      sim.dirty = false
      resized = false

      const p = params(amplitude(sim.clock), sim.size)
      lastParams = p
      const cam = camera(Math.sin((2 * Math.PI * swayT) / SWAY_PERIOD), spring.yaw, spring.pitch)
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

      // Floor
      gl.depthMask(false)
      floor.use()
      gl.uniformMatrix4fv(floor.u('uMVP'), false, m)
      gl.uniform2f(floor.u('uHalf'), XW, ZW)
      gl.uniform3f(floor.u('uPaperL'), toLinear(bg[0]), toLinear(bg[1]), toLinear(bg[2]))
      gl.bindVertexArray(emptyVao)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      gl.depthMask(true)

      // Surface, then the walls, from one program.
      surf.use()
      setShared(surf, p, m)
      setLook(surf, e, probe)
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

      // Axis lines
      line.use()
      gl.uniformMatrix4fv(line.u('uMVP'), false, m)
      gl.uniform2f(line.u('uPx'), 2 / cssW, 2 / cssH)
      gl.uniform1f(line.u('uWidth'), 1)
      gl.uniform3fv(line.u('uColor'), palette.graphite)
      gl.bindVertexArray(lineVao)
      gl.drawArrays(gl.TRIANGLES, 0, segs.length * 6)
      gl.bindVertexArray(null)

      // Labels, notes and the reading point ride the same projection.
      const els = hooks.labels()
      LABELS.forEach((l, i) => place(els[i] ?? null, m, l.at[0], l.at[1], l.at[2]))
      const notes = hooks.notes()
      NOTES.forEach((nt, i) => place(notes[i] ?? null, m, wx(nt.k), wy(iv(p, nt.k, nt.T)), wz(nt.T)))
      place(hooks.dot(), m, wx(probe.k), wy(iv(p, probe.k, probe.T)), wz(probe.T))

      hooks.sync(p, sim.clock)
      drawnOnce = true
      // The clock moves after the frame, so the first frame is the poster's moment exactly.
      if (sim.playing) {
        sim.clock += dt
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
      gl.deleteBuffer(lineBuf)
      gl.deleteVertexArray(surfVao)
      gl.deleteVertexArray(lineVao)
      gl.deleteVertexArray(emptyVao)
    },
  }
}

