import { EASE_OUT } from '@/lib/ease'
import { paint, readShape, type MakeMini } from '../paint'

/**
 * CloseBooks' miniature: the batch as the thumbnail draws it, each line's confidence a bar; every twelve seconds the
 * batch runs again as the figure's does: the rows let go (to a trace, over 150ms on the ease-out) and arrive again
 * 45ms apart over their own traces, each settling over 240ms on the ease-out, so the thumbnail is never empty.
 */
export const make: MakeMini = (svg) => {
  const sh = readShape(svg)
  const bars = sh.bars ?? []
  return {
    ready: () => bars.length > 0,
    draw(g, w, h, t, _dt, pal) {
      const c = t % 12
      const faded = c < 9 ? 1 : 1 - 0.85 * EASE_OUT(Math.min(1, (c - 9) / 0.15))
      paint(g, { ...sh, bars: [] }, w, h, pal)
      const sx = w / 1000, sy = h / 600
      bars.forEach(([x, y, bw, bh], i) => {
        const k = c < 9.15 ? 0 : EASE_OUT(Math.max(0, Math.min(1, (c - 9.15 - i * 0.045) / 0.24)))
        g.fillStyle = pal.indigo
        g.globalAlpha = faded
        g.fillRect(x * sx, y * sy, bw * sx, bh * sy)
        if (k > 0) {
          g.globalAlpha = 1
          g.fillRect(x * sx, y * sy, bw * k * sx, bh * sy)
        }
        g.globalAlpha = 1
      })
    },
  }
}
