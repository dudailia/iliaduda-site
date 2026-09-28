'use client'

import { useEffect } from 'react'

/**
 * The Contents' live miniatures (./live.ts), loaded only as the Contents comes near the screen, so a first view of the
 * page carries none of their code. Renders nothing.
 */
export function ContentsLive() {
  useEffect(() => {
    const list = document.querySelector('[data-vt-contents]')
    if (!list) return
    let stop: (() => void) | null = null
    let gone = false
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return
        io.disconnect()
        void import('./live').then(
          (m) => {
            if (!gone) stop = m.start()
          },
          () => {},
        )
      },
      { rootMargin: '400px 0px' },
    )
    io.observe(list)
    return () => {
      gone = true
      io.disconnect()
      stop?.()
    }
  }, [])
  return null
}
