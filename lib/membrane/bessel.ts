/**
 * Bessel functions of the first kind and their zeros, for the drum (/membrane): the radial shapes of its modes and
 * the frequencies they ring at. Pure TypeScript, no dependencies, the same in Node (the poster, the tests) and the
 * browser.
 *
 * Jₙ(x) by Miller's backward recurrence: start far above both n and x, where Jₖ is negligible, recur
 * J(k−1) = (2k/x)·J(k) − J(k+1) down to J₀, and normalise by J₀ + 2(J₂ + J₄ + …) = 1. Downward the recurrence is
 * stable for every order, so one routine is good to about 1e-14 for n ≤ 20 and x ≤ 100, the drum's whole range
 * (tests/membrane-bessel.test.ts holds it to SciPy's values at 1e-12).
 */
export function besselJ(n: number, x: number): number {
  if (x === 0) return n === 0 ? 1 : 0
  if (x < 0) return (n % 2 ? -1 : 1) * besselJ(n, -x)
  const top = Math.max(n, x)
  // An even starting order well past where the terms fall away.
  const M = 2 * Math.ceil((top + 32 + Math.sqrt(48 * top)) / 2)
  let next = 0 // J(k+1)
  let cur = 1e-300 // J(k), unnormalised
  let norm = 0
  let ans = 0
  for (let k = M; k > 0; k--) {
    const prev = ((2 * k) / x) * cur - next // J(k−1)
    next = cur
    cur = prev
    // Rescale before the unnormalised values overflow; the ratio is all that matters.
    if (Math.abs(cur) > 1e250) {
      cur *= 1e-250
      next *= 1e-250
      norm *= 1e-250
      ans *= 1e-250
    }
    const i = k - 1
    if (i % 2 === 0) norm += i === 0 ? cur : 2 * cur
    if (i === n) ans = cur
  }
  return ans / norm
}

/** dJₙ/dx: J(n−1) − (n/x)Jₙ, and −J₁ for n = 0. */
export function besselJPrime(n: number, x: number): number {
  if (n === 0) return -besselJ(1, x)
  if (x === 0) return n === 1 ? 0.5 : 0
  return besselJ(n - 1, x) - (n / x) * besselJ(n, x)
}

const zeroCache = new Map<string, number[]>()

/**
 * The first `count` positive zeros of Jₙ, in increasing order. Found by stepping along x for a change of sign (the
 * zeros of Jₙ are all past n and about π apart, so a step of 0.1 cannot pass two) and closing each bracket by
 * bisection to the last bit, then one Newton step to polish it.
 */
export function besselZeros(n: number, count: number): number[] {
  const key = `${n}:${count}`
  const hit = zeroCache.get(key)
  if (hit) return hit
  const out: number[] = []
  const step = 0.1
  let a = Math.max(n, 0.5)
  let fa = besselJ(n, a)
  while (out.length < count) {
    const b = a + step
    const fb = besselJ(n, b)
    if (fa === 0) out.push(a)
    else if (fa * fb < 0) {
      let lo = a
      let hi = b
      let flo = fa
      for (let it = 0; it < 80 && hi - lo > 1e-15 * hi; it++) {
        const mid = 0.5 * (lo + hi)
        const fm = besselJ(n, mid)
        if (fm === 0) {
          lo = hi = mid
          break
        }
        if (flo * fm < 0) hi = mid
        else {
          lo = mid
          flo = fm
        }
      }
      let z = 0.5 * (lo + hi)
      const d = besselJPrime(n, z)
      if (d !== 0) {
        const nz = z - besselJ(n, z) / d
        if (nz > lo - 1e-12 && nz < hi + 1e-12) z = nz
      }
      out.push(z)
    }
    a = b
    fa = fb
  }
  zeroCache.set(key, out)
  return out
}
