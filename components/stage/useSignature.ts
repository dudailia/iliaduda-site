'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { isSkipInput, type Sequence } from '@/lib/stage/sequence'

export type SignatureState = 'off' | 'pending' | 'playing' | 'done'

/**
 * A figure's once-per-session signature moment, wired the hero's way:
 * - armed by the pre-paint mark (`data-{name}-seq`, lib/stage/prepaint.ts);
 * - started once a third of the stage is in view, or a fifth held for 1.2 s,
 *   so nobody is left looking at an empty stage waiting for a scroll;
 * - spent (the session flag) on the first drawn frame of it, not before, so a
 *   reader who never scrolls to it keeps it;
 * - finished quickly by a click or a key (not a scroll), at once by a return
 *   through the back-forward cache;
 * - released — finished and unmarked — when the figure declines to go live.
 * The sequence's clock itself is advanced by the figure, on drawn frames, and
 * `onFrame` is called after each.
 */
export function useSignature<P extends string>(name: string, box: RefObject<HTMLElement | null>, seq: RefObject<Sequence<P>>) {
  const armed = useRef(false)
  const [state, setState] = useState<SignatureState>('off')
  const stateRef = useRef<SignatureState>('off')
  const set = useCallback((s: SignatureState) => {
    if (stateRef.current === s) return
    stateRef.current = s
    setState(s)
  }, [])

  // Claim the figure for the pre-paint script, and read its decision.
  useEffect(() => {
    const d = document.documentElement
    d.dataset[`${name}Live`] = '1'
    if (d.dataset[`${name}Seq`] === '1') {
      armed.current = true
      set('pending')
    }
  }, [name, set])

  useEffect(() => {
    const el = box.current
    if (!el) return
    let wait = 0
    const go = () => {
      if (armed.current && !seq.current.started) seq.current.start()
    }
    const io = new IntersectionObserver(
      ([e]) => {
        const seen = e?.isIntersecting ? e.intersectionRatio : 0
        if (seen >= 0.35 || seen < 0.2) {
          clearTimeout(wait)
          wait = 0
          if (seen >= 0.35) go()
        } else if (!wait)
          wait = window.setTimeout(() => {
            wait = 0
            go()
          }, 1200)
      },
      { threshold: [0, 0.2, 0.35] },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      clearTimeout(wait)
    }
  }, [box, seq])

  useEffect(() => {
    const onInput = (e: Event) => {
      if (armed.current && isSkipInput(e as Event & { pointerType?: string; key?: string })) seq.current.skip()
    }
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && armed.current) seq.current.finish()
    }
    for (const t of ['click', 'keydown', 'pointerdown']) document.addEventListener(t, onInput, true)
    addEventListener('pageshow', onShow)
    return () => {
      for (const t of ['click', 'keydown', 'pointerdown']) document.removeEventListener(t, onInput, true)
      removeEventListener('pageshow', onShow)
    }
  }, [seq])

  /** After each drawn frame: spends the session's signature on its first, and follows its state. */
  const onFrame = useCallback(() => {
    const s = seq.current
    if (!armed.current || !s.started) return
    if (stateRef.current === 'pending')
      try {
        sessionStorage.setItem(`${name}-seq`, '1')
      } catch {}
    const next: SignatureState = s.done ? 'done' : 'playing'
    if (next !== stateRef.current) set(next)
  }, [name, seq, set])

  /** The figure will not go live here: show the finished picture. */
  const release = useCallback(() => {
    armed.current = false
    seq.current.finish()
    delete document.documentElement.dataset[`${name}Seq`]
    set('off')
  }, [name, seq, set])

  /** Replay: the reader asked for it, so it plays whatever the session has seen. */
  const replay = useCallback(() => {
    armed.current = true
    seq.current.replay()
    set('playing')
  }, [seq, set])

  return { armed, state, stateRef, onFrame, release, replay }
}
