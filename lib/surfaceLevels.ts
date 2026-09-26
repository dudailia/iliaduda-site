import { U } from '@/components/figures/surface/frames'
import { contour, pathD } from './contours'
import { DOMAIN, iv } from './svi'
import { LABELLED, LEVELS } from './surfaceView'

/**
 * The implied-volatility surface as contour lines, computed from the SSVI
 * maths in lib/svi.ts, in the figure's 1000 × 1000 plot box. The IV paper's
 * poster and the contents thumbnail both draw these. It lives here, not in
 * the figure module, because the thumbnail and every page's social image
 * import it, and Next ships every client component such a graph reaches to
 * the page (tests/client-graph.test.ts).
 */

const NK = 71
const NT = 49

function sample(): Float64Array {
  const out = new Float64Array(NK * NT)
  for (let j = 0; j < NT; j++) {
    const T = DOMAIN.tMin + ((DOMAIN.tMax - DOMAIN.tMin) * j) / (NT - 1)
    for (let i = 0; i < NK; i++) {
      const k = DOMAIN.kMin + ((DOMAIN.kMax - DOMAIN.kMin) * i) / (NK - 1)
      out[j * NK + i] = iv(k, T)
    }
  }
  return out
}

/** Grid coordinates (i over strike, j over expiry) to plot units. */
const gx = (i: number) => (i / (NK - 1)) * U
const gy = (j: number) => (j / (NT - 1)) * U

export interface Level {
  readonly level: number
  readonly d: string
  /** Where its label sits, as fractions of the plot, or null if unlabelled. */
  readonly label: { x: number; y: number } | null
}

export function levels(): readonly Level[] {
  const field = sample()
  return LEVELS.map((level) => {
    const lines = contour(field, NK, NT, level)
    const d = lines.map((l) => pathD(l.map(([i, j]) => [gx(i), gy(j)] as const))).join('')
    let label: Level['label'] = null
    if (LABELLED.has(level)) {
      // Prefer where the line leaves through the long-expiry (bottom) edge;
      // lines that never reach it leave through the low-strike (left) edge.
      const pts = lines.flat()
      const top = pts.filter(([, j]) => j > NT - 1.01).sort((a, b) => a[0] - b[0])[0]
      const left = pts.filter(([i]) => i < 0.01).sort((a, b) => b[1] - a[1])[0]
      const p = top ?? left
      if (p) label = { x: p[0] / (NK - 1), y: p[1] / (NT - 1) }
    }
    return { level, d, label }
  })
}
