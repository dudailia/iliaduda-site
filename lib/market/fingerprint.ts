import type { Flow } from './flow'

/**
 * A fingerprint of everything the market is — its book, its clock, its
 * counts and its tape — so two runs can be compared in one string. The
 * market is deterministic (whole quanta, lib/market/detmath.ts), so the same
 * seed gives the same fingerprint on every engine; ?debug=1 on a live figure
 * shows whether the browser's matches the one pinned here from Node.
 */
const word = new Float64Array(1)
const words = new Uint32Array(word.buffer)
/** FNV-1a over the exact bits of each double: two numbers a unit in the last place apart hash apart. */
export function bitsHash(xs: Iterable<number>): string {
  let h = 2166136261
  for (const x of xs) {
    word[0] = x
    h = Math.imul(h ^ words[0]!, 16777619) >>> 0
    h = Math.imul(h ^ words[1]!, 16777619) >>> 0
  }
  return h.toString(16)
}

export function fingerprint(f: Flow): string {
  let h = 2166136261
  const mix = (x: number) => {
    h = Math.imul(h ^ Math.trunc(x), 16777619) >>> 0
    h = Math.imul(h ^ Math.round((x - Math.trunc(x)) * 1e9), 16777619) >>> 0
  }
  for (const v of f.book.bid) mix(v)
  for (const v of f.book.ask) mix(v)
  mix(f.book.bestBid)
  mix(f.book.bestAsk)
  mix(f.book.base)
  for (const c of f.hawkes.counts) mix(c)
  mix(f.t * 1e6)
  for (const tr of f.trades) {
    mix(tr.t * 1e6)
    mix(tr.price)
    mix(tr.size)
    mix(tr.side)
  }
  return `${h}:${f.written}:${f.hawkes.counts.join(',')}`
}

/** The market twenty simulated seconds after the poster, as Node computes it (tests/market-model.test.ts). */
export const GOLDEN = '320027338:520:12719,12938,2799,2836,9319,9274'
