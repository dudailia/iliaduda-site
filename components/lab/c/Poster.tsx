import { params, PEAK, amplitude } from '@/lib/lab/c/shock'
import { FRAME_H, poster, RAMP_CSS, type PosterData } from '@/lib/lab/c/poster'
import { AxisLabel, Frame, NoteMark } from './marks'

/**
 * The poster: a real frame of the surface at the peak of the shock, from the
 * camera the live renderer starts at, rendered on the server. One picture for
 * every screen; the phone keeps fewer labels (CSS). Carries `data-lab-poster`
 * for the lab's reduced-motion gate.
 *
 * The mesh is written as one string of SVG markup rather than as several
 * hundred React elements. The markup is the same, but React hydrates one node
 * instead of walking every path, and the RSC payload carries one string
 * instead of a JSON record per path — both were measurable on a phone.
 */

const MESH_CSS = '.lab-c .m path{fill:currentColor;stroke:currentColor;stroke-width:1;stroke-linejoin:round;vector-effect:non-scaling-stroke}'
const NS = 'vector-effect="non-scaling-stroke"'

/** Everything in these strings is computed here: numbers, path data and color-mix() expressions — no quotes, no markup. */
function meshMarkup(d: PosterData): string {
  const id = (w: string) => `lab-c-${w}`
  const grads = d.walls
    .map(
      (w) =>
        `<linearGradient id="${id(w.id)}" gradientUnits="userSpaceOnUse" x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}">` +
        w.stops.map((s) => `<stop offset="${s.o}" style="stop-color:${s.c}"/>`).join('') +
        '</linearGradient>',
    )
    .join('')
  return (
    `<defs>${grads}<filter id="${id('soft')}" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="16"/></filter></defs>` +
    `<g fill="#000" fill-opacity="0.09" filter="url(#${id('soft')})">${d.shadow.map((s) => `<path d="${s}"/>`).join('')}</g>` +
    `<g class="m">${d.runs.map((r) => `<path class="${r.cls}" d="${r.d}"/>`).join('')}</g>` +
    d.walls.map((w) => `<path d="${w.d}" fill="url(#${id(w.id)})" stroke="url(#${id(w.id)})" stroke-width="1" ${NS}/>`).join('') +
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    d.lines.map((l) => `<path d="${l.d}" style="stroke:${l.c}" stroke-width="${l.w}" ${NS}/>`).join('') +
    `<path d="${d.ticks}" stroke="var(--color-graphite)" stroke-width="1" ${NS}/></g>`
  )
}

const shown = (only: string | undefined) => (only === 'wide' ? 'hidden sm:block' : only === 'tall' ? 'sm:hidden' : '')

export function Poster() {
  const d = poster(params(amplitude(PEAK)))
  return (
    <div data-lab-poster className="absolute inset-0">
      <style>{MESH_CSS + RAMP_CSS + d.css}</style>
      <Frame>
        <svg
          viewBox={`0 0 ${d.width} ${FRAME_H}`}
          className="absolute inset-0 h-full w-full overflow-visible"
          aria-hidden
          dangerouslySetInnerHTML={{ __html: meshMarkup(d) }}
        />
        {d.labels.map((l) => (
          <AxisLabel
            key={l.id}
            text={l.text}
            align={l.align}
            kind={l.kind}
            className={shown(l.only)}
            style={{ left: `${(l.x * 100).toFixed(2)}%`, top: `${(l.y * 100).toFixed(2)}%` }}
          />
        ))}
        {d.notes.map((n) => (
          <NoteMark
            key={n.id}
            lead={n.lead}
            text={n.text}
            dx={n.dx}
            dy={n.dy}
            align={n.align}
            className={shown(n.kind)}
            style={{ left: `${(n.x * 100).toFixed(2)}%`, top: `${(n.y * 100).toFixed(2)}%` }}
          />
        ))}
      </Frame>
    </div>
  )
}
