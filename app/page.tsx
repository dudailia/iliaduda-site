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
        <Contents />
        <ExperienceBrief />
        <OtherWork />
      </Shell>
    </main>
  )
}
