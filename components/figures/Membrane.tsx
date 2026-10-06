import { syntheticValue as value } from '@/content/synthetic'
import { prepaint } from '@/lib/stage/prepaint'
import { besselZeros } from '@/lib/membrane/bessel'
import { expand, SHAPES } from '@/lib/membrane/expand'
import { MODES_START, table, wire } from '@/lib/membrane/view'
import { MembraneLive } from './membrane/Live'
import { Poster, PH, PW } from './membrane/Poster'

/**
 * Fig. 1 of /membrane: the drum. The poster is the opening shape in its opening modes, drawn here at build time from
 * the same solution the browser rings live (lib/membrane/).
 */
export function MembraneFigure() {
  const first = expand(SHAPES[0]!, MODES_START)
  const zeros = (n: number) => besselZeros(n, 3).map((z) => z.toFixed(4))
  const radius = value('mbRadius')
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: prepaint('membrane') }} />
      <MembraneLive
        poster={<Poster w={wire(table(first), 0, 1, PW, PH)} />}
        caption={
          <>
            A drum of radius {radius}, fixed at its rim. Each mode is a Bessel function across the drum times a sine or cosine
            round it, and rings at its own frequency, a zero of that Bessel function: the drum is not harmonic, as a
            string is, because those zeros are not multiples of one another. The initial shapes are the exercises&rsquo;;
            each is drawn as the sum of the modes kept, so a shape that does not vanish at the rim needs many of them
            there. Up to {value('mbModesMax')} modes.
          </>
        }
        table={
          <table>
            <caption>The first zeros of the Bessel functions, which set the drum&rsquo;s frequencies</caption>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">First</th>
                <th scope="col">Second</th>
                <th scope="col">Third</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((n) => (
                <tr key={n}>
                  <th scope="row">{`J${n}`}</th>
                  {zeros(n).map((z) => (
                    <td key={z}>{z}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
    </>
  )
}
