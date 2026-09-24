'use client'

import Link from 'next/link'
import { Row, Shell } from '@/components/Layout'
import { RunningHead } from '@/components/RunningHead'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <RunningHead />
      <main id="main">
        <Shell>
          <div className="pt-16 lg:pt-24">
            <Row rail="Error">
              <h1 className="text-h2">Something broke</h1>
              <p className="mt-4 max-w-[34rem]">
                Not the impression I was going for. You can retry, or go back to the{' '}
                <Link prefetch={false} href="/">contents</Link>.
              </p>
              <button
                type="button"
                onClick={reset}
                className="text-meta mt-6 border-b border-rule pb-0.5 font-mono hover:border-ink"
              >
                Retry
              </button>
            </Row>
          </div>
        </Shell>
      </main>
    </>
  )
}
