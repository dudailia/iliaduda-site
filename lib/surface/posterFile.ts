import { palette, type Palette } from '@/lib/palette'
import { FRAME_H, poster, RAMP_CSS, STAGE_CSS } from './poster'
import { MESH_CSS, meshMarkup } from './posterMarkup'
import type { Params } from './ssvi'
import type { FrameKind } from './view'

/**
 * The IV figure's poster as a file of its own, one for each framing
 * (app/(pages)/iv-surface/poster.svg and poster-tall.svg, of which a reader
 * fetches the one their screen shows), so the reader is sent it once rather
 * than twice (in the HTML and again in the page's RSC payload). The mesh is the markup the page would have
 * inlined (lib/surface/posterMarkup.ts); as an image it cannot read the page's
 * colour tokens, so its root defines the six itself, for both colour schemes,
 * read from the stylesheet (lib/palette.ts), and the stage's ramp over them.
 * No text: the axis labels and notes stay in the page, over it.
 */
export function surfacePosterSvg(p: Params, kind: FrameKind = 'wide'): string {
  const d = poster(p, kind)
  const { light, dark } = palette()
  const tokens = (c: Palette) =>
    `--color-ink:${c.ink};--color-paper:${c.paper};--color-graphite:${c.graphite};--color-rule:${c.rule};--color-indigo:${c.indigo};--color-indigo-wash:${c['indigo-wash']}`
  const style = `:root{${tokens(light)}}@media (prefers-color-scheme:dark){:root{${tokens(dark)}}}` + STAGE_CSS + RAMP_CSS + MESH_CSS + d.css
  return `<svg xmlns="http://www.w3.org/2000/svg" class="iv-fig" width="${d.width}" height="${FRAME_H}" viewBox="0 0 ${d.width} ${FRAME_H}"><style>${style}</style>${meshMarkup(d)}</svg>`
}
