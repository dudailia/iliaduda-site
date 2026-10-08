/**
 * The most device pixels a figure draws a CSS pixel at. A 3× phone's at full, and past 3 where a page is zoomed: a large
 * Android font size zooms the page (130% on a Galaxy S24 is 3.9 device pixels a CSS pixel), and its CSS box shrinks by
 * as much, so the screen's own pixels cost what 3× costs at 100%. Capped at 3, the figures drew at 77–88% of the screen
 * and were scaled up, softer than the words beside them.
 */
export const DPR_MAX = 4

/** The device pixels a CSS pixel draws at, here and now. */
export const deviceRatio = () => Math.min(DPR_MAX, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
