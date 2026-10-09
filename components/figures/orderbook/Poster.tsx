import type { Flow } from '@/lib/market/flow'
import { LABEL_FS, POSTERS, posterOf, type PosterGeometry, type PosterLabel } from '@/lib/orderbook/poster'

/**
 * A real frame of the simulation, drawn on the server: the book's history as
 * ridgelines through the live camera, the price river through the valley and
 * the recent trades as dots. The drawing is an image of its own
 * (app/(pages)/order-book/poster-*.svg), fetched in the one arrangement the
 * screen shows; its labels are drawn here, over it, in the page's own type,
 * which an image cannot load. It is the figure until the canvas has drawn,
 * and the whole figure for a reader who asked for reduced motion. On a first
 * visit the pre-paint mark hides everything drawn (`data-fill`), so the
 * terrain can rise out of the page.
 */
export function Poster({ sim, label }: { sim: Flow; label: string }) {
  const [wide, narrow, short, low] = POSTERS
  return (
    <>
      <picture>
        {/* Short where the stage is a phone turned sideways (globals.css, the short variant): its own wide, low frame. */}
        <source media="(min-width: 36rem) and (max-height: 30rem)" srcSet="/order-book/poster-short.svg" width={short.w} height={short.h} />
        {/* Low where a phone held upright is under 600px tall (an iPhone SE): its stage is wider than tall, and its own. */}
        <source media="(max-height: 37.5rem) and (orientation: portrait)" srcSet="/order-book/poster-low.svg" width={low.w} height={low.h} />
        {/* Narrow where the stage is taller than wide, as the live figure frames it: a phone held upright. A portrait
            tablet's stage sits in the text column and is wider than tall, so it gets the wide frame. */}
        {/* Not under 37.5rem tall (an iPhone SE): there the stage is wider than tall, and the live figure frames it wide. */}
        <source media="(width < 40rem) and (orientation: portrait) and (min-height: 37.5001rem)" srcSet="/order-book/poster-narrow.svg" width={narrow.w} height={narrow.h} />
        <img
          data-fill=""
          src="/order-book/poster-wide.svg"
          width={wide.w}
          height={wide.h}
          alt={label}
          decoding="async"
          className="absolute inset-0 size-full object-contain"
        />
      </picture>
      <Labels g={posterOf(sim, 'wide')} className="max-sm:portrait:hidden short:hidden low:hidden" />
      <Labels g={posterOf(sim, 'narrow')} className="hidden max-sm:portrait:block low:hidden" />
      <Labels g={posterOf(sim, 'short')} className="hidden short:block" />
      <Labels g={posterOf(sim, 'low')} className="hidden low:block" />
    </>
  )
}

function Labels({ g, className }: { g: PosterGeometry; className: string }) {
  return (
    <svg
      data-fill=""
      aria-hidden
      viewBox={`0 0 ${g.w} ${g.h}`}
      preserveAspectRatio="xMidYMid meet"
      className={`absolute inset-0 size-full ${className}`}
    >
      <g className="font-mono" fontSize={LABEL_FS} textAnchor="middle" dominantBaseline="central">
        {g.labels.map((l) => (
          <Label key={l.text} l={l} />
        ))}
      </g>
    </svg>
  )
}

/** The live overlay's colors for each kind of label (components/figures/orderbook/renderer.ts): the price in ink. */
const LOOK: Record<PosterLabel['kind'], { back: string; opacity: number; text: string }> = {
  tag: { back: 'var(--color-ink)', opacity: 1, text: 'var(--color-paper)' },
  wall: { back: 'var(--color-paper)', opacity: 0.85, text: 'var(--color-ink)' },
  time: { back: 'var(--color-paper)', opacity: 0.9, text: 'var(--color-graphite)' },
  tick: { back: 'var(--color-paper)', opacity: 0.9, text: 'var(--color-graphite)' },
}

function Label({ l }: { l: PosterLabel }) {
  const k = LOOK[l.kind]
  const r = (v: number) => Math.round(v * 10) / 10
  return (
    <>
      <rect x={l.x0} y={l.y0} width={r(l.x1 - l.x0)} height={r(l.y1 - l.y0)} rx={4} fill={k.back} fillOpacity={k.opacity} />
      {/* On each text: WebKit does not inherit dominant-baseline from the group, and the words sat above their pills. */}
      <text x={r((l.x0 + l.x1) / 2)} y={r((l.y0 + l.y1) / 2)} fill={k.text} dominantBaseline="central">
        {l.text}
      </text>
    </>
  )
}
