import type { CSSProperties } from 'react'

/**
 * How far a range input's track is filled, from its value: the site's one slider style (app/globals.css, "The site's
 * slider") reads it, so the filled track is indigo in every browser, iOS Safari included, where accent-color is not.
 */
export const rangeFill = (value: number, min: number, max: number): CSSProperties => {
  const f = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0
  // --frac as well, for a track painted inside its input (the cricket scrubber's, app/globals.css).
  return { '--fill': `${f * 100}%`, '--frac': f } as CSSProperties
}
