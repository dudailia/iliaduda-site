import { CaseStudyTitle } from '@/components/CaseStudy'
import { Shell } from '@/components/Layout'
import { MarketFigure } from '@/components/figures/Market'

export default function Market() {
  return (
    <Shell>
      <article>
        <CaseStudyTitle
          byline="Independent work · September 2026 · synthetic data"
          level="h1"
          title="One market, three views"
          standfirst={<p>One simulated market runs in your browser, and its order book, its futures and its vol surface are drawn from it in the same frame.</p>}
        />
        <MarketFigure />
      </article>
    </Shell>
  )
}
