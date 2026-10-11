import { whole, type Pts, type Shape } from './shape'

/**
 * /arclo's Fig. 1 in miniature: one set of tokens (the indigo block) feeding three templates, each in two colorways
 * (the paired washes), into one render route, which writes every export (the four boxes on the right). The claim is
 * the wiring: every line out of the tokens.
 */

const TOKENS = [30, 255, 110, 90] as const
const TEMPLATE_Y = [110, 300, 490] as const
const EXPORT_Y = [75, 225, 375, 525] as const
const SWATCH = { x: 330, w: 70, gap: 10, h: 80 }
const RENDER = { x: 600, w: 50, h: 120 }
const EXPORT = { x: 840, w: 130, h: 70 }

const box = (x: number, y: number, w: number, h: number): Pts => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]
/** An elbow from one node to the next: across, down or up at the midpoint, across. */
const elbow = (x0: number, y0: number, x1: number, y1: number): Pts => {
  const m = (x0 + x1) / 2
  return whole([[x0, y0], [m, y0], [m, y1], [x1, y1]])
}

const tokOut = [TOKENS[0] + TOKENS[2], TOKENS[1] + TOKENS[3] / 2] as const
const tplIn = SWATCH.x
const tplOut = SWATCH.x + 2 * SWATCH.w + SWATCH.gap
const renderY = 300

/** The wire from the tokens into template `i`. */
export const intoTemplate = (i: number): Pts => elbow(tokOut[0], tokOut[1], tplIn, TEMPLATE_Y[i]!)
/** The wire from template `i` into the render route. */
export const intoRender = (i: number): Pts => elbow(tplOut, TEMPLATE_Y[i]!, RENDER.x, renderY)
/** The wire from the render route out to export `j`. */
export const intoExport = (j: number): Pts => elbow(RENDER.x + RENDER.w, renderY, EXPORT.x, EXPORT_Y[j]!)

export const TEMPLATES = TEMPLATE_Y.length
export const EXPORTS = EXPORT_Y.length

export function arcloShape(): Shape {
  return {
    context: [
      box(RENDER.x, renderY - RENDER.h / 2, RENDER.w, RENDER.h),
      ...EXPORT_Y.map((y) => box(EXPORT.x, y - EXPORT.h / 2, EXPORT.w, EXPORT.h)),
    ],
    claim: [
      ...TEMPLATE_Y.map((_, i) => intoTemplate(i)),
      ...TEMPLATE_Y.map((_, i) => intoRender(i)),
      ...EXPORT_Y.map((_, j) => intoExport(j)),
    ],
    bars: [TOKENS],
    quiet: TEMPLATE_Y.flatMap((y) => [
      [SWATCH.x, y - SWATCH.h / 2, SWATCH.w, SWATCH.h] as const,
      [SWATCH.x + SWATCH.w + SWATCH.gap, y - SWATCH.h / 2, SWATCH.w, SWATCH.h] as const,
    ]),
  }
}
