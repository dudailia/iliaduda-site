import { expand, SHAPES } from '../membrane/expand'
import { MODES_START, table, wire, type Table } from '../membrane/view'
import { TH, TW, whole, type Pts, type Shape } from './shape'

/**
 * /membrane's Fig. 1 in miniature: the drum the page opens on (its first shape, in the modes it starts with) as a
 * wireframe through its own camera, fitted to the box. Its rings' near halves are the claim; their far halves, the
 * spokes and the rim are the context, so the rings read in front rather than as a knot. Every fifth ring of the
 * figure's, so it stays legible at a thumbnail's size. `t` is the drum's own time: 0 on the thumbnail; the live
 * miniature lets it ring.
 */
const RING_STEP = 8
let cached: { tb: Table; fit: (p: Pts) => Pts } | null = null

/** One scale and centre for every moment of a period, so the drum fills its box and never breathes in size. */
function fitted(tb: Table): (p: Pts) => Pts {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  const period = (2 * Math.PI) / tb.e.lambda[0]!
  for (let s = 0; s < 24; s++) {
    const w = wire(tb, (s / 24) * period, 1, TW, TH, 0, RING_STEP)
    for (const [x, y] of [...w.rim, ...w.rings.flat(), ...w.spokes.flat()]) {
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
  }
  const k = Math.min((0.94 * TW) / (x1 - x0), (0.9 * TH) / (y1 - y0))
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  return (p) => p.map(([x, y]) => [TW / 2 + (x - cx) * k, TH / 2 + (y - cy) * k] as const)
}

/** A ring cut where it passes behind the drum's middle, near and far runs sharing their ends. */
function halves(ring: Pts, far: readonly boolean[]): { near: Pts[]; far: Pts[] } {
  const out = { near: [] as [number, number][][], far: [] as [number, number][][] }
  let run: [number, number][] = []
  let side: boolean | null = null
  ring.forEach(([x, y], j) => {
    if (side !== null && far[j] !== side) {
      run.push([x, y])
      ;(side ? out.far : out.near).push(run)
      run = []
    }
    side = far[j]!
    run.push([x, y])
  })
  if (run.length > 1) (side ? out.far : out.near).push(run)
  return out
}

/**
 * Every `k`-th point, and the last: at a thumbnail's size (9rem) a ring of 49 points is as smooth as one of 97, and every
 * point ships twice (the HTML and the page's payload).
 */
const every = <T,>(a: readonly T[], k: number) => a.filter((_, i) => i % k === 0 || i === a.length - 1)

export function membraneShape(t = 0): Shape {
  if (!cached) {
    const tb = table(expand(SHAPES[0]!, MODES_START))
    cached = { tb, fit: fitted(tb) }
  }
  const { tb, fit } = cached
  const w = wire(tb, t, 1, TW, TH, 0, RING_STEP)
  const near: Pts[] = []
  const far: Pts[] = []
  w.rings.forEach((r, i) => {
    const h = halves(every(r, 2), every(w.far[i]!, 2))
    near.push(...h.near)
    far.push(...h.far)
  })
  const f = (p: Pts) => whole(fit(p))
  // Eight spokes, each sampled every fourth ring.
  const spokes = w.spokes.filter((_, i) => i % 2 === 0).map((sp) => every(sp, 4))
  return { context: [...spokes.map(f), ...far.map(f), f(every(w.rim, 2))], claim: near.map(f) }
}
