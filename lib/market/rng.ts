/**
 * A seeded generator, so the server's poster and the browser's live run are
 * the same market: mulberry32, 32 bits of state, uniform on [0, 1).
 */
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Exponential with the given rate. 1 − u keeps the logarithm finite. */
export const expo = (rng: Rng, rate: number) => -Math.log(1 - rng()) / rate

/** 1 + a geometric count with the given mean excess: order sizes in shares. */
export const lots = (rng: Rng, meanExcess: number) => 1 + Math.floor(-Math.log(1 - rng()) * meanExcess)
