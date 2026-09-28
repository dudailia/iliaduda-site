/**
 * The figures' one spring, for everything that follows the reader (a lean, a
 * drag let go, a slider): critically damped, so it never overshoots from rest,
 * and stepped exactly, by the closed-form solution rather than an integrator,
 * so it is the same motion at any frame rate and after any gap.
 */
export function spring(s: { x: number; v: number }, target: number, dt: number, omega: number) {
  const d = s.x - target
  const e = Math.exp(-omega * dt)
  const c = s.v + omega * d
  s.x = target + (d + c * dt) * e
  s.v = (s.v - omega * c * dt) * e
}

/** Whether a spring has arrived; if it has, it is put exactly there, so a still figure stays still. */
export function arrived(s: { x: number; v: number }, target: number, eps: number) {
  if (Math.abs(s.x - target) > eps || Math.abs(s.v) > eps * 10) return false
  s.x = target
  s.v = 0
  return true
}
