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

function Box({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-sm border border-rule bg-paper px-4 py-3" data-pipeline-box={label}>
      <p className="text-meta font-mono text-graphite">{label}</p>
      <p className="text-note mt-1 text-ink">{title}</p>
      <ul className="text-meta mt-2 grid gap-y-1 font-mono text-graphite">{children}</ul>
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
      write('frames', r.frames > 0 ? `${n(r.frames, 1)} a second` : '—')
      write('paths', r.paths > 0 ? `${n(Math.round(r.paths / 1000) * 1000)} a second` : '—')
      write('headroom', r.busy > 0 ? `×${n(Math.round(1 / r.busy))} real time` : '—')
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
    <FigureFrame id="fig-2" number="Fig. 2" title={title} subtitle={subtitle} rail={<Readouts rows={rows} />} caption={caption} table={table}>
      <div data-market-follow="" className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,1fr)]">
        <Box label="A worker" title="The market, and its futures">
          <li>Hawkes order flow into a limit order book, in quanta of 1/60 of a second</li>
          <li>realised volatility, stress, the liquidity shock</li>
          <li>a fan of 4,096 futures each simulated second, a slice a frame</li>
        </Box>
        <div className="text-meta flex flex-row items-center justify-center gap-4 font-mono text-graphite sm:flex-col sm:gap-3" aria-hidden="true">
          <span className="text-center">
            <span className="block">to the worker</span>
            <span className="block text-ink">a frame, asked for at the page’s clock</span>
          </span>
          <span className="text-center">
            <span className="block">to the page</span>
            <span className="block text-ink">one buffer, lent and given back</span>
          </span>
        </div>
        <Box label="The page" title="Three views, one animation frame">
          <li>the vol surface (WebGL2), from the stress</li>
          <li>the order book, from its rows, its trades and the depth now</li>
          <li>the futures, from the fan, the price and the volatility</li>
        </Box>
      </div>
      <div className="mt-4 lg:hidden">
        <Readouts across rows={rowsBelow} />
      </div>
    </FigureFrame>
  )
}
