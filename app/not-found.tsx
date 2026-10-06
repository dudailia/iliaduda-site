import type { Metadata } from 'next'
import { Row, Shell } from '@/components/Layout'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { preload } from 'react-dom'
import { RunningHead } from '@/components/RunningHead'

// Next marks a 404 noindex itself; the layout says nothing on production, so the page says it once.
export const metadata: Metadata = { title: 'Not found' }

/**
 * The two faces' files, from the build's own font manifest: Next preloads them on every page but this one (its manifest
 * lists them for it all the same), and here they swapped in after the first paint, a 0.025 shift at 360px. Static, so
 * read once at build time; nothing if the manifest cannot be read.
 */
function preloadFaces() {
  try {
    const m = JSON.parse(readFileSync(join(process.cwd(), '.next/server/next-font-manifest.json'), 'utf8')) as { app?: Record<string, string[]> }
    for (const f of m.app?.['[project]/app/_not-found/page'] ?? []) preload(`/_next/${f}`, { as: 'font', type: 'font/woff2', crossOrigin: '' })
  } catch {}
}

export default function NotFound() {
  preloadFaces()
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
                <a href="/#contents" data-print-href="">contents</a>, and the <a href="/cv">CV</a> is one
                page away.
              </p>
            </Row>
          </div>
        </Shell>
      </main>
    </>
  )
}
