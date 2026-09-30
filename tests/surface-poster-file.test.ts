import { describe, expect, it } from 'vitest'
import { palette } from '../lib/palette'
import { surfacePosterSvg } from '../lib/surface/posterFile'
import { CALM } from '../lib/surface/ssvi'

/**
 * The IV figure's poster is a file of its own, as the order book's is: sent
 * once, not twice (in the HTML and again in the page's RSC payload). As an
 * image it cannot read the page's tokens or fonts, so it defines the six
 * tokens itself for both colour schemes, from the stylesheet, and carries no
 * text: the labels and notes stay in the page, over it.
 */

const svg = surfacePosterSvg(CALM)

describe('the IV poster file', () => {
  it('is a standalone image: its own namespace and size, no text, nothing fetched', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toMatch(/ width="\d+" height="\d+" viewBox="0 0 \d+ \d+"/)
    expect(svg).not.toMatch(/<text|href=|url\((?!#)/)
  })
  it('defines every custom property it reads, the page’s six tokens among them, in both colour schemes', () => {
    const used = new Set([...svg.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]))
    const defined = new Set([...svg.matchAll(/(--[\w-]+):/g)].map((m) => m[1]))
    for (const u of used) expect(defined, u).toContain(u)
    const p = palette()
    expect(svg).toContain('@media (prefers-color-scheme:dark)')
    expect(svg).toContain(p.light.indigo)
    expect(svg).toContain(p.dark.indigo)
  })
  it('draws the lit surface, its walls and its contours', () => {
    expect((svg.match(/<path /g) ?? []).length).toBeGreaterThan(50)
    expect(svg).toContain('<linearGradient')
  })
})
