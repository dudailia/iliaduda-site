'use client'

import { useEffect, useRef, useState } from 'react'
import { CONTROL } from '@/components/stage/controls'
import type { Minis } from './live'

const PAUSED = 'contents-paused'

/**
 * The Contents' live miniatures (./live.ts), loaded only as the Contents comes near the screen, so a first view of the
 * page carries none of their code; and their Pause (WCAG 2.2.2: they move by themselves and go on), remembered for
 * the visit as every figure's is. The button is in the page from the first paint, its room kept, and shows once the
 * miniatures run.
 */
export function ContentsLive() {
  // Not paused on the server's render and the client's first: the visit's Pause is read once the miniatures load, so
  // the page hydrates with the words it was sent.
  const [paused, setPaused] = useState(false)
  const [running, setRunning] = useState(false)
  const minis = useRef<Minis | null>(null)
  const pausedRef = useRef(false)

  useEffect(() => {
    const list = document.querySelector('[data-vt-contents]')
    if (!list) return
    let gone = false
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return
        io.disconnect()
        void import('./live').then(
          (m) => {
            if (gone) return
            let held = false
            try {
              held = sessionStorage.getItem(PAUSED) === '1'
            } catch {}
            pausedRef.current = held
            setPaused(held)
            // Stopped for good (reduced motion asked for): the button goes with them.
            minis.current = m.start(held, () => setRunning(false))
            if (minis.current) setRunning(true)
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
      minis.current?.stop()
    }
  }, [])

  const toggle = () => {
    const next = !pausedRef.current
    pausedRef.current = next
    setPaused(next)
    minis.current?.pause(next)
    try {
      sessionStorage.setItem(PAUSED, next ? '1' : '0')
    } catch {}
  }

  return (
    <div className="mt-3 h-8 motion-reduce:hidden print:hidden">
      <button
        type="button"
        onClick={toggle}
        className={`${CONTROL} min-w-[6.5rem] ${running ? '' : 'invisible'}`}
        aria-label={paused ? 'Resume the thumbnails' : 'Pause the thumbnails'}
        data-contents-pause=""
      >
        {paused ? 'Resume' : 'Pause'}
      </button>
    </div>
  )
}
