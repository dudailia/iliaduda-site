import { levels } from '@/components/figures/VolSurface'
import { chart, feed } from '@/content/data/closebooks-feed'
import replay from '@/content/data/cricket-final.json'
import ranking from '@/content/data/startup-ranking.json'
import { categorise } from './closebooks'
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
  // levels() is drawn in a 1000 × 1000 box; squash it into 1000 × 600.
  const squash = (d: string) =>
    d.replace(/([ML])([\d.]+) ([\d.]+)/g, (_, c, x, y) => `${c}${x} ${((Number(y) * TH) / 1000).toFixed(1)}`)
  const ls = levels()
  return {
    context: ls.filter((_, i) => i % 2).map((l) => squash(l.d)),
    claim: ls.filter((_, i) => i % 2 === 0).map((l) => squash(l.d)),
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
  const top = [...ranking.segments].sort((x, y) => x.a.rank - y.a.rank).slice(0, 10)
  const n = ranking.segments.length
  const y = (r: number) => ((r - 1) / (n - 1)) * (TH - 20) + 10
  return {
    context: ranking.segments.map((s) => line([[40, y(s.a.rank)], [TW - 40, y(s.b.rank)]])),
    claim: top.map((s) => line([[40, y(s.a.rank)], [TW - 40, y(s.b.rank)]])),
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
  const t = offeredTerms(6_000_000).find((x) => x.months >= 12)!.s
  const w = TW / t.months
  return {
    context: [line([[0, TH], [TW, TH]])],
    claim: [],
    bars: Array.from({ length: t.months }, (_, i) => {
      const hh = ((i === t.months - 1 ? t.last : t.monthly) / t.monthly) * (TH * 0.85)
      return [i * w + w * 0.12, TH - hh, w * 0.76, hh] as const
    }),
  }
}

const BUILDERS: Record<string, () => Thumb> = {
  'iv-surface': ivSurface,
  cricstate: cricket,
  'startup-investments': startup,
  closebooks,
  'debt-portal': debtPortal,
}

export function thumbFor(slug: string): Thumb | null {
  return BUILDERS[slug]?.() ?? null
}
