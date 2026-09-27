import { CALM, iv } from './surface/ssvi'
import { apply, camera, EXPIRY_TICKS, kOfU, mvp, STRIKE_TICKS, tOfV, wx, wy, wz } from './surface/view'
import { chart, feed } from '@/content/data/closebooks-feed'
import replay from '@/content/data/cricket-final.json'
import ranking from '@/content/data/startup-ranking.json'
import ofz from '@/content/data/ofz-curve.json'
import { categorise } from './closebooks'
import { zcy } from './gcurve'
import { posterFlow } from './market/flow'
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
  const m = mvp(camera(0))
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

const BUILDERS: Record<string, () => Thumb> = {
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
