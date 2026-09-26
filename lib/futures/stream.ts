import { BURST } from './sequence'

/**
 * After the signature sequence, the futures keep coming. Each drawn slot holds
 * its path a while, fades it out, and launches the next member of the ensemble
 * from today, whose front then travels to expiry. Every path drawn is a real
 * path of the same model (slot i's k-th launch is path i + k·N), so the stream
 * is the ensemble going by, not decoration.
 *
 * Nothing pops. A slot changes path only once the old one has faded to
 * nothing, and the new one starts as a point at today. Slots start their
 * cycles on a golden-ratio stagger, so the fades and launches are spread
 * evenly in time and the picture's weight holds steady. The clock is the
 * caller's: paused, it holds, and the same time is always the same picture.
 */

export const STREAM = {
  /** Seconds from one launch to the next, per slot. */
  cycle: 10,
  /** Seconds the old path takes to fade, then the new one's front takes to reach expiry. */
  fade: 0.6,
  travel: 2.6,
} as const

const PHI = 0.618034

export interface Slot {
  id: number
  /** How much of the path is drawn, 0 (a point at today) to 1 (to expiry). */
  reveal: number
  alpha: number
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const frac = (x: number) => x - Math.floor(x)
/** The burst's own curve: a quintic, the power curve closest to cubic-bezier(0.23, 1, 0.32, 1). */
const quint = (u: number) => (u >= 1 ? 1 : 1 - (1 - u) ** 5)
const smooth = (u: number) => u * u * (3 - 2 * u)

/** Slot i during the burst: its first path, its front easing out of today on the golden-ratio stagger. */
export function burstSlot(i: number, burst: number): Slot {
  const u = clamp01((burst - frac(i * PHI) * BURST.launch) / BURST.front)
  return { id: i, reveal: quint(u), alpha: 1 }
}

export class Stream {
  readonly ids: Float64Array
  readonly reveal: Float32Array
  readonly alpha: Float32Array
  /** The cycle each slot is in, whether it launches a path in it, and whether the path it fades exists. */
  private readonly cycleOf: Int32Array
  private readonly launches: Uint8Array
  private readonly fades: Uint8Array

  constructor(readonly n: number) {
    this.ids = Float64Array.from({ length: n }, (_, i) => i)
    this.reveal = new Float32Array(n).fill(1)
    this.alpha = new Float32Array(n).fill(1)
    this.cycleOf = new Int32Array(n).fill(-1)
    this.launches = new Uint8Array(n).fill(1)
    this.fades = new Uint8Array(n).fill(1)
  }

  /** Where every slot is `tau` seconds after the hand-off from the burst, with slots `active` and above resting. */
  update(tau: number, active: number): void {
    const { cycle, fade, travel } = STREAM
    for (let i = 0; i < this.n; i++) {
      const t = tau - frac(i * PHI) * cycle
      if (t < 0) {
        // Still holding its first path, the one the burst drew.
        this.ids[i] = i
        this.reveal[i] = 1
        this.alpha[i] = 1
        continue
      }
      const c = Math.floor(t / cycle)
      const u = t - c * cycle
      if (c !== this.cycleOf[i]) {
        // A new cycle: it fades what the last one launched (the first cycle fades the burst's path), and launches
        // only if the slot is in play.
        this.fades[i] = c === 0 || c !== this.cycleOf[i]! + 1 ? 1 : this.launches[i]!
        this.launches[i] = i < active ? 1 : 0
        this.cycleOf[i] = c
      }
      if (u < fade) {
        this.ids[i] = c === 0 ? i : i + this.n * c
        this.reveal[i] = 1
        this.alpha[i] = this.fades[i] ? 1 - smooth(u / fade) : 0
      } else {
        this.ids[i] = i + this.n * (c + 1)
        this.reveal[i] = this.launches[i] ? quint((u - fade) / travel) : 0
        this.alpha[i] = this.launches[i] ? 1 : 0
      }
    }
  }

  slot(i: number): Slot {
    return { id: this.ids[i]!, reveal: this.reveal[i]!, alpha: this.alpha[i]! }
  }
}
