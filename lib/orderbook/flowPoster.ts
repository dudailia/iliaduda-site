import { HAWKES, MARKET_BUY, MARKET_SELL, type Flow } from '@/lib/market/flow'
import { palette, type Palette } from '@/lib/palette'
import { HEIGHT, LAM_MID, LANE_H, QUEUE_H, QUEUE_MID, lamY, laneTop, queueY } from './flowLayout'
import { LANES, SECONDS, flowFrame } from './flowview'

/**
 * Fig. 2's still frame as a file of its own (app/(pages)/order-book/
 * flow.svg): the strips at the still frame's moment, the same geometry the
 * canvas draws (lib/orderbook/flowLayout.ts), stretched across whatever width
 * the stage has. Its strokes keep their weight however it stretches; it
 * carries both palettes, and no text: its labels, and the rules they name,
 * are the page's, over both it and the live canvas.
 */

const W = 1000
const COLS = 160
const CW = W / COLS
const r1 = (v: number) => Math.round(v * 10) / 10

export function flowPosterSvg(f: Flow): string {
  const fr = flowFrame(f, { t0: f.t - SECONDS, t1: f.t, cols: COLS }, HAWKES)
  const { light, dark } = palette()
  const tokens = (c: Palette) => `--p:${c.paper};--k:${c.ink};--g:${c.graphite};--r:${c.rule};--i:${c.indigo};--w:${c['indigo-wash']}`
  const style =
    `:root{${tokens(light)}}@media (prefers-color-scheme:dark){:root{${tokens(dark)}}}` +
    'path{vector-effect:non-scaling-stroke}' +
    // Limit orders and cancels are the texture; market orders, the ones that trade, are ink.
    '.o1,.o2,.o3{fill:var(--g)}.o1{opacity:.18}.o2{opacity:.3}.o3{opacity:.45}.m1,.m2,.m3{fill:var(--k)}' +
    // The part of each intensity that comes on its own (μ) in grey, the part set off by earlier orders in wash.
    '.own{fill:var(--r)}.set{fill:var(--w)}.lam{fill:none;stroke:var(--k);stroke-width:1;stroke-linejoin:round}' +
    '.a{fill:var(--r);stroke:var(--g);stroke-width:1;stroke-linejoin:round}' +
    '.gone{fill:none;stroke:var(--i);stroke-width:1.5}'
  let body = ''

  // Orders: a mark per column with events in it, fainter for one or two, merged into runs.
  LANES.forEach((type, lane) => {
    const market = type === MARKET_BUY || type === MARKET_SELL
    const y = laneTop(lane)
    for (const bin of [1, 2, 3]) {
      let d = ''
      for (let c = 0; c < COLS; ) {
        const n = fr.counts[lane * COLS + c]!
        if (Math.min(3, n) !== bin) {
          c++
          continue
        }
        let e = c + 1
        while (e < COLS && Math.min(3, fr.counts[lane * COLS + e]!) === bin) e++
        d += `M${c * CW} ${y}h${(e - c) * CW}v${LANE_H}h${-(e - c) * CW}z`
        c = e
      }
      if (d) body += `<path class="${market ? 'm' : 'o'}${bin}" d="${d}"/>`
    }
  })

  // Intensities, mirrored: the baseline μ each type would arrive at on its own, and above it (below, for sells) the
  // rest, set off by earlier orders, out to each column's envelope: its greatest and least value and where it ends.
  fr.lam.forEach((E, i) => {
    const mu = HAWKES.mu[i === 0 ? MARKET_BUY : MARKET_SELL]!
    body += `<path class="own" d="M0 ${LAM_MID}H${W}V${r1(lamY(i, mu))}H0z"/>`
    let d = ''
    for (let c = 0; c < COLS; c++) {
      const x = r1((c + 0.5) * CW)
      d += `${c ? 'L' : 'M'}${x} ${r1(lamY(i, E.max[c]!))}L${x} ${r1(lamY(i, E.min[c]!))}L${x} ${r1(lamY(i, E.last[c]!))}`
    }
    // The wash between μ and the curve, then the curve itself: only the intensity is inked.
    body += `<path class="set" d="M0 ${r1(lamY(i, mu))}L${d.slice(1)}L${W} ${r1(lamY(i, E.last[COLS - 1]!))}V${r1(lamY(i, mu))}z"/>`
    body += `<path class="lam ${i === 0 ? 'b' : 's'}" d="${d}"/>`
  })

  // Queues: the bid's above the centre line, the ask's below, each column at its fullest.
  fr.queue.forEach((Q, s) => {
    let d = `M0 ${QUEUE_MID}`
    for (let c = 0; c < COLS; c++) {
      const y = r1(queueY(s as 0 | 1, Q.max[c]!))
      d += `L${c * CW} ${y}L${(c + 1) * CW} ${y}`
    }
    body += `<path class="q${s} a" d="${d}L${W} ${QUEUE_MID}z"/>`
  })

  // The claim: each moment a queue was emptied and the price stepped, across that side's half.
  let gone = ''
  for (const m of fr.emptied) {
    const x = r1(((m.t - (f.t - SECONDS)) / SECONDS) * W)
    gone += `M${x} ${QUEUE_MID}V${r1(QUEUE_MID + (m.side === 0 ? -1 : 1) * QUEUE_H * 0.46)}`
  }
  if (gone) body += `<path class="gone" d="${gone}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HEIGHT}" viewBox="0 0 ${W} ${HEIGHT}" preserveAspectRatio="none"><style>${style}</style>${body}</svg>`
}
