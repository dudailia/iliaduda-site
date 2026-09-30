import { Contents, ExperienceBrief, OtherWork } from '@/components/Contents'
import { Shell } from '@/components/Layout'
import { Masthead } from '@/components/Masthead'
import { FuturesFigure } from '@/components/figures/Futures'
import { pageMeta } from '@/lib/meta'
import { AVAILABILITY, POSITIONING } from '@/lib/site'

export const metadata = pageMeta('/', undefined, `${POSITIONING} ${AVAILABILITY.line}.`)

export default function Home() {
  return (
    <main id="main">
      <Shell>
        <Masthead />
        <FuturesFigure />
        {/* One market: the futures above are drawn at the simulated market's own volatility, and /market runs it. */}
        <div className="-mt-6 mb-12 grid grid-cols-1 lg:-mt-10 lg:mb-16 lg:grid-cols-[var(--rail)_minmax(0,var(--measure))] lg:gap-x-(--gutter)">
          <p className="text-note text-pretty lg:col-start-2" data-one-market="">
            <a href="/market" className="inline-block py-1">These futures, its order book and its vol surface: one simulated market, running in your browser.</a>
          </p>
        </div>
        <Contents />
        <ExperienceBrief />
        <OtherWork />
      </Shell>
    </main>
  )
}
