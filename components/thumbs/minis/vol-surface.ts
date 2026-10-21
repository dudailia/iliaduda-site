import { EASE_IN_OUT } from '@/lib/ease'
import { paint, readShape, type MakeMini } from '../paint'

/**
 * The live surface's miniature: one expiry's quotes as the thumbnail draws them, and the fit through them moving between
 * the two models the live page lets the reader switch between: eSSVI (the thumbnail's line) held 3.4 s, 600ms to SSVI on
 * the site's in-out curve, held, and back. SSVI's heights at the line's own points are on the thumbnail (`data-mini`),
 * so the miniature draws only the paper's own fits.
 */
export const make: MakeMini = (svg) => {
  const sh = readShape(svg)
  const essvi = sh.claim[0] ?? []
  const ssvi = JSON.parse(svg.dataset.mini ?? '[]') as number[]
  return {
    ready: () => essvi.length > 1 && ssvi.length === essvi.length,
    // Each model holds 3.4 s of its 4, the line gliding in the last 0.6.
    atRest: (t) => (t % 8) % 4 < 3.4,
    draw(g, w, h, t, _dt, pal) {
      const c = t % 8
      const k = Math.floor(c / 4)
      const u = EASE_IN_OUT(Math.max(0, Math.min(1, (c - k * 4 - 3.4) / 0.6)))
      // From eSSVI towards SSVI on the first leg, back on the second.
      const m = k === 0 ? u : 1 - u
      paint(g, { ...sh, claim: [essvi.map(([x, y], i) => [x, y + (ssvi[i]! - y) * m] as const)] }, w, h, pal)
    },
  }
}
