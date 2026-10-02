import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { keepDashes } from '@/components/Layout'

/**
 * A spaced em dash ends its line, never opens the next: in prose, the space before it is a no-break one, down through
 * the plain elements the prose is written in, and a component's own children are left alone.
 */

const text = (n: ReactNode): string =>
  typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join('') : isValidElement(n) ? text((n as ReactElement<{ children?: ReactNode }>).props.children) : ''

describe('keepDashes', () => {
  it('holds a spaced em dash to the word before it', () => {
    expect(keepDashes('the book — and the rest')).toBe('the book — and the rest')
  })

  it('reaches into paragraphs, links and emphasis, and keeps their props', () => {
    const p = createElement('p', { className: 'x' }, 'one — two ', createElement('a', { href: '/a' }, 'three — four'), ' end')
    const out = keepDashes(p) as ReactElement<{ className: string }>
    expect(out.props.className).toBe('x')
    expect(text(out)).toBe('one — two three — four end')
  })

  it('leaves a component’s children and dashless text as they are', () => {
    const C = ({ children }: { children: ReactNode }) => children
    const c = createElement(C, null, 'a — b')
    expect(keepDashes(c)).toBe(c)
    expect(keepDashes('no dash – here')).toBe('no dash – here')
  })
})
