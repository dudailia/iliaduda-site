import type { CSSProperties } from 'react'

/**
 * How far a range input's track is filled, from its value: the site's one slider style (app/globals.css, "The site's
 * slider") reads it, so the filled track is indigo in every browser, iOS Safari included, where accent-color is not.
 */
export const rangeFill = (value: number, min: number, max: number): CSSProperties =>
  ({ '--fill': `${max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0}%` }) as CSSProperties
