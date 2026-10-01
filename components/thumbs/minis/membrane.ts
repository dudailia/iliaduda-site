import { membraneShape } from '@/lib/minis/membrane'
import { paint, type MakeMini } from '../paint'

/**
 * /membrane's miniature: the drum the page opens on, ringing in its first four modes at a fifth of its own time (its
 * fundamental about every six seconds), quiet beside the other papers' miniatures.
 */
export const make: MakeMini = () => ({
  ready: () => true,
  draw(g, w, h, t, _dt, pal) {
    paint(g, membraneShape(t * 0.2), w, h, pal)
  },
})
