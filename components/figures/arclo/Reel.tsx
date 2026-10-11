'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { FigureFrame } from '@/components/FigureFrame'
import { CONTROL } from '@/components/stage/controls'
import { saveData, useInView, useReducedMotion } from '@/components/stage/env'

/**
 * Fig. 2 of /arclo: the template reel, a rendered video, served from this site beside the page. It is the poster until
 * the script knows it may move: then it plays, muted and looping, only while a quarter of it is on screen and the page
 * is visible, with Pause beside it (WCAG 2.2.2). Reduced motion, asked for at any time, keeps the poster and no
 * control; save-data keeps the poster until the reader presses Play. Nothing but the poster is fetched until it plays.
 */

const noop = () => () => {}
const onVisibility = (cb: () => void) => {
  document.addEventListener('visibilitychange', cb)
  return () => document.removeEventListener('visibilitychange', cb)
}

export function ReelLive({
  src,
  poster,
  size,
  title,
  subtitle,
  caption,
  table,
}: {
  src: string
  poster: string
  size: number
  title: string
  subtitle: string
  caption: ReactNode
  table: ReactNode
}) {
  const video = useRef<HTMLVideoElement>(null)
  const hydrated = useSyncExternalStore(noop, () => true, () => false)
  const reduced = useReducedMotion()
  const inView = useInView(video, '0px', 0.25)
  const visible = useSyncExternalStore(onVisibility, () => document.visibilityState === 'visible', () => false)
  // The reader's choice, once they have made one; until then save-data starts it held.
  const [chosen, setChosen] = useState<boolean | null>(null)
  const [started, setStarted] = useState(false)
  const live = hydrated && !reduced
  const paused = chosen ?? (hydrated && saveData())
  const playing = live && inView && visible && !paused

  useEffect(() => {
    const v = video.current
    if (!v) return
    if (playing) v.play().then(() => setStarted(true), () => {})
    else v.pause()
  }, [playing])

  // Reduced motion asked for mid-visit: back to the poster (with no preload, loading again shows it rather than the
  // frame the reel stopped on).
  useEffect(() => {
    const v = video.current
    if (reduced && v && v.currentTime > 0) v.load()
  }, [reduced])

  const label = paused ? (started && !reduced ? 'Resume' : 'Play') : 'Pause'
  return (
    <FigureFrame id="fig-reel" number="Fig. 2" title={title} subtitle={subtitle} caption={caption} table={table}>
      <video
        ref={video}
        src={src}
        poster={poster}
        width={size}
        height={size}
        muted
        loop
        playsInline
        preload="none"
        disablePictureInPicture
        aria-label={title}
        className="block aspect-square h-auto w-full max-w-[26rem] border border-rule bg-paper"
      />
      <div className="mt-3 flex min-h-8 gap-2">
        {live ? (
          <button type="button" onClick={() => setChosen(!paused)} className={`${CONTROL} min-w-[4.5rem]`} aria-label={`${label} the reel`}>
            {label}
          </button>
        ) : null}
      </div>
    </FigureFrame>
  )
}
