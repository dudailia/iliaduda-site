import { CALM } from './surface/ssvi'
import { chart, feed } from '@/content/data/closebooks-feed'
import replay from '@/content/data/cricket-final.json'
import ranking from '@/content/data/startup-ranking.json'
import ofz from '@/content/data/ofz-curve.json'
import { categorise } from './closebooks'
import { zcy } from './gcurve'
import { HZ, posterFlow } from './market/flow'
import { marketFrame } from './market/poster'
import { offeredTerms } from './settlement'
import { marketShape } from './minis/market'
import { orderBookShape } from './minis/orderBook'
import { ivSurfaceShape } from './minis/ivSurface'
import { membraneShape } from './minis/membrane'
import { TH, TW, type Pts, type Shape } from './minis/shape'
import smile from './volsurface/snapshot.json'
import { essviSlice, sliceVol, ssviSlice } from './volsurface/ssvi'
import { replayData } from './toxicflow/replay'

/**
 * Miniatures of each paper's Fig. 1, drawn from the same data: for the
 * contents page (where each is the start of a view transition into its paper)
 * and for the Open Graph cards. Every shape is in a 1000 × 600 box; callers
 * choose the pixel size.
 */

export { TH, TW } from './minis/shape'

export interface Thumb {
  /** Context marks: drawn in the rule or wash color. */
  readonly context: readonly string[]
  /** The claimed value: drawn in indigo. */
  readonly claim: readonly string[]
  /** Solid bars for the claim, as [x, y, w, h]. */
  readonly bars?: readonly (readonly [number, number, number, number])[]
  /** Bars behind the claim, in the indigo wash, as [x, y, w, h]. */
  readonly quiet?: readonly (readonly [number, number, number, number])[]
  /** What a live miniature needs beyond the picture (components/thumbs/minis/), as the SVG's `data-mini`. */
  readonly mini?: string
}

const line = (pts: readonly (readonly [number, number])[]) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')

/** A shape of whole units (lib/minis/shape.ts) as the thumbnail's SVG paths. */
const ints = (pts: Pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('')
const toThumb = (sh: Shape): Thumb => ({ context: sh.context.map(ints), claim: sh.claim.map(ints), ...(sh.bars ? { bars: sh.bars } : {}) })

// Fig. 1 of /iv-surface, /order-book and /market, from the functions their live miniatures draw with (lib/minis/).
const ivSurface = () => toThumb(ivSurfaceShape(CALM))
const membrane = () => toThumb(membraneShape(0))
const orderBook = () => toThumb(orderBookShape(posterFlow()))
function market(): Thumb {
  const { m, fan, surface } = marketFrame()
  const f = m.flow
  const st = fan.strands()
  return toThumb(
    marketShape({
      mid: (age) => {
        const r = f.row(age)
        return r >= 0 ? f.mids[r]! : undefined
      },
      now: f.book.mid,
      written: f.written,
      u: Math.min(1, Math.max(0, (f.t - f.times[f.row(0)]!) * HZ)),
      band: (b, j) => fan.band(b, j),
      strand: (i, j) => st[i * 65 + j]!,
      surface,
    }),
  )
}


function volSurface(): Thumb {
  // Fig. 1 of /vol-surface: one expiry's quotes from bid to ask as context, the eSSVI fit through them as the claim, on
  // the figure's axes; the SSVI fit's heights at the same points for the miniature, which moves between the two models.
  const k0 = Math.min(...smile.k)
  const k1 = Math.max(...smile.k)
  const lo = Math.min(...smile.bid)
  const hi = Math.max(...smile.ask)
  const x = (k: number) => ((k - k0) / (k1 - k0)) * TW
  const y = (v: number) => TH * 0.06 + (1 - (v - lo) / (hi - lo)) * TH * 0.88
  const fit = essviSlice(smile.essvi.theta, smile.essvi.rho, smile.essvi.psi)
  const plain = ssviSlice(smile.ssvi.theta, smile.ssvi.rho, smile.ssvi.eta, smile.ssvi.gamma)
  const ks = Array.from({ length: 61 }, (_, i) => k0 + ((k1 - k0) * i) / 60)
  return {
    context: smile.k.map((k, i) => line([[x(k), y(smile.bid[i]!)], [x(k), y(smile.ask[i]!)]])),
    claim: [line(ks.map((k) => [x(k), y(sliceVol(k, fit, smile.T))] as const))],
    mini: JSON.stringify(ks.map((k) => Number(y(sliceVol(k, plain, smile.T)).toFixed(1)))),
  }
}

function toxicFlow(): Thumb {
  // Fig. 1 of /toxic-flow: the minute's mid, held from step to step, sweep and all, as the claim; under it, the Hawkes
  // intensities B3 reads, as context, on the same clock.
  const d = replayData()
  const x = (t: number) => (t / d.span) * TW
  const mids = d.bids.map((b, n) => (b[0]![0] + d.asks[n]![0]![0]) / 2)
  const my = (m: number) => TH * 0.04 + (1 - (m - d.lo) / Math.max(1, d.hi - d.lo)) * TH * 0.5
  const lamMax = Math.max(...d.lamB, ...d.lamS)
  const ly = (v: number) => TH * 0.98 - (v / lamMax) * TH * 0.36
  // Few points, since every byte of a thumbnail ships twice: the mid only where it moves, the intensities as the peak
  // of each of a hundred buckets of steps.
  const held = (v: readonly number[], y: (v: number) => number) => {
    const pts: [number, number][] = [[0, y(v[0]!)]]
    v.forEach((val, n) => {
      if (n && val !== v[n - 1]) pts.push([x(d.t[n]!), y(v[n - 1]!)], [x(d.t[n]!), y(val)])
    })
    pts.push([TW, y(v[v.length - 1]!)])
    return line(pts)
  }
  const peaks = (v: readonly number[], y: (v: number) => number, n = 100) =>
    line(Array.from({ length: n }, (_, b) => {
      const part = v.slice(Math.floor((b * v.length) / n), Math.floor(((b + 1) * v.length) / n))
      return [((b + 0.5) / n) * TW, y(Math.max(...part))] as const
    }))
  return { context: [peaks(d.lamB, ly), peaks(d.lamS, ly)], claim: [held(mids, my)] }
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
  // written, bar length the composite score, the top pick in indigo.
  const top = [...ranking.segments].sort((x, y) => x.a.rank - y.a.rank).slice(0, 10)
  const max = top[0]!.a.score
  const h = TH / top.length
  return {
    context: top.map((_, i) => line([[0, i * h + h - 4], [TW, i * h + h - 4]])),
    claim: [],
    // The top pick is the claim; the other nine sit behind it in the wash, so which segment leads is what reads.
    bars: top.slice(0, 1).map((s, i) => [TW * 0.08, i * h + h * 0.25, (s.a.score / max) * TW * 0.9, h * 0.42] as const),
    quiet: top.slice(1).map((s, i) => [TW * 0.08, (i + 1) * h + h * 0.25, (s.a.score / max) * TW * 0.9, h * 0.42] as const),
    // The ten's scores under the three treatments, for the miniature that re-ranks them.
    mini: JSON.stringify(top.map((s) => [s.a.score, s.b.score, s.c.score])),
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



const BUILDERS: Record<string, () => Thumb> = {
  'vol-surface': volSurface,
  'toxic-flow': toxicFlow,
  market,
  'iv-surface': ivSurface,
  membrane,
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
