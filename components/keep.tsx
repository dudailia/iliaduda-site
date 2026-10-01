import type { ReactNode } from 'react'

/**
 * A title with each en-dash compound ("Fourier–Bessel") kept on one line: a browser may break a line after an en dash,
 * and half a name at a line's end reads as a hyphenated word.
 */
export function keepCompounds(text: string): ReactNode {
  const parts = text.split(/(\S+–\S+)/)
  if (parts.length === 1) return text
  return parts.map((p, i) =>
    i % 2 ? (
      <span key={i} className="whitespace-nowrap">
        {p}
      </span>
    ) : (
      p
    ),
  )
}
