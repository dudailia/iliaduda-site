import type { PosterData } from './poster'

/**
 * The poster's mesh as one string of SVG markup, for the server's first paint
 * (components/figures/surface/Poster.tsx) and for the page to redraw where the
 * live figure does not run (reduced motion, no WebGL2), as the reader moves
 * the shock. Everything in these strings is computed here: numbers, path data
 * and color-mix() expressions, no quotes and no markup from outside.
 */

export const MESH_CSS = '.iv-fig .m path{fill:currentColor;stroke:currentColor;stroke-width:1;stroke-linejoin:round;vector-effect:non-scaling-stroke}'
const NS = 'vector-effect="non-scaling-stroke"'

/**
 * Everything in these strings is computed here: numbers, path data and color-mix() expressions — no quotes, no markup.
 * Without `sheet`, the lit sheet itself is left out, for a still frame that paints it smooth underneath
 * (components/figures/surface/still.ts): the walls, contours and ticks stay vector, over it.
 */
export function meshMarkup(d: PosterData, sheet = true): string {
  const id = (w: string) => `iv-fig-${w}`
  const grads = d.walls
    .map(
      (w) =>
        `<linearGradient id="${id(w.id)}" gradientUnits="userSpaceOnUse" x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}">` +
        w.stops.map((s) => `<stop offset="${s.o}" style="stop-color:${s.c}"/>`).join('') +
        '</linearGradient>',
    )
    .join('')
  return (
    `<defs>${grads}</defs>` +
    (sheet ? `<g class="m">${d.runs.map((r) => `<path class="${r.cls}" d="${r.d}"/>`).join('')}</g>` : '') +
    d.walls.map((w) => `<path d="${w.d}" fill="url(#${id(w.id)})" stroke="url(#${id(w.id)})" stroke-width="1" ${NS}/>`).join('') +
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    d.lines.map((l) => `<path d="${l.d}" style="stroke:${l.c}" stroke-width="${l.w}" ${NS}/>`).join('') +
    `<path d="${d.ticks}" stroke="var(--color-graphite)" stroke-width="1" ${NS}/></g>`
  )
}
