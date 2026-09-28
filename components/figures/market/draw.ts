import { EASE_OUT } from '@/lib/ease'
import type { Mirror } from '@/lib/market/mirror'
import { PROTOCOL } from '@/lib/market/protocol'
import { FAN_RANGE, fanAt, LADDER, levelTone, PriceWindow, smoothedQueue, SPAN, WINDOW } from '@/lib/market/views'
import { spring } from '@/lib/stage/spring'
import type { Palette, RGB } from '@/components/stage/useStage'

/**
 * /market's two flat views, drawn on 2D canvases from the page's copy of the market (lib/market/mirror.ts), in the
 * same animation frame as the surface (components/figures/market/Live.tsx). No text is drawn here: the axes' words
 * are the page's, placed over the canvases from `layout()`.
 */

export { FAN_RANGE, LADDER, SPAN }
/** The book at now: a depth of this many shares or more runs the whole width. */
const LADDER_FULL = 800
const L = PROTOCOL.levels
const HALF = PROTOCOL.half
const ROWS = 2 * WINDOW.half + 1

const mix = (a: RGB, b: RGB, t: number, i: number) => a[i]! + (b[i]! - a[i]!) * t
const css = (c: RGB, opacity = 1) => `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)}${opacity < 1 ? ` / ${opacity.toFixed(3)}` : ''})`

/** A canvas sized to its box at up to two device pixels a CSS pixel; true when its size changed. */
function fit(cv: HTMLCanvasElement, box: { w: number; h: number }): boolean {
  const r = cv.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr))
  box.w = r.width
  box.h = r.height
  if (cv.width === w && cv.height === h) return false
  cv.width = w
  cv.height = h
  return true
}

/** A shock's landing as a view shows it: when (wall clock, ms) and what it swept (prices, in ticks). */
export interface Landing {
  at: number
  t: number
  hi: number
  lo: number
}

/**
 * The order book: twenty simulated seconds of it as a heat strip, price up the side and time across, each price in
 * the tone of the shares resting there, averaged over a quarter second (lib/market/views.ts, levelTone and
 * smoothedQueue; both sides indigo, the shares waiting, the spread between them paper), the price through the middle
 * in ink, every trade a dot, and the book at now on the right, its depth at each price a bar: the exchange's depth
 * chart, on its side. A liquidity shock's sweep lands as a bright streak run down the levels it took (180ms), fading
 * over 900ms; its fills and the book at now empty behind its front.
 */
export class BookView {
  readonly box = { w: 1, h: 1 }
  private win: PriceWindow | null = null
  private readonly g: CanvasRenderingContext2D | null
  private readonly heatCv: HTMLCanvasElement
  private readonly heatG: CanvasRenderingContext2D | null
  private img: ImageData | null = null
  private readonly cum = new Float32Array(L)
  /** The book at now as it stood before a sweep, by price from `heldCentre − half`: what the sweep's front has yet to take. */
  private readonly held = new Float32Array(L)
  private heldCentre = 0
  /** Rows the heat image holds, as the mirror counts them (`taken`); -1: none. */
  private builtTaken = -1
  private builtBase = NaN
  private builtPal: Palette | null = null
  private last = -1
  /** Where the reader points, in CSS pixels across the strip, or null. */
  hover: number | null = null
  /** The page's margin on a phone, where the canvas runs to the screen's edges: the book at now keeps inside it. */
  inset = 0

  /** The market started over: its window lands on the new price at once, where the new strip opens, not sliding to it. */
  restart(): void {
    this.win = null
    this.builtTaken = -1
  }

  constructor(private readonly cv: HTMLCanvasElement) {
    this.g = cv.getContext('2d')
    this.heatCv = document.createElement('canvas')
    this.heatCv.width = 256
    this.heatCv.height = ROWS
    this.heatG = this.heatCv.getContext('2d')
  }

  /** The strip's geometry: where time and price fall, in CSS pixels. */
  layout() {
    const w = this.box.w, h = this.box.h
    const x1 = w - LADDER - this.inset
    const centre = this.win?.centre ?? 0
    const px = h / ROWS
    return {
      x1,
      width: x1,
      h,
      centre,
      /** x of simulated time `t`, given the market's time now. */
      x: (t: number, now: number) => x1 - ((now - t) / SPAN) * x1,
      /** y of a price in ticks (its level's middle). */
      y: (p: number) => (centre + WINDOW.half + 0.5 - p) * px,
      px,
    }
  }

  /** Draws the book as `m` has it; `now` is the page's clock (ms), for the landing's streak. */
  draw(m: Mirror, pal: Palette, now: number, landing: Landing | null, dt: number): boolean {
    const g = this.g
    if (!g || !m.rows) return false
    const resized = fit(this.cv, this.box)
    if (!this.win) this.win = new PriceWindow(m.h.mid)
    this.win.step(m.h.mid, dt)
    const flash = landing ? (now - landing.at) / 1000 : Infinity
    if (!resized && this.last === m.frames && flash > 1.2 && this.hover === null && this.builtPal === pal && Math.abs(this.win.centre - this.builtBase) < 1e-9) return false
    this.last = m.frames
    const lay = this.layout()
    const dpr = this.cv.width / this.box.w
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.fillStyle = css(pal.paper)
    g.fillRect(0, 0, this.box.w, lay.h)

    // The heat, a column a row, built again when a row comes in, the window moves a tick, or the colours change.
    const base = Math.round(this.win.centre)
    if (this.builtTaken !== m.taken || this.builtBase !== base || this.builtPal !== pal) this.build(m, base, pal)
    const t = m.h.t
    const newest = m.time(m.row(0))
    const col = 1 / PROTOCOL.hz
    const xa = lay.x(newest - 255 * col, t), xb = lay.x(newest + col, t)
    g.save()
    g.beginPath()
    g.rect(0, 0, lay.x1, lay.h)
    g.clip()
    g.imageSmoothingEnabled = true
    // Offset by the window's fraction of a tick, so it glides rather than steps.
    const dy = (this.win.centre - base) * lay.px
    if (this.heatCv && this.img) g.drawImage(this.heatCv, xa, dy, xb - xa, lay.h)

    // The price through it: a row's mid at its time, and the mid now.
    g.strokeStyle = css(pal.ink)
    g.lineWidth = 1.25
    g.lineJoin = 'round'
    g.beginPath()
    const n = Math.min(m.rows, 255)
    for (let a = n - 1; a >= 0; a--) {
      const i = m.row(a)
      const x = lay.x(m.time(i), t), y = lay.y(m.mid(i))
      if (a === n - 1) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.lineTo(lay.x1, lay.y(m.h.mid))
    g.stroke()

    // The shock's sweep, its geometry first: its fills are revealed behind the streak's front, not drawn before it.
    const sweep = landing && flash < 1.2 ? landing : null
    const run = sweep ? EASE_OUT(Math.min(1, Math.max(0, flash) / 0.18)) : 0
    const sy0 = sweep ? lay.y(sweep.hi) - lay.px / 2 : 0
    const sy1 = sweep ? sy0 + (lay.y(sweep.lo) + lay.px / 2 - sy0) * run : 0
    const dot = (tr: { t: number; price: number; size: number }) => {
      const r = Math.min(2.6, 0.7 + 0.28 * Math.sqrt(tr.size))
      g.beginPath()
      g.arc(lay.x(tr.t, t), lay.y(tr.price), r, 0, Math.PI * 2)
      g.fill()
    }

    // Every trade in the window, a dot, its area the shares.
    g.fillStyle = css(pal.ink, 0.85)
    for (let a = 0; a < m.tradeCount; a++) {
      const tr = m.trade(a)
      if (tr.t < t - SPAN) break
      if (sweep && tr.t === sweep.t) continue
      dot(tr)
    }

    // The sweep: a streak run down the levels it took (180ms), then fading (900ms), kept inside the strip at now.
    if (sweep) {
      const fade = flash < 0.18 ? 1 : Math.max(0, 1 - EASE_OUT((flash - 0.18) / 0.9))
      const x = Math.min(lay.x(sweep.t, t), lay.x1 - 1.5)
      if (pal.dark) {
        g.globalCompositeOperation = 'lighter'
        const glow = g.createLinearGradient(x - 10, 0, x + 10, 0)
        glow.addColorStop(0, css(pal.indigo, 0))
        glow.addColorStop(0.5, css(pal.indigo, 0.55 * fade))
        glow.addColorStop(1, css(pal.indigo, 0))
        g.fillStyle = glow
        g.fillRect(x - 10, sy0 - 4, 20, sy1 - sy0 + 8)
        g.fillStyle = css(pal.ink, 0.9 * fade)
        g.fillRect(x - 1.25, sy0, 2.5, sy1 - sy0)
        g.globalCompositeOperation = 'source-over'
      } else {
        g.fillStyle = css(pal.paper, 0.8 * fade)
        g.fillRect(x - 5, sy0 - 2, 10, sy1 - sy0 + 4)
        g.fillStyle = css(pal.ink, fade)
        g.fillRect(x - 1.25, sy0, 2.5, sy1 - sy0)
      }
      // Its fills, where the front has reached.
      g.fillStyle = css(pal.ink, 0.85)
      for (let a = 0; a < m.tradeCount; a++) {
        const tr = m.trade(a)
        if (tr.t < sweep.t) break
        if (tr.t === sweep.t && lay.y(tr.price) <= sy1 + lay.px / 2) dot(tr)
      }
    }

    // Where the reader points: a hairline through the moment.
    if (this.hover !== null && this.hover < lay.x1) {
      g.fillStyle = css(pal.graphite)
      g.fillRect(Math.round(this.hover) - 0.5, 0, 1, lay.h)
    }
    g.restore()

    // The book at now: its depth at each price, a bar.
    g.fillStyle = css(pal.indigo)
    const c = m.h.centre
    this.depthOf(m.ladder, m.h.bestBid - c + HALF, m.h.bestAsk - c + HALF)
    // While the sweep runs, the levels its front has not reached keep their bars: the book empties behind the streak.
    const running = sweep !== null && flash < 0.18
    if (!running) {
      this.held.set(this.cum)
      this.heldCentre = c
    }
    const barW = LADDER - 8
    for (let p = base - WINDOW.half - 1; p <= base + WINDOW.half + 1; p++) {
      const j = p - c + HALF
      if (j < 0 || j >= L) continue
      const k = p - this.heldCentre + HALF
      const was = running && lay.y(p) > sy1 && k >= 0 && k < L ? this.held[k]! : 0
      const d = Math.max(this.cum[j]!, was)
      if (!d) continue
      // Level to level with no gap, so the depth reads as one silhouette.
      const len = Math.max(1, (Math.min(d, LADDER_FULL) / LADDER_FULL) * barW)
      g.fillRect(lay.x1 + 6, lay.y(p) - lay.px / 2, len, lay.px + 0.25)
    }
    g.fillStyle = css(pal.rule)
    g.fillRect(lay.x1 + 0.5, 0, 1, lay.h)
    return true
  }

  /** Depth outward from each touch over a row's levels (`jb`, `ja`: the touches' levels), into `cum`: as the flow's rows have it. */
  private depthOf(lv: Float32Array, jb: number, ja: number) {
    const cum = this.cum
    cum.fill(0)
    let acc = 0
    for (let j = Math.min(jb, L - 1); j >= 0; j--) {
      acc += lv[j]!
      cum[j] = acc
    }
    acc = 0
    for (let j = Math.max(ja, 0); j < L; j++) {
      acc += lv[j]!
      cum[j] = acc
    }
  }

  /**
   * The heat image, a column a row, newest at the right. When only rows have come in (the window and the colours as
   * they were), the image moves left by that many columns and only the new ones, and the one before them (the smoothing
   * reaches a row either side), are worked out: at twelve rows a second, two columns, not the whole strip.
   */
  private build(m: Mirror, base: number, pal: Palette) {
    const hg = this.heatG
    if (!hg) return
    if (!this.img) this.img = hg.createImageData(256, ROWS)
    const d = this.img.data
    const top = base + WINDOW.half
    const fresh = m.taken - this.builtTaken
    const whole = this.builtTaken < 0 || this.builtBase !== base || this.builtPal !== pal || fresh < 0 || fresh >= 255
    if (!whole && fresh > 0) for (let y = 0; y < ROWS; y++) d.copyWithin(y * 1024, y * 1024 + fresh * 4, (y + 1) * 1024)
    // The queue at a price in the row `age` back: each row is stored around its own mid.
    const at = (age: number, price: number) => {
      const i = m.row(age)
      return m.level(i, price - (m.centre(i) - HALF))
    }
    const r0 = mix(pal.paper, pal.indigo, 0, 0), r1 = mix(pal.paper, pal.indigo, 1, 0)
    const g0 = mix(pal.paper, pal.indigo, 0, 1), g1 = mix(pal.paper, pal.indigo, 1, 1)
    const b0 = mix(pal.paper, pal.indigo, 0, 2), b1 = mix(pal.paper, pal.indigo, 1, 2)
    const last = whole ? 255 : Math.min(255, fresh)
    for (let age = 0; age <= last; age++) {
      const c = 255 - age
      for (let y = 0; y < ROWS; y++) {
        const k = age < m.rows ? levelTone(smoothedQueue(at, age, top - y, m.rows)) : 0
        const o = (y * 256 + c) * 4
        d[o] = Math.round((r0 + (r1 - r0) * k) * 255)
        d[o + 1] = Math.round((g0 + (g1 - g0) * k) * 255)
        d[o + 2] = Math.round((b0 + (b1 - b0) * k) * 255)
        d[o + 3] = 255
      }
    }
    hg.putImageData(this.img, 0, 0)
    this.builtTaken = m.taken
    this.builtBase = base
    this.builtPal = pal
  }
}


/**
 * The futures: a year of the market's futures from its price now, at its realised volatility (lib/futures/fan.ts,
 * drawn in the worker), price up the side on a log scale so a doubling and a halving are the same step, the next
 * twelve months across. The 5th to 95th percentile and the 25th to 75th are washes of indigo, the median a line,
 * and 48 of the paths themselves thin lines, glowing by night. The fan is drawn at the volatility shown, which
 * follows the market's on a spring (ω 8), from the latest fan mapped exactly (lib/market/views.ts, fanAt), so when a
 * shock lifts the volatility the fan breathes out rather than jumps; it is rooted at the price now, so it moves with
 * the price in the frame the price moves. A shock's landing lights the paths as long as the book's
 * streak: held 180ms, fading over 900ms.
 */
export class FanView {
  readonly box = { w: 1, h: 1 }
  private readonly g: CanvasRenderingContext2D | null
  private readonly bands = new Float64Array(5 * 65)
  private readonly strands = new Float64Array(48 * 65)
  private readonly sig = { x: 0, v: 0 }
  private last = -1
  private lastSig = NaN
  private lastPal: Palette | null = null
  /** The volatility the fan is drawn at while the reader points at a past moment. */
  as: number | null = null
  /** When the reader last pointed, on the page's clock: the fan follows pointing, and its end, on the quick spring. */
  private pointedAt = -Infinity
  /** The page's margin on a phone, where the canvas runs to the screen's edges: the fan keeps inside it. */
  inset = 0

  constructor(private readonly cv: HTMLCanvasElement) {
    this.g = cv.getContext('2d')
  }

  /** The fan's geometry in CSS pixels, for the page's labels; prices as multiples of the price at its root. */
  layout() {
    const w = this.box.w, h = this.box.h
    const pad = { l: 8 + this.inset, r: 44 + this.inset, t: 8, b: 8 }
    const x0 = pad.l, x1 = w - pad.r, cy = h / 2
    const scale = (h / 2 - pad.t) / Math.log(FAN_RANGE.hi)
    return {
      x0,
      x1,
      /** x of step `j` of 64. */
      x: (j: number) => x0 + (j / 64) * (x1 - x0),
      /** y of a price, as a multiple of the price at the root. */
      y: (p: number) => cy - Math.log(p) * scale,
      cy,
    }
  }

  /** The volatility the fan is drawn at now. */
  get sigma() {
    return this.sig.x
  }

  draw(m: Mirror, pal: Palette, now: number, landing: Landing | null, dt: number): boolean {
    const g = this.g
    const fan = m.fan
    if (!g || !fan) return false
    const resized = fit(this.cv, this.box)
    const target = this.as ?? m.h.sigma
    if (!this.sig.x) this.sig.x = target
    // The market's own moves breathe the fan out on ω 8; a moment the reader points at, and the return from it, on the
    // surface's quick ω 30, so the three views agree about "then" within a sixth of a second.
    if (this.as !== null) this.pointedAt = now
    spring(this.sig, target, dt, now - this.pointedAt < 600 ? 30 : 8)
    const flash = landing ? (now - landing.at) / 1000 : Infinity
    // Lit while its volatility moves fast, as after a shock's jump, so the landing and the widening are one gesture.
    const moving = Math.min(1, Math.abs(this.sig.v) / Math.max(0.05, this.sig.x) / 1.2)
    if (!resized && this.last === m.frames && Math.abs(this.sig.x - this.lastSig) < 1e-7 && flash > 1.1 && moving < 0.01 && this.lastPal === pal) return false
    this.last = m.frames
    this.lastSig = this.sig.x
    this.lastPal = pal
    fanAt(fan, this.sig.x, this.bands, this.strands)
    const lay = this.layout()
    const dpr = this.cv.width / this.box.w
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.fillStyle = css(pal.paper)
    g.fillRect(0, 0, this.box.w, this.box.h)
    g.save()
    g.beginPath()
    g.rect(0, 0, this.box.w, this.box.h)
    g.clip()

    // The washes: 5th–95th, then 25th–75th over it; the median.
    const band = (lo: number, hi: number, fill: string) => {
      g.beginPath()
      for (let j = 0; j <= 64; j++) g.lineTo(lay.x(j), lay.y(this.bands[hi * 65 + j]!))
      for (let j = 64; j >= 0; j--) g.lineTo(lay.x(j), lay.y(this.bands[lo * 65 + j]!))
      g.closePath()
      g.fillStyle = fill
      g.fill()
    }
    band(0, 4, css(pal.indigo, pal.dark ? 0.16 : 0.1))
    band(1, 3, css(pal.indigo, pal.dark ? 0.2 : 0.14))

    // The paths, and by night their glow; a landing lights them, and they stay lit while the fan breathes out.
    const lit = Math.max(flash < 0.18 ? 1 : flash < 1.08 ? 1 - EASE_OUT((flash - 0.18) / 0.9) : 0, moving)
    const path = (s: number) => {
      g.beginPath()
      for (let j = 0; j <= 64; j++) {
        const x = lay.x(j), y = lay.y(this.strands[s * 65 + j]!)
        if (j === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    }
    g.lineJoin = 'round'
    // By night a soft glow under the paths, added light; the paths themselves laid over it, so where they cross they
    // do not add up to white.
    if (pal.dark) {
      g.globalCompositeOperation = 'lighter'
      g.strokeStyle = css(pal.indigo, 0.035 + 0.07 * lit)
      g.lineWidth = 4
      for (let s = 0; s < 48; s++) path(s)
      g.globalCompositeOperation = 'source-over'
    }
    g.strokeStyle = css(pal.dark ? mixRGB(pal.indigo, pal.ink, 0.25) : pal.indigo, Math.min(1, (pal.dark ? 0.38 : 0.34) + 0.4 * lit))
    g.lineWidth = 0.8 + 0.5 * lit
    for (let s = 0; s < 48; s++) path(s)

    g.strokeStyle = css(pal.indigo)
    g.lineWidth = 1.5
    g.beginPath()
    for (let j = 0; j <= 64; j++) g.lineTo(lay.x(j), lay.y(this.bands[2 * 65 + j]!))
    g.stroke()

    // Now: the fan's root, the price, which a landing makes ring once.
    const ring = flash < 0.6 ? EASE_OUT(flash / 0.6) : 1
    g.fillStyle = css(pal.ink)
    g.beginPath()
    g.arc(lay.x(0), lay.y(1), 2.75, 0, Math.PI * 2)
    g.fill()
    if (ring < 1) {
      g.strokeStyle = css(pal.ink, 1 - ring)
      g.lineWidth = 1.25
      g.beginPath()
      g.arc(lay.x(0), lay.y(1), 3 + 9 * ring, 0, Math.PI * 2)
      g.stroke()
    }
    // Paths leaving the view fade into the paper at its top and bottom rather than stop at a line.
    const edge = 10
    for (const [y0, y1] of [
      [0, edge],
      [this.box.h, this.box.h - edge],
    ] as const) {
      const fadeOut = g.createLinearGradient(0, y0, 0, y1)
      fadeOut.addColorStop(0, css(pal.paper))
      fadeOut.addColorStop(1, css(pal.paper, 0))
      g.fillStyle = fadeOut
      g.fillRect(0, Math.min(y0, y1), this.box.w, edge)
    }
    g.restore()
    return true
  }

  /** The drawn fan's `b`-th percentile at step `j`, as a multiple of the price at its root. */
  band(b: number, j: number) {
    return this.bands[b * 65 + j]!
  }
}

function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [mix(a, b, t, 0), mix(a, b, t, 1), mix(a, b, t, 2)]
}
