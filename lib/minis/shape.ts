/**
 * A paper's Fig. 1 in miniature, as numbers: the marks of its Contents thumbnail in a 1000 × 600 box. The build writes
 * it as SVG (lib/thumbs.ts); a live miniature (components/thumbs/) draws the same numbers on a canvas, from the same
 * functions, so its first frame is the thumbnail it replaces.
 */
export const TW = 1000
export const TH = 600

export type Pts = readonly (readonly [number, number])[]

export interface Shape {
  /** Context marks: drawn in the rule or wash color. */
  readonly context: readonly Pts[]
  /** The claimed value: drawn in indigo. */
  readonly claim: readonly Pts[]
  /** Solid bars for the claim, as [x, y, w, h]. */
  readonly bars?: readonly (readonly [number, number, number, number])[]
  /** Bars behind the claim, in the indigo wash, as [x, y, w, h]. */
  readonly quiet?: readonly (readonly [number, number, number, number])[]
}

/** Points rounded to whole units of the box: every byte of a thumbnail ships twice. */
export const whole = (pts: Pts): Pts => pts.map(([x, y]) => [Math.round(x), Math.round(y)] as const)

/**
 * A thumbnail's context marks: graphite mixed into paper (in sRGB), so the smiles, ridges and washes behind the claim
 * are seen (2:1 or more in both themes, tests/contrast.test.ts) and stay quieter than any text.
 */
export const CONTEXT_MIX = 0.5
/** The CSS the thumbnail's SVG strokes its context with; the canvas mixes the same color (mixHex). */
export const CONTEXT_CSS = `color-mix(in srgb, var(--color-graphite) ${CONTEXT_MIX * 100}%, var(--color-paper))`

/** `a` mixed into `b` by `t`, in sRGB, as CSS's color-mix(in srgb, a t, b) does: #rrggbb. */
export function mixHex(a: string, b: string, t: number): string {
  const c = (h: string, i: number) => Number.parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  return `#${[0, 1, 2].map((i) => Math.round(c(a, i) * t + c(b, i) * (1 - t)).toString(16).padStart(2, '0')).join('')}`
}
