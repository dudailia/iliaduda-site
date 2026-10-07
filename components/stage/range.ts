import type { CSSProperties } from 'react'

/**
 * How far a range input's track is filled, from its value: the site's one slider style (app/globals.css, "The site's
 * slider") reads it, so the filled track is indigo in every browser, iOS Safari included, where accent-color is not.
 */
export const rangeFill = (value: number, min: number, max: number): CSSProperties => {
  const f = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0
  // --frac as well, for a track painted inside its input (the cricket scrubber's, app/globals.css).
  return { '--fill': `${f * 100}%`, '--frac': f } as CSSProperties
}

/**
 * A tap on a slider's track sets it there, under a finger, in every browser. Chrome on Android seeks on a tap already;
 * iOS Safari moves a range only by its thumb, 16px wide inside the 44px the input gives a finger, so a tap beside it did
 * nothing. A tap (under 10px of movement, within 600ms) that left the value where it was is answered here, as an input
 * event the figure takes like any other; a drag, a scroll that started on the slider, or a tap the browser already
 * answered is left alone. The thumb's centre runs 8px inside the input's ends (its 16px), as the site's slider draws it.
 */
const TAP_PX = 10
const TAP_MS = 600
let down: { id: number; x: number; y: number; t: number; el: HTMLInputElement; value: string } | null = null

function onDown(e: PointerEvent) {
  const el = e.target
  down = e.pointerType !== 'mouse' && el instanceof HTMLInputElement && el.type === 'range' && !el.disabled
    ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, el, value: el.value }
    : null
}

function onUp(e: PointerEvent) {
  const d = down
  down = null
  if (!d || d.id !== e.pointerId || d.el.value !== d.value) return
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_PX || e.timeStamp - d.t > TAP_MS) return
  const el = d.el
  const r = el.getBoundingClientRect()
  const min = Number(el.min || 0), max = Number(el.max || 100)
  const step = el.step === 'any' ? 0 : Number(el.step || 1)
  const f = Math.min(1, Math.max(0, (e.clientX - r.left - 8) / Math.max(1, r.width - 16)))
  let v = min + f * (max - min)
  if (step > 0) v = Math.min(max, min + Math.round((v - min) / step) * step)
  // The step's own decimals, so 0.05 steps never read 0.15000000000000002.
  const next = step > 0 ? v.toFixed(Math.max(0, (String(step).split('.')[1] ?? '').length)) : String(v)
  if (Number(next) === Number(el.value)) return
  // Through the native setter, so React sees the change as the browser's own.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, next)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', onDown, { passive: true, capture: true })
  document.addEventListener('pointerup', onUp, { passive: true, capture: true })
}
