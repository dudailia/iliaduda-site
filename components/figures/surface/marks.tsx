import type { CSSProperties, ReactNode, Ref } from 'react'

/**
 * Markup shared by the server poster and the live layer: the frame the
 * surface is fitted to, axis labels, and the on-surface notes. One source, so
 * the live labels land where the poster's were.
 */

/**
 * The two framings' aspects (lib/surface/view.ts, FRAMES), as classes: a phone's below `sm`, the wide one from it.
 * The stage has the same aspect, so the frame fills it. Written out whole for Tailwind to find; tests/surface-dynamics
 * checks them against FRAMES.
 */
export const FRAME_ASPECT = 'aspect-[1.1] sm:aspect-[1.62]'

/**
 * A box of the frame's aspect, as large as fits and centred — SVG's
 * xMidYMid meet, in CSS: an inset-0 box with auto margins, an aspect ratio,
 * and both maxima at 100%, whose constraints transfer through the ratio. The
 * live renderer letterboxes its projection the same way.
 */
export function Frame({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`pointer-events-none absolute inset-0 m-auto max-h-full max-w-full ${FRAME_ASPECT} ${className}`}>{children}</div>
}

const ALIGN: Record<string, string> = {
  center: 'translate(-50%, -50%)',
  left: 'translate(0, -50%)',
  right: 'translate(-100%, -50%)',
  above: 'translate(-50%, -100%)',
}

/**
 * An axis's word, placed by the renderer (or the poster) at its projected point. `moving` promotes it to its own layer,
 * for a live figure that moves it every frame; a poster's stand still. A title sits on a paper chip, as the notes do,
 * so an edge of the sheet or a line of the mesh behind it never takes its contrast.
 */
export function AxisLabel({ text, align, kind, className = '', style, ref, moving = false }: { text: string; align: string; kind: string; className?: string; style?: CSSProperties; ref?: Ref<HTMLSpanElement>; moving?: boolean }) {
  return (
    <span ref={ref} className={`absolute top-0 left-0 ${moving ? 'will-change-transform' : ''} ${className}`} style={style}>
      <span
        className={`block font-mono text-meta leading-none whitespace-nowrap ${kind === 'title' ? 'rounded-sm bg-paper/90 px-1 py-0.5 text-ink' : 'text-graphite [text-shadow:0_0_2px_var(--color-paper),0_0_4px_var(--color-paper)]'}`}
        style={{ transform: ALIGN[align] }}
      >
        {text}
      </span>
    </span>
  )
}

const NOTE_ALIGN: Record<string, string> = {
  right: 'translate(-100%, -100%)',
  left: 'translate(0, -100%)',
  center: 'translate(-50%, -100%)',
}

/**
 * Where a note's words hang from its point, in CSS pixels (negative is up): at its own offset `dy` above it, unless that
 * would put them past the top of the stage, as the surface's peak rises in a shock; then as low as keeps them whole,
 * the leader shortening to no less than 10px; and where even that leaves no room, 10px below the point instead.
 * `y` is the point's height in the stage, `h` the words'. `below`: the words hang below already, and stay there until
 * 16px of room has opened above, so a peak hovering at the edge never flips them back and forth.
 */
export function noteRise(y: number, dy: number, h: number, top = 4, below = false): number {
  const up = Math.max(dy, top + h - y)
  return up <= (below ? -16 : -10) ? up : 10
}

/** Hangs a note's words `dy` from its point, above it or (for a positive `dy`) below: the leader's end moves with them. */
export function setNoteRise(el: HTMLElement, dy: number, align: string) {
  const words = el.querySelector<HTMLElement>('[data-note-words]')
  const lead = el.querySelector('line')
  if (words) {
    // Moved by its transform, never its top, so following the point runs no layout.
    words.style.top = '0px'
    const a = dy > 0 ? NOTE_ALIGN[align]!.replace('-100%)', '0)') : NOTE_ALIGN[align]!
    words.style.transform = `translate3d(0, ${dy.toFixed(1)}px, 0) ${a}`
  }
  lead?.setAttribute('y2', String(dy))
}

/**
 * A note pinned to the surface: a ring on the point, a leader, and the words.
 * Positioned by its anchor; the leader and text hang off it in CSS pixels, so
 * the live layer moves one transform per note.
 */
export function NoteMark({
  lead,
  text,
  dx,
  dy,
  align,
  className = '',
  style,
  ref,
  note,
  moving = false,
}: {
  lead: string
  text: string
  dx: number
  dy: number
  align: string
  className?: string
  style?: CSSProperties
  ref?: Ref<HTMLSpanElement>
  /** Which note it is, for the still frame's redraw to move it with the surface. */
  note?: string
  /** On its own layer: the live figure moves it every frame (a poster's notes stand still). */
  moving?: boolean
}) {
  return (
    <span ref={ref} data-note={note} className={`absolute top-0 left-0 ${moving ? 'will-change-transform' : ''} ${className}`} style={style}>
      <svg aria-hidden className="absolute top-0 left-0 overflow-visible" width="1" height="1">
        <line x1={0} y1={0} x2={dx} y2={dy} stroke="var(--color-ink)" strokeWidth={1} />
        <circle cx={0} cy={0} r={3.5} fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth={1.25} />
      </svg>
      <span
        data-note-words=""
        className="absolute block w-max max-w-[12rem] rounded-sm bg-paper/90 px-1.5 py-0.5 text-note leading-snug text-ink sm:max-w-[16rem]"
        style={{ left: dx, top: dy, transform: NOTE_ALIGN[align] }}
      >
        <span className="font-semibold">{lead}:</span> {text}
      </span>
    </span>
  )
}
