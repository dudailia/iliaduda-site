import { describe, expect, it } from 'vitest'
import { posterFlow } from '@/lib/market/flow'
import { HEIGHT } from '@/lib/orderbook/flowLayout'
import { flowPosterSvg } from '@/lib/orderbook/flowPoster'
import { palette } from '@/lib/palette'

/**
 * Fig. 2's still frame, as a file of its own like Fig. 1's: the three strips
 * at the still frame's moment, drawn to stretch across whatever width the
 * stage has (the strokes keep their weight), in either colour scheme, with no
 * text (its labels are the page's, shared with the live figure).
 */

const svg = flowPosterSvg(posterFlow())

describe('the order-flow poster file', () => {
  it('is a standalone image the stage can stretch: its own namespace, no text, nothing fetched', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain(`viewBox="0 0 1000 ${HEIGHT}"`)
    expect(svg).toContain('preserveAspectRatio="none"')
    expect(svg).toContain('vector-effect:non-scaling-stroke')
    expect(svg).not.toMatch(/<text|href=|url\(/)
  })
  it('follows the reader’s colour scheme with the stylesheet’s own tokens', () => {
    const p = palette()
    expect(svg).toContain('@media (prefers-color-scheme:dark)')
    expect(svg).toContain(p.light.indigo)
    expect(svg).toContain(p.dark.ink)
  })
  it('draws the lanes, both intensities, both queues and the moments a queue emptied', () => {
    expect(svg).toMatch(/<path class="o[0-9]"/)
    expect((svg.match(/<path class="lam /g) ?? []).length).toBe(2)
    expect((svg.match(/<path class="q[0-9] /g) ?? []).length).toBe(2)
    expect(svg).toContain('<path class="gone"')
  })
  it('stays small enough to send', () => {
    expect(svg.length).toBeLessThan(60_000)
  })
})
