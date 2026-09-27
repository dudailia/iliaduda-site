import { LANES } from './flowview'

/**
 * Fig. 2's geometry, in CSS pixels: one place for the canvas that draws it
 * live, the server poster that stands in for it, and the labels over both, so
 * the three register. Top to bottom: room for a selected event's parent arc,
 * the six lanes of orders, the intensity of market orders, the queues at the
 * touch, and the time axis.
 */

/** Room above the lanes: a hairline of paper, and the selected order's ring. */
export const ARC = 8
/** A lane and the paper between lanes: tall enough to aim at an order with a finger. */
export const LANE_H = 18
export const LANE_GAP = 5
export const ORDERS_H = LANES.length * (LANE_H + LANE_GAP) - LANE_GAP
/** A strip's title line. */
export const TITLE_H = 34
export const INTENSITY_H = 88
export const QUEUE_H = 96
export const AXIS_H = 24
export const HEIGHT = ARC + ORDERS_H + TITLE_H + INTENSITY_H + TITLE_H + QUEUE_H + AXIS_H

export const Y = {
  orders: ARC,
  intensity: ARC + ORDERS_H + TITLE_H,
  queue: ARC + ORDERS_H + TITLE_H + INTENSITY_H + TITLE_H,
  axis: ARC + ORDERS_H + TITLE_H + INTENSITY_H + TITLE_H + QUEUE_H,
} as const

/**
 * The strips' fixed scales, so they never jump as the window moves: over ten calm minutes a market-order intensity
 * never passed 25.2 a second (p99.9 24.1), and a queue at the touch passed 157 shares 1% of the time.
 */
export const LAM_MAX = 30
export const QUEUE_MAX = 160

/** A wide stage names the lanes in a gutter of their own; a phone's names them inside, over their oldest events. */
export const gutter = (w: number) => (w >= 520 ? 124 : 0)
/** Paper kept right of now, so the newest event is not on the frame's edge. */
export const RIGHT = 8

export const laneTop = (lane: number) => Y.orders + lane * (LANE_H + LANE_GAP)
export const laneMid = (lane: number) => laneTop(lane) + LANE_H / 2
/** The lane under a point, or −1. */
export function laneAt(y: number): number {
  const i = Math.floor((y - Y.orders) / (LANE_H + LANE_GAP))
  return i >= 0 && i < LANES.length && y - laneTop(i) <= LANE_H + LANE_GAP / 2 ? i : -1
}
/**
 * The intensity strip is mirrored like the queues below it: market buys rise above its centre line, market sells
 * hang below, so the buying side is above in both.
 */
export const LAM_MID = Y.intensity + INTENSITY_H / 2
export const lamY = (d: number, v: number) => LAM_MID + (d === 0 ? 1 : -1) * (INTENSITY_H / 2) * Math.min(1, Math.max(0, v / LAM_MAX))
/** The centre line of the queue strip: the bid's queue rises above it, the ask's hangs below. */
export const QUEUE_MID = Y.queue + QUEUE_H / 2
export const queueY = (side: 0 | 1, q: number) => QUEUE_MID + (side === 0 ? -1 : 1) * (QUEUE_H / 2) * Math.min(1, Math.max(0, q / QUEUE_MAX))
