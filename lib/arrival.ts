/**
 * True when this page was entered through the contents view transition and
 * its Fig. 1 has just morphed in from the thumbnail (set by the pagereveal
 * script in app/(pages)/layout.tsx). A figure with a once-on-view replay skips
 * it then: the morph already was the entrance.
 */
export function arrivedByMorph(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.vtArrival === '1'
}
