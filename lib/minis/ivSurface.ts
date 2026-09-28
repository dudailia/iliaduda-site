import { iv, type Params } from '../surface/ssvi'
import { apply, camera, EXPIRY_TICKS, kOfU, mvp, STRIKE_TICKS, tOfV, wx, wy, wz } from '../surface/view'
import { TH, TW, whole, type Shape } from './shape'

/**
 * /iv-surface's Fig. 1 as a wireframe through its own camera: the smiles at the ticked expiries, with the one-month
 * smile (the steep one a shock lifts) as the claim, and the strike lines across them as context. `p` is the surface:
 * calm on the thumbnail; the live miniature breathes a shock into it.
 */
export function ivSurfaceShape(p: Params): Shape {
  const m = mvp('wide', camera('wide'))
  const at = (k: number, T: number) => {
    const q = apply(m, wx(k), wy(iv(p, k, T)), wz(T))
    return [((q[0] / q[3]) * 0.5 + 0.5) * TW, (1 - ((q[1] / q[3]) * 0.5 + 0.5)) * TH] as const
  }
  const smile = (T: number) => whole(Array.from({ length: 25 }, (_, i) => at(kOfU(i / 24), T)))
  const across = (K: number) => whole(Array.from({ length: 17 }, (_, j) => at(Math.log(K), tOfV(j / 16))))
  const [first, ...rest] = EXPIRY_TICKS
  return {
    context: [...rest.map(([T]) => smile(T)), ...STRIKE_TICKS.map((K) => across(K))],
    claim: [smile(first[0])],
  }
}
