/**
 * A paper's Fig. 1 in miniature, as numbers: the marks of its Contents thumbnail in a 1000 × 600 box. The build writes
 * it as SVG (lib/thumbs.ts); a live miniature (components/thumbs/) draws the same numbers on a canvas, from the same
 * functions, so its first frame is the thumbnail it replaces.
 */
export const TW = 1000
export const TH = 600

export type Pts = readonly (readonly [number, number])[]

export interface Shape {
  /** Context marks: drawn in the rule or wash colour. */
  readonly context: readonly Pts[]
  /** The claimed value: drawn in indigo. */
  readonly claim: readonly Pts[]
  /** Solid bars for the claim, as [x, y, w, h]. */
  readonly bars?: readonly (readonly [number, number, number, number])[]
}

/** Points rounded to whole units of the box: every byte of a thumbnail ships twice. */
export const whole = (pts: Pts): Pts => pts.map(([x, y]) => [Math.round(x), Math.round(y)] as const)
