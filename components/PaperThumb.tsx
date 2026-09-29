import { CONTEXT_CSS } from '@/lib/minis/shape'
import { thumbFor, TH, TW } from '@/lib/thumbs'

/**
 * A paper's Fig. 1 in miniature, on the contents page, and a second way into
 * the paper. It carries no view-transition-name of its own: the contents
 * script gives one only to the thumbnail whose paper is being opened, so it —
 * and nothing else — grows into that paper's figure.
 */
export function PaperThumb({ slug, href }: { slug: string; href: string }) {
  const t = thumbFor(slug)
  if (!t) return null
  return (
    <a
      href={href}
      tabIndex={-1}
      aria-hidden
      data-vt-thumb={`fig-${slug}`}
      className="relative block aspect-[5/3] w-full border border-rule bg-paper p-1.5 no-underline transition-[border-color] duration-150 ease-[ease] hover:border-graphite"
    >
      <svg viewBox={`0 0 ${TW} ${TH}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" data-mini={t.mini}>
        {t.context.map((d, i) => (
          <path key={`c${i}`} d={d} fill="none" stroke={CONTEXT_CSS} strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
        {t.quiet?.map(([x, y, w, h], i) => (
          <rect key={`q${i}`} x={x} y={y} width={w} height={h} fill="var(--color-indigo-wash)" data-quiet="" />
        ))}
        {t.bars?.map(([x, y, w, h], i) => (
          <rect key={`b${i}`} x={x} y={y} width={w} height={h} fill="var(--color-indigo)" />
        ))}
        {t.claim.map((d, i) => (
          <path key={`p${i}`} d={d} fill="none" stroke="var(--color-indigo)" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    </a>
  )
}
