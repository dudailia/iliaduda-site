import type { Metadata } from 'next'
import { Row, Shell } from '@/components/Layout'
import { RunningHead } from '@/components/RunningHead'

// Not indexed, its links followed: said once (the layout's index, follow would otherwise stand beside Next's noindex).
export const metadata: Metadata = { title: 'Not found', robots: { index: false, follow: true } }

export default function NotFound() {
  return (
    <>
      <RunningHead />
      <main id="main">
        <Shell>
          <div className="pt-16 lg:pt-24">
            {/* The number in the margin at lg, at the heading's first line; on a phone no label above the heading. */}
            <Row rail={<span className="hidden lg:inline-block lg:pt-[0.55rem]">404</span>}>
              <h1 className="text-h2">That page is not here</h1>
              <p className="mt-4 max-w-[34rem]">
                Everything on the site is listed in the{' '}
                <a href="/#contents">contents</a>, and the <a href="/cv">CV</a> is one
                page away.
              </p>
            </Row>
          </div>
        </Shell>
      </main>
    </>
  )
}
