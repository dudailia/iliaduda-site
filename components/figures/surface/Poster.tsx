import type { Params } from '@/lib/surface/ssvi'
import { FRAME_H, poster } from '@/lib/surface/poster'
import { AxisLabel, Frame, NoteMark } from './marks'

/**
 * The poster: a real frame of the surface from the camera the live renderer
 * starts at, rendered on the server: at calm, where the live figure rests, so
 * it is the finished picture a visit without the signature opens on, and the
 * reduced-motion figure. One picture for every screen; the phone keeps fewer
 * labels (CSS). On a first visit the pre-paint mark hides everything drawn
 * (`data-fill`), so the surface can form out of the page.
 *
 * The mesh is an image of its own (app/(pages)/iv-surface/poster.svg,
 * lib/surface/posterFile.ts), sent once rather than inlined into the HTML and
 * again into the RSC payload; the labels and notes are drawn here, over it, in
 * the page's type. Where the live figure does not run, the page redraws the
 * mesh inline as the reader moves the shock.
 */

const shown = (only: string | undefined) => (only === 'wide' ? 'hidden sm:block' : only === 'tall' ? 'sm:hidden' : '')

export function Poster({ at }: { at: Params }) {
  const d = poster(at)
  return (
    <div data-iv-poster="" className="absolute inset-0">
      <Frame>
        {/* eslint-disable-next-line @next/next/no-img-element -- drawn at build time and served as it is; next/image would only add a client runtime */}
        <img data-fill="" data-mesh="" src="/iv-surface/poster.svg" width={d.width} height={FRAME_H} alt="" decoding="async" className="absolute inset-0 h-full w-full" />
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
            note={n.id}
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
