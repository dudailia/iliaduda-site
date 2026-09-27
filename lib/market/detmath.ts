/**
 * The market's exponential, logarithm and power.
 *
 * Math.exp and Math.log are not required to round the same way in every
 * JavaScript engine, and one bit of difference in a Hawkes decay grows into a
 * different market within seconds: Safari's live figure would drift from the
 * poster Node built. These are fdlibm's algorithms (e_exp.c, e_log.c), which
 * use IEEE-754 arithmetic alone — additions, multiplications, one division, an
 * exact scaling by a power of two built from its bits — so every engine
 * computes the same bits, to under one unit in the last place.
 * tests/market-detmath.test.ts checks them against the platform's.
 */

const bits = new DataView(new ArrayBuffer(8))

/** 2^k for an integer k in [−1022, 1023], exactly, from its bits. */
function pow2(k: number): number {
  bits.setUint32(0, (k + 1023) << 20)
  bits.setUint32(4, 0)
  return bits.getFloat64(0)
}

// ln 2 split so that k·LN2_HI is exact for the k the range reduction produces.
const LN2_HI = 6.93147180369123816490e-1
const LN2_LO = 1.90821492927058770002e-10
const INV_LN2 = 1.44269504088896338700

const P1 = 1.66666666666666019037e-1
const P2 = -2.77777777770155933842e-3
const P3 = 6.61375632143793436117e-5
const P4 = -1.65339022054652515390e-6
const P5 = 4.13813679705723846039e-8

/** e^x. */
export function dexp(x: number): number {
  if (x !== x) return NaN
  if (x > 709.782712893384) return Infinity
  if (x < -745.1332191019411) return 0
  if (x === 0) return 1
  const k = Math.round(x * INV_LN2)
  const hi = x - k * LN2_HI
  const lo = k * LN2_LO
  const r = hi - lo
  const t = r * r
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))))
  const y = 1 - (lo - (r * c) / (2 - c) - hi)
  if (k > 1023) return y * pow2(1023) * 2
  if (k < -1022) return y * pow2(k + 1000) * pow2(-1000)
  return y * pow2(k)
}

const LG1 = 6.666666666666735130e-1
const LG2 = 3.999999999940941908e-1
const LG3 = 2.857142874366239149e-1
const LG4 = 2.222219843214978396e-1
const LG5 = 1.818357216161805012e-1
const LG6 = 1.531383769920937332e-1
const LG7 = 1.479819860511658591e-1

/** The natural logarithm. */
export function dlog(x: number): number {
  if (x !== x || x < 0) return NaN
  if (x === 0) return -Infinity
  if (x === Infinity) return Infinity
  bits.setFloat64(0, x)
  let hi = bits.getUint32(0)
  let lo = bits.getUint32(4)
  let e = (hi >>> 20) - 1023
  if (e === -1023) {
    // Subnormal: scale into the normal range by 2^54 first.
    bits.setFloat64(0, x * 18014398509481984)
    hi = bits.getUint32(0)
    lo = bits.getUint32(4)
    e = (hi >>> 20) - 1023 - 54
  }
  // x = m·2^e, m in [1, 2); then m in [√2/2, √2).
  bits.setUint32(0, (hi & 0x000fffff) | 0x3ff00000)
  bits.setUint32(4, lo)
  let m = bits.getFloat64(0)
  if (m > Math.SQRT2) {
    m /= 2
    e++
  }
  const f = m - 1
  const s = f / (2 + f)
  const z = s * s
  const w = z * z
  const t1 = w * (LG2 + w * (LG4 + w * LG6))
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)))
  const R = t2 + t1
  const hfsq = 0.5 * f * f
  return e * LN2_HI - (hfsq - (s * (hfsq + R) + e * LN2_LO) - f)
}

/** x^y for x > 0. */
export function dpow(x: number, y: number): number {
  return dexp(y * dlog(x))
}

/** x^n for a whole n ≥ 0, by squaring: multiplications only. */
export function ipow(x: number, n: number): number {
  let r = 1
  let b = x
  for (let k = n; k > 0; k >>= 1) {
    if (k & 1) r *= b
    b *= b
  }
  return r
}
