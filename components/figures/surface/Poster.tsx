import type { Params } from '@/lib/surface/ssvi'
import { FRAME_H, poster, RAMP_CSS } from '@/lib/surface/poster'
import { MESH_CSS, meshMarkup } from '@/lib/surface/posterMarkup'
import { AxisLabel, Frame, NoteMark } from './marks'

/**
 * The poster: a real frame of the surface from the camera the live renderer
 * starts at, rendered on the server: at calm, where the live figure rests, so
 * it is the finished picture a visit without the signature opens on, and the
 * reduced-motion figure. One picture for every screen; the phone keeps fewer
 * labels (CSS). On a first visit the pre-paint mark hides everything drawn
 * (`data-fill`), so the surface can form out of the page.
 *
 * The mesh is one string of SVG markup (lib/surface/posterMarkup.ts) rather
 * than several hundred React elements: React hydrates one node, and the RSC
 * payload carries one string, both measurable on a phone. Where the live
 * figure does not run, the page redraws that string as the reader moves the
 * shock.
 */

const shown = (only: string | undefined) => (only === 'wide' ? 'hidden sm:block' : only === 'tall' ? 'sm:hidden' : '')

export function Poster({ at }: { at: Params }) {
  const d = poster(at)
  return (
    <div data-iv-poster="" className="absolute inset-0">
      <style>{MESH_CSS + RAMP_CSS + d.css}</style>
      <Frame>
        <svg
          data-fill=""
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
