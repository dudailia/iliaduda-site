import { HZ, TICK, type Sim } from './sim'

/** What the probe reads at one price and one moment: straight from the stored snapshot. */
export interface Reading {
  price: number
  side: 'bid' | 'ask' | 'spread'
  /** Shares resting at exactly this price. */
  queue: number
  /** Shares between this price and the touch, inclusive: the wall's height. */
  cum: number
  /** Seconds before the newest snapshot, plus the time since it. */
  ago: number
  /** Mid and spread at that moment, in ticks. */
  mid: number
  spread: number
}

export function readAt(sim: Sim, price: number, age: number, frac = 0): Reading | null {
  const r = sim.row(age)
  if (r < 0) return null
  const d = sim.depthAt(r, price)
  const bb = sim.bids[r]!, ba = sim.asks[r]!
  return {
    price,
    side: price <= bb ? 'bid' : price >= ba ? 'ask' : 'spread',
    queue: sim.queueAt(r, price),
    cum: Math.abs(d),
    ago: (age + frac) / HZ,
    mid: sim.mids[r]!,
    spread: ba - bb,
  }
}

const usd = (ticks: number) => `$${(ticks * TICK).toFixed(2)}`
/** The mid sits on a half tick whenever the spread is odd; show the half cent rather than round it away. */
const mid = (ticks: number) => `$${(ticks * TICK).toFixed(Number.isInteger(ticks) ? 2 : 3)}`
export const fmt = {
  usd,
  mid,
  side: (r: Reading) => (r.side === 'bid' ? 'buyers waiting' : r.side === 'ask' ? 'sellers waiting' : 'inside the spread'),
  shares: (n: number) => `${Math.round(n).toLocaleString('en-US')} ${Math.round(n) === 1 ? 'share' : 'shares'}`,
  ago: (s: number) => (s < 0.05 ? 'now' : `${s.toFixed(1)} s ago`),
  spread: (ticks: number) => `${ticks} ${ticks === 1 ? 'tick' : 'ticks'} · ${usd(ticks)}`,
}

/** One sentence for a screen reader: the probe's reading in words. */
export function sentence(r: Reading): string {
  if (r.side === 'spread') return `${usd(r.price)}, ${fmt.ago(r.ago)}: inside the spread, nobody waiting. Mid ${mid(r.mid)}.`
  const who = r.side === 'bid' ? 'to buy' : 'to sell'
  const best = r.side === 'bid' ? 'best bid' : 'best ask'
  return `${usd(r.price)}, ${fmt.ago(r.ago)}: ${fmt.shares(r.queue)} waiting ${who} at this price, ${fmt.shares(r.cum)} between here and the ${best}.`
}
