import { describe, expect, it } from 'vitest'
import { HZ, posterFlow } from '@/lib/market/flow'
import { arrange, boxAt, labelSpecs, PAD, type Box } from '@/lib/orderbook/labels'
import { posterGeometry } from '@/lib/orderbook/poster'
import { DX, HISTORY, height } from '@/lib/orderbook/view'

/**
 * The order book's direct labels come from one list, for the live overlay and
 * the poster alike, so the crossfade between them moves nothing: most
 * important first, each anchored where it belongs in the world, and placed
 * only where it fits the frame and clears the labels before it.
 */

const sim = posterFlow()
const head = sim.row(0)
const centre = sim.mids[head]!
const specs = (narrow: boolean) => labelSpecs(sim, { centre, fracZ: 0, narrow, rows: HISTORY })

describe('the label list', () => {
  it('puts the price first, then now, then the two walls', () => {
    for (const narrow of [false, true]) expect(specs(narrow).slice(0, 4).map((s) => s.id)).toEqual(['price', 't0', 'buyers', 'sellers'])
  })

  it('hangs the price tag from the river where it meets the front row, not from the floor below it', () => {
    const tag = specs(false)[0]!
    expect(tag.text).toMatch(/^Price \$\d+\.\d{2,3}$/)
    expect(tag.at[0]).toBeCloseTo(0, 9)
    expect(tag.at[1]).toBeGreaterThan(0)
    expect(tag.at[1]).toBeLessThanOrEqual(Math.max(height(sim.depthAt(head, Math.floor(centre))), height(sim.depthAt(head, Math.floor(centre) + 1))) + 1e-9)
  })

  it('leaves out the price tick the tag already says', () => {
    for (const narrow of [false, true]) {
      const ticks = specs(narrow).filter((s) => s.kind === 'tick')
      expect(ticks.length).toBeGreaterThan(2)
      for (const t of ticks) expect(Math.abs(t.at[0] / DX)).toBeGreaterThanOrEqual(10 - 1e-9)
    }
  })

  it('labels time only where the history is still drawn in full, each reading inward from its anchor', () => {
    for (const narrow of [false, true]) {
      const times = specs(narrow).filter((s) => s.kind === 'time')
      expect(times[0]!.text).toBe('now')
      for (const t of times) {
        const s = t.text === 'now' ? 0 : Number(t.text.split(' ')[0])
        expect(s * HZ).toBeLessThan(HISTORY * 0.62)
        // A laptop marks time at the buyers' end of each row, a phone just right of the price.
        expect(t.anchor).toBe(narrow ? 'r' : 'l')
      }
    }
  })
})

describe('arranging labels', () => {
  const size = (text: string, kind: keyof typeof PAD, fs = 13) => [text.length * fs * 0.6 + 2 * PAD[kind][0], fs + 2 * PAD[kind][1]] as const

  it('drops a label that would leave the frame, and one that would cover a label placed before it', () => {
    const [w, h] = size('Price $100.215', 'tag')
    const got = arrange(
      [
        { x: 200, y: 100, w, h, anchor: 'c' },
        { x: 205, y: 104, w, h, anchor: 'c' },
        { x: 395, y: 300, w, h, anchor: 'c' },
        { x: 200, y: 200, w, h, anchor: 'c' },
      ],
      400,
      400,
    )
    expect(got.map((b) => b !== null)).toEqual([true, false, false, true])
  })

  it('keeps a label that is already shown until it truly leaves, so one at the edge does not flicker as the camera drifts', () => {
    const [w, h] = size('10 s ago', 'time')
    // 5px from the edge: a new label waits for 8px of room; one already shown stays until 2px.
    const item = { x: 400 - 1 - 3 - 4, y: 100, w, h, anchor: 'r' as const }
    expect(arrange([item], 400, 400)[0]).toBeNull()
    expect(arrange([{ ...item, shown: true }], 400, 400)[0]).not.toBeNull()
  })

  it('keeps a shown label beside a neighbour it just touches, where a new one would wait for the full gap', () => {
    const [w, h] = size('10 s ago', 'time')
    const first = { x: 100, y: 100, w, h, anchor: 'l' as const }
    // The second starts 2px after the first ends: inside the 3px a new label keeps from a neighbour on each side.
    const next = { x: 100 + w + 2, y: 100, w, h, anchor: 'l' as const }
    expect(arrange([first, next], 400, 400)[1]).toBeNull()
    expect(arrange([first, { ...next, shown: true }], 400, 400)[1]).not.toBeNull()
  })

  it('reads a box the way its anchor says', () => {
    const b: Box = boxAt(100, 50, 40, 10, 'r')
    expect([b.x0, b.x1, b.y0, b.y1]).toEqual([60, 100, 45, 55])
    expect(boxAt(100, 50, 40, 10, 'l').x0).toBe(100)
    expect(boxAt(100, 50, 40, 10, 'c').x0).toBe(80)
  })
})

describe.each([
  { name: 'wide', w: 646, h: 504, opts: { every: 6, step: 2 } },
  { name: 'narrow', w: 390, h: 591, opts: { every: 7, step: 2 } },
])('the $name poster’s labels', ({ w, h, opts }) => {
  const g = posterGeometry(sim, w, h, opts)
  it('show the price, now and both walls', () => {
    const texts = g.labels.map((l) => l.text)
    expect(texts[0]).toMatch(/^Price /)
    for (const t of ['now', 'Buyers waiting', 'Sellers waiting']) expect(texts).toContain(t)
  })
  it('are all inside the frame and none covers another', () => {
    for (const l of g.labels) {
      expect(l.x0).toBeGreaterThanOrEqual(0)
      expect(l.x1).toBeLessThanOrEqual(w)
      expect(l.y0).toBeGreaterThanOrEqual(0)
      expect(l.y1).toBeLessThanOrEqual(h)
    }
    for (let i = 0; i < g.labels.length; i++)
      for (let j = i + 1; j < g.labels.length; j++) {
        const a = g.labels[i]!, b = g.labels[j]!
        expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1, `${a.text} / ${b.text}`).toBe(false)
      }
  })
})
