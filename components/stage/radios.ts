'use client'

import { useRef, type KeyboardEvent, type MouseEvent } from 'react'

/** How a choice was made: a keyboard step is never animated (DESIGN.md), a pointer's may be. */
export type ChoiceBy = 'pointer' | 'key'

/**
 * Radio groups the keyboard way (as /startup-investments' treatments): one tab stop in a group, on its checked option
 * (its first, when the choice is in another group of the same choice), and the arrow keys, Home and End move the
 * choice and the focus together within the group, wrapping at its ends. `radio(key, group)` goes on each option's
 * button, `group` being the keys of the radio group it is in.
 */
export function useRadios<K extends string | number>(value: K | null, choose: (k: K, by: ChoiceBy) => void) {
  const refs = useRef(new Map<K, HTMLButtonElement | null>())
  return (k: K, group: readonly K[]) => {
    const held = value !== null && group.includes(value)
    return {
      ref: (el: HTMLButtonElement | null) => {
        refs.current.set(k, el)
      },
      type: 'button' as const,
      role: 'radio' as const,
      'aria-checked': value === k,
      tabIndex: (held ? value === k : group[0] === k) ? 0 : -1,
      // Enter and Space press a button with no pointer: detail 0.
      onClick: (e: MouseEvent<HTMLButtonElement>) => choose(k, e.detail === 0 ? 'key' : 'pointer'),
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
        const i = group.indexOf(k)
        const n = group.length
        const to =
          e.key === 'ArrowRight' || e.key === 'ArrowDown'
            ? group[(i + 1) % n]
            : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
              ? group[(i + n - 1) % n]
              : e.key === 'Home'
                ? group[0]
                : e.key === 'End'
                  ? group[n - 1]
                  : undefined
        if (to === undefined) return
        e.preventDefault()
        choose(to, 'key')
        refs.current.get(to)?.focus()
      },
    }
  }
}
