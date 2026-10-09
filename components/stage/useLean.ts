'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Lean } from '@/lib/futures/tilt'

export type Permission = 'unasked' | 'granted' | 'denied'

/**
 * The reader leans a 3D figure's view, as on the hero: a pointer that can
 * hover leans it toward itself; a phone's tilt leans it — at once where the
 * browser allows, after the first tap where it asks (iOS asks only from a
 * tap). Paused, the lean holds where it was. The figure reads `lean.current`
 * each frame and springs toward it.
 */
/** The visit's answer to iOS's tilt question (sessionStorage), shared by every figure. */
const TILT_KEY = 'tilt-permission'

export function useLean(live: boolean, reduced: boolean, paused: { current: boolean }) {
  const lean = useRef({ x: 0, y: 0 })
  const from = useRef<'drift' | 'pointer' | 'tilt'>('drift')
  const tilt = useRef(new Lean())
  const [permission, setPermission] = useState<Permission>('unasked')

  useEffect(() => {
    if (!live || reduced || typeof DeviceOrientationEvent === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) return
    const D = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }
    if (typeof D.requestPermission === 'function' && permission !== 'granted') return
    const onTilt = (e: DeviceOrientationEvent) => {
      if (paused.current) return
      lean.current = tilt.current.read(e.beta, e.gamma, screen.orientation?.angle ?? 0, e.timeStamp)
      from.current = 'tilt'
    }
    addEventListener('deviceorientation', onTilt)
    return () => removeEventListener('deviceorientation', onTilt)
  }, [live, reduced, permission, paused])

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!live || paused.current || (e.pointerType !== 'mouse' && e.pointerType !== 'pen')) return
      const r = e.currentTarget.getBoundingClientRect()
      const c = (v: number) => Math.max(-1, Math.min(1, v))
      lean.current = { x: c((e.clientX - r.left - r.width / 2) / (r.width / 2)), y: c(-(e.clientY - r.top - r.height / 2) / (r.height / 2)) }
      from.current = 'pointer'
    },
    [live, paused],
  )
  const onPointerLeave = useCallback(() => {
    if (from.current === 'pointer') lean.current = { x: 0, y: 0 }
  }, [])
  /**
   * iOS asks before a page may read the tilt, and only from a tap: the first tap on a figure asks, once a visit. The
   * answer is kept for the visit, for every figure: a refusal is never asked again (each figure's first tap raised the
   * sheet over the tap the reader meant), and a grant is taken again without a sheet.
   */
  const onTap = useCallback(() => {
    if (permission !== 'unasked' || !live || reduced || !window.matchMedia('(pointer: coarse)').matches) return
    const D = (typeof DeviceOrientationEvent === 'undefined' ? undefined : DeviceOrientationEvent) as
      | (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> })
      | undefined
    if (typeof D?.requestPermission !== 'function') return
    let kept: string | null = null
    try {
      kept = sessionStorage.getItem(TILT_KEY)
    } catch {}
    setPermission('denied')
    if (kept === 'denied') return
    D.requestPermission()
      .then((r) => {
        setPermission(r === 'granted' ? 'granted' : 'denied')
        try {
          sessionStorage.setItem(TILT_KEY, r === 'granted' ? 'granted' : 'denied')
        } catch {}
      })
      .catch(() => setPermission('denied'))
  }, [permission, live, reduced])

  return { lean, from, permission, onPointerMove, onPointerLeave, onTap }
}
