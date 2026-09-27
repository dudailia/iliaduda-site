import { describe, expect, it } from 'vitest'
import { posterFlow } from '@/lib/market/flow'
import { posterGeometry } from '@/lib/orderbook/poster'

/**
 * The order book's poster is cropped by its frame the way the live canvas is:
 * nothing is authored outside the viewBox (the figures e2e holds every figure
 * to that), and a ridge that runs off an edge ends on it, with its stroke
 * pattern still covering exactly its top.
 */

/** Absolute vertices of a path written as M x y, then relative l dx dy segments, then z. */
function vertices(d: string): [number, number][] {
  const out: [number, number][] = []
  const re = /([Ml])(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g
  let m: RegExpExecArray | null
  let x = 0, y = 0
  while ((m = re.exec(d))) {
    const a = Number(m[2]), b = Number(m[3])
    if (m[1] === 'M') [x, y] = [a, b]
    else [x, y] = [x + a, y + b]
    out.push([x, y])
  }
  return out
}

const sim = posterFlow()
const variants = [
  { name: 'wide', w: 646, h: 504, opts: { every: 6, step: 2 } },
  { name: 'narrow', w: 390, h: 591, opts: { every: 7, step: 2 } },
] as const

describe.each(variants)('the $name poster', ({ w, h, opts }) => {
  const g = posterGeometry(sim, w, h, opts)
  const inside = ([x, y]: [number, number]) => x >= 0 && x <= w && y >= 0 && y <= h

  it('keeps every ridge, the river and every trade inside its frame', () => {
    const out: string[] = []
    g.rows.forEach((r, i) => {
      for (const side of ['bid', 'ask'] as const)
        for (const p of vertices(r[side].d)) if (!inside(p)) out.push(`row ${i} ${side}: ${p.join(',')}`)
    })
    for (const p of vertices(g.river)) if (!inside(p)) out.push(`river: ${p.join(',')}`)
    for (const [x, y, rad] of g.dots) if (x - rad < 0 || x + rad > w || y - rad < 0 || y + rad > h) out.push(`dot: ${x},${y}`)
    expect(out).toEqual([])
  })

  it('still strokes exactly the top of each ridge', () => {
    for (const r of g.rows)
      for (const side of [r.bid, r.ask]) {
        if (!side.d) continue
        const v = vertices(side.d)
        // The dash covers the top, which is every vertex but the two floor ends the closure adds.
        const top = v.slice(0, -2)
        let len = 0
        for (let i = 1; i < top.length; i++) len += Math.hypot(top[i]![0] - top[i - 1]![0], top[i]![1] - top[i - 1]![1])
        expect(Number(side.dash.split(' ')[0])).toBeCloseTo(len, 0)
      }
  })

  it('still draws a real frame: most of its rows have both walls', () => {
    const both = g.rows.filter((r) => vertices(r.bid.d).length > 3 && vertices(r.ask.d).length > 3).length
    expect(both / g.rows.length).toBeGreaterThan(0.9)
  })
})
