import { CALM, iv } from './surface/ssvi'
import { apply, camera, EXPIRY_TICKS, kOfU, mvp, STRIKE_TICKS, tOfV, wx, wy, wz } from './surface/view'
import { chart, feed } from '@/content/data/closebooks-feed'
import replay from '@/content/data/cricket-final.json'
import ranking from '@/content/data/startup-ranking.json'
import ofz from '@/content/data/ofz-curve.json'
import { categorise } from './closebooks'
import { zcy } from './gcurve'
import { posterFlow } from './market/flow'
import { marketFrame } from './market/poster'
import { offeredTerms } from './settlement'

/**
 * Miniatures of each paper's Fig. 1, drawn from the same data: for the
 * contents page (where each is the start of a view transition into its paper)
 * and for the Open Graph cards. Every shape is in a 1000 × 600 box; callers
 * choose the pixel size.
 */

export const TW = 1000
export const TH = 600

export interface Thumb {
  /** Context marks: drawn in the rule or wash colour. */
  readonly context: readonly string[]
  /** The claimed value: drawn in indigo. */
  readonly claim: readonly string[]
  /** Solid bars for the claim, as [x, y, w, h]. */
  readonly bars?: readonly (readonly [number, number, number, number])[]
}

const line = (pts: readonly (readonly [number, number])[]) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')

function ivSurface(): Thumb {
  // Fig. 1's calm surface through Fig. 1's own camera, as a wireframe: the smiles at the ticked expiries, with the
  // one-month smile (the steep one a shock lifts) as the claim, and the strike lines across them as context.
  const m = mvp('wide', camera('wide'))
  const at = (k: number, T: number) => {
    const q = apply(m, wx(k), wy(iv(CALM, k, T)), wz(T))
    return [Math.round(((q[0] / q[3]) * 0.5 + 0.5) * TW), Math.round((1 - ((q[1] / q[3]) * 0.5 + 0.5)) * TH)] as const
  }
  const round = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('')
  const smile = (T: number) => round(Array.from({ length: 25 }, (_, i) => at(kOfU(i / 24), T)))
  const across = (K: number) => round(Array.from({ length: 17 }, (_, j) => at(Math.log(K), tOfV(j / 16))))
  const [first, ...rest] = EXPIRY_TICKS
  return {
    context: [...rest.map(([T]) => smile(T)), ...STRIKE_TICKS.map((K) => across(K))],
    claim: [smile(first[0])],
  }
}

function cricket(): Thumb {
  const b = replay.balls
  const pts = b.map((x, i) => [(i / (b.length - 1)) * TW, (1 - x.p) * TH] as const)
  const brk = b.findIndex((x) => x.inn === 2)
  return {
    context: [line([[0, TH / 2], [TW, TH / 2]]), line([[(brk / (b.length - 1)) * TW, 0], [(brk / (b.length - 1)) * TW, TH]])],
    claim: [line(pts)],
  }
}

function startup(): Thumb {
  // The figure is a ranked bar list, so the thumbnail is one: the top ten as
  // written, bar length the composite score.
  const top = [...ranking.segments].sort((x, y) => x.a.rank - y.a.rank).slice(0, 10)
  const max = top[0]!.a.score
  const h = TH / top.length
  return {
    context: top.map((_, i) => line([[0, i * h + h - 4], [TW, i * h + h - 4]])),
    claim: [],
    bars: top.map((s, i) => [TW * 0.08, i * h + h * 0.25, (s.a.score / max) * TW * 0.9, h * 0.42] as const),
  }
}

function closebooks(): Thumb {
  const rows = feed.map((l) => categorise(l, chart))
  const h = TH / rows.length
  return {
    context: rows.map((_, i) => line([[0, i * h + h - 6], [TW, i * h + h - 6]])),
    claim: [],
    bars: rows.map((r, i) => [0, i * h + h * 0.25, r.confidence * TW, h * 0.45] as const),
  }
}

function debtPortal(): Thumb {
  // The figure's chart: monthly payment against term, offered terms joined.
  const o = offeredTerms(6_000_000)
  const maxM = o.at(-1)!.months
  const hi = o[0]!.s.monthly
  const lo = o.at(-1)!.s.monthly
  const pts = o.map((t) => [((t.months - 1) / (maxM - 1)) * TW, TH * 0.08 + (1 - (t.s.monthly - lo) / (hi - lo)) * TH * 0.84] as const)
  return { context: [line([[0, TH], [TW, TH]]), line([[0, 0], [0, TH]])], claim: [line(pts)] }
}

function bcs(): Thumb {
  // The /about figure: every session of the summer as context, 15 August in
  // indigo. Same axes as the figure: square-root maturity, 6.5–12.5%.
  const T0 = Math.sqrt(0.25)
  const T1 = Math.sqrt(20)
  const ts = Array.from({ length: 28 }, (_, i) => (T0 + ((T1 - T0) * i) / 27) ** 2)
  const curve = (p: readonly number[]) =>
    line(ts.map((t) => [((Math.sqrt(t) - T0) / (T1 - T0)) * TW, ((12.5 - zcy(p, t)) / 6) * TH] as const))
  const hike = ofz.days.find((d) => d.date === '2023-08-15')!
  return {
    context: ofz.days.filter((d) => d !== hike).map((d) => curve(d.params)),
    claim: [curve(hike.params)],
  }
}

function orderBook(): Thumb {
  // The book as a joy plot: six of the poster's twenty seconds of ridges, older ones higher and in the rule colour,
  // the newest in indigo, each the cumulative depth outward from the touch across the 128 ticks the figure shows.
  const f = posterFlow()
  const ridge = (age: number, lift: number) => {
    const r = f.row(age)
    const c = f.centre[r]!
    const pts: [number, number][] = []
    for (let j = -64; j <= 64; j += 4) {
      const h = Math.sqrt(Math.abs(f.depthAt(r, c + j)) / 1400)
      pts.push([Math.round(((j + 64) / 128) * TW), Math.round(TH - 40 - lift - Math.min(1, h) * 300)])
    }
    return line(pts).replace(/\.0/g, '')
  }
  const ages = [200, 160, 120, 80, 40]
  return {
    context: ages.map((a, i) => ridge(a, (ages.length - i) * 40)),
    claim: [ridge(0, 0)],
  }
}

function market(): Thumb {
  // Fig. 1's stage as it is laid out: the market's vol surface above, through the surface's own camera, and under it
  // the book's price over its last twenty seconds beside a year of its futures. The one-month smile and eight of the
  // year's paths are the claim; the other smiles, the strike lines, the price and the fan's 5th–95th the context. At
  // a thumbnail's size (9rem) a dozen points a line draw it; whole units, since every byte ships twice.
  const { m, fan, surface } = marketFrame()
  const f = m.flow
  const int = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${Math.round(x)} ${Math.round(y)}`).join('')
  // The surface, in a box of its own frame's aspect across the top of the thumbnail.
  const sh = TH * 0.56, sw = sh * 1.62, sx0 = (TW - sw) / 2
  const mv = mvp('wide', camera('wide'))
  const at = (k: number, T: number) => {
    const q = apply(mv, wx(k), wy(iv(surface, k, T)), wz(T))
    return [sx0 + ((q[0] / q[3]) * 0.5 + 0.5) * sw, (1 - ((q[1] / q[3]) * 0.5 + 0.5)) * sh] as const
  }
  const smile = (T: number) => int(Array.from({ length: 13 }, (_, i) => at(kOfU(i / 12), T)))
  const across = (K: number) => int(Array.from({ length: 9 }, (_, j) => at(Math.log(K), tOfV(j / 8))))
  const [first, ...rest] = EXPIRY_TICKS
  // The row under it: the book's price on the left, the year from now on the right.
  const y0 = TH * 0.64, rh = TH - y0, split = TW * 0.56, gap = 24
  const mids: number[] = []
  for (let a = 239; a >= 0; a -= 5) {
    const r = f.row(a)
    if (r >= 0) mids.push(f.mids[r]!)
  }
  const lo = Math.min(...mids) - 6, hi = Math.max(...mids) + 6
  const midY = (v: number) => y0 + rh / 2 + ((v - f.book.mid) / (hi - lo)) * -rh * 0.8
  const past = int(mids.map((v, i) => [(i / (mids.length - 1)) * split, midY(v)] as const))
  const yr = (v: number) => y0 + rh / 2 - (Math.log(v) / Math.log(3)) * (rh / 2)
  const x = (j: number) => split + gap + (j / 64) * (TW - split - gap)
  const band = (b: number) => int(Array.from({ length: 17 }, (_, j) => [x(j * 4), yr(fan.band(b, j * 4))] as const))
  const st = fan.strands()
  const strand = (i: number) => int(Array.from({ length: 17 }, (_, k) => [x(k * 4), yr(st[i * 65 + k * 4]!)] as const))
  return {
    context: [...rest.map(([T]) => smile(T)), ...STRIKE_TICKS.map((K) => across(K)), past, band(0), band(4)],
    claim: [smile(first[0]), ...Array.from({ length: 8 }, (_, i) => strand(i * 6))],
  }
}

const BUILDERS: Record<string, () => Thumb> = {
  market,
  'iv-surface': ivSurface,
  cricstate: cricket,
  'startup-investments': startup,
  closebooks,
  'debt-portal': debtPortal,
  bcs,
  'order-book': orderBook,
}

export function thumbFor(slug: string): Thumb | null {
  return BUILDERS[slug]?.() ?? null
}
