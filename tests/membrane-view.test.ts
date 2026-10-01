import { describe, expect, it } from 'vitest'
import { expand, SHAPES } from '@/lib/membrane/expand'
import { camera, indices, PEAK, RINGS, SPOKES, spokeA, surface, table, VERTS, wire } from '@/lib/membrane/view'

/** The drum on its mesh (lib/membrane/view.ts): what the renderer, the poster and the miniature all draw. */
describe('the drum on its mesh', () => {
  it('never moves at its rim: every mode is zero there', () => {
    for (const s of SHAPES) {
      const tb = table(expand(s, 12))
      const out = new Float32Array(VERTS * 3)
      for (const t of [0, 0.4, 1.3, 5.2]) {
        surface(tb, t, 1, out)
        for (let j = 0; j < SPOKES; j++) expect(Math.abs(out[(1 + (RINGS - 1) * SPOKES + j) * 3 + 1]!), `${s.id} t=${t}`).toBeLessThan(1e-9)
      }
    }
  })
  it('is scaled to the same peak whatever the shape, so no drum is drawn flat or off the stage', () => {
    for (const s of SHAPES) {
      const tb = table(expand(s, 6))
      const out = new Float32Array(VERTS * 3)
      let peak = 0
      for (let k = 0; k <= 24; k++) {
        surface(tb, (k / 24) * ((2 * Math.PI) / tb.e.lambda[0]!), 1, out)
        for (let v = 0; v < VERTS; v++) peak = Math.max(peak, Math.abs(out[v * 3 + 1]!))
      }
      expect(peak, s.id).toBeGreaterThan(PEAK * 0.9)
      expect(peak, s.id).toBeLessThanOrEqual(PEAK * 1.0001)
    }
  })
  it('is a closed mesh of triangles over every vertex', () => {
    const ix = indices()
    expect(ix.length).toBe(3 * (SPOKES + 2 * (RINGS - 1) * SPOKES))
    expect(Math.max(...ix)).toBe(VERTS - 1)
  })
  it('projects inside its box, whatever the shape (the poster and the miniature)', () => {
    for (const s of SHAPES) {
      const w = wire(table(expand(s, 8)), 0, 1, 1000, 600)
      for (const p of [...w.rim, ...w.rings.flat(), ...w.spokes.flat()]) {
        expect(p[0]).toBeGreaterThan(0)
        expect(p[0]).toBeLessThan(1000)
        expect(p[1]).toBeGreaterThan(0)
        expect(p[1]).toBeLessThan(600)
      }
    }
  })
  it('tells each ring\'s near half from its far half, so a still frame can draw the far side quieter', () => {
    const tb = table(expand(SHAPES[0]!, 4))
    const w = wire(tb, 0, 1, 1000, 620)
    const { eye } = camera(1000 / 620)
    expect(w.far).toHaveLength(w.rings.length)
    w.far.forEach((ring, k) => {
      expect(ring).toHaveLength(w.rings[k]!.length)
      ring.forEach((far, j) => expect(far).toBe(Math.cos(spokeA(j)) * eye[0] + Math.sin(spokeA(j)) * eye[2] < 0))
      // About half of every ring is on the far side.
      expect(ring.filter(Boolean).length).toBeGreaterThan(SPOKES * 0.4)
      expect(ring.filter(Boolean).length).toBeLessThan(SPOKES * 0.6)
    })
  })
  it('draws fewer rings when asked (the miniature)', () => {
    const tb = table(expand(SHAPES[0]!, 4))
    expect(wire(tb, 0, 1, 1000, 600).rings).toHaveLength(9)
    expect(wire(tb, 0, 1, 1000, 600, 0, 8).rings).toHaveLength(4)
  })
})
