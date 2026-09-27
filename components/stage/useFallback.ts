'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/** Why a figure that meant to go live fell back to its still frame: its context was lost, its code did not load, or it threw. */
export type Declined = 'lost' | 'load' | 'error'

/** How long a renderer may take to draw its first frame before the reader is shown the finished still frame. */
export const FIRST_FRAME_MS = 6000

export const DECLINED_TEXT: Record<Declined, string> = {
  lost: 'Still frame: the graphics context was lost.',
  load: 'Still frame: the live figure could not start here.',
  error: 'Still frame: the live figure could not start here.',
}

/**
 * The ways a live figure ends up a still frame after all, handled as the home
 * figure handles them: a lost context (an iPhone's app switch), a renderer
 * that did not load or threw, and a first frame that never came. Each releases
 * the signature, finished and unmarked, so the reader gets the finished
 * poster, never an empty stage waiting on a figure that will not come. A
 * restored context clears the reason: the stage kit builds the renderer again,
 * and the figure goes live from its first frame.
 *
 * `watch()` is called where the renderer is made (the stage is on screen by
 * then), so a reader who never scrolls to the figure keeps its signature.
 */
export function useFallback(canvas: RefObject<HTMLCanvasElement | null>, live: boolean, release: () => void) {
  const [declined, setDeclined] = useState<Declined | null>(null)
  const liveRef = useRef(live)
  useEffect(() => {
    liveRef.current = live
  }, [live])

  const fail = useCallback(
    (why: 'load' | 'error') => {
      setDeclined(why)
      release()
    },
    [release],
  )

  const watch = useCallback(() => {
    const id = window.setTimeout(() => {
      if (!liveRef.current) release()
    }, FIRST_FRAME_MS)
    return () => window.clearTimeout(id)
  }, [release])

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const onLost = () => {
      setDeclined('lost')
      release()
    }
    const onRestored = () => setDeclined(null)
    cv.addEventListener('webglcontextlost', onLost)
    cv.addEventListener('webglcontextrestored', onRestored)
    return () => {
      cv.removeEventListener('webglcontextlost', onLost)
      cv.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [canvas, release])

  return { declined, fail, watch }
}
