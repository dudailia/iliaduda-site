import { Row, Shell } from '@/components/Layout'
import { RunningHead } from '@/components/RunningHead'

export default function NotFound() {
  return (
    <>
      <RunningHead />
      <main id="main">
        <Shell>
          <div className="pt-16 lg:pt-24">
            <Row rail="404">
              <h1 className="text-h2">That page is not here</h1>
              <p className="mt-4 max-w-[34rem]">
                Everything on the site is listed in the{' '}
                <a href="/#contents">contents</a>, and the <a href="/cv">CV</a> is one
                page.
              </p>
            </Row>
          </div>
        </Shell>
      </main>
    </>
  )
}
