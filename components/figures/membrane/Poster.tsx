import type { wire } from '@/lib/membrane/view'

/** The poster's box: the stage's own aspect on a laptop, so the live drum takes over where the drawn one stands. */
export const PW = 1000
export const PH = 620

type P = readonly (readonly [number, number])[]
const pts = (p: P) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

/** A ring cut where it passes behind the drum's middle: runs of points, near or far, each sharing its ends. */
function runs(p: P, far: readonly boolean[]): { p: P; far: boolean }[] {
  const out: { p: [number, number][]; far: boolean }[] = []
  p.forEach((q, j) => {
    const last = out[out.length - 1]
    if (last && last.far === far[j]) last.p.push([q[0], q[1]])
    else {
      if (last) last.p.push([q[0], q[1]])
      out.push({ p: [[q[0], q[1]]], far: far[j]! })
    }
  })
  return out
}

/**
 * The drum as a drawing: the same mesh, camera and solution as the live figure (lib/membrane/view.ts), its rings in
 * indigo (the shape, which is the claim), quieter on the drum's far half so the near side reads in front, its spokes
 * as context and its rim in ink. The server's first paint, and the still frame where the live drum does not run,
 * redrawn for the shape and modes the reader picks.
 */
export function Poster({ w }: { w: ReturnType<typeof wire> }) {
  return (
    <svg viewBox={`0 0 ${PW} ${PH}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" aria-hidden>
      {w.spokes.map((s, i) => (
        <polyline key={`s${i}`} points={pts(s)} fill="none" stroke="var(--color-rule)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {w.rings.flatMap((s, i) =>
        runs(s, w.far[i]!).map((r, k) => (
          <polyline
            key={`r${i}-${k}`}
            points={pts(r.p)}
            fill="none"
            stroke="var(--color-indigo)"
            strokeOpacity={r.far ? 0.32 : 1}
            strokeWidth={r.far ? 1 : 1.25}
            vectorEffect="non-scaling-stroke"
          />
        )),
      )}
      <polyline points={pts(w.rim)} fill="none" stroke="var(--color-ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
