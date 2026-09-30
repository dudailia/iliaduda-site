'use client'

import { useState } from 'react'
import { Row, Shell } from '@/components/Layout'
import { RunningHead } from '@/components/RunningHead'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  // A retry that fails too says so, rather than looking as if nothing happened.
  const [tries, setTries] = useState(0)
  return (
    <>
      <RunningHead />
      <main id="main">
        <Shell>
          <div className="pt-16 lg:pt-24">
            <Row rail="Error">
              <h1 className="text-h2">Something broke</h1>
              <p className="mt-4 max-w-[34rem]">
                {tries ? 'It failed again. ' : 'The page failed to render. '}Retry, or go back to the <a href="/">contents</a>.
              </p>
              <button
                type="button"
                onClick={() => {
                  setTries((t) => t + 1)
                  reset()
                }}
                className="text-meta mt-6 border-b border-rule pb-0.5 font-mono transition-[border-color,scale] duration-150 ease-out hover:border-ink active:scale-[0.97]"
              >
                {tries ? 'Retry again' : 'Retry'}
              </button>
            </Row>
          </div>
        </Shell>
      </main>
    </>
  )
}
