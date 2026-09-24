import { DOMAIN } from '@/lib/svi'

/**
 * Plot coordinates for the contour map. The SVG is drawn in a 1000 × 1000 box
 * and stretched to whatever shape its container has (preserveAspectRatio
 * none, strokes non-scaling), and every label is HTML positioned in percent.
 * So the text is 12px at every width instead of being correct at one width and
 * scaled everywhere else — which is what a viewBox does to type.
 *
 * Expiries run down the page, shortest at the top, the way a volatility grid
 * on a desk lists them — and the top edge is the far edge of the 3D view once
 * the map tilts up, so the steep short-dated skew rises at the back instead of
 * standing in front of the rest of the surface.
 */

export const U = 1000

export const fx = (k: number) => (k - DOMAIN.kMin) / (DOMAIN.kMax - DOMAIN.kMin)
export const fy = (T: number) => (T - DOMAIN.tMin) / (DOMAIN.tMax - DOMAIN.tMin)

export function fromFraction(x: number, y: number): { k: number; T: number } {
  return {
    k: DOMAIN.kMin + x * (DOMAIN.kMax - DOMAIN.kMin),
    T: DOMAIN.tMin + y * (DOMAIN.tMax - DOMAIN.tMin),
  }
}
