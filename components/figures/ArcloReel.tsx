import { fact, type FactKey } from '@/content/facts'
import { ReelLive } from './arclo/Reel'

/**
 * Fig. 2 of /arclo: the Route of the week template's transition reel, rendered with Remotion from the template's own
 * parts and tokens (arclo-portfolio @7b08ccc, src/pieces/motion/templateReel.tsx), served from this site.
 */

const words = (k: FactKey) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][fact(k).value] ?? String(fact(k).value)

export function ArcloReel() {
  return (
    <ReelLive
      src="/arclo/template-reel.mp4"
      poster="/arclo/template-reel.jpg"
      size={720}
      title={`One Route card through ${words('arReelStates')} routes and both colorways, rendered from the same template.`}
      subtitle={`Arclo · Route of the week · rendered with Remotion · a ${fact('arReelSeconds').value}-second loop`}
      caption={
        <>
          At each change the words step out, only the ground crossfades, the start slides to the new route and the route
          draws on a spring with the rider on it; the number, the label and the footer stay on screen and change color
          with the ground. The last change returns to the first state, so the reel loops.
        </>
      }
      table={
        <table>
          <caption>The routes the card passes through, in order.</caption>
          <tbody>
            <tr><th scope="row">First</th><td>Campus Center to Fenway, by e-bike, on Chalk</td></tr>
            <tr><th scope="row">Second</th><td>Library to Seaport, by e-scooter, on Asphalt</td></tr>
            <tr><th scope="row">Third</th><td>Main quad to Back Bay, by e-bike, on Chalk</td></tr>
            <tr><th scope="row">Fourth</th><td>Student center to Fenway, by e-scooter, on Asphalt</td></tr>
          </tbody>
        </table>
      }
    />
  )
}
