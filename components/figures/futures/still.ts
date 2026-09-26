import { cssColor } from '@/components/stage/env'
import { BAR_D, ZWALL, project, restPose, viewProjection, type M4, type V3 } from '@/lib/futures/camera'
import { HIST, MODEL, binWidth, lane, path } from '@/lib/futures/mc'
import { AXIS, HLEN, HX0, LABELS, TICKS, TICK_CLEAR, X0, X1, ZW, wy } from '@/lib/futures/world'
import { LABEL } from './Poster'

/**
 * The still frame: the live figure's resting view, drawn once on a 2D canvas,
 * for every reader who does not get the live one — reduced motion, a software
 * rasteriser, no WebGL2, save-data, a failed download, a lost context. It is
 * the same picture from the same camera: the same paths of the same ensemble
 * (lib/futures/mc.ts, path and lane), anti-aliased and laid down as ink by day
 * (multiply) and light by night (additive), fading with depth; the histogram
 * the CPU priced, as shaded slabs on the expiry wall; the wall, the strike and
 * the labels.
 *
 * It is drawn off screen, a slice of paths per frame so a slow phone never
 * blocks, and shown whole: the reader sees one finished frame fade in, never a
 * picture building up.
 */

export interface StillInput {
  sigma: number
  strike: number
  /** The drawn bins: paths ending in each, and what they pay at the strike. */
  counts: readonly number[]
  payoff: readonly number[]
  /** The call's price, as priced for this frame. */
  price: number
}

/** Paths drawn: a dense cloud, still only a few frames' work on a phone. */
export const stillCount = (cssW: number) => (cssW < 520 ? 900 : 1600)
const SLICE = 120

type RGB = readonly [number, number, number]
const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${a})`
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Draw the still frame onto `canvas` and its labels into `labels`; `ready` is
 * called once it is on screen. Returns a cancel for a draw still in progress.
 */
export function drawStill(canvas: HTMLCanvasElement, labels: HTMLElement, input: StillInput, ready: () => void): () => void {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches
  const pal = {
    paper: cssColor('--color-paper'),
    ink: cssColor('--color-ink'),
    graphite: cssColor('--color-graphite'),
    indigo: cssColor('--color-indigo'),
  }
  const box = canvas.getBoundingClientRect()
  const cssW = Math.max(1, box.width), cssH = Math.max(1, box.height)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr)
  const aspect = cssW / cssH
  const pose = restPose(aspect)
  const vp: M4 = viewProjection(pose, aspect)
  const toPx = (x: number, y: number, z: number): [number, number, number] => {
    const [sx, sy, w] = project(vp, x, y, z)
    return [((sx + 1) / 2) * W, ((1 - sy) / 2) * H, w]
  }
  const eye = pose.eye
  const near = Math.hypot(eye[0] - X0, eye[1], eye[2])
  const far = Math.hypot(eye[0] - X1, eye[1], eye[2]) * 1.15

  // Off screen until it is finished.
  const work = document.createElement('canvas')
  work.width = W
  work.height = H
  const g = work.getContext('2d')!
  g.fillStyle = css(pal.paper)
  g.fillRect(0, 0, W, H)

  // The bars first: the futures are laid over them, as in the live figure.
  const maxPay = Math.max(1e-9, ...input.payoff)
  const maxCount = Math.max(1e-9, ...input.counts)
  type Face = { pts: [number, number][]; fill: string; depth: number }
  const faces: Face[] = []
  const slab = (x0: number, x1: number, y0: number, y1: number, base: RGB) => {
    const z0 = -2 * BAR_D, z1 = 0
    const top = mixc(base, dark ? pal.ink : pal.paper, dark ? 0.2 : 0.24)
    const end = mixc(base, dark ? pal.paper : pal.ink, dark ? 0.3 : 0.14)
    const low = mixc(base, dark ? pal.paper : pal.ink, dark ? 0.45 : 0.24)
    const quad = (vs: V3[], col: RGB) => {
      const p = vs.map((v) => toPx(v[0], v[1], v[2]))
      // Only the faces turned toward the eye: counter-clockwise on screen (y runs down).
      const area = p.reduce((s, a, i) => {
        const b = p[(i + 1) % p.length]!
        return s + a[0] * b[1] - b[0] * a[1]
      }, 0)
      if (area >= 0) return
      faces.push({ pts: p.map((q) => [q[0], q[1]]), fill: css(col), depth: p.reduce((s, q) => s + q[2], 0) / p.length })
    }
    quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], base)
    quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], top)
    quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], end)
    quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], low)
  }
  for (let b = 0; b < HIST.bins; b++) {
    const len = input.payoff[b]! / maxPay
    if (len < 0.004) continue
    const lo = HIST.lo + b * binWidth
    slab(HX0, HX0 + HLEN * len, wy(lo) + 0.0025, wy(lo + binWidth) - 0.0025, mixc(pal.paper, pal.indigo, 0.95))
  }
  faces.sort((a, b) => b.depth - a.depth)
  for (const f of faces) {
    g.fillStyle = f.fill
    g.beginPath()
    f.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.closePath()
    g.fill()
  }

  // The futures, a slice at a time. Ink absorbs by day; light adds by night.
  const n = stillCount(cssW)
  const pays = css(pal.indigo), not = css(pal.graphite)
  g.globalCompositeOperation = dark ? 'lighter' : 'multiply'
  g.lineJoin = 'round'
  g.lineCap = 'round'
  let next = 0
  let raf = 0
  let cancelled = false
  const P = new Float32Array(65 * 3)
  const slice = () => {
    raf = 0
    if (cancelled) return
    const end = Math.min(n, next + SLICE)
    for (let id = next; id < end; id++) {
      const s = path(id, input.sigma)
      const ln = lane(id)
      let depth = 0
      for (let j = 0; j <= 64; j++) {
        const t = j / 64
        const q = toPx(X0 + (X1 - X0) * t, wy(s[j]!), ln * ZW * 0.45 * Math.sqrt(t))
        P[j * 3] = q[0]
        P[j * 3 + 1] = q[1]
        P[j * 3 + 2] = q[2]
        depth += q[2]
      }
      depth /= 65
      const up = s[64]! > input.strike
      const fade = 1 - 0.45 * smooth(near, far, depth)
      g.globalAlpha = (dark ? (up ? 0.04 : 0.024) : up ? 0.085 : 0.05) * fade
      g.strokeStyle = up ? pays : not
      g.lineWidth = Math.max(0.8, Math.min(1.8, (1.1 * dpr * near) / depth))
      g.beginPath()
      g.moveTo(P[0]!, P[1]!)
      for (let j = 1; j <= 64; j++) g.lineTo(P[j * 3]!, P[j * 3 + 1]!)
      g.stroke()
    }
    next = end
    if (next < n) {
      raf = requestAnimationFrame(slice)
      return
    }
    finish()
  }

  const finish = () => {
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
    const line = (a: V3, b: V3, width: number, col: string, dash?: number[]) => {
      const p = toPx(...a), q = toPx(...b)
      g.strokeStyle = col
      g.lineWidth = width
      g.setLineDash(dash ?? [])
      g.beginPath()
      g.moveTo(p[0], p[1])
      g.lineTo(q[0], q[1])
      g.stroke()
    }
    const lo = wy(AXIS.lo), hi = wy(AXIS.hi)
    const z = ZWALL
    const hair = Math.max(1, 0.5 * dpr)
    // The wall, its guides and ticks.
    line([X1, lo, z], [X1, hi, z], hair, css(pal.graphite, 0.5))
    line([X1, lo, -z], [X1, hi, -z], hair, css(pal.graphite, 0.32))
    line([X1, lo, -z], [X1, lo, z], hair, css(pal.graphite, 0.32))
    line([X1, hi, -z], [X1, hi, z], hair, css(pal.graphite, 0.32))
    for (const s of TICKS) {
      line([X1, wy(s), -z], [X1, wy(s), z], hair, css(pal.graphite, dark ? 0.16 : 0.13))
      line([X1 - 0.03, wy(s), z], [X1, wy(s), z], hair, css(pal.graphite, 0.8))
    }
    // The distribution, as a hairline outline on the bars' front faces.
    const out = css(pal.graphite, dark ? 0.6 : 0.55)
    let prev = -1
    for (let b = 0; b < HIST.bins; b++) {
      const blo = HIST.lo + b * binWidth
      const len = input.counts[b]! / maxCount
      if (len > 0.005) {
        const x = HX0 + HLEN * len
        line([prev >= 0 ? prev : HX0, wy(blo), 0], [x, wy(blo), 0], hair, out)
        line([x, wy(blo), 0], [x, wy(blo + binWidth), 0], hair, out)
        prev = x
      } else if (prev >= 0) {
        line([prev, wy(blo), 0], [HX0, wy(blo), 0], hair, out)
        prev = -1
      }
    }
    // The strike, across the bars and across the wall's depth.
    const y = wy(input.strike)
    line([LABELS.strike.x0, y, 0], [LABELS.strike.x, y, 0], 0.75 * dpr * 2, css(pal.ink, 0.9), [6 * dpr, 4 * dpr])
    line([X1, y, -z], [X1, y, z], 0.6 * dpr * 2, css(pal.ink, 0.55), [4 * dpr, 4 * dpr])
    g.setLineDash([])

    canvas.width = W
    canvas.height = H
    canvas.getContext('2d', { alpha: false })!.drawImage(work, 0, 0)
    canvas.dataset.drawn = String(Number(canvas.dataset.drawn ?? 0) + 1)
    placeLabels()
    ready()
  }

  const placeLabels = () => {
    labels.replaceChildren()
    const put = (text: string, cls: string, at: V3) => {
      const [sx, sy, w] = project(vp, at[0], at[1], at[2])
      if (w <= 0.05) return
      const el = document.createElement('span')
      el.textContent = text
      el.className = `${LABEL} left-0 top-0 ${cls}`
      labels.appendChild(el)
      const side = cls.includes('-translate-x-full') ? -1 : cls.includes('-translate-x-1/2') ? -0.5 : 0
      const vside = cls.includes('-translate-y-full') ? -1 : cls.includes('-translate-y-1/2') ? -0.5 : 0
      let px = ((sx + 1) / 2) * cssW
      let py = ((1 - sy) / 2) * cssH
      // Kept inside the stage both ways, 4px in.
      const left = px + side * el.offsetWidth
      if (left < 4) px += 4 - left
      else if (left + el.offsetWidth > cssW - 4) px -= left + el.offsetWidth - (cssW - 4)
      const top = py + vside * el.offsetHeight
      if (top < 4) py += 4 - top
      else if (top + el.offsetHeight > cssH - 4) py -= top + el.offsetHeight - (cssH - 4)
      el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`
    }
    put(`Today · $${MODEL.s0}`, LABELS.today.cls, [LABELS.today.at[0], LABELS.today.at[1], 0])
    put('One year out', LABELS.expiry.cls, [LABELS.expiry.at[0], LABELS.expiry.at[1], ZWALL])
    for (const s of TICKS) if (Math.abs(s - input.strike) >= TICK_CLEAR) put(`$${s}`, LABELS.tick.cls, [LABELS.tick.x, wy(s), ZWALL])
    put(`Strike $${input.strike}`, LABELS.strike.cls, [LABELS.strike.label, wy(input.strike), ZWALL])
    put('Payoff × how often it happens', `${LABELS.hist.cls} text-ink`, [LABELS.hist.at[0], LABELS.hist.at[1], 0])
    const narrow = cssW < 520
    put(
      narrow ? `Call price: $${input.price.toFixed(2)}` : `Call price, the average discounted payoff: $${input.price.toFixed(2)}`,
      `${LABELS.value.cls} text-indigo`,
      [LABELS.strike.label, wy(input.strike - LABELS.value.below * 1.4), ZWALL],
    )
  }

  raf = requestAnimationFrame(slice)
  return () => {
    cancelled = true
    cancelAnimationFrame(raf)
  }
}
