/**
 * Shared figure vocabulary.
 *
 * Colour inside a figure encodes epistemic status, not brand: WASH for a
 * context quantity, solid ACCENT for the thing actually being claimed or
 * measured, INK for structure and thresholds, GRAPHITE for annotation.
 *
 * On sizing: SVG text scales with its container, so a viewBox can only be the
 * right type size at one width. Fig 1 ships two arrangements because it is the
 * page's one bold element and has to fill the measure. Every other figure is
 * authored at DIAGRAM_W and capped there, so it renders between 0.93x and 1.0x
 * from 360px up and its labels are always the same physical size as the running
 * text. A figure narrower than the measure is normal in a typeset document, and
 * it keeps the quiet figures quiet.
 */

export const INK = 'var(--color-ink)'
export const GRAPHITE = 'var(--color-graphite)'
export const RULE = 'var(--color-rule)'
export const ACCENT = 'var(--color-indigo)'
export const WASH = 'var(--color-indigo-wash)'

/** Intrinsic width every non-hero figure is authored at. */
export const DIAGRAM_W = 336
export const DIAGRAM_CAP = 'max-w-[336px]'

export const LABEL = 12
export const SMALL = 11
