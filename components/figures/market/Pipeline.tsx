'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { marketRates, type MarketRates } from '@/components/market/stats'

/**
 * /market's Fig. 2, the boundary the market runs behind: the worker and the page, and what crosses between them,
 * with the rates this browser is running at, written straight into the DOM as Fig. 1 measures them. Laid out as a
 * diagram in HTML, so its words are the page's own at every width: side by side from `sm`, stacked on a phone.
 */

const n = (x: number, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

/** One side of the boundary: a hairline frame, its name in mono, what runs there in the page's own type. */
function Box({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <div className="border border-rule bg-paper px-4 py-3" data-pipeline-box={label}>
      <p className="text-meta font-mono text-graphite">{label}</p>
      <p className="text-note mt-1 font-semibold text-ink">{title}</p>
      <ul className="text-note mt-1.5 grid gap-y-1 text-graphite">{children}</ul>
    </div>
  )
}

/**
 * One way across the boundary: a hairline arrow in ink with its words over it. Across on a wide screen, where the
 * worker is on the left and the page on the right; down or up on a phone, where they are stacked.
 */
function Crossing({ to, words }: { to: 'worker' | 'page'; words: ReactNode }) {
  const left = to === 'worker'
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 sm:flex-none" aria-hidden="true">
      <span className="text-meta text-center font-mono leading-snug text-graphite">{words}</span>
      <svg className="hidden h-2.5 w-full text-ink sm:block" viewBox="0 0 100 10" preserveAspectRatio="none">
        <line x1="2" y1="5" x2="98" y2="5" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={left ? 'M8 1 L2 5 L8 9' : 'M92 1 L98 5 L92 9'} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <svg className="h-8 w-2.5 text-ink sm:hidden" viewBox="0 0 10 40" preserveAspectRatio="none">
        <line x1="5" y1="2" x2="5" y2="38" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={left ? 'M1 8 L5 2 L9 8' : 'M1 32 L5 38 L9 32'} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

export function PipelineLive({ title, subtitle, caption, table }: { title: string; subtitle: string; caption: ReactNode; table: ReactNode }) {
  const out = useRef<Record<string, HTMLElement | null>>({})
  useEffect(() => {
    const write = (id: string, text: string) => {
      for (const k of [id, `${id}-m`]) {
        const el = out.current[k]
        if (el && el.textContent !== text) el.textContent = text
      }
    }
    const show = (r: MarketRates) => {
      write('events', `${n(r.rate, 1)} a second`)
      // Held, the worker draws nothing and the page takes nothing: its rates would be an idle worker's.
      write('frames', r.paused ? 'held' : r.frames > 0 ? `${n(r.frames, 1)} a second` : '—')
      write('paths', r.paused ? 'held' : r.paths > 0 ? `${n(Math.round(r.paths / 1000) * 1000)} a second` : '—')
      write('headroom', r.paused ? 'held' : r.busy > 0 ? `×${n(Math.round(1 / r.busy))} real time` : '—')
      write('held', `${n(r.held, 1)} s`)
    }
    const r = marketRates.get()
    if (r) show(r)
    return marketRates.subscribe(show)
  }, [])
  const IDS = ['events', 'frames', 'paths', 'headroom', 'held'] as const
  const LABELS = ['Events', 'Frames to the page', 'Futures drawn', 'Headroom', 'Held while away'] as const
  const rows = IDS.map((id, i) => ({
    label: LABELS[i]!,
    value: (
      <span
        ref={(el) => {
          out.current[id] = el
        }}
      >
        —
      </span>
    ),
  }))
  const rowsBelow = IDS.map((id, i) => ({
    label: LABELS[i]!,
    value: (
      <span
        ref={(el) => {
          out.current[`${id}-m`] = el
        }}
      >
        —
      </span>
    ),
  }))
  return (
    <FigureFrame id="fig-2" number="Fig. 2" title={title} subtitle={subtitle} railBelow={false} rail={<Readouts rows={rows} />} caption={caption} table={table}>
      <div data-market-follow="" className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_8.5rem_minmax(0,1fr)] sm:gap-4">
        <Box label="A worker" title="The market, and its futures">
          <li>Hawkes order flow into a limit order book, in quanta of 1/60 of a second</li>
          <li>its realised volatility, its stress, and the liquidity shock</li>
          <li>a fan of 4,096 futures each simulated second, a slice a frame</li>
        </Box>
        <div className="flex flex-row items-center justify-center gap-6 sm:flex-col sm:justify-center sm:gap-5">
          <Crossing to="worker" words="a frame, asked for at the page’s clock" />
          <Crossing to="page" words="one buffer, lent and given back, never copied" />
        </div>
        <Box label="The page" title="Three views, one animation frame">
          <li>the vol surface (WebGL2), from the stress</li>
          <li>the order book, from its rows, its trades and its depth now</li>
          <li>the futures, from the fan, the price and the volatility</li>
        </Box>
      </div>
      <div className="mt-4 lg:hidden">
        <Readouts across rows={rowsBelow} />
      </div>
    </FigureFrame>
  )
}
