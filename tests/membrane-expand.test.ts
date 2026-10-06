import { describe, expect, it } from 'vitest'
import { besselJ, besselZeros } from '@/lib/membrane/bessel'
import { SHAPES, energy, expand, height, l2Error, profileCoefficients, PROFILES, quad, relativeError, velocity } from '@/lib/membrane/expand'

const shape = (id: string) => SHAPES.find((s) => s.id === id)!
const four = (x: number) => Number(x.toFixed(4))

/**
 * The drum's expansions (lib/membrane/expand.ts): the coefficients that make the figure, checked against the
 * exercises they come from (two terms, as worked by hand) and against the properties the page claims for them.
 */
describe('the exercises, to four places', () => {
  it('f = 2 sin 2θ, g = 0: the J₂ coefficients of cos λt', () => {
    expect(expand(shape('f-2sin2t'), 2).A.map(four)).toEqual([5.2698, -0.3168])
  })
  it('f = 0, g = −cos θ: the J₁ coefficients of sin λt', () => {
    expect(expand(shape('g-cost'), 2).B.map(four)).toEqual([-0.5776, 0.0737])
  })
  it('f = r sin θ, g = 0', () => {
    expect(expand(shape('f-rsint'), 2).A.map(four)).toEqual([1.296, -0.9499])
  })
  it('f = 0, g = (r − 1) cos 2θ', () => {
    expect(expand(shape('g-r1cos2t'), 2).B.map(four)).toEqual([-0.1871, -0.0736])
  })
  it('the radial profiles, in J₀ and J₁', () => {
    const want: Record<string, [number[], number[]]> = {
      one: [[1.602, -1.0648], [2.2131, -0.5171]],
      'two-x-plus-one': [[3.2369, -3.3318], [4.8051, -2.4169]],
      'one-minus-three-x': [[-0.8504, 2.3357], [-1.6747, 2.3326]],
      step: [[3.1415, 0.2581], [3.6955, 1.7905]],
    }
    for (const p of PROFILES) {
      expect(profileCoefficients(p, 0, 2).map(four), `${p.id} J0`).toEqual(want[p.id]![0])
      expect(profileCoefficients(p, 1, 2).map(four), `${p.id} J1`).toEqual(want[p.id]![1])
    }
  })
})

describe('the properties the page states', () => {
  it('modes are orthogonal: ∫ Jₙ(λᵢr) Jₙ(λⱼr) r dr is ½ J²ₙ₊₁(λᵢ) when i = j and 0 otherwise', () => {
    for (let n = 0; n < 3; n++) {
      const zs = besselZeros(n, 10)
      for (let i = 0; i < 10; i++)
        for (let j = 0; j < 10; j++) {
          const v = quad((r) => besselJ(n, zs[i]! * r) * besselJ(n, zs[j]! * r) * r)
          const want = i === j ? 0.5 * besselJ(n + 1, zs[i]!) ** 2 : 0
          expect(Math.abs(v - want), `n=${n} i=${i} j=${j}`).toBeLessThan(1e-12)
        }
    }
  })
  it('a pure mode expands to itself: one coefficient of 1, the rest 0', () => {
    const z = besselZeros(1, 3)[2]!
    const c = profileCoefficients({ id: 'mode', label: '', formula: '', radial: (r) => besselJ(1, z * r) }, 1, 6)
    c.forEach((v, i) => expect(Math.abs(v - (i === 2 ? 1 : 0))).toBeLessThan(1e-12))
  })
  it('more modes never make the shape worse: the L² error falls as modes are added', () => {
    for (const s of SHAPES) {
      let last = Infinity
      for (let m = 1; m <= 20; m++) {
        const e = l2Error(s, m)
        expect(e, `${s.id} with ${m}`).toBeLessThanOrEqual(last + 1e-12)
        last = e
      }
    }
  })
  it('the relative error is one number for a shape, on the disc as on the line: Fig. 1 and Fig. 2 agree', () => {
    for (const s of SHAPES)
      for (const m of [1, 2, 4, 20]) {
        const disc = l2Error(s, m) / Math.sqrt(quad((r) => s.radial(r) ** 2 * r, 0, 1, 16, s.breaks ?? []) * (s.order === 0 ? 2 * Math.PI : Math.PI))
        const line = Math.sqrt(1 - profileCoefficients(s, s.order, m).reduce((a, c, k) => a + c * c * 0.5 * besselJ(s.order + 1, besselZeros(s.order, m)[k]!) ** 2, 0) / quad((r) => s.radial(r) ** 2 * r, 0, 1, 16, s.breaks ?? []))
        expect(relativeError(s, m), `${s.id} with ${m}`).toBeCloseTo(disc, 12)
        expect(relativeError(s, m), `${s.id} with ${m}`).toBeCloseTo(line, 9)
        expect(relativeError(s, m)).toBeGreaterThanOrEqual(0)
        expect(relativeError(s, m)).toBeLessThan(1)
      }
  })
  it('at t = 0 the drum is the truncated shape, and its velocity the truncated g', () => {
    const s = shape('f-rsint')
    const e = expand(s, 20)
    // Inside the rim: a shape that does not vanish there (r sin θ) converges slowly next to it, as the page shows.
    for (const [r, th] of [[0.3, 0.4], [0.6, 2.1], [0.5, -1.2]] as const) {
      expect(Math.abs(height(e, r, th, 0) - r * Math.sin(th))).toBeLessThan(0.02)
      expect(Math.abs(velocity(e, r, th, 0))).toBeLessThan(1e-12)
    }
    const g = expand(shape('g-r1cos2t'), 20)
    expect(Math.abs(height(g, 0.5, 0.3, 0))).toBeLessThan(1e-12)
    expect(Math.abs(velocity(g, 0.5, 0.3, 0) - (0.5 - 1) * Math.cos(0.6))).toBeLessThan(0.01)
  })
  it('the energy is the same at every moment, and the same as the one computed from the coefficients', () => {
    for (const id of ['f-2sin2t', 'g-cost', 'step-drum']) {
      const e = expand(shape(id), 8)
      const want = energy(e)
      for (const t of [0, 0.37, 1.9, 7.3]) {
        // ½∫∫ (u_t² + u_r² + u_θ²/r²) r dr dθ, by quadrature over the disc.
        const h = 1e-5
        const got = quad((r) =>
          quad((th) => {
            const ut = velocity(e, r, th, t)
            const ur = (height(e, r + h, th, t) - height(e, r - h, th, t)) / (2 * h)
            const uth = (height(e, r, th + h, t) - height(e, r, th - h, t)) / (2 * h)
            return 0.5 * (ut * ut + ur * ur + (uth * uth) / (r * r)) * r
          }, -Math.PI, Math.PI, 2),
          1e-9, 1, 2,
        )
        expect(Math.abs(got - want) / want, `${id} at t=${t}`).toBeLessThan(1e-5)
      }
    }
  })
})
