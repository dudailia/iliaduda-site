import { thumbFor, TH, TW } from '@/lib/thumbs'
import { vtStyle } from './FigureFrame'

/**
 * A paper's Fig. 1 in miniature, on the contents page. It shares its paper
 * figure's view-transition-name, so following the link grows this into that.
 * Decorative: the entry's title and abstract carry the meaning.
 */
export function PaperThumb({ slug }: { slug: string }) {
  const t = thumbFor(slug)
  if (!t) return null
  return (
    <div aria-hidden className="aspect-[5/3] w-full border border-rule bg-paper p-1.5" style={vtStyle(slug)}>
      <svg viewBox={`0 0 ${TW} ${TH}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        {t.context.map((d, i) => (
          <path key={`c${i}`} d={d} fill="none" stroke="var(--color-rule)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {t.bars?.map(([x, y, w, h], i) => (
          <rect key={`b${i}`} x={x} y={y} width={w} height={h} fill="var(--color-indigo)" />
        ))}
        {t.claim.map((d, i) => (
          <path key={`p${i}`} d={d} fill="none" stroke="var(--color-indigo)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    </div>
  )
}
