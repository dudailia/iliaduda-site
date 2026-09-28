import { along, dot, paint, readShape, type MakeMini } from '../paint'

/** cricstate's miniature: the final's win probability as the thumbnail draws it, the ball riding it through the match. */
export const make: MakeMini = (svg) => {
  const sh = readShape(svg)
  const line = sh.claim[0] ?? []
  return {
    ready: () => line.length > 1,
    draw(g, w, h, t, _dt, pal) {
      paint(g, sh, w, h, pal)
      // Fourteen seconds a match: twelve riding it, then a moment at the end before the next.
      const c = t % 14
      const u = Math.min(1, c / 12)
      const o = Math.min(1, c / 0.4, (12.4 - c) / 0.4)
      const [x, y] = along(line, u)
      dot(g, (x * w) / 1000, (y * h) / 600, Math.max(0, o), pal)
    },
  }
}
