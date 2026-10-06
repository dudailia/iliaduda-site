import type { Flow } from '@/lib/market/flow'
import { palette, type Palette } from '@/lib/palette'
import { POSTERS, posterOf, type Variant } from './poster'

export { POSTERS, type Variant }

/**
 * The order book's poster as a file of its own (app/(pages)/order-book/
 * poster-*.svg), so a reader fetches it once, in the one arrangement their
 * screen shows, instead of two inline copies sent twice (in the HTML and again
 * in the page's RSC payload). As an image it cannot read the page's color
 * tokens, so it carries both palettes under the reader's own color-scheme
 * setting; and it cannot load the page's fonts, so it has no text: the labels
 * stay in the page, drawn over it (components/figures/orderbook/Poster.tsx).
 */
export function posterSvg(sim: Flow, variant: Variant): string {
  const g = posterOf(sim, variant)
  const { light, dark } = palette()
  const tokens = (c: Palette) => `--p:${c.paper};--i:${c.indigo};--w:${c['indigo-wash']};--k:${c.ink};--g:${c.graphite};--r:${c.rule}`
  // The walls as the live shader colors them (components/figures/orderbook/renderer.ts): both indigo, the figure's
  // claim, bids the lighter and asks the deeper, the past fading by day to a wash (55%) and by night to the paper
  // (94%); the price between them in ink, with a paper halo by day and a glow by night. Mixed from the six tokens,
  // never a seventh color.
  const style =
    `:root{${tokens(light)};--bn:color-mix(in oklab,var(--i) 60%,var(--w));--sn:color-mix(in oklab,var(--i) 82%,var(--w));--f:color-mix(in oklab,var(--p) 50%,var(--w));--fk:.55;--h:var(--p);--ho:.55;--hw:8}` +
    `@media (prefers-color-scheme:dark){:root{${tokens(dark)};--bn:color-mix(in oklab,var(--i) 36%,var(--w));--sn:color-mix(in oklab,var(--i) 72%,var(--w));--f:var(--p);--fk:.94;--h:var(--k);--ho:.22;--hw:12}}` +
    'path{stroke-width:1;stroke-linejoin:round}' +
    '.b{fill:color-mix(in oklab,var(--f) calc(var(--a)*var(--fk)*100%),var(--bn));stroke:var(--i)}' +
    '.s{fill:color-mix(in oklab,var(--f) calc(var(--a)*var(--fk)*100%),var(--sn));stroke:var(--i)}' +
    // Nothing stands in front of now: the front row's ridge is the terrain's edge, drawn in ink, with the page below it.
    '.n path{stroke:var(--k);fill:var(--p)}' +
    // The price river in ink, with the live figure's halo; the trades in ink.
    '.w,.r{fill:none;stroke-linecap:round}.w{stroke:var(--h);stroke-width:var(--hw);stroke-opacity:var(--ho)}.r{stroke:var(--k);stroke-width:2}circle{fill:var(--k)}'
  let body = ''
  g.rows.forEach((r, i) => {
    body += `<g style="--a:${r.fade}"${i === g.rows.length - 1 ? ' class="n"' : ''} stroke-opacity="${(0.2 + 0.8 * r.near).toFixed(2)}">`
    if (r.bid.d) body += `<path class="b" d="${r.bid.d}" stroke-dasharray="${r.bid.dash}"/>`
    if (r.ask.d) body += `<path class="s" d="${r.ask.d}" stroke-dasharray="${r.ask.dash}"/>`
    body += '</g>'
  })
  body += `<path class="w" d="${g.river}"/><path class="r" d="${g.river}"/>`
  // Trades, in quarters of opacity: the older, the fainter. Drawn over the walls rather than among them, they are
  // held a little under full strength, so the valley is not a string of beads.
  const bins = new Map<number, string>()
  for (const [x, y, rad, a] of g.dots) {
    const o = Math.max(0.25, Math.round(a * 0.8 * 4) / 4)
    bins.set(o, (bins.get(o) ?? '') + `<circle cx="${x}" cy="${y}" r="${rad}"/>`)
  }
  for (const [o, c] of [...bins].sort((p, q) => p[0] - q[0])) body += o === 1 ? c : `<g opacity="${o}">${c}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${g.w}" height="${g.h}" viewBox="0 0 ${g.w} ${g.h}"><style>${style}</style>${body}</svg>`
}
