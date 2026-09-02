'use client'

import { Row, Shell } from '@/components/Layout'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <Shell>
      <div className="pt-16 lg:pt-24">
        <Row rail="Error">
          <h1 className="text-h2">Something broke</h1>
          <p className="mt-4 max-w-[34rem] text-graphite">
            Not the impression I was going for. You can retry, or use the links in the footer.
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
  )
}
