import { Fan } from '../futures/fan'
import { palette, type Palette } from '../palette'
import { whitePng } from '../png'
import { dlog } from './detmath'
import { Market } from './engine'
import { HALF, HZ, LEVELS, POSTER_T, SEED, TICK } from './flow'
import { surfaceOf } from './surface'
import { depthTone, logTicks, priceTicks, WINDOW } from './views'

/**
 * /market's still frames, drawn on the server from the same seeded market at the same moment the live figure starts
 * from (POSTER_T), so the page opens on the market it then runs (components/figures/Market.tsx). The book and the
 * futures are images of their own (app/(pages)/market/*.svg), each defining the site's colour tokens for both
 * schemes, as the IV figure's poster does, so one file serves both; the book's heat is a mask (lib/png.ts) the
 * indigo shows through, as the live strip mixes it (components/figures/market/draw.ts): white, at each queue's
 * tone, so its luminance is that tone exactly, in any colour space. No text: the page places
 * the axes' words over them. Server only.
 */

const ROWS = 2 * WINDOW.half + 1
/** Columns shown: twenty seconds at twelve rows a second. */
const COLS = 20 * HZ

/**
 * The two moments there are still frames of: calm, where the live figure starts, and the same market one simulated
 * second after a liquidity shock pressed at that moment, at the height of its stress (0.86, the price 14 ticks down,
 * realised volatility nearly doubled), for a reader who asked for reduced motion (or whose device does not run the
 * market), whose Liquidity shock swaps one for the other. Both are the worker's own market: the same seed, the same
 * shock log (tests/market-shock.test.ts), run here.
 */
export type Moment = 'calm' | 'shock'
export const SHOCK_FRAME_S = 1

const cached: Partial<Record<Moment, ReturnType<typeof build>>> = {}

function build(moment: Moment) {
  const m = new Market(SEED)
  m.advance(POSTER_T)
  if (moment === 'shock') {
    m.apply('shock')
    m.advance(POSTER_T + SHOCK_FRAME_S)
  }
  const fan = new Fan()
  fan.begin(1, m.sigma)
  while (!fan.work(4096));
  return { m, fan, surface: surfaceOf(m.stress) }
}

/** The market at a still frame's moment, and its fan: built once a build. */
export function marketFrame(moment: Moment = 'calm') {
  return (cached[moment] ??= build(moment))
}

const tokens = (c: Palette) =>
  `--color-ink:${c.ink};--color-paper:${c.paper};--color-graphite:${c.graphite};--color-rule:${c.rule};--color-indigo:${c.indigo};--color-indigo-wash:${c['indigo-wash']}`
function root() {
  const { light, dark } = palette()
  return `:root{${tokens(light)}}@media (prefers-color-scheme:dark){:root{${tokens(dark)}}}`
}
const r3 = (x: number) => Math.round(x * 1000) / 1000

/** The book's still frame: its window, centred on the price, with its price ticks as fractions of its height from the top. */
export function bookFrame(moment: Moment = 'calm') {
  const { m } = marketFrame(moment)
  const centre = m.flow.book.mid
  const base = Math.round(centre)
  const y = (p: number) => (centre + WINDOW.half + 0.5 - p) / ROWS
  // None too near the strip's edges to be read whole, as the live strip leaves them out.
  const ticks = priceTicks(centre - WINDOW.half, centre + WINDOW.half)
    .map((p) => ({ p, y: y(p) }))
    .filter((t) => t.y >= 0.08 && t.y <= 0.92)
  return { centre, base, ticks }
}

/**
 * A depth's byte in the heat strip's mask: its tone, in steps of 4 of 255 (1.6% of the indigo mix, below what an eye can
 * tell in a gradient), so the image compresses to a third of its size; the live strip draws the exact tone.
 */
export const maskByte = (depth: number) => Math.min(255, Math.round((depthTone(depth) * 255) / 4) * 4)

/** The heat strip: twenty seconds of the book's queues as a mask of the indigo, with the price and the trades over it. */
export function bookSvg(moment: Moment = 'calm'): string {
  const { m } = marketFrame(moment)
  const f = m.flow
  const { centre, base } = bookFrame(moment)
  const top = base + WINDOW.half
  // A column a row, the newest last, as the live strip lays them (its newest ends at now).
  const opacity = new Uint8Array(256 * ROWS)
  for (let c = 0; c < 256; c++) {
    const r = f.row(255 - c)
    if (r < 0) continue
    const off = top - (f.centre[r]! - HALF)
    for (let yy = 0; yy < ROWS; yy++) {
      const j = off - yy
      // The book's depth there: the flow's own, every share between the price and the touch (+ asks, − bids).
      const d = j >= 0 && j < LEVELS ? Math.abs(f.depth[r * LEVELS + j]!) : 0
      opacity[yy * 256 + c] = maskByte(d)
    }
  }
  const png = whitePng(256, ROWS, opacity).toString('base64')
  const now = m.t
  const x = (t: number) => COLS - (now - t) * HZ
  const yv = (p: number) => centre + WINDOW.half + 0.5 - p
  // The price through it.
  const pts: string[] = []
  for (let a = 254; a >= 0; a--) {
    const r = f.row(a)
    if (r < 0) continue
    pts.push(`${r3(x(f.times[r]!))},${r3(yv(f.mids[r]!))}`)
  }
  pts.push(`${COLS},${r3(yv(f.book.mid))}`)
  // Every trade in the window, a dot that does not stretch with the image.
  const dots = f.trades
    .filter((tr) => tr.t >= now - 20)
    .map((tr) => `M${r3(x(tr.t))} ${r3(yv(tr.price))}h0`)
    .join('')
  // The heat's image starts fifteen columns before the window (21.3 seconds of rows, twenty shown) and its
  // `centre − base` fraction of a tick above, as the live strip draws it.
  const dy = r3(centre - base)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLS} ${ROWS}" preserveAspectRatio="none">` +
    `<style>${root()}</style>` +
    `<defs><mask id="q"><image href="data:image/png;base64,${png}" x="-15" y="${dy}" width="256" height="${ROWS}" preserveAspectRatio="none"/></mask></defs>` +
    `<rect width="${COLS}" height="${ROWS}" fill="var(--color-paper)"/>` +
    `<rect x="-15" y="${dy}" width="256" height="${ROWS}" fill="var(--color-indigo)" mask="url(#q)"/>` +
    `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--color-ink)" stroke-width="1.25" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` +
    `<path d="${dots}" stroke="var(--color-ink)" stroke-opacity="0.85" stroke-width="2.6" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` +
    `</svg>`
  )
}

/** The book at now: its depth at each price, every share between it and the touch, a bar; 800 or more the whole width. */
export function ladderSvg(moment: Moment = 'calm'): string {
  const { m } = marketFrame(moment)
  const b = m.flow.book
  const { centre, base } = bookFrame(moment)
  const depth = (p: number) => {
    let d = 0
    if (p <= b.bestBid) for (let x = b.bestBid; x >= p; x--) d += b.bidAt(x)
    else if (p >= b.bestAsk) for (let x = b.bestAsk; x <= p; x++) d += b.askAt(x)
    return d
  }
  const bars: string[] = []
  for (let p = base - WINDOW.half - 1; p <= base + WINDOW.half + 1; p++) {
    const d = depth(p)
    if (!d) continue
    const y = centre + WINDOW.half + 0.5 - p - 0.5
    bars.push(`<rect x="6" y="${r3(y)}" width="${r3(Math.max(1, (Math.min(d, 800) / 800) * 48))}" height="1.02"/>`)
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 ${ROWS}" preserveAspectRatio="none">` +
    `<style>${root()}</style>` +
    `<rect width="56" height="${ROWS}" fill="var(--color-paper)"/>` +
    `<g fill="var(--color-indigo)">${bars.join('')}</g>` +
    `<rect x="0.5" width="1" height="${ROWS}" fill="var(--color-rule)"/>` +
    `</svg>`
  )
}

const LN3 = dlog(3)

/** The futures' still frame: the price ticks for a year out, as fractions of the plot's height from its top. */
export function fanFrame(moment: Moment = 'calm') {
  const { m, fan } = marketFrame(moment)
  const mid$ = m.flow.book.mid * TICK
  return {
    ticks: logTicks(mid$, 1 / 3, 3).map((d) => ({ d, y: (LN3 - dlog(d / mid$)) / (2 * LN3) })),
    lo: fan.band(0, 64) * mid$,
    hi: fan.band(4, 64) * mid$,
  }
}

/**
 * A year of futures from the price at the still frame: the 5th–95th and 25th–75th percentiles as washes, the median
 * a line, 48 paths thin lines; in log price, a doubling the same step as a halving, the root the price now.
 */
export function fanSvg(moment: Moment = 'calm'): string {
  const { fan } = marketFrame(moment)
  const y = (v: number) => r3(-dlog(v))
  const line = (row: (j: number) => number, step = 1) => {
    const p: string[] = []
    for (let j = 0; j <= 64; j += step) p.push(`${j},${y(row(j))}`)
    if (64 % step) p.push(`64,${y(row(64))}`)
    return p.join(' ')
  }
  const band = (lo: number, hi: number) => {
    const up: string[] = [], down: string[] = []
    for (let j = 0; j <= 64; j++) {
      up.push(`${j},${y(fan.band(hi, j))}`)
      down.unshift(`${j},${y(fan.band(lo, j))}`)
    }
    return up.concat(down).join(' ')
  }
  const s = fan.strands()
  const strands = Array.from({ length: 48 }, (_, i) => `<polyline points="${line((j) => s[i * 65 + j]!, 2)}"/>`).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${r3(-LN3)} 64 ${r3(2 * LN3)}" preserveAspectRatio="none">` +
    `<style>${root()}.w{fill:var(--color-indigo)}.s{fill:none;stroke:var(--color-indigo);stroke-width:0.8;stroke-opacity:0.34}@media (prefers-color-scheme:dark){.s{stroke-opacity:0.38}}</style>` +
    `<polygon class="w" fill-opacity="0.1" points="${band(0, 4)}"/>` +
    `<polygon class="w" fill-opacity="0.14" points="${band(1, 3)}"/>` +
    `<g class="s" stroke-linejoin="round" vector-effect="non-scaling-stroke">${strands.replaceAll('<polyline ', '<polyline vector-effect="non-scaling-stroke" ')}</g>` +
    `<polyline points="${line((j) => fan.band(2, j))}" fill="none" stroke="var(--color-indigo)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` +
    `</svg>`
  )
}
