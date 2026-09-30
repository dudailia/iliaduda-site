import { alongX, dot, paint, readShape, type MakeMini } from '../paint'

/** cricstate's miniature: the final's win probability as the thumbnail draws it, the ball riding it through the match. */
export const make: MakeMini = (svg) => {
  const sh = readShape(svg)
  const line = sh.claim[0] ?? []
  return {
    ready: () => line.length > 1,
    draw(g, w, h, t, _dt, pal) {
      paint(g, sh, w, h, pal)
      // Fourteen seconds a match: twelve riding it at a steady pace of balls (the line's x), fading in over its first
      // 0.4 s and out over its last, so it has gone before the corner the line ends in; then a moment before the next.
      const c = t % 14
      const u = Math.min(1, c / 12)
      const o = Math.min(1, c / 0.4, (12 - c) / 0.4)
      const [x, y] = alongX(line, u)
      dot(g, (x * w) / 1000, (y * h) / 600, Math.max(0, o), pal)
    },
  }
}
