import { EASE_IN_OUT } from '@/lib/ease'
import { dot, paint, readShape, type MakeMini } from '../paint'

/**
 * The debt portal's miniature: the offered terms as the thumbnail draws them, and a reader's choice stepping along them
 * as the figure's slider does, from one offered term to the next (held 1.4 s, 400ms between on the site's in-out curve),
 * out to the longest and back: every place it rests is a term the portal offers.
 */
export const make: MakeMini = (svg) => {
  const sh = readShape(svg)
  const line = sh.claim[0] ?? []
  const n = line.length
  return {
    ready: () => n > 1,
    // Each term is held 1.4s of its 1.8, the choice stepping in the last 0.4.
    atRest: (t) => ((t / 1.8) % (2 * (n - 1))) % 1 < 1.4 / 1.8,
    draw(g, w, h, t, _dt, pal) {
      paint(g, sh, w, h, pal)
      const step = 1.8
      const stops = 2 * (n - 1)
      const c = (t / step) % stops
      const i = Math.floor(c)
      const u = EASE_IN_OUT(Math.max(0, Math.min(1, (c - i - 1.4 / step) / (0.4 / step))))
      // Out along the terms and back: the i-th move goes from term a to term b.
      const a = i < n - 1 ? i : stops - i, b = i < n - 1 ? i + 1 : stops - i - 1
      const p = line[a]!, q = line[b]!
      const x = p[0] + (q[0] - p[0]) * u, y = p[1] + (q[1] - p[1]) * u
      dot(g, (x * w) / 1000, (y * h) / 600, Math.min(1, t / 0.4), pal)
    },
  }
}
