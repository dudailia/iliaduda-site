import { EASE_IN_OUT } from '@/lib/ease'
import { arcloShape, EXPORTS, intoExport, intoRender, intoTemplate, TEMPLATES } from '@/lib/minis/arclo'
import { TH, TW, type Pts } from '@/lib/minis/shape'
import { along, dot, paint, type MakeMini } from '../paint'

/**
 * /arclo's miniature: the pipeline as the thumbnail draws it, and one piece at a time running through it, from the
 * tokens through a template and the render route out to an export (1.6s on the site's in-out curve), held there 0.7s
 * and let go. Each run takes the next template and the next export, so twelve runs pass every pair once.
 */
const TRAVEL = 1.6
const HOLD = 0.7
const FADE = 0.3
const RUN = TRAVEL + HOLD + FADE

const route = (k: number): Pts => [...intoTemplate(k % TEMPLATES), ...intoRender(k % TEMPLATES), ...intoExport(k % EXPORTS)]

export const make: MakeMini = () => {
  const sh = arcloShape()
  const routes = Array.from({ length: TEMPLATES * EXPORTS }, (_, k) => route(k))
  return {
    ready: () => true,
    atRest: (t) => t % RUN >= TRAVEL,
    draw(g, w, h, t, _dt, pal) {
      paint(g, sh, w, h, pal)
      const k = Math.floor(t / RUN) % routes.length
      const p = t % RUN
      const [x, y] = along(routes[k]!, EASE_IN_OUT(Math.min(1, p / TRAVEL)))
      const o = Math.min(1, p / 0.2, (RUN - p) / FADE)
      dot(g, (x * w) / TW, (y * h) / TH, o, pal)
    },
  }
}
