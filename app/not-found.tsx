import Link from 'next/link'
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
                The link may be old, or I may have renamed something I said I would not rename.
                Everything is listed in the <Link href="/#contents">contents</Link>, and the{' '}
                <a href="/about">CV</a> is one click away.
              </p>
            </Row>
          </div>
        </Shell>
      </main>
    </>
  )
}
