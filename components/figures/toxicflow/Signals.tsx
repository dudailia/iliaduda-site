import { FigureFrame } from '@/components/FigureFrame'
import { bundle, num, type SignalSplit, type Stat } from '@/lib/toxicflow/data'

/**
 * Do the signals carry information before any quoting? For each signal setting, the correlation of its direction u
 * with the mid's change over the next few seconds, one correlation a day, the mean over days with its day-bootstrap
 * interval: training days filled, validation days open. One panel per horizon, all on one axis.
 */

const si = bundle.signal_information.splits

/** "B2b_ewma_5s" as the reader meets it. */
export function signalName(key: string): string {
  const [code, kind, rest] = key.split('_') as [string, string | undefined, string | undefined]
  if (code === 'B2') return `OFI, window ${rest?.replace(/s$/, ' s') ?? ''}`
  if (code === 'B2b') return `trade count, decay ${rest?.replace(/s$/, ' s') ?? ''}`
  if (code === 'B3') return 'Hawkes, fitted β'
  if (code === 'C4') return `Hawkes, β × ${kind?.replace(/^x/, '') ?? ''}`
  return key
}

function parse(split: SignalSplit) {
  const signals: string[] = []
  const horizons: number[] = []
  for (const k of Object.keys(split.table)) {
    const [s, h] = k.split('|') as [string, string]
    if (!signals.includes(s)) signals.push(s)
    if (!horizons.includes(Number(h))) horizons.push(Number(h))
  }
  return { signals, horizons: horizons.sort((a, b) => a - b) }
}

export function signalRows() {
  const { signals, horizons } = parse(si.train)
  const get = (split: SignalSplit, s: string, h: number): Stat | undefined => split.table[`${s}|${h}`]?.u
  return { signals, horizons, get }
}

export function SignalsFigure({ number }: { number: string }) {
  const { signals, horizons, get } = signalRows()
  const all = signals.flatMap((s) => horizons.flatMap((h) => [get(si.train, s, h), get(si.val, s, h)])).filter((v): v is Stat => !!v)
  const hi = Math.max(...all.map((v) => v.ci[1])) * 1.05
  const x = (v: number) => `${(Math.max(0, v) / hi) * 100}%`
  const nTrain = si.train.days.length
  const nVal = si.val.days.length
  const fmt = (v: Stat | undefined) => (v ? `${num(v.mean, 3)} [${num(v.ci[0], 3)}, ${num(v.ci[1], 3)}], ${v.days_above_0} of ${v.days} days above 0` : 'n/a')
  return (
    <FigureFrame
      id="signals"
      number={number}
      title="How well each signal’s direction foretells the next move of the mid"
      subtitle={`correlation of u with the mid change ahead · mean over days · ${nTrain} training days filled · ${nVal} validation days open`}
      caption={
        <>
          OFI is order-flow imbalance at the best bid and ask over a trailing window; the trade count is B2b’s signed
          decay-weighted count of market orders; the Hawkes rows are B3’s intensity with its fitted decay β and the two
          wrong decays of canary C4. Nothing was tuned here, and no strategy, fill or fee enters: this measures information,
          not profit.
        </>
      }
      table={
        <table>
          <caption>Correlation of each signal’s direction with the mid change ahead, mean over days with bootstrap interval</caption>
          <thead>
            <tr>
              <th scope="col">Signal</th>
              {horizons.map((h) => (
                <th key={h} scope="col">{`${h} s ahead, training; validation`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => (
              <tr key={s}>
                <th scope="row">{signalName(s)}</th>
                {horizons.map((h) => (
                  <td key={h}>{`${fmt(get(si.train, s, h))}; ${fmt(get(si.val, s, h))}`}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <p className="sr-only">
        {signals
          .map((s) => `${signalName(s)}: ${horizons.map((h) => `${h} s ahead ${num(get(si.train, s, h)?.mean ?? 0, 3)} on training days and ${num(get(si.val, s, h)?.mean ?? 0, 3)} on validation days`).join(', ')}.`)
          .join(' ')}
      </p>
      <div aria-hidden="true" className="grid gap-x-5 gap-y-6 sm:grid-cols-[9.5rem_repeat(3,minmax(0,1fr))]">
        <span className="hidden sm:block" />
        {horizons.map((h) => (
          <span key={h} className="text-meta hidden border-b border-rule pb-1 font-mono text-graphite sm:block">
            {h} s ahead
          </span>
        ))}
        {signals.map((s) => (
          <div key={s} className="contents">
            <span className="text-meta font-mono text-ink max-sm:-mb-4 sm:self-center">{signalName(s)}</span>
            {horizons.map((h) => {
              const t = get(si.train, s, h)
              const v = get(si.val, s, h)
              return (
                <div key={h} className="relative h-5 border-l border-ink max-sm:mt-1">
                  <span className="text-meta absolute -top-0.5 right-0 font-mono text-graphite sm:hidden">{h} s</span>
                  {[t, v].map((st, n) =>
                    st ? (
                      <span key={n} className="absolute inset-x-0" style={{ top: n ? '70%' : '30%' }}>
                        <span className="absolute h-px -translate-y-1/2 bg-graphite/60" style={{ left: x(st.ci[0]), width: `calc(${x(st.ci[1])} - ${x(st.ci[0])})` }} />
                        <span
                          className={`absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-indigo ${n ? 'bg-paper' : 'bg-indigo'}`}
                          style={{ left: x(st.mean) }}
                        />
                      </span>
                    ) : null,
                  )}
                </div>
              )
            })}
          </div>
        ))}
        <span className="hidden sm:block" />
        {horizons.map((h) => (
          <span key={h} className="text-meta relative hidden h-4 font-mono text-graphite sm:block">
            <span className="absolute left-0 -translate-x-1/2">0</span>
            <span className="absolute -translate-x-1/2" style={{ left: x(hi / 1.05 / 2) }}>
              {num(hi / 1.05 / 2, 2)}
            </span>
          </span>
        ))}
      </div>
    </FigureFrame>
  )
}
