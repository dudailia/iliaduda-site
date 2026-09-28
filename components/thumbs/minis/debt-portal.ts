import { along, dot, paint, readShape, type MakeMini } from '../paint'

/** The debt portal's miniature: the offered terms as the thumbnail draws them, a reader's choice sweeping along them. */
export const make: MakeMini = (svg) => {
  const sh = readShape(svg)
  const line = sh.claim[0] ?? []
  return {
    ready: () => line.length > 1,
    draw(g, w, h, t, _dt, pal) {
      paint(g, sh, w, h, pal)
      // Out along the ladder and back, ten seconds each way, easing at the ends as a slider does under a hand.
      const c = (t % 20) / 10
      const u = 0.5 - 0.5 * Math.cos(Math.PI * (c < 1 ? c : 2 - c))
      const [x, y] = along(line, u)
      dot(g, (x * w) / 1000, (y * h) / 600, Math.min(1, t / 0.4), pal)
    },
  }
}
