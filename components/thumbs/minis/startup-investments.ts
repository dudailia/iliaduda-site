import { EASE_IN_OUT } from '@/lib/ease'
import { TW } from '@/lib/minis/shape'
import { paint, readShape, type MakeMini } from '../paint'

/**
 * The startup ranking's miniature: the thumbnail's top ten under the first treatment, then re-ranked under the second
 * and the third, each held three and a half seconds, the bars gliding to their places over 600ms (the site's
 * cubic-bezier(0.77, 0, 0.175, 1)). Each bar's score under the other two treatments is on the thumbnail
 * (`data-mini`), so the miniature draws only the paper's own numbers.
 */
export const make: MakeMini = (svg) => {
  const sh = readShape(svg)
  const bars = sh.bars ?? []
  const scores = JSON.parse(svg.dataset.mini ?? '[]') as [number, number, number][]
  const n = bars.length
  const slot = bars.map(([, y]) => y).sort((a, b) => a - b)
  // Under treatment k: each bar's slot (its rank among the ten) and its length (against the ten's best).
  const layout = [0, 1, 2].map((k) => {
    const by = scores.map((s, i) => [s[k]!, i] as const).sort((a, b) => b[0] - a[0])
    const rank = new Array<number>(n)
    by.forEach(([, i], r) => (rank[i] = r))
    const max = by[0]?.[0] ?? 1
    return scores.map((s, i) => ({ y: slot[rank[i]!]!, w: (s[k]! / max) * TW * 0.9 }))
  })
  return {
    ready: () => n > 0 && scores.length === n,
    draw(g, w, h, t, _dt, pal) {
      const c = t % 12
      const k = Math.floor(c / 4)
      const u = EASE_IN_OUT(Math.max(0, Math.min(1, (c - k * 4 - 3.4) / 0.6)))
      const from = layout[k]!, to = layout[(k + 1) % 3]!
      paint(
        g,
        { ...sh, bars: bars.map(([x, , , bh], i) => [x, from[i]!.y + (to[i]!.y - from[i]!.y) * u, from[i]!.w + (to[i]!.w - from[i]!.w) * u, bh] as const) },
        w,
        h,
        pal,
      )
    },
  }
}
