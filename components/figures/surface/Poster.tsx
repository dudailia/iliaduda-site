import type { Params } from '@/lib/surface/ssvi'
import { FRAME_H, poster, type PosterData } from '@/lib/surface/poster'
import type { FrameKind } from '@/lib/surface/view'
import { AxisLabel, Frame, NoteMark } from './marks'

/**
 * The poster: a real frame of the surface from the camera the live renderer
 * starts at, rendered on the server: at calm, where the live figure rests, so
 * it is the finished picture a visit without the signature opens on, and the
 * reduced-motion figure. Each framing has its own (a phone's is taller, from
 * its own camera, with fewer labels), and the screen shows one. On a first
 * visit the pre-paint mark hides everything drawn (`data-fill`), so the
 * surface can form out of the page.
 *
 * The mesh is an image of its own (app/(pages)/iv-surface/poster.svg and
 * poster-tall.svg, lib/surface/posterFile.ts), sent once rather than inlined
 * into the HTML and again into the RSC payload, and only the framing the
 * screen shows is fetched; the labels and notes are drawn here, over it, in the
 * page's type. Where the live figure does not run, the page redraws the mesh
 * inline as the reader moves the shock.
 */

/** Each framing's marks show at its own breakpoint, the one the stage and the picture change at (lib/surface/view.ts, WIDE_QUERY). */
const shown = (kind: FrameKind) => (kind === 'wide' ? 'hidden sm:block' : 'sm:hidden')

/** The mesh's two files: the IV paper's, unless a page draws its own surface (/market's, at the market's stress). */
const IV_MESH = { wide: '/iv-surface/poster.svg', tall: '/iv-surface/poster-tall.svg' } as const

export function Poster({ at, mesh = IV_MESH, notes = true, lazy = false }: { at: Params; mesh?: { wide: string; tall: string }; notes?: boolean; lazy?: boolean }) {
  const wide = poster(at, 'wide')
  const tall = poster(at, 'tall')
  return (
    <div data-iv-poster="" className="absolute inset-0">
      <Frame>
        <picture>
          <source media="(width < 40rem)" srcSet={mesh.tall} width={tall.width} height={FRAME_H} />
          {/* The figure's picture, and on a laptop the page's largest: asked for first, unless the page defers it. */}
          <img data-fill="" data-mesh="" src={mesh.wide} width={wide.width} height={FRAME_H} alt="" decoding="async" loading={lazy ? 'lazy' : undefined} fetchPriority={lazy ? undefined : 'high'} className="absolute inset-0 h-full w-full" />
        </picture>
        <Marks d={wide} kind="wide" notes={notes} />
        <Marks d={tall} kind="tall" notes={notes} />
      </Frame>
    </div>
  )
}

/**
 * The strike axis's title, a few pixels up: it stands between the 70% tick above it and the 100% one below, which come
 * closer as the poster gets smaller while the words keep their size. Where /market's views stand side by side (its
 * laptop layout, and on paper) the title sat on the 100%, the one tick a reader looks for; 6px clears both down to the
 * smallest surface drawn, 240px tall.
 */
const TITLE_LIFT = { id: 'kt', px: 6 } as const

function Marks({ d, kind, notes }: { d: PosterData; kind: FrameKind; notes: boolean }) {
  return (
    <>
      {d.labels.map((l) => (
        <AxisLabel
          key={l.id}
          text={l.text}
          align={l.align}
          kind={l.kind}
          className={shown(kind)}
          style={{ left: `${(l.x * 100).toFixed(2)}%`, top: l.id === TITLE_LIFT.id ? `calc(${(l.y * 100).toFixed(2)}% - ${TITLE_LIFT.px}px)` : `${(l.y * 100).toFixed(2)}%` }}
        />
      ))}
      {(notes ? d.notes : []).map((n) => (
        <NoteMark
          key={n.id}
          note={n.id}
          lead={n.lead}
          text={n.text}
          dx={n.dx}
          dy={n.dy}
          align={n.align}
          className={shown(kind)}
          style={{ left: `${(n.x * 100).toFixed(2)}%`, top: `${(n.y * 100).toFixed(2)}%` }}
        />
      ))}
    </>
  )
}
