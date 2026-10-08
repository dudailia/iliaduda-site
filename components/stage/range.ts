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
 * A slider under a finger, the same in every browser. A tap on its track sets it there: Chrome on Android seeks on a tap
 * already; iOS Safari moves a range only by its thumb, 16px wide inside the 44px the input gives a finger, so a tap beside
 * it did nothing. A tap (under 10px of movement, within 600ms) that left the value where it was is answered here, as an
 * input event the figure takes like any other; a tap on the thumb itself moves nothing. A finger that lands on the track
 * and goes plainly sideways drags the value with it, where the browser does not (iOS). And a touch the page takes for
 * a scroll or a pinch puts the value back: Chrome seeks on touchstart, before it knows the direction, so a scroll that
 * began on a slider's row moved it (σ 23 → 65 on the way down the page). The thumb's centre runs 8px inside the input's
 * ends (its 16px), as the site's slider draws it.
 */
const TAP_PX = 10
const TAP_MS = 600
type Down = { id: number; x: number; y: number; t: number; el: HTMLInputElement; value: string; off: boolean; drag: boolean }
let down: Down | null = null

const bounds = (el: HTMLInputElement) => {
  const min = Number(el.min || 0), max = Number(el.max || 100)
  return { min, max, step: el.step === 'any' ? 0 : Number(el.step || 1) }
}

/** Where the thumb's centre is, in client pixels. */
function thumbX(el: HTMLInputElement): number {
  const r = el.getBoundingClientRect()
  const { min, max } = bounds(el)
  const f = max > min ? (Number(el.value) - min) / (max - min) : 0
  return r.left + 8 + f * Math.max(1, r.width - 16)
}

/** Sets the value through the native setter, so React sees the change as the browser's own. */
function put(el: HTMLInputElement, next: string) {
  if (Number(next) === Number(el.value)) return
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, next)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/** The value under a finger at `x`, on the input's own steps. */
function valueAt(el: HTMLInputElement, x: number): string {
  const r = el.getBoundingClientRect()
  const { min, max, step } = bounds(el)
  const f = Math.min(1, Math.max(0, (x - r.left - 8) / Math.max(1, r.width - 16)))
  let v = min + f * (max - min)
  if (step > 0) v = Math.min(max, min + Math.round((v - min) / step) * step)
  // The step's own decimals, so 0.05 steps never read 0.15000000000000002.
  return step > 0 ? v.toFixed(Math.max(0, (String(step).split('.')[1] ?? '').length)) : String(v)
}

function onDown(e: PointerEvent) {
  const el = e.target
  if (e.pointerType === 'mouse' || !(el instanceof HTMLInputElement) || el.type !== 'range' || el.disabled) {
    down = null
    return
  }
  // A second finger (a pinch) is not the slider's.
  if (down && down.id !== e.pointerId) return
  down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, el, value: el.value, off: Math.abs(e.clientX - thumbX(el)) > TAP_PX, drag: false }
}

function onMove(e: PointerEvent) {
  const d = down
  if (!d || d.id !== e.pointerId) return
  const dx = e.clientX - d.x, dy = e.clientY - d.y
  // Plainly sideways from the track, and the browser has not taken it (it moved nothing): the value follows the finger.
  if (!d.drag && d.off && d.el.value === d.value && Math.abs(dx) > TAP_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) d.drag = true
  if (d.drag) put(d.el, valueAt(d.el, e.clientX))
}

function onCancel(e: PointerEvent) {
  const d = down
  if (!d || d.id !== e.pointerId) return
  down = null
  // The page took the touch (a scroll, a pinch): what the browser's seek moved goes back; a drag of our own stays.
  if (!d.drag && d.el.value !== d.value) put(d.el, d.value)
}

function onUp(e: PointerEvent) {
  const d = down
  if (!d || d.id !== e.pointerId) return
  down = null
  if (d.drag || d.el.value !== d.value || !d.off) return
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_PX || e.timeStamp - d.t > TAP_MS) return
  put(d.el, valueAt(d.el, e.clientX))
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', onDown, { passive: true, capture: true })
  document.addEventListener('pointermove', onMove, { passive: true, capture: true })
  document.addEventListener('pointerup', onUp, { passive: true, capture: true })
  document.addEventListener('pointercancel', onCancel, { passive: true, capture: true })
}
