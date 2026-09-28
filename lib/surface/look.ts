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

import { toLinear } from '../gl'

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

// ── colour arithmetic, as the shader does it (components/figures/surface/shaders.ts) ──

export type Lab = [number, number, number]

/** An sRGB colour (0…1 a channel) in oklab. */
export function oklab(c: readonly number[]): Lab {
  const r = toLinear(c[0]!), g = toLinear(c[1]!), b = toLinear(c[2]!)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** An oklab colour in linear sRGB: the shader's `lin`. */
export function linOf(c: readonly number[]): [number, number, number] {
  const l_ = c[0]! + 0.3963377774 * c[1]! + 0.2158037573 * c[2]!
  const m_ = c[0]! - 0.1055613458 * c[1]! - 0.0638541728 * c[2]!
  const s_ = c[0]! - 0.0894841775 * c[1]! - 1.291485548 * c[2]!
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
}

/** Linear sRGB back to sRGB, clamped: the shader's `srgb`. */
export function srgbOf(c: readonly number[]): [number, number, number] {
  const f = (x: number) => {
    const v = Math.min(1, Math.max(0, x))
    return v < 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
  }
  return [f(c[0]!), f(c[1]!), f(c[2]!)]
}

export const mixv = (a: readonly number[], b: readonly number[], t: number): Lab => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t]

/** The ramp at t, in oklab, between its three stops, as the shader mixes it. */
export function rampLab(t: number, stops: { lo: Lab; mid: Lab; top: Lab }): Lab {
  if (t <= 0) return stops.lo
  if (t === 0.5) return stops.mid
  if (t >= 1) return stops.top
  return t < 0.5 ? mixv(stops.lo, stops.mid, t / 0.5) : mixv(stops.mid, stops.top, (t - 0.5) / 0.5)
}

/** The ramp's stops from the page's tokens, day or night: the uniforms the shader is given. */
export function rampStops(pal: { wash: readonly number[]; indigo: readonly number[]; ink: readonly number[]; dark: boolean }): { lo: Lab; mid: Lab; top: Lab } {
  const wash = oklab(pal.wash), ind = oklab(pal.indigo), ink = oklab(pal.ink)
  return { lo: mixv(wash, ind, STOPS.lo), mid: mixv(wash, ind, STOPS.mid), top: pal.dark ? mixv(ind, ink, STOPS.nightTop) : ind }
}

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
