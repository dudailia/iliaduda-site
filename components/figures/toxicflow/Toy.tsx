'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { FigureFrame } from '@/components/FigureFrame'
import { useInView, whenIdle } from '@/components/stage/env'
import { CONTROL } from '@/components/stage/controls'
import type { HawkesParams, ToyApi } from './HawkesToy'

/** The toy's chart and its clock, loaded later; until then their room is kept, empty (the same value there). */
const CHART_H = 'h-[14rem]'
const Body = dynamic(() => import('./HawkesToy').then((m) => m.ToyBody), { ssr: false, loading: () => <div className={CHART_H} /> })

/**
 * Fig. 2, the fitted Hawkes model as a toy: its frame, words, table and buttons are in the page from the first byte, so the
 * page's tab order never changes as it loads; the chart and its clock (./HawkesToy) load once the page is idle, or 600px
 * before the figure is reached if that comes first, so a phone never parses and mounts them in the middle of a scroll. A
 * tap made before they arrive is kept and played as they do.
 */
export function ToyFigure({ p, description, caption, table }: { p: HawkesParams; description: string; caption: ReactNode; table: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const near = useInView(box, '600px')
  const [idle, setIdle] = useState(false)
  useEffect(() => whenIdle(() => setIdle(true)), [])
  const api = useRef<ToyApi | null>(null)
  const pending = useRef<(1 | -1)[]>([])
  const add = (side: 1 | -1) => {
    if (api.current) api.current.add(side)
    else {
      pending.current.push(side)
      setIdle(true)
    }
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'b' || e.key === 'B') add(1)
    else if (e.key === 's' || e.key === 'S') add(-1)
  }
  return (
    <FigureFrame
      id="hawkes"
      number="Fig. 2"
      title="The fitted Hawkes model, as a toy"
      subtitle="your market orders · our fitted μ, α and β · played at a tenth of real time"
      hint="Add a market buy or sell · B and S from the keyboard"
      caption={caption}
      table={table}
    >
      <p className="sr-only">{description}</p>
      <div ref={box} onKeyDown={onKey}>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={CONTROL} onClick={() => add(1)}>
            <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full bg-buy" />Market buy
          </button>
          <button type="button" className={CONTROL} onClick={() => add(-1)}>
            <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full border-2 border-sell" />Market sell
          </button>
        </div>
        {near || idle ? <Body p={p} apiRef={api} pendingRef={pending} /> : <div className={CHART_H} />}
      </div>
    </FigureFrame>
  )
}
