import { syntheticValue as value } from '@/content/synthetic'
import { ConvergenceLive } from './membrane/Convergence'

/** A Bessel function's name, its order a subscript: notation, not a figure's number. */
const J = (n: number) => (
  <>
    J<sub>{n}</sub>
  </>
)

/** Fig. 2 of /membrane: the exercises' radial profiles against their Fourier–Bessel series. */
export function MembraneConvergence() {
  return (
    <ConvergenceLive
      caption={
        <>
          Section 3.3&rsquo;s four profiles on a radius of {value('mbRadius')}, each expanded in {J(0)} or {J(1)} as the exercises do,
          to as many terms as the reader keeps. The error, as a share of the profile, falls with every term added; where a profile does not
          vanish at the rim the series still overshoots next to it, since every term is zero there, and adding terms only
          narrows the overshoot.
        </>
      }
    />
  )
}
