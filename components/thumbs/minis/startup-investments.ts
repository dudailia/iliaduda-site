import { EASE_IN_OUT } from '@/lib/ease'
import { TW } from '@/lib/minis/shape'
import { paint, readShape, type MakeMini } from '../paint'

/**
 * The startup ranking's miniature: the thumbnail's top ten under the first treatment, then re-ranked under the second
 * and the third, each held seven seconds, the bars gliding to their places over 600ms (the site's
 * cubic-bezier(0.77, 0, 0.175, 1)). Each bar's score under the other two treatments is on the thumbnail
 * (`data-mini`), so the miniature draws only the paper's own numbers; the top pick is indigo, so the change of lead reads.
 */
export const make: MakeMini = (svg) => {
  const sh = readShape(svg)
  // The ten in the thumbnail's order (the first treatment's), the top pick first.
  const bars = [...(sh.bars ?? []), ...(sh.quiet ?? [])].sort((p, q) => p[1] - q[1])
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
      // Each order held 7 s, then 600ms to the next: 7.6 s a treatment.
      const c = t % 22.8
      const k = Math.floor(c / 7.6)
      const u = EASE_IN_OUT(Math.max(0, Math.min(1, (c - k * 7.6 - 7) / 0.6)))
      const from = layout[k]!, to = layout[(k + 1) % 3]!
      const placed = bars.map(([x, , , bh], i) => [x, from[i]!.y + (to[i]!.y - from[i]!.y) * u, from[i]!.w + (to[i]!.w - from[i]!.w) * u, bh] as const)
      // The top pick in indigo, the rest in the wash: the lead passes to the next treatment's halfway through the glide.
      const lead = (u < 0.5 ? from : to).reduce((best, b, i, all) => (b.y < all[best]!.y ? i : best), 0)
      paint(g, { ...sh, bars: [placed[lead]!], quiet: placed.filter((_, i) => i !== lead) }, w, h, pal)
    },
  }
}
