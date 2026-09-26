import { describe, expect, it } from 'vitest'
import { DENSITY_SCALE, densityFormat, glOverride } from '@/lib/futures/caps'
import { FINE, FINE_PER, aggregate, binnedPrice, fineBin, fineWidth } from '@/lib/futures/hist'
import { HIST, MODEL, binWidth, discount } from '@/lib/futures/mc'
import { ensemble, summarize } from '@/lib/futures/poster'

/**
 * The GPU counts where the paths end in fine bins, four to each bin the figure
 * draws, as exact integers (an 8-bit blend target, accumulated into 32-bit
 * integers): that needs no float render target, so it runs on a phone. What
 * each bin pays is then taken at each fine bin's midpoint. These tests hold the
 * aggregation to the exact CPU histogram of the same paths.
 */

const t = ensemble(MODEL.sigma, 65_536)
const fineCounts = (terms: Float32Array) => {
  const f = new Uint32Array(FINE)
  for (const s of terms) {
    const b = fineBin(s)
    if (b >= 0) f[b]!++
  }
  return f
}

describe('the fine histogram', () => {
  it('nests exactly inside the drawn bins', () => {
    expect(FINE).toBe(HIST.bins * FINE_PER)
    expect(fineWidth * FINE_PER).toBeCloseTo(binWidth, 12)
    // A price on a drawn bin's lower edge is the first fine bin of that bin.
    for (const b of [0, 17, HIST.bins - 1]) expect(fineBin(HIST.lo + b * binWidth + 1e-9)).toBe(b * FINE_PER)
    expect(fineBin(HIST.lo - 0.01)).toBe(-1)
    expect(fineBin(HIST.hi)).toBe(-1)
  })

  it('gives the same counts as the exact histogram of the same paths', () => {
    for (const K of [70, 100, 130]) {
      const exact = summarize(t, K)
      expect(aggregate(fineCounts(t), K).counts).toEqual(exact.counts)
    }
  })

  it('gives what each bin pays to within a fraction of a percent', () => {
    for (const K of [70, 100, 130]) {
      const exact = summarize(t, K)
      const agg = aggregate(fineCounts(t), K)
      const total = exact.payoff.reduce((a, b) => a + b, 0)
      expect(Math.abs(agg.payoff.reduce((a, b) => a + b, 0) - total) / total).toBeLessThan(1e-3)
      for (let b = 0; b < HIST.bins; b++) {
        // Bins well clear of the strike, and with enough paths to have a payoff worth comparing.
        const lo = HIST.lo + b * binWidth
        if (exact.counts[b]! < 200 || lo < K + binWidth) continue
        expect(Math.abs(agg.payoff[b]! - exact.payoff[b]!) / exact.payoff[b]!).toBeLessThan(5e-3)
      }
    }
  })

  it('prices a strike it was not run at, close to the exact price of the same paths', () => {
    for (const K of [80, 100, 120]) {
      let s = 0, n = 0
      for (const ST of t) {
        if (ST < HIST.lo || ST >= HIST.hi) continue
        s += Math.max(ST - K, 0)
        n++
      }
      const exact = (discount() * s) / n
      expect(Math.abs(binnedPrice(fineCounts(t), K) - exact) / exact).toBeLessThan(2e-3)
    }
  })

  it('has nothing to price from an empty histogram', () => {
    expect(binnedPrice(new Uint32Array(FINE), 100)).toBeNaN()
  })
})

describe('the density buffer', () => {
  it('is half float where the device can render and blend it, eight-bit otherwise', () => {
    expect(densityFormat({ half: true }, null)).toBe('rgba16f')
    expect(densityFormat({ half: false }, null)).toBe('rgba8')
  })

  it('can be forced down to eight bits for testing, never up to what the device lacks', () => {
    expect(densityFormat({ half: true }, 'rgba8')).toBe('rgba8')
    expect(densityFormat({ half: false }, 'half')).toBe('rgba8')
    expect(densityFormat({ half: true }, 'half')).toBe('rgba16f')
  })

  it('reads the override from the query string, and ignores anything else', () => {
    expect(glOverride('?gl=rgba8')).toBe('rgba8')
    expect(glOverride('?debug=1&gl=half')).toBe('half')
    expect(glOverride('?gl=f32')).toBeNull()
    expect(glOverride('')).toBeNull()
  })

  it('stores density scaled so an eight-bit buffer covers the tone curve', () => {
    expect(DENSITY_SCALE.rgba16f).toBe(1)
    // The tone curve is 1 − e^(−0.9 d): at d = 1/scale it is past 99.9%.
    expect(1 - Math.exp(-0.9 / DENSITY_SCALE.rgba8)).toBeGreaterThan(0.999)
  })
})
