import { EASE_OUT } from '@/lib/ease'
import { paint, readShape, type MakeMini } from '../paint'

/**
 * CloseBooks' miniature: the batch as the thumbnail draws it, each line's confidence a bar; every seven seconds the
 * batch runs again, the rows letting go (150ms) and arriving 45ms apart, each settling over 240ms on the ease-out, as
 * the figure's own batch does.
 */
export const make: MakeMini = (svg) => {
  const sh = readShape(svg)
  const bars = sh.bars ?? []
  return {
    ready: () => bars.length > 0,
    draw(g, w, h, t, _dt, pal) {
      const c = t % 7
      const k = (i: number) => {
        if (c < 4) return 1
        if (c < 4.15) return 1 - (c - 4) / 0.15
        return EASE_OUT(Math.max(0, Math.min(1, (c - 4.4 - i * 0.045) / 0.24)))
      }
      paint(g, { ...sh, bars: bars.map(([x, y, bw, bh], i) => [x, y, bw * k(i), bh] as const) }, w, h, pal)
    },
  }
}
