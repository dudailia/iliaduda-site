import { Contents, ExperienceBrief, OtherWork } from '@/components/Contents'
import { Shell } from '@/components/Layout'
import { Masthead } from '@/components/Masthead'
import { SurfaceFigure } from '@/components/figures/VolSurface'
import { pageMeta } from '@/lib/meta'
import { AVAILABILITY, POSITIONING } from '@/lib/site'

export const metadata = pageMeta('/', undefined, `${POSITIONING} ${AVAILABILITY.line}.`)

export default function Home() {
  return (
    <main id="main">
      <Shell>
        <Masthead />
        <SurfaceFigure entrance />
        <Contents />
        <ExperienceBrief />
        <OtherWork />
      </Shell>
    </main>
  )
}
