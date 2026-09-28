import { afterEach, describe, expect, it } from 'vitest'
import { handOff, handedTo, spend } from '../lib/minis/handoff'

const store = new Map<string, string>()
;(globalThis as { sessionStorage?: unknown }).sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}

describe('a miniature’s hand-off to its paper', () => {
  afterEach(() => store.clear())
  it('gives the paper the moment the miniature was at, for that paper only, while fresh', () => {
    handOff('market', 150.5, 1000)
    expect(handedTo('market', 143.3, 2000)).toBe(150.5)
    expect(handedTo('order-book', 143.3, 2000)).toBeNull()
    expect(handedTo('market', 143.3, 1000 + 20_000)).toBeNull()
  })
  it('never takes the figure back before its own moment, nor more than ten minutes past it', () => {
    handOff('market', 100, 0)
    expect(handedTo('market', 143.3, 1)).toBe(143.3)
    handOff('market', 99_999, 0)
    expect(handedTo('market', 143.3, 1)).toBe(743.3)
  })
  it('is spent once taken, and ignores what it cannot read', () => {
    handOff('market', 150, 0)
    spend()
    expect(handedTo('market', 143.3, 1)).toBeNull()
    store.set('mini-handoff', '{nope')
    expect(handedTo('market', 143.3, 1)).toBeNull()
  })
})
