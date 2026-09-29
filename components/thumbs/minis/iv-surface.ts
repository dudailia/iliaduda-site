import { ivSurfaceShape } from '@/lib/minis/ivSurface'
import { params } from '@/lib/surface/shock'
import { paint, type MakeMini } from '../paint'

/**
 * /iv-surface's miniature: its calm surface, as the thumbnail draws it, breathing a small shock in and out of the
 * figure's own shock family (at most 0.4 of the full one, over sixteen seconds), so every frame is a surface free of
 * static arbitrage; and turning through its figure's sway, so it reads as the 3D surface it is.
 */
export const make: MakeMini = () => ({
  ready: () => true,
  draw(g, w, h, t, _dt, pal) {
    const a = 0.2 * (1 - Math.cos((2 * Math.PI * t) / 16))
    // Turned as the figure's drift turns it: its full sway over 48 s.
    paint(g, ivSurfaceShape(params(a), Math.sin((2 * Math.PI * t) / 48)), w, h, pal)
  },
})
