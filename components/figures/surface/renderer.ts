import { program } from '@/lib/gl'
import { invert } from '@/lib/m4'
import { EASE_IN_OUT_QUAD, EASE_OUT, EASE_OUT_CSS } from '@/lib/ease'
import { FILL, KEY, LIGHT, LINE_FLIP, oklab, RAMP, rampStops, UP_LIGHT } from '@/lib/surface/look'
import { lineReveal } from '@/lib/surface/sequence'
import { spring as spring2 } from '@/lib/stage/spring'
import { params } from '@/lib/surface/shock'
import { DOMAIN, iv, type Params } from '@/lib/surface/ssvi'
import {
  camera, EXPIRY_TICKS, eye, H, kOfU, LABELS, mvp, NOTES, pickSurface, POST, STRIKE_TICKS, SWAY_PERIOD, V0, V1,
  VOL_TICKS, wx, wy, wz, XW, ZW, fu, fv, type FrameKind, type M4,
} from '@/lib/surface/view'
import type { Palette, Renderer, StageEnv } from '@/components/stage/useStage'
import { GLOW_FS, LINE_FS, LINE_VS, surfaceFS, surfaceVS } from './shaders'
import { noteRise, setNoteRise } from './marks'

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
  /** The kit may draw every other frame at rest on a 120 Hz display: only where no other view draws in step with this. */
  halveAtRest?: boolean
  /** Which framing the stage shows (a phone's, or the wide one): its camera, and its labels. */
  frame(): FrameKind
  /** The signature's phases while it waits or plays; null once it is over, or on a visit without one. */
  sequence(): { lines: number; rise: number; labels: number; shock: number; relax: number } | null
  /** The story has started and is not over: every frame of it is drawn, paused or not. */
  playing(): boolean
  /** The story is armed and waits to be seen: the stage is paper until it starts, so a frame need not be redrawn. */
  waiting?(): boolean
  /** The shock the signature shows now: its own, or, while a reader's skip plays, draining from where it stood. */
  shown(): number
  /** A drawn frame took this long: the signature's clock moves on it. */
  tick(dtMs: number): void
  /** The shock the reader has set: 0 is calm, 1 a full shock, up to SIZE_MAX. */
  level(): number
  /**
   * Paused: the drift and the lean hold, and a paused figure draws nothing new. The story itself, five seconds
   * started by the page or by Replay, plays out (a click or the keyboard's Pause finishes it first); the reader can
   * still read the surface and turn it.
   */
  paused(): boolean
  /** The reader's lean, −1…1 each way, from the pointer or the tilt. */
  lean(): { x: number; y: number }
  /** A click or tap pinned the reading point here. */
  onPin(p: Probe): void
  labels(): readonly (HTMLElement | null)[]
  labelLayer(): HTMLElement | null
  notes(): readonly (HTMLElement | null)[]
  dot(): HTMLElement | null
  /** The tag beside the dot, which names the volatility at the point while the reader is reading one. */
  tag(): HTMLElement | null
  /** The reader has set the reading point (a click or tap, or the keys): its tag stays up once it is theirs. */
  pinned(): boolean
  /** The readouts, for the parameters just drawn, and the shock they were drawn at (0 calm, 1 a full shock). */
  sync(p: Params, shown: number): void
  /**
   * /market's surface only: a liquidity shock has just landed, this hard (0 to 1), read once. The surface takes it as a
   * blow: a nod of the camera on the drag's own spring, and the one-month smile lit for a moment, by day in ink.
   */
  impact?(): number
  /** Whether the surface is read at a point (the IV paper's): /market's is not, and draws no crosshair. */
  reading?(): boolean
  /** /market's surface only: the camera's distance as a share of its fitted one (a shock's blow draws it in). */
  zoom?(): number
  /** /market's surface only: where the keyboard has turned the view to, in radians, within the drag's own soft limits. */
  aim?(): { yaw: number; pitch: number }
}

/** Grid vertices per side and wall segments, by quality level. */
const GRID = [40, 96, 168, 256] as const
/** Points along each hanging smile. */
const SMILE_N = 96
/** How far the reader's lean turns the surface, radians: in yaw, and in pitch. */
const LEAN = { yaw: 0.06, pitch: 0.03 } as const

// ── the renderer ─────────────────────────────────────────────────────────────

/** One spring step on a pair of fields of an object (its position and its velocity), without making a new one. */
const pair = { x: 0, v: 0 }
function step2<K extends string, V extends string>(o: Record<K | V, number>, x: K, v: V, target: number, dt: number, omega: number) {
  pair.x = o[x]
  pair.v = o[v]
  spring2(pair, target, dt, omega)
  o[x] = pair.x
  o[v] = pair.v
}

/** How long Replay takes to lower the sheet into the page (its labels go in 150ms). */
const SINK_S = 0.35

export interface SurfaceRenderer extends Renderer {
  /** Replay: lower what is shown back into the page, then call `done`, which starts the story again from there. */
  sink(done: () => void): void
}

export function make(env: StageEnv, hooks: Hooks): SurfaceRenderer {
  const { gl, canvas } = env
  const sim = hooks.sim
  // The software tier (a CPU rasteriser) gets the light shader variant.
  const lite = env.tier === 'software'
  const surf = program(gl, surfaceVS(lite), surfaceFS(lite))
  const line = program(gl, LINE_VS, LINE_FS)
  const glow = program(gl, LINE_VS, GLOW_FS)
  const progs = [surf, line, glow]

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
  /** The same corners, flat, for the loops run every frame of a shock: read by index, they make no iterators. */
  const CORNER_E = [0, 1, 1, 0, 1, 0] as const, CORNER_SIDE = [-1, -1, 1, -1, 1, 1] as const
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
  /** The one-month smile's corners, first in the buffer: the smile a shock lifts most, which glows by night. */
  let frontCount = 0
  /** Its glow's colour, indigo toward ink by night (kept, not made again every frame). */
  const glowColor = new Float32Array(3)
  let smileKey = ''
  const buildSmiles = (p: Params, lines: number) => {
    const key = `${p.s0},${p.s1},${p.kappa},${p.rho},${p.eta},${lines}`
    if (key === smileKey) return
    smileKey = key
    // Written straight into the vertex buffer, six corners a segment: rebuilt every frame of a shock, so it makes
    // no arrays of its own.
    let o = 0, n = 0
    for (const [T] of EXPIRY_TICKS) {
      const shown = lineReveal(lines, fv(T)) * (SMILE_N - 1)
      let px = 0, py = 0, pz = 0
      for (let i = 0; i <= Math.ceil(shown); i++) {
        const u = Math.min(i, shown) / (SMILE_N - 1)
        const k = kOfU(u)
        const x = wx(k), y = wy(iv(p, k, T)) + 0.008, z = wz(T)
        if (i > 0) {
          for (let c = 0; c < 6; c++) {
            smileData[o++] = px
            smileData[o++] = py
            smileData[o++] = pz
            smileData[o++] = x
            smileData[o++] = y
            smileData[o++] = z
            smileData[o++] = CORNER_E[c]!
            smileData[o++] = CORNER_SIDE[c]!
          }
          n++
        }
        px = x
        py = y
        pz = z
      }
      if (T === EXPIRY_TICKS[0][0]) frontCount = n * 6
    }
    smileCount = n * 6
    gl.bindBuffer(gl.ARRAY_BUFFER, smileBuf)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, smileData, 0, smileCount * 8)
  }

  // ── state ──────────────────────────────────────────────────────────────────
  let w = 1, h = 1, cssW = 1, cssH = 1
  let swayT = 0
  /** The programs have linked: asked once, not every frame. */
  let linked = false
  /** The surface's finish (highlight, occlusion), 0…1: off at the lowest quality, eased across a step. */
  let finishK = 1
  /** The sway's speed (coasting on Pause) and how far it has come in (0 during the story). */
  let swayK = 1
  let swayIn = 0
  let resized = true
  let drawnOnce = false
  let draws = 0
  let inv: M4 | null = null
  /** The inverse's own matrix, written again each frame rather than made anew. */
  const invBuf: M4 = new Float32Array(16)
  /** The ramp's stops and the two ends' oklab, for the palette they were worked out for. */
  let stopsFor: Palette | null = null
  let stops = rampStops(palette)
  let inkLab = oklab(palette.ink), paperLab = oklab(palette.paper)
  /** The shock shown: the signature's, or the reader's level followed on a quick spring (ω = 30/s, the home figure's). */
  const shock = { x: hooks.level(), v: 0 }
  /** Replay's way back into the page: from what was shown when it was pressed, on the site's ease-out. */
  let sinking: { t: number; rise: number; lines: number; labels: number; shock: number; sway: number; done: () => void } | null = null
  /** What the last frame showed, for a sink to start from. */
  let shown = { rise: 1, lines: 1, labels: 1, shock: 0 }
  /** The story's phases at the last frame, summed: a change (Replay, its end) is drawn by a paused figure too. */
  let lastStory = -1
  let lastParams: Params = params(0)
  /** Drag offset of the orbit and the reader's lean, on critically damped springs back to their targets. */
  const spring = { yaw: 0, pitch: 0, vy: 0, vp: 0, ty: 0, tp: 0 }
  const lean = { yaw: 0, pitch: 0, vy: 0, vp: 0 }
  // A shock's nod, on a spring of its own (the drag's ω 7), so Pause can hold it without holding the reader's drag.
  const nod = { yaw: 0, pitch: 0, vy: 0, vp: 0 }
  let drag: { id: number; x: number; y: number; moved: number; t: number; rawYaw: number; rawPitch: number; live: boolean } | null = null
  /** Until when a key's aim is followed on the quick spring (performance.now(), ms). */
  let keyedUntil = 0

  // ── input ──────────────────────────────────────────────────────────────────
  const pick = (clientX: number, clientY: number): Probe | null => {
    if (!inv) return null
    const r = canvas.getBoundingClientRect()
    return pickSurface(inv, ((clientX - r.left) / r.width) * 2 - 1, 1 - ((clientY - r.top) / r.height) * 2, lastParams)
  }


  // The soft limits the drag eases into, and their inverses: a surface grabbed again near a limit picks up from where
  // it is, not from a second pass through the limit.
  const soft = { yaw: (r: number) => 0.9 * Math.tanh(r / 0.9), pitch: (r: number) => 0.1 + 0.4 * Math.tanh((r - 0.1) / 0.4) }
  /** How far the camera stands back at each soft limit: a share of its distance. */
  const PULL = { yaw: 0.18, pitch: 0.3 }
  const raw = {
    yaw: (y: number) => 0.9 * Math.atanh(Math.max(-0.999, Math.min(0.999, y / 0.9))),
    pitch: (p: number) => 0.1 + 0.4 * Math.atanh(Math.max(-0.999, Math.min(0.999, (p - 0.1) / 0.4))),
  }
  const onDown = (e: PointerEvent) => {
    if (drag) return
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: e.timeStamp, rawYaw: 0, rawPitch: 0, live: false }
    canvas.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      drag.moved += Math.abs(dx) + Math.abs(dy)
      drag.x = e.clientX
      drag.y = e.clientY
      if (drag.moved > 4) {
        // The hand's grip shows while the surface turns under it.
        canvas.style.cursor = 'grabbing'
        // The hand takes the surface where it is now: while the press could still have been a tap, the spring carried
        // it on, so a surface grabbed again as it springs home never jumps back to where the press began.
        const first = !drag.live
        if (first) {
          drag.live = true
          drag.rawYaw = raw.yaw(spring.yaw)
          drag.rawPitch = raw.pitch(spring.pitch)
          drag.t = e.timeStamp
          spring.vy = 0
          spring.vp = 0
        }
        // The surface follows the hand 1:1 while dragging, easing into soft limits (tanh) instead of stopping
        // dead, and the hand's speed is kept so the release carries it.
        const dtS = Math.max(1e-3, (e.timeStamp - drag.t) / 1000)
        drag.t = e.timeStamp
        drag.rawYaw -= dx * 0.006
        const yaw = soft.yaw(drag.rawYaw)
        if (!first) spring.vy = spring.vy * 0.6 + ((yaw - spring.yaw) / dtS) * 0.4
        spring.yaw = yaw
        // Touch turns only: a vertical swipe belongs to the page.
        if (e.pointerType !== 'touch') {
          drag.rawPitch += dy * 0.004
          const pitch = soft.pitch(drag.rawPitch)
          if (!first) spring.vp = spring.vp * 0.6 + ((pitch - spring.pitch) / dtS) * 0.4
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
    // A hand that had stopped before it let go throws nothing: the speed kept from its last move is spent.
    const still = (e.timeStamp - drag.t) / 1000
    if (still > 0.05) {
      const k = Math.exp(-(still - 0.05) / 0.05)
      spring.vy *= k
      spring.vp *= k
    }
    drag = null
    canvas.style.cursor = ''
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
    canvas.style.cursor = ''
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
  const setLook = (prog: typeof surf, e: [number, number, number], probe: Probe | null, probeK = 1) => {
    // The ramp's stops follow the palette, which changes only with the colour scheme: worked out once for each.
    if (stopsFor !== palette) {
      stopsFor = palette
      stops = rampStops(palette)
      inkLab = oklab(palette.ink)
      paperLab = oklab(palette.paper)
    }
    gl.uniform3fv(prog.u('uLo'), stops.lo)
    gl.uniform3fv(prog.u('uMid'), stops.mid)
    gl.uniform3fv(prog.u('uTop'), stops.top)
    gl.uniform3fv(prog.u('uInk'), inkLab)
    gl.uniform3fv(prog.u('uPaper'), paperLab)
    gl.uniform2f(prog.u('uRamp'), RAMP.lo, RAMP.hi)
    gl.uniform1f(prog.u('uFlip'), LINE_FLIP)
    gl.uniform3fv(prog.u('uKey'), KEY)
    gl.uniform3fv(prog.u('uFill'), FILL)
    gl.uniform3f(prog.u('uLight'), LIGHT.ambient, LIGHT.key, LIGHT.fill)
    gl.uniform1f(prog.u('uUp'), UP_LIGHT)
    gl.uniform3fv(prog.u('uEye'), e)
    // The highlight and the occlusion shading are eased across a quality step, not switched in a frame.
    gl.uniform1f(prog.u('uSpec'), finishK * (palette.dark ? 0.16 : 0.1))
    gl.uniform1f(prog.u('uAOk'), finishK * 1.6)
    gl.uniform3f(prog.u('uProbe'), probe ? fu(probe.k) : -1, probe ? Math.min(0.995, fv(probe.T)) : -1, probe ? probeK : 0)
  }

  /** Where `place` put its element, in CSS pixels across and down the stage: kept, so no point makes an array. */
  const placed = new Float64Array(2)
  /** Moves `el` to where (x, y, z) is drawn, and leaves where that is in `placed`. */
  const place = (el: HTMLElement | null, m: M4, x: number, y: number, z: number) => {
    const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!
    const sx = (((m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w) * 0.5 + 0.5) * cssW
    const sy = (1 - (((m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w) * 0.5 + 0.5)) * cssH
    placed[0] = sx
    placed[1] = sy
    if (el) el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`
  }
  /** Each axis label's size (measured once a size and once the page's face has arrived), and whether it is shown. */
  const labelSize: ([number, number] | undefined)[] = []
  const labelOn: boolean[] = []
  const labelXY: number[] = []
  const SHIFT: Record<string, readonly [number, number]> = { center: [-0.5, -0.5], left: [0, -0.5], right: [-1, -0.5], above: [-0.5, -1] }
  /**
   * Turned far, an axis foreshortens and its ticks close up ("1M3M6M"), or a label's point leaves the stage and its words
   * fall onto the lines below it, or the edge an axis hangs on turns behind the sheet. The titles are placed first, then
   * each tick in order: one on an edge turned away, one that would touch a label already kept, or one outside the stage
   * gives way (a 120ms fade), and comes back when there is room again.
   */
  const thinLabels = (els: readonly (HTMLElement | null)[], e: readonly number[]) => {
    // The strike axis hangs on the front edge, the expiry axis on the right one: past the drag's soft limit the eye can
    // stand behind either, and its words would be painted over the sheet that hides it.
    const turned = (id: string) => (id[0] === 'k' ? e[2]! < ZW : id[0] === 't' ? e[0]! < XW : false)
    // The notes' words and the reading point first: they are the figure's reading, and an axis label that would touch
    // them gives way (held at a drag's limit, the dot sat on "implied vol").
    const kept: number[] = noteBox.flatMap((b) => (b ? [b[0], b[1], b[2], b[3]] : []))
    if (dotAt) kept.push(dotAt[0] - 8, dotAt[1] - 8, dotAt[0] + 8, dotAt[1] + 8)
    if (tagAt) kept.push(tagAt[0], tagAt[1], tagAt[2], tagAt[3])
    /** Each kept tick's axis, by its box's index in `kept` (a note or the dot has none). */
    const axisOf: (string | null)[] = kept.map(() => null)
    const order = [...LABELS.keys()].sort((a, b) => (LABELS[a]!.kind === 'title' ? 0 : 1) - (LABELS[b]!.kind === 'title' ? 0 : 1))
    for (const i of order) {
      const el = els[i]
      if (!el) continue
      const size = (labelSize[i] ||= [el.offsetWidth, el.offsetHeight])
      // The other framing's labels are in the layer too, not shown: nothing to place, nothing to make room for.
      if (!size[0]) continue
      const [fx, fy] = SHIFT[LABELS[i]!.align]!
      const x0 = labelXY[i * 2]! + fx * size[0], y0 = labelXY[i * 2 + 1]! + fy * size[1]
      const x1 = x0 + size[0], y1 = y0 + size[1]
      const inside = x0 >= -2 && y0 >= -2 && x1 <= cssW + 2 && y1 <= cssH + 2
      let clear = inside && !turned(LABELS[i]!.id)
      // Boxes, not ink: a label's box is its line, taller than its glyphs (about 3px above and below them, at
      // leading-none), so two may share that much and still read apart (the 1M and 3M ticks of /market's short pane do,
      // at rest, as the poster draws them); across, a box is its glyphs' advance, and words closer than 1px touch.
      // Ticks of one axis stacked one over another (most of the narrower's width shared, as a foreshortened axis piles
      // them) need a real gap: there the 3px of shared line read as one block of figures.
      const axis = LABELS[i]!.kind === 'tick' ? LABELS[i]!.id[0]! : null
      for (let k = 0; clear && k < kept.length; k += 4) {
        const ox = Math.min(x1, kept[k + 2]!) - Math.max(x0, kept[k]!)
        const stacked = axis !== null && axisOf[k] === axis && ox > 0.5 * Math.min(x1 - x0, kept[k + 2]! - kept[k]!)
        const slack = stacked ? -1 : 3
        // Across, a gap of 4px: words of two axes closer than that read as one ("130%2Y").
        if (x0 < kept[k + 2]! + 4 && x1 > kept[k]! - 4 && y0 < kept[k + 3]! - slack && y1 > kept[k + 1]! + slack) clear = false
      }
      if (clear) {
        axisOf[kept.length] = axis
        kept.push(x0, y0, x1, y1)
      }
      if (labelOn[i] !== clear) {
        labelOn[i] = clear
        el.style.transition = `opacity 120ms ${EASE_OUT_CSS}`
        el.style.opacity = clear ? '' : '0'
      }
    }
  }
  /** Each note's words: their height (measured once a size), and how far above the point they last stood. */
  const noteH: number[] = []
  const noteW: number[] = []
  /** Where each note's words stood last frame, on the stage: the axis labels give way to them (thinLabels). */
  const noteBox: (readonly [number, number, number, number] | null)[] = []
  /** Where the reading point stood last frame, on the stage (an obstacle the axis labels give way to too). */
  let dotAt: readonly [number, number] | null = null
  /** Where the reading's tag stood last frame, and its size (measured once a text). */
  let tagAt: readonly [number, number, number, number] | null = null
  let tagSize: [number, number] | null = null
  const noteDy: (number | undefined)[] = []
  // A note mid-way through its word swap to the other side of its point.
  const noteSwap: boolean[] = []
  // The page's own face may arrive after the first frame and set the words a little taller: measured again then.
  void document.fonts?.ready.then(() => {
    labelSize.length = 0
    noteH.length = 0
    noteW.length = 0
    noteDy.length = 0
    noteSwap.length = 0
    sim.dirty = true
  })
  /** The tag: how much it is shown (it comes and goes over about 150ms), what it last said, and which side it is on. */
  let tagK = 0
  let tagText = ''
  let tagLeft = false
  /** A landed shock's light on the one-month smile, 1 at the blow and fading over about a second. */
  let flash = 0
  const reads = () => hooks.reading?.() ?? true
  let lastZoom = 1
  let calmNow = false

  return {
    calm: () => calmNow,
    frame(_t, dt) {
      if (!linked) {
        if (!progs.every((p) => p.ready())) return false
        linked = true
      }
      const paused = hooks.paused()
      const ph = hooks.sequence()

      // Springs, the figures' one (lib/stage/spring.ts), stepped exactly at any frame rate: the drag's return (ω 7),
      // the reader's lean (ω 4, the home figure's), and below, the reader's shock (ω 30).
      // /market's keys aim the view, within the drag's soft limits, on the drag's own spring; home is zero.
      const aimed = hooks.aim?.()
      if (aimed && !drag) {
        const ty = aimed.yaw ? soft.yaw(aimed.yaw) : 0, tp = aimed.pitch ? soft.pitch(aimed.pitch) : 0
        // A key's aim is followed on the quick spring (ω 30, there in about 160ms): a key press never trails.
        if (ty !== spring.ty || tp !== spring.tp) keyedUntil = performance.now() + 500
        spring.ty = ty
        spring.tp = tp
      }
      if (!drag || !drag.live) {
        const w = performance.now() < keyedUntil ? 30 : 7
        step2(spring, 'yaw', 'vy', spring.ty, dt, w)
        step2(spring, 'pitch', 'vp', spring.tp, dt, w)
      }
      // A shock's blow: the camera nods (a kick to the drag spring's speed, ω 7, which carries it home without an
      // overshoot) and the one-month smile lights. The kick sets the speed rather than adding to it, so shocks pressed
      // in a row nod no harder than the hardest of them.
      const blow = hooks.impact?.() ?? 0
      if (blow > 0) {
        nod.vp = Math.max(nod.vp, 0.55 * blow)
        nod.vy = Math.min(nod.vy, -0.3 * blow)
        flash = Math.max(flash, blow)
        // For the specs: the animation frame the blow landed in, on the frame's own clock.
        canvas.dataset.landed = String(document.timeline?.currentTime ?? performance.now())
      }
      // Paused, the nod and the smile's light stand where they are (Pause holds everything, WCAG 2.2.2).
      if (!paused) {
        step2(nod, 'yaw', 'vy', 0, dt, 7)
        step2(nod, 'pitch', 'vp', 0, dt, 7)
        flash = flash > 0.004 ? flash * Math.exp(-dt / 0.3) : 0
      }
      // Paused, while the hand turns it, or while a mouse reads a point, the lean rests where it is: the grip is the
      // hand's alone, and the point being read stays under the pointer (as the order book holds still for a reading).
      const reading = sim.hover !== null
      const leaning = paused || drag?.live || reading ? null : hooks.lean()
      const ly = leaning ? -LEAN.yaw * leaning.x : lean.yaw, lp = leaning ? -LEAN.pitch * leaning.y : lean.pitch
      step2(lean, 'yaw', 'vy', ly, dt, 4)
      step2(lean, 'pitch', 'vp', lp, dt, 4)

      // The shock: the signature's while it plays; after it, the reader's level on a quick spring (ω = 30/s).
      let x: number
      if (ph) {
        x = hooks.shown()
        shock.x = x
        shock.v = 0
      } else {
        spring2(shock, hooks.level(), dt, 30)
        // Within a ten-thousandth of a full shock and all but still, it is there: settle it, so a paused figure stops
        // drawing rather than spend most of a second on a change no one could see.
        if (Math.abs(hooks.level() - shock.x) < 1e-4 && Math.abs(shock.v) < 1e-3) {
          shock.x = hooks.level()
          shock.v = 0
        }
        x = shock.x
      }
      // What is shown of the story: its phases, exactly. While Replay sinks the last one, the sheet lowers into the
      // page as its smiles draw back and any shock drains (350ms), and the labels go (150ms), all on the ease-out;
      // only then does the story start again, from there.
      let rise = ph ? EASE_OUT(ph.rise) : 1
      let lines = ph ? ph.lines : 1
      let labelsK = ph ? EASE_OUT(ph.labels) : 1
      if (sinking) {
        const k = sinking
        k.t += dt
        const out = (secs: number) => 1 - EASE_OUT(Math.min(1, k.t / secs))
        rise = k.rise * out(SINK_S)
        lines = k.lines * out(SINK_S)
        labelsK = k.labels * out(0.15)
        x = k.shock * out(SINK_S)
        shock.x = x
        shock.v = 0
        // The sway sinks with the sheet, so Replay never snaps the camera; its clock starts over with the story.
        swayIn = k.sway * out(SINK_S)
        if (k.t >= SINK_S) {
          sinking = null
          swayT = 0
          k.done()
        }
      }
      shown = { rise, lines, labels: labelsK, shock: x }
      const moving =
        !!drag ||
        sinking !== null ||
        (paused && swayK > 0) ||
        Math.abs((q === 0 ? 0 : 1) - finishK) > 0.01 ||
        Math.abs(spring.yaw - spring.ty) + Math.abs(spring.pitch - spring.tp) + Math.abs(spring.vy) + Math.abs(spring.vp) > 1e-4 ||
        (!paused && Math.abs(nod.yaw) + Math.abs(nod.pitch) + Math.abs(nod.vy) + Math.abs(nod.vp) > 1e-4) ||
        Math.abs(lean.vy) + Math.abs(lean.vp) > 1e-5 ||
        Math.abs(shock.v) > 1e-5 ||
        Math.abs(hooks.level() - shock.x) > 1e-4 ||
        Math.abs((sim.hover || hooks.pinned() ? 1 : 0) - tagK) > 0.01 ||
        (!paused && flash > 0) ||
        (hooks.zoom?.() ?? 1) !== lastZoom
      // Unpaused, it drifts, so every frame is drawn; paused, only a change is.
      const story = ph ? ph.lines + ph.rise + ph.labels + ph.shock + ph.relax : -1
      const storyMoved = story !== lastStory
      lastStory = story
      // At rest: only the drift moving, no story, drag, lowering, spring, lean, shock, reading or flash.
      calmNow =
        !!hooks.halveAtRest &&
        !ph &&
        // Not through the sway's coast or ramp (Pause, Resume, a reading taken up or let go): drawn at every frame.
        (swayK === 0 || swayK === 1) &&
        !drag &&
        sinking === null &&
        Math.abs(spring.yaw - spring.ty) + Math.abs(spring.pitch - spring.tp) + Math.abs(spring.vy) + Math.abs(spring.vp) < 1e-4 &&
        Math.abs(lean.vy) + Math.abs(lean.vp) < 1e-5 &&
        Math.abs(shock.v) < 1e-5 &&
        Math.abs(hooks.level() - shock.x) < 1e-4 &&
        !sim.hover &&
        !hooks.pinned() &&
        flash <= 0
      if (drawnOnce && paused && !moving && !storyMoved && !hooks.playing() && !sim.dirty && !resized) return 'idle'
      // Waiting for the reader to bring the stage on screen, the paper on it is already drawn (a phone held a third of
      // it in view for as long as it liked, at 120 frames a second).
      if (drawnOnce && hooks.waiting?.() && !moving && !storyMoved && !sim.dirty && !resized) return 'idle'
      sim.dirty = false
      resized = false

      const p = params(Math.max(0, x))
      lastParams = p
      finishK += ((q === 0 ? 0 : 1) - finishK) * (1 - Math.exp(-dt / 0.08))
      // The sway comes in after the story, and from a still start on a visit without one (so the first frame is the
      // poster's exactly), over 1.5s on the in-out; Pause lets it coast to rest (240ms) and pick up again (400ms).
      if (!sinking) swayIn = ph ? 0 : Math.min(1, swayIn + (dt / 1.5) * swayK)
      const kind = hooks.frame()
      const cam = camera(kind, Math.sin((2 * Math.PI * swayT) / SWAY_PERIOD) * EASE_IN_OUT_QUAD(swayIn), spring.yaw + lean.yaw + nod.yaw, spring.pitch + lean.pitch + nod.pitch)
      lastZoom = hooks.zoom?.() ?? 1
      // Turned toward a soft limit, the camera stands back (by the square of the turn, so rest is untouched): the slab's
      // front and corners stay on the stage instead of being cut on its edge.
      cam.dist *= lastZoom * (1 + PULL.yaw * (spring.yaw / 0.9) ** 2 + PULL.pitch * (Math.max(0, spring.pitch) / 0.5) ** 2 + PULL.pitch * (Math.min(0, spring.pitch) / 0.3) ** 2)
      const m = mvp(kind, cam, cssW / cssH)
      inv = invert(m, invBuf)
      const e = eye(cam)
      const probe = sim.hover ?? sim.probe
      const shownProbe = reads() ? probe : null

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
      // The reading point's crosshair arrives and leaves with the labels and the dot, never in one frame.
      setLook(surf, e, shownProbe, labelsK)
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
        // By night the one-month smile glows while a shock lifts it, as strongly as the shock shown: light from the
        // moment the story's shock lands, or the reader's, gone again at calm; a landed blow lights it at once.
        const lit = palette.dark ? Math.max(Math.min(1, Math.max(0, x)) * labelsK, flash) : 0
        // By day the blow draws it in ink, heavier, fading back to the other smiles' line.
        if (!palette.dark && flash > 0.01 && frontCount) {
          for (let i = 0; i < 3; i++) glowColor[i] = palette.graphite[i]! + (palette.ink[i]! - palette.graphite[i]!) * flash
          gl.uniform3fv(line.u('uColor'), glowColor)
          gl.uniform1f(line.u('uWidth'), 1 + 1.5 * flash)
          gl.drawArrays(gl.TRIANGLES, 0, frontCount)
          gl.uniform1f(line.u('uWidth'), 1)
        }
        // By night every ticked smile keeps a faint glow at rest (a sixth of a shock's, arriving with the sheet), so
        // the surface is lit, not matte; the one-month smile's shock glow is laid over it.
        const resting = palette.dark ? 0.07 * labelsK : 0
        if ((lit > 0.01 && frontCount) || resting > 0.005) {
          glow.use()
          gl.uniformMatrix4fv(glow.u('uMVP'), false, m)
          gl.uniform2f(glow.u('uPx'), 2 / cssW, 2 / cssH)
          gl.uniform1f(glow.u('uWidth'), 14)
          for (let i = 0; i < 3; i++) glowColor[i] = palette.indigo[i]! + (palette.ink[i]! - palette.indigo[i]!) * 0.4
          gl.uniform3fv(glow.u('uColor'), glowColor)
          gl.enable(gl.BLEND)
          gl.blendFunc(gl.ONE, gl.ONE)
          gl.depthMask(false)
          if (resting > 0.005) {
            gl.uniform1f(glow.u('uAlpha'), resting)
            gl.drawArrays(gl.TRIANGLES, 0, smileCount)
          }
          if (lit > 0.01 && frontCount) {
            gl.uniform1f(glow.u('uAlpha'), 0.45 * lit)
            gl.drawArrays(gl.TRIANGLES, 0, frontCount)
          }
          gl.depthMask(true)
          gl.disable(gl.BLEND)
        }
      }
      gl.bindVertexArray(null)

      // Labels, notes and the reading point ride the same projection; the labels arrive with the sheet.
      const els = hooks.labels()
      LABELS.forEach((l, i) => {
        place(els[i] ?? null, m, l.at[0], l.at[1], l.at[2])
        labelXY[i * 2] = placed[0]!
        labelXY[i * 2 + 1] = placed[1]!
      })
      thinLabels(els, e)
      const layer = hooks.labelLayer()
      if (layer) layer.style.opacity = labelsK.toFixed(3)
      const notes = hooks.notes()
      NOTES.forEach((nt, i) => {
        const el = notes[i] ?? null
        place(el, m, wx(nt.k), wy(iv(p, nt.k, nt.T)) * rise, wz(nt.T))
        const sx = placed[0]!, sy = placed[1]!
        const o = nt.offset[kind]
        if (!el || !o) return
        // At a shock's peak the words would rise past the stage's top: they stop there, and the leader shortens.
        const words = el.querySelector<HTMLElement>('[data-note-words]')
        noteH[i] ||= words?.offsetHeight ?? 0
        noteW[i] ||= words?.offsetWidth ?? 0
        // Where the point is, so the words stay inside the stage across as well, and hang beside it rather than below.
        const at = { x: sx, w: noteW[i]!, stageW: cssW, h: noteH[i]! }
        const below = (noteDy[i] ?? -1) > 0
        if (noteSwap[i]) {
          // Mid-swap the words keep riding the point on the side they are leaving.
          const keep = below ? 10 : Math.min(-10, Math.max(o[1], 4 + noteH[i]! - sy))
          const b = setNoteRise(el, (noteDy[i] = keep), o[2], at)
          noteBox[i] = b ? [sx + b[0], sy + b[1], sx + b[2], sy + b[3]] : null
          return
        }
        const dy = noteRise(sy, o[1], noteH[i]!, 4, below)
        if (noteDy[i] !== undefined && dy > 0 !== below) {
          // To the other side of its point: out where they are and in where they go, through the site's blur and with
          // the opacity too (a 3px blur alone did not hide a 50–80px move of two lines), on the ease-out.
          const words = el.querySelector<HTMLElement>('[data-note-words]')
          const ease = EASE_OUT_CSS
          const land = () => {
            setNoteRise(el, (noteDy[i] = dy), o[2], at)
            noteSwap[i] = false
            words?.animate([{ filter: 'blur(3px)', opacity: 0 }, { filter: 'blur(0px)', opacity: 1 }], { duration: 140, easing: ease })
          }
          const out = words?.animate([{ filter: 'blur(0px)', opacity: 1 }, { filter: 'blur(3px)', opacity: 0 }], { duration: 90, easing: ease, fill: 'forwards' })
          if (!out) return land()
          noteSwap[i] = true
          out.onfinish = () => {
            out.cancel()
            land()
          }
          return
        }
        // Every frame: the point moves across the stage as the surface turns, and the words are held inside it.
        const b = setNoteRise(el, (noteDy[i] = dy), o[2], at)
        noteBox[i] = b ? [sx + b[0], sy + b[1], sx + b[2], sy + b[3]] : null
      })
      const dot = hooks.dot()
      const at = iv(p, probe.k, probe.T)
      place(dot, m, wx(probe.k), wy(at) * rise, wz(probe.T))
      const dotX = placed[0]!
      dotAt = dot && labelsK > 0.01 ? [placed[0]!, placed[1]!] : null
      // The reading point arrives with the labels, once the sheet is up to be read.
      if (dot) dot.style.opacity = labelsK.toFixed(3)
      // While the reader reads a point, its tag names the volatility there, beside the dot, on whichever side has room.
      const tag = hooks.tag()
      if (tag) {
        tagK += ((sim.hover || hooks.pinned() ? 1 : 0) - tagK) * (1 - Math.exp(-dt / 0.05))
        if (tagK < 0.005) tagK = 0
        const text = `vol ${(at * 100).toFixed(1)}%`
        if (text !== tagText) {
          tag.textContent = tagText = text
          tagSize = null
        }
        // Over to the left past 96px from the edge, and back only under 120px, so a dot at the edge never flips it.
        const left = tagLeft ? dotX > cssW - 120 : dotX > cssW - 96
        if (left !== tagLeft) {
          tagLeft = left
          tag.style.transform = left ? 'translateX(calc(-100% - 1.25rem))' : ''
        }
        tag.style.opacity = (tagK * labelsK).toFixed(3)
        // Where it stands (it hangs 10px right of the dot and 8px above it, or as far left), for the axis labels to give
        // way to next frame: held at a drag's limit it covered "implied vol" and the 60% tick.
        if (tagK * labelsK > 0.05) {
          tagSize ??= [tag.offsetWidth, tag.offsetHeight]
          const [tw, th] = tagSize
          const x0 = tagLeft ? dotX - 10 - tw : dotX + 10
          tagAt = [x0, placed[1]! - 8 - th, x0 + tw, placed[1]! - 8]
        } else tagAt = null
      } else tagAt = null

      hooks.sync(p, x)
      drawnOnce = true
      // For the specs and ?debug=1: frames drawn, and how far the sheet stands out of the page.
      canvas.dataset.draws = String(++draws)
      canvas.dataset.rise = rise.toFixed(3)
      // The clocks move after the frame, so the first frame is the poster's moment exactly. The story plays out
      // whether or not the figure is paused; the drift holds.
      hooks.tick(dt * 1000)
      // The sway coasts to rest for Pause and for a reading, and picks up again once they end.
      swayK = paused || reading ? Math.max(0, swayK - dt / 0.24) : Math.min(1, swayK + dt / 0.4)
      // Held while the story plays, so the sway eases in after it from rest (sin 0), not partway through a swing.
      if (!ph) swayT += dt * swayK
      return true
    },
    resize(bw, bh, cw, ch) {
      w = bw
      h = bh
      cssW = cw
      cssH = ch
      resized = true
      // A new size may wrap a note's words differently: measured again (and the labels, whose text size may step).
      labelSize.length = 0
      noteH.length = 0
      noteW.length = 0
      noteDy.length = 0
      noteSwap.length = 0
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
    sink(done) {
      if (sinking) return
      sinking = { t: 0, ...shown, sway: swayIn, done }
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
