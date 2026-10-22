import { besselJ, besselZeros } from './bessel'

/**
 * The vibrating drum of /membrane: a circular membrane of radius 1, fixed at its rim, with wave speed 1. Separating
 * variables in u_tt = Δu gives modes Jₙ(λₙₘ r)·(cos nθ or sin nθ)·(cos λₙₘ t or sin λₙₘ t), where λₙₘ is the m-th zero
 * of Jₙ (the rim must not move). An initial displacement f and velocity g with one angular order n expand in these
 * modes: the coefficient of each is an integral against the mode, divided by its norm ½ J²ₙ₊₁(λ) — the
 * orthogonality of the modes is what makes the coefficients independent of one another.
 *
 * The shapes are the directed study's exercises (MATH 4992, Spring 2026): four drums from section 5.5.2, and the four
 * radial profiles of section 3.3, which there were expanded on a line and here are also struck as drums.
 */

// ── Gauss–Legendre quadrature ───────────────────────────────────────────────────────────────────────────────────────

const GL_N = 32
const GL: { x: number[]; w: number[] } = (() => {
  const x: number[] = []
  const w: number[] = []
  for (let i = 1; i <= GL_N; i++) {
    // Newton on P_N from the Chebyshev guess; the derivative from the recurrence.
    let z = Math.cos((Math.PI * (i - 0.25)) / (GL_N + 0.5))
    let dp = 0
    for (let it = 0; it < 100; it++) {
      let p0 = 1
      let p1 = z
      for (let k = 2; k <= GL_N; k++) {
        const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k
        p0 = p1
        p1 = p2
      }
      dp = (GL_N * (z * p1 - p0)) / (z * z - 1)
      const dz = p1 / dp
      z -= dz
      if (Math.abs(dz) < 1e-16) break
    }
    x.push(z)
    w.push(2 / ((1 - z * z) * dp * dp))
  }
  return { x, w }
})()

/**
 * ∫ₐᵇ fn, by 32-point Gauss–Legendre on `panels` equal panels, and on each side of any break (where a profile jumps,
 * the step's ½), so a discontinuity never sits inside a panel.
 */
export function quad(fn: (x: number) => number, a = 0, b = 1, panels = 16, breaks: readonly number[] = []): number {
  const cuts = [a, ...breaks.filter((c) => c > a && c < b), b]
  let sum = 0
  for (let s = 0; s + 1 < cuts.length; s++) {
    const lo = cuts[s]!
    const hi = cuts[s + 1]!
    const h = (hi - lo) / panels
    for (let p = 0; p < panels; p++) {
      const mid = lo + (p + 0.5) * h
      const half = h / 2
      for (let i = 0; i < GL_N; i++) sum += GL.w[i]! * half * fn(mid + half * GL.x[i]!)
    }
  }
  return sum
}

// ── the shapes ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** A radial profile f(r) on 0 ≤ r ≤ 1 (section 3.3's exercises, which write x for r). */
export interface Profile {
  readonly id: string
  readonly label: string
  /** As the exercise has it, in r. */
  readonly formula: string
  readonly radial: (r: number) => number
  readonly breaks?: readonly number[]
}

export const PROFILES: readonly Profile[] = [
  { id: 'one', label: 'f = 1', formula: 'f(r) = 1', radial: () => 1 },
  { id: 'two-x-plus-one', label: 'f = 2r + 1', formula: 'f(r) = 2r + 1', radial: (r) => 2 * r + 1 },
  { id: 'one-minus-three-x', label: 'f = 1 − 3r', formula: 'f(r) = 1 − 3r', radial: (r) => 1 - 3 * r },
  { id: 'step', label: 'f = 3, then 1', formula: 'f(r) = 3 for r ≤ ½, 1 beyond', radial: (r) => (r <= 0.5 ? 3 : 1), breaks: [0.5] },
]

/** A drum: an initial displacement f or velocity g of one angular order, as radial part × trig(nθ). */
export interface Shape {
  readonly id: string
  /** What the reader picks it by. */
  readonly label: string
  /** The initial condition as the exercise writes it, both f and g. */
  readonly formula: string
  /** Which initial condition carries the shape: f (displacement, rings as cos λt) or g (velocity, as sin λt). */
  readonly field: 'f' | 'g'
  readonly order: number
  readonly trig: 'cos' | 'sin'
  readonly radial: (r: number) => number
  readonly breaks?: readonly number[]
  /** Where it comes from: section 5.5.2's drums, or a 3.3 profile struck as a drum. */
  readonly from: '5.5.2' | '3.3'
}

const drum = (p: Profile): Shape => ({
  id: `${p.id}-drum`,
  label: p.label,
  formula: `${p.formula}, g = 0`,
  field: 'f',
  order: 0,
  trig: 'cos',
  radial: p.radial,
  ...(p.breaks ? { breaks: p.breaks } : {}),
  from: '3.3',
})

export const SHAPES: readonly Shape[] = [
  { id: 'f-2sin2t', label: 'f = 2 sin 2θ', formula: 'f = 2 sin 2θ, g = 0', field: 'f', order: 2, trig: 'sin', radial: () => 2, from: '5.5.2' },
  { id: 'g-cost', label: 'g = −cos θ', formula: 'f = 0, g = −cos θ', field: 'g', order: 1, trig: 'cos', radial: () => -1, from: '5.5.2' },
  { id: 'f-rsint', label: 'f = r sin θ', formula: 'f = r sin θ, g = 0', field: 'f', order: 1, trig: 'sin', radial: (r) => r, from: '5.5.2' },
  { id: 'g-r1cos2t', label: 'g = (r − 1) cos 2θ', formula: 'f = 0, g = (r − 1) cos 2θ', field: 'g', order: 2, trig: 'cos', radial: (r) => r - 1, from: '5.5.2' },
  ...PROFILES.map(drum),
]

// ── coefficients ────────────────────────────────────────────────────────────────────────────────────────────────────

/** ½ J²ₙ₊₁(λ): the norm ∫₀¹ Jₙ(λr)² r dr of a mode whose λ is a zero of Jₙ. */
export const modeNorm = (n: number, lambda: number) => 0.5 * besselJ(n + 1, lambda) ** 2

/** The first `count` Fourier–Bessel coefficients of a radial profile in Jₙ(λₙₘ r): ∫ u Jₙ r dr / (½ J²ₙ₊₁). */
export function profileCoefficients(p: Pick<Profile, 'radial' | 'breaks'> & Partial<Profile>, n: number, count: number): number[] {
  // The mth coefficient does not depend on how many are kept: each profile's are worked out once, as far as asked for,
  // and a slider's step reads them (it ran ~10,000 Bessel evaluations a step, twice, and dropped the drum's frames).
  let byOrder = known.get(p)
  if (!byOrder) known.set(p, (byOrder = new Map()))
  const c = byOrder.get(n) ?? []
  if (c.length < count) {
    const zeros = besselZeros(n, count)
    for (let m = c.length; m < count; m++) c.push(quad((r) => p.radial(r) * besselJ(n, zeros[m]! * r) * r, 0, 1, 16, p.breaks ?? []) / modeNorm(n, zeros[m]!))
    byOrder.set(n, c)
  }
  return c.slice(0, count)
}
const known = new WeakMap<object, Map<number, number[]>>()

/** A drum's solution in its first `count` modes: u = Σ Jₙ(λₘ r) trig(nθ) (Aₘ cos λₘt + Bₘ sin λₘt). */
export interface Expansion {
  readonly shape: Shape
  readonly order: number
  readonly lambda: readonly number[]
  readonly A: readonly number[]
  readonly B: readonly number[]
  readonly norm: readonly number[]
}

export function expand(shape: Shape, count: number): Expansion {
  const lambda = besselZeros(shape.order, count)
  const c = profileCoefficients(shape, shape.order, count)
  // A velocity's coefficients are divided by λ: integrating sin λt in time.
  const A = shape.field === 'f' ? c : c.map(() => 0)
  const B = shape.field === 'g' ? c.map((v, m) => v / lambda[m]!) : c.map(() => 0)
  return { shape, order: shape.order, lambda, A, B, norm: lambda.map((l) => modeNorm(shape.order, l)) }
}

const angular = (e: Expansion, theta: number) => (e.order === 0 ? 1 : e.shape.trig === 'cos' ? Math.cos(e.order * theta) : Math.sin(e.order * theta))

/** The membrane's height at (r, θ) and time t. */
export function height(e: Expansion, r: number, theta: number, t: number): number {
  let u = 0
  for (let m = 0; m < e.lambda.length; m++) {
    const l = e.lambda[m]!
    u += besselJ(e.order, l * r) * (e.A[m]! * Math.cos(l * t) + e.B[m]! * Math.sin(l * t))
  }
  return u * angular(e, theta)
}

/** ∂u/∂t at (r, θ) and time t. */
export function velocity(e: Expansion, r: number, theta: number, t: number): number {
  let v = 0
  for (let m = 0; m < e.lambda.length; m++) {
    const l = e.lambda[m]!
    v += besselJ(e.order, l * r) * l * (-e.A[m]! * Math.sin(l * t) + e.B[m]! * Math.cos(l * t))
  }
  return v * angular(e, theta)
}

/** ∫ trig²(nθ) dθ over a turn: 2π for the axisymmetric order, π otherwise. */
const angularNorm = (n: number) => (n === 0 ? 2 * Math.PI : Math.PI)

/**
 * The drum's energy, ½∫∫(u_t² + |∇u|²): each mode keeps its own, ½ λ²(A² + B²) times its norm, because the modes
 * are orthogonal in both terms. Constant in time, which tests/membrane-expand.test.ts checks against quadrature.
 */
export function energy(e: Expansion): number {
  let s = 0
  for (let m = 0; m < e.lambda.length; m++) s += 0.5 * e.lambda[m]! ** 2 * (e.A[m]! ** 2 + e.B[m]! ** 2) * e.norm[m]!
  return s * angularNorm(e.order)
}

/**
 * The L² error of the shape in `count` modes, over the disc: ‖F‖² − Σ c²·norm, by orthogonality (Bessel's
 * inequality), so it can only fall as modes are added.
 */
export function l2Error(shape: Shape, count: number): number {
  const whole = quad((r) => shape.radial(r) ** 2 * r, 0, 1, 16, shape.breaks ?? [])
  const c = profileCoefficients(shape, shape.order, count)
  const lambda = besselZeros(shape.order, count)
  let kept = 0
  for (let m = 0; m < count; m++) kept += c[m]! ** 2 * modeNorm(shape.order, lambda[m]!)
  return Math.sqrt(Math.max(0, (whole - kept) * angularNorm(shape.order)))
}

/**
 * The same error as a share of the shape's own size, ‖F − F_N‖ / ‖F‖. The turn's integral is a factor of both, so it
 * is one number on the disc and on the line: Fig. 1 and Fig. 2 read the same for the same profile.
 */
export function relativeError(shape: Shape, count: number): number {
  const whole = quad((r) => shape.radial(r) ** 2 * r, 0, 1, 16, shape.breaks ?? [])
  return l2Error(shape, count) / Math.sqrt(whole * angularNorm(shape.order))
}
