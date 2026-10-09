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
 * it did nothing. A tap (under 10px of movement, held however long) that left the value where it was is answered here, as an
 * input event the figure takes like any other; a tap on the thumb itself moves nothing. A finger that lands on the track
 * and goes plainly sideways drags the value with it, where the browser does not (iOS). And a touch the page takes for
 * a scroll or a pinch puts the value back: Chrome seeks on touchstart, before it knows the direction, so a scroll that
 * began on a slider's row moved it (σ 23 → 65 on the way down the page). The thumb's centre runs 8px inside the input's
 * ends (its 16px), as the site's slider draws it.
 */
const TAP_PX = 10
type Down = { id: number; x: number; y: number; t: number; el: HTMLInputElement; value: string; off: boolean; drag: boolean; held: boolean; seek: string | null }
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

/** Sets the value and tells no one: the thumb stays where the figure has it. */
const quiet = (el: HTMLInputElement, v: string) => Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)

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
  // Held: until the touch shows what it is, the browser's own seek is kept from the figure (see onInput).
  down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, el, value: el.value, off: Math.abs(e.clientX - thumbX(el)) > TAP_PX, drag: false, held: true, seek: null }
}

function onMove(e: PointerEvent) {
  const d = down
  if (!d || d.id !== e.pointerId) return
  const dx = e.clientX - d.x, dy = e.clientY - d.y
  // Sideways, it is the slider's: from the track the value follows the finger (iOS moves a range only by its thumb; on
  // Android this is where the browser's own drag has it anyway), and what the browser does from here reaches the figure.
  if (d.held && Math.abs(dx) > TAP_PX && Math.abs(dx) > Math.abs(dy)) {
    d.held = false
    d.drag = d.off
    put(d.el, d.off ? valueAt(d.el, e.clientX) : (d.seek ?? d.value))
  }
  if (d.drag) put(d.el, valueAt(d.el, e.clientX))
}

function onCancel(e: PointerEvent) {
  const d = down
  if (!d || d.id !== e.pointerId) return
  down = null
  // The page took the touch (a scroll, a pinch): held, the figure never saw the browser's seek and the thumb never left
  // its value, so nothing moves (on Android a scroll begun on a slider showed the touched value for up to 290ms, the fan
  // widening and narrowing again). A drag of our own stays.
  if (d.held) quiet(d.el, d.value)
}

function onUp(e: PointerEvent) {
  const d = down
  if (!d || d.id !== e.pointerId) return
  down = null
  if (!d.held) return
  // Still held at the lift, the touch was a press: a scroll ends in a cancel, never here. However long it was held, the
  // value goes where the browser sought it (Android), or under the finger off the thumb (iOS seeks nothing); on the thumb
  // itself, nowhere. Pressed and held 650ms on a live figure, the value was lost half the time.
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_PX) return
  if (d.seek !== null) put(d.el, d.seek)
  else if (d.off) put(d.el, valueAt(d.el, e.clientX))
}

/**
 * The browser's own input on a held slider stops here, before the figure (React listens further down the page), and its
 * thumb goes back to the figure's value at once: kept where the browser put it, the figure's next render put it back, and
 * the lift moved it again (three moves on one tap). Where it was sought is kept for the lift.
 */
function onInput(e: Event) {
  const d = down
  if (!d || !d.held || !e.isTrusted || e.target !== d.el) return
  e.stopImmediatePropagation()
  if (d.el.value !== d.value) {
    d.seek = d.el.value
    quiet(d.el, d.value)
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('input', onInput, { capture: true })
  document.addEventListener('change', onInput, { capture: true })
  document.addEventListener('pointerdown', onDown, { passive: true, capture: true })
  document.addEventListener('pointermove', onMove, { passive: true, capture: true })
  document.addEventListener('pointerup', onUp, { passive: true, capture: true })
  document.addEventListener('pointercancel', onCancel, { passive: true, capture: true })
}
