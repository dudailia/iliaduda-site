import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { posterFlow } from '@/lib/market/flow'
import { posterSvg, POSTERS } from '@/lib/orderbook/posterFile'
import { palette } from '@/lib/palette'

/**
 * The order book's poster is a file of its own, fetched once and only in the
 * arrangement the reader's screen shows, instead of two inline copies sent
 * twice (in the HTML and again in the page's RSC payload). As an image it
 * cannot read the page's colour tokens or load its fonts, so it carries both
 * palettes under the reader's own colour-scheme setting, read from the
 * stylesheet at build time, and no text: its labels stay in the page.
 */

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
const sim = posterFlow()

describe('the palette for build-time images', () => {
  it('is the stylesheet’s six tokens, by day and by night', () => {
    const p = palette()
    expect(Object.keys(p.light).sort()).toEqual(['graphite', 'indigo', 'indigo-wash', 'ink', 'paper', 'rule'])
    for (const [k, v] of Object.entries(p.light)) expect(css).toContain(`--color-${k}: ${v};`)
    for (const [k, v] of Object.entries(p.dark)) expect(css).toContain(`--color-${k}: ${v};`)
    expect(p.dark.paper).not.toBe(p.light.paper)
  })
})

describe.each(POSTERS)('the $variant poster file', ({ variant }) => {
  const svg = posterSvg(sim, variant)
  it('is a standalone image: its own namespace and size, nothing it would have to fetch or read from the page, no text', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toMatch(/ width="\d+" height="\d+" viewBox="0 0 \d+ \d+"/)
    expect(svg).not.toMatch(/<text|href=|url\(/)
    // Every custom property it reads, it defines itself: none is the page's.
    const used = new Set([...svg.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]))
    const defined = new Set([...svg.matchAll(/(--[\w-]+):/g)].map((m) => m[1]))
    for (const u of used) expect(defined, u).toContain(u)
  })
  it('follows the reader’s colour scheme with the stylesheet’s own dark tokens', () => {
    const p = palette()
    expect(svg).toContain('@media (prefers-color-scheme:dark)')
    expect(svg).toContain(p.light.indigo)
    expect(svg).toContain(p.dark.indigo)
    expect(svg).toContain(p.dark.paper)
  })
  it('draws the frame: ridgelines, the price river and the trades', () => {
    expect((svg.match(/<path /g) ?? []).length).toBeGreaterThan(20)
    expect(svg).toContain('<circle ')
  })
  it('fills its walls as the live terrain colours them, fading into the past as the terrain does', () => {
    // Mixed from the palette in each theme (no seventh colour), and faded by each row's age, as the shader fades it.
    expect(svg).toMatch(/\.b\{fill:color-mix\(in oklab/)
    expect(svg).toMatch(/\.s\{fill:color-mix\(in oklab/)
    const fades = [...svg.matchAll(/<g style="--a:([\d.]+)"/g)].map((m) => Number(m[1]))
    expect(fades.length).toBeGreaterThan(15)
    expect(Math.min(...fades)).toBe(0)
    expect(Math.max(...fades)).toBeGreaterThan(0.5)
    expect(Math.max(...fades)).toBeLessThanOrEqual(1)
  })
  it('draws each trade at the live figure’s size, the older ones fainter', () => {
    const r = [...svg.matchAll(/<circle [^>]*r="([\d.]+)"/g)].map((m) => Number(m[1]))
    // The live point is 3 + 0.6√size px across.
    const biggest = Math.max(...sim.trades.map((t) => t.size))
    expect(Math.max(...r)).toBeLessThanOrEqual(1.5 + 0.3 * Math.sqrt(biggest) + 0.05)
    expect(svg).toMatch(/<g opacity="0\.\d+"><circle/)
  })
})
