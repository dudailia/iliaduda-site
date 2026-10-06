import { useSyncExternalStore } from 'react'

/**
 * True when this page was entered through the contents view transition and
 * its Fig. 1 has just morphed in from the thumbnail (set by the pagereveal
 * script in app/(pages)/layout.tsx). A figure with a once-on-view replay skips
 * it then: the morph already was the entrance.
 */
export function arrivedByMorph(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.vtArrival === '1'
}

/**
 * The same, as React state: hydration can finish before pagereveal marks the page, so a component that has to act on
 * the arrival (the market starting its worker under the morph) hears the mark when it lands. Once set, it stays.
 */
export function useArrivedByMorph(): boolean {
  return useSyncExternalStore(subscribe, arrivedByMorph, () => false)
}
function subscribe(on: () => void): () => void {
  const mo = new MutationObserver(on)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-vt-arrival'] })
  return () => mo.disconnect()
}
