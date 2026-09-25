/**
 * The look, as numbers both renderers read: the colour ramp and the lights.
 * The live shader implements these in GLSL; the server poster approximates
 * them with CSS color-mix() over the site's tokens, which is why the ramp is
 * defined as oklab mixes of tokens rather than as colours — color-mix in oklab
 * is the same arithmetic the shader does, and it follows the reader's theme
 * without the poster knowing which one it is.
 *
 * One accent: the ramp runs from a whisper of indigo over the wash to full
 * indigo as volatility rises. At night the same tokens swap in, and the top
 * stop leans toward ink, so high volatility glows rather than sinks.
 */

/** Volatility mapped onto the ramp: t = 0 at `lo`, 1 at `hi`. */
export const RAMP = { lo: 0.17, hi: 0.64 } as const
export const rampT = (vol: number) => Math.min(1, Math.max(0, (vol - RAMP.lo) / (RAMP.hi - RAMP.lo)))

/** Stops, as the share of indigo mixed into the wash (and, at night, of ink into the top). */
export const STOPS = {
  lo: 0.15,
  mid: 0.58,
  /** At night only: how far the top stop leans from indigo toward ink. */
  nightTop: 0.42,
} as const

/** Contour levels, in volatility: every five points, the tens drawn heavier. */
export const CONTOUR_STEP = 0.05
/** Ramp position above which contour lines switch from ink to paper. */
export const LINE_FLIP = 0.55

// ── lights ───────────────────────────────────────────────────────────────────

const norm = (v: readonly [number, number, number]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** Key light: high, from the front left. Fill: low, from the right. */
export const KEY = norm([-0.45, 0.85, 0.5])
export const FILL = norm([0.8, 0.3, 0.35])
export const LIGHT = { ambient: 0.3, key: 0.75, fill: 0.22 } as const

/**
 * Diffuse light reaching a surface with unit normal n, normalised so a flat,
 * upward-facing patch gets exactly 1 — the ramp colour is then the colour of
 * the plateau, and the lights only sculpt.
 */
export function diffuse(n: readonly [number, number, number]): number {
  const d = (a: readonly number[], b: readonly number[]) => Math.max(0, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!)
  const up = LIGHT.ambient + LIGHT.key * KEY[1] + LIGHT.fill * FILL[1]
  return (LIGHT.ambient + LIGHT.key * d(n, KEY) + LIGHT.fill * d(n, FILL)) / up
}

/** The same normalisation constant, for the shader. */
export const UP_LIGHT = LIGHT.ambient + LIGHT.key * KEY[1] + LIGHT.fill * FILL[1]
