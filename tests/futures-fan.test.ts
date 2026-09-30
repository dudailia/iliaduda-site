import { describe, expect, it } from 'vitest'
import { FAN, Fan } from '../lib/futures/fan'
import { MODEL, bsCall, path } from '../lib/futures/mc'
import { inv } from '../lib/bs'

/**
 * /market's futures: one-year paths of geometric Brownian motion from the
 * market's own price at its own realised volatility, drawn from the home
 * figure's generator (lib/futures/mc.ts), so they are the same kind of
 * futures as the home page's, path for path. The fan reports quantile bands
 * at every step, a sample of paths to draw, and the at-the-money call against
 * Black–Scholes.
 */

const S0 = 100.37
const SIG = 0.31

function run(n: number, slice = n) {
  const f = new Fan()
  f.begin(S0, SIG, n)
  while (!f.work(slice));
  return f
}

describe('the futures fan', () => {
  it('takes its percentiles over several slices, never all 64 steps in one: no frame of the worker stalls on a sort', () => {
    const f = new Fan()
    f.begin(S0, SIG, FAN.paths)
    let calls = 1
    while (!f.work(512)) calls++
    // Eight slices to draw 4,096 paths, and eight more to sort the 64 steps, eight at a time.
    expect(calls).toBe(16)
    const whole = run(FAN.paths)
    for (let b = 0; b < 5; b++) for (const s of [1, 32, 64]) expect(f.band(b, s)).toBe(whole.band(b, s))
  })

  it('draws the home figure’s paths: the same generator, the same ids, the same futures', () => {
    const f = run(64)
    for (const id of [0, 7, 63]) {
      const want = path(id, SIG, { ...MODEL, s0: S0 })
      const got = f.path(id)
      for (let i = 0; i < want.length; i++) expect(got[i]).toBe(want[i])
    }
  })

  it('bands its paths at the lognormal quantiles, within Monte Carlo error, at every twelfth step', () => {
    const n = 8192
    const f = run(n)
    for (let step = 16; step <= MODEL.steps; step += 16) {
      const t = (step / MODEL.steps) * MODEL.T
      FAN.quantiles.forEach((q, b) => {
        const want = S0 * Math.exp((MODEL.r - 0.5 * SIG * SIG) * t + SIG * Math.sqrt(t) * inv(q))
        // The q-quantile's standard error, through the lognormal density at it.
        const dens = Math.exp(-0.5 * inv(q) ** 2) / Math.sqrt(2 * Math.PI) / (want * SIG * Math.sqrt(t))
        const se = Math.sqrt((q * (1 - q)) / n) / dens
        expect(Math.abs(f.band(b, step) - want), `q ${q} step ${step}`).toBeLessThan(4 * se)
      })
    }
  })

  it('is a martingale: the mean price a year out is today’s grown at the rate, within four standard errors', () => {
    const f = run(8192)
    const e = f.terminalMean()
    expect(Math.abs(e.mean - S0 * Math.exp(MODEL.r * MODEL.T))).toBeLessThan(4 * e.se)
  })

  it('prices the at-the-money call within its error of Black–Scholes, and the error falls as one over √n', () => {
    const small = run(2048).call()
    const big = run(8192).call()
    const exact = bsCall(S0, S0, MODEL.T, MODEL.r, SIG)
    expect(Math.abs(big.mean - exact)).toBeLessThan(4 * big.se)
    expect(big.se / small.se).toBeGreaterThan(0.45)
    expect(big.se / small.se).toBeLessThan(0.55)
    expect(big.exact).toBeCloseTo(exact, 10)
  })

  it('is the same fan in slices as all at once: the worker can spread it over its frames', () => {
    const a = run(4096)
    const b = run(4096, 300)
    for (let s = 0; s <= MODEL.steps; s += 8) for (let q = 0; q < FAN.quantiles.length; q++) expect(b.band(q, s)).toBe(a.band(q, s))
    expect(b.call().mean).toBe(a.call().mean)
  })

  it('is one fan at every volatility: a fan drawn at one maps exactly onto the fan drawn at another', async () => {
    const { fanAt } = await import('../lib/market/views')
    const a = new Fan(), b = new Fan()
    a.begin(1, 0.25, 2048)
    b.begin(1, 0.7, 2048)
    while (!a.work(4096));
    while (!b.work(4096));
    const bands = new Float64Array(a.bandsData().length), strands = new Float64Array(a.strands().length)
    fanAt({ sigma: 0.25, r: MODEL.r, dt: MODEL.T / MODEL.steps, bands: a.bandsData(), strands: a.strands() }, 0.7, bands, strands)
    const close = (x: ArrayLike<number>, y: ArrayLike<number>) => {
      let worst = 0
      for (let i = 0; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i]! / y[i]! - 1))
      return worst
    }
    expect(close(strands, b.strands())).toBeLessThan(1e-12)
    expect(close(bands, b.bandsData())).toBeLessThan(1e-12)
  })

  it('keeps a sample of paths to draw, today first, one year last', () => {
    const f = run(1024)
    const strands = f.strands()
    expect(strands.length).toBe(FAN.strands * (MODEL.steps + 1))
    expect(strands[0]).toBeCloseTo(S0, 10)
  })
})
