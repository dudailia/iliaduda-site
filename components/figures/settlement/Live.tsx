'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { EPISODE_MS, requestCode, used, WINDOWS, type Allowance, type Outcome } from '@/lib/contact'
import { LADDER, offeredTerms, rub, terms, termForMonthly } from '@/lib/settlement'
import { CONTROL, option } from '@/components/stage/controls'
import { rangeFill } from '@/components/stage/range'

/**
 * Two things the portal's debtor path has to get right, side by side: what a
 * settlement costs, and what the login that shows it is allowed to cost in
 * statutory contacts. Both are the portal's own mechanics; the discount ladder
 * is illustrative. Every control is a direct change, and the numbers simply
 * are what they are; only a code request's answer arrives through a 3px blur
 * (120ms), so the same answer twice still reads as an answer.
 */

const DEBTS = [750_000, 6_000_000, 18_500_000] // kopecks
const MIN = 60_000
const DAY = 24 * 60 * MIN

const clock = (t: number) => {
  const day = Math.floor(t / DAY) + 1
  const m = Math.floor((t % DAY) / MIN) + 9 * 60
  return `day ${day}, ${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function message(o: Outcome | null): string {
  if (!o) return 'No code requested yet.'
  if (o.ok) return o.spent ? 'Code sent. One contact spent from every window.' : 'Resent inside the same verification episode. Nothing more spent.'
  if (o.reason === 'refused') return 'Not sent: the debtor has refused interaction. The site stays open; nothing is sent.'
  return `Not sent: ${o.window.cap} of ${o.window.cap} in the last ${o.window.label}. The allowance reopens at ${clock(o.nextAt)}, when the oldest of them ages out.`
}

export function SettlementLive({
  caption,
  table,
  loginCaption,
  loginTable,
  callCaps,
}: {
  caption: ReactNode
  table: ReactNode
  loginCaption: ReactNode
  loginTable: ReactNode
  callCaps: string
}) {
  // ── calculator ──────────────────────────────────────────────────────────
  const [debt, setDebt] = useState(DEBTS[1]!)
  const offered = offeredTerms(debt)
  const all = terms(debt)
  const defaultIndex = Math.max(0, offered.findIndex((t) => t.months >= 12))
  const [index, setIndex] = useState(defaultIndex)
  const [typed, setTyped] = useState('')
  const i = Math.min(index, offered.length - 1)
  const s = offered[i]!.s
  const hidden = all.filter((t) => !t.offered).length

  // What typing an amount chose, said once the reader stops typing (the slider and readouts it moves say nothing).
  const [heard, setHeard] = useState('')
  const heardTimer = useRef(0)
  useEffect(() => () => clearTimeout(heardTimer.current), [])
  const debtButtons = useRef<(HTMLButtonElement | null)[]>([])
  const chooseDebt = (d: number) => {
    // A typed amount's answer, still to be said, is for the old debt: it is not said.
    clearTimeout(heardTimer.current)
    setHeard('')
    setDebt(d)
    const o = offeredTerms(d)
    setIndex(Math.max(0, o.findIndex((t) => t.months >= 12)))
    setTyped('')
  }
  // What an amount typed chooses, in words: shown under the field as it is typed, and said once the typing stops.
  const termWords = (t: (typeof offered)[number]) => (t.months === 1 ? `one payment of ${rub(t.s.monthly)}` : `${t.months} months, ${rub(t.s.monthly)} a month`)
  const typedFor = (v: string): { text: string; invalid: boolean } => {
    if (!v.trim()) return { text: '', invalid: false }
    const roubles = Number.parseInt(v.replace(/[.,]\d{1,2}\s*$/, '').replace(/[^\d]/g, ''), 10)
    if (!/\d/.test(v)) return { text: 'An amount in roubles, in figures.', invalid: true }
    if (!(roubles > 0)) return { text: 'More than 0 ₽ a month.', invalid: true }
    const t = offered.find((o) => o.months === termForMonthly(debt, roubles * 100))!
    const longest = offered.reduce((a, o) => (o.months > a.months ? o : a))
    return roubles * 100 < longest.s.monthly
      ? { text: `No offered term is that low: the longest, ${termWords(longest)}.`, invalid: false }
      : { text: `Fits: ${termWords(t)}.`, invalid: false }
  }
  const typedNote = typedFor(typed)
  const onTyped = (v: string) => {
    setTyped(v)
    clearTimeout(heardTimer.current)
    const roubles = Number.parseInt(v.replace(/[.,]\d{1,2}\s*$/, '').replace(/[^\d]/g, ''), 10)
    if (Number.isFinite(roubles) && roubles > 0) {
      const months = termForMonthly(debt, roubles * 100)
      setIndex(offered.findIndex((t) => t.months === months))
    }
    const said = typedFor(v).text
    if (said) heardTimer.current = window.setTimeout(() => setHeard(said), 700)
  }

  // ── contact allowance ───────────────────────────────────────────────────
  const [now, setNow] = useState(0)
  const [allowance, setAllowance] = useState<Allowance>({ episodes: [], refused: false })
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  // Requests made, so a repeated outcome still reads as an answer: its sentence arrives again, through a 3px blur.
  const [asked, setAsked] = useState(0)
  const request = () => {
    const r = requestCode(allowance, now)
    setAllowance(r.next)
    setOutcome(r.outcome)
    setAsked((n) => n + 1)
  }
  const inEpisode = allowance.episodes.length > 0 && now - allowance.episodes.at(-1)! < EPISODE_MS

  // Controls that act press to 0.97; a radio group's selection changes fill instead (DESIGN.md, Buttons).

  const rail = (
    <Readouts
      rows={[
        { label: 'Debt', value: rub(debt) },
        { label: 'Term', value: s.months === 1 ? 'one payment' : `${s.months} months` },
        { label: 'Discount', value: `${(s.bp / 100).toFixed(0)}%` },
        { label: 'Pays in total', value: rub(s.payable) },
        { label: s.months === 1 ? 'Single payment' : 'Monthly', value: rub(s.monthly) },
        { label: 'Last payment', value: rub(s.last) },
      ]}
    />
  )
  // The login's own margin: the simulated clock and the state of the allowance, which the meters draw.
  const loginRail = (
    <Readouts
      rows={[
        { label: 'Simulated clock', value: clock(now) },
        { label: 'Interaction', value: allowance.refused ? 'refused (art. 8)' : 'allowed' },
      ]}
    />
  )
  // A refusal to send goes stale once the clock passes the time it named: then it says the allowance has reopened.
  const said =
    outcome && !outcome.ok && outcome.reason !== 'refused' && now >= outcome.nextAt
      ? `The allowance reopened at ${clock(outcome.nextAt)}: the next code can be sent.`
      : message(outcome)

  // Monthly payment against term: every term up to the floor, the offered ones
  // joined, the pruned ones left hanging above the line where a longer term
  // would cost more a month. The ladder's steps are the dashed rules.
  const maxM = all.length
  const maxPay = Math.max(...all.map((t) => t.s.monthly))
  const minPay = Math.min(...all.map((t) => t.s.monthly))
  // Inset 2% each side, so the first and last dots sit inside the frame.
  const px = (m: number) => (maxM === 1 ? 50 : 2 + ((m - 1) / (maxM - 1)) * 96)
  const py = (v: number) => (maxPay === minPay ? 50 : 6 + (1 - (v - minPay) / (maxPay - minPay)) * 88)
  const stepPath = offered.map((t, k) => `${k ? 'L' : 'M'}${px(t.months).toFixed(2)} ${py(t.s.monthly).toFixed(2)}`).join('')

  return (
    <>
    <FigureFrame
      id="fig-settlement"
      number="Fig. 1"
      vt="debt-portal"
      title="A settlement, with only the terms worth choosing"
      subtitle="the portal’s arithmetic · illustrative discount ladder, not the client’s terms"
      caption={caption}
      table={table}
      rail={rail}
      railBelow={false}
    >
        <section aria-labelledby="st-a">
          <h2 id="st-a" className="text-meta font-mono font-normal tracking-normal text-graphite">
            Settlement calculator
          </h2>
          <div role="radiogroup" aria-label="Debt" className="mt-2 flex flex-wrap gap-2">
            {DEBTS.map((d, di) => (
              <button
                key={d}
                ref={(el) => {
                  debtButtons.current[di] = el
                }}
                type="button"
                role="radio"
                aria-checked={debt === d}
                tabIndex={debt === d ? 0 : -1}
                onClick={() => chooseDebt(d)}
                onKeyDown={(e) => {
                  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
                  if (!step) return
                  e.preventDefault()
                  const next = (di + step + DEBTS.length) % DEBTS.length
                  chooseDebt(DEBTS[next]!)
                  debtButtons.current[next]?.focus()
                }}
                className={option(debt === d)}
              >
                {rub(d)}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem] sm:items-end sm:gap-6">
            <label className="block">
              <span className="text-meta font-mono text-graphite">
                Term: {s.months === 1 ? 'one payment' : `${s.months} months`}
              </span>
              <input
                type="range"
                min={0}
                max={offered.length - 1}
                step={1}
                value={i}
                disabled={offered.length === 1}
                aria-valuetext={s.months === 1 ? 'one payment' : `${s.months} months, ${rub(s.monthly)} a month`}
                onChange={(e) => {
                  setIndex(Number(e.currentTarget.value))
                  setTyped('')
                  clearTimeout(heardTimer.current)
                  setHeard('')
                }}
                className="mt-1 h-6 w-full"
                style={rangeFill(i, 0, offered.length - 1)}
              />
            </label>
            <label className="block">
              <span className="text-meta font-mono text-graphite">Can pay per month, ₽</span>
              <input
                inputMode="numeric"
                value={typed}
                onChange={(e) => onTyped(e.currentTarget.value)}
                placeholder="e.g. 4000"
                aria-invalid={typedNote.invalid || undefined}
                aria-describedby="settlement-typed"
                className="text-note tabular mt-1 w-full rounded-sm border border-graphite bg-paper px-2 py-1.5 text-ink placeholder:text-graphite pointer-coarse:text-small"
              />
            </label>
            {/* What the amount chose, for the eye at once (its line kept, so the page does not move as it appears). */}
            <p id="settlement-typed" className="text-meta mt-1 min-h-[1lh] font-mono text-graphite">
              {typedNote.text}
            </p>
            <p className="sr-only" aria-live="polite">
              {heard}
            </p>
          </div>

          {/* Not a live region: these follow the reader's own inputs, which speak for themselves. */}
          <dl className="text-meta mt-4 grid grid-cols-2 gap-x-6 gap-y-2 font-mono sm:grid-cols-4 lg:hidden">
            <div>
              <dt className="text-graphite">Discount</dt>
              <dd className="tabular text-ink">{(s.bp / 100).toFixed(0)}%</dd>
            </div>
            <div>
              <dt className="text-graphite">Pays in total</dt>
              <dd className="tabular text-ink">{rub(s.payable)}</dd>
            </div>
            <div>
              <dt className="text-graphite">{s.months === 1 ? 'Single payment' : 'Monthly'}</dt>
              <dd className="tabular text-ink">{rub(s.monthly)}</dd>
            </div>
            <div>
              <dt className="text-graphite">{s.months === 1 ? 'Saves' : 'Last payment'}</dt>
              <dd className="tabular text-ink">{s.months === 1 ? rub(s.saved) : rub(s.last)}</dd>
            </div>
          </dl>

          <div className="relative mt-5 h-36" role="img" aria-label={`Monthly payment by term for ${rub(debt)}: ${offered.length} terms offered, ${hidden} hidden because a shorter term costs less a month.`}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
              <rect x={0} y={0} width={100} height={100} fill="none" stroke="var(--color-rule)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              {LADDER.slice(0, -1)
                .filter(([upTo]) => upTo < maxM)
                .map(([upTo]) => (
                  <line key={upTo} x1={px(upTo + 0.5)} x2={px(upTo + 0.5)} y1={0} y2={100} stroke="var(--color-rule)" strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                ))}
              <path d={stepPath} fill="none" stroke="var(--color-indigo)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <line x1={px(s.months)} x2={px(s.months)} y1={0} y2={100} stroke="var(--color-ink)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </svg>
            {all.map((t) => (
              <span
                key={t.months}
                aria-hidden
                title={t.offered ? `${t.months} months: ${rub(t.s.monthly)} a month` : `${t.months} months: hidden, costs more a month than a shorter term`}
                className={`absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                  t.months === s.months ? 'bg-ink' : t.offered ? 'bg-indigo' : 'size-2.5 border-2 border-ink bg-paper'
                }`}
                style={{ left: `${px(t.months)}%`, top: `${py(t.s.monthly)}%` }}
              />
            ))}
            {/* Beside the point it names, the one-month payment, not in the far corner. */}
            <span
              aria-hidden
              className="text-meta absolute -translate-y-1/2 bg-paper px-0.5 font-mono text-graphite"
              style={{ left: `calc(${px(1)}% + 0.75rem)`, top: `${py(maxPay)}%` }}
            >
              {all.length > 1 ? `${rub(maxPay)} in one payment` : `${rub(maxPay)} a month`}
            </span>
            {/* The figure's claim, named where it is: the first hidden term and what it would cost, against the shorter
                term that costs less. */}
            {(() => {
              const h = all.find((t) => !t.offered)
              const before = h && all.filter((t) => t.offered && t.months < h.months).at(-1)
              if (!h || !before) return null
              const right = px(h.months) > 60
              return (
                <span
                  aria-hidden
                  data-hidden-term=""
                  className={`text-meta absolute -translate-y-[calc(100%+0.6rem)] bg-paper px-0.5 font-mono whitespace-nowrap text-ink ${right ? '-translate-x-full' : ''}`}
                  style={{ left: `${px(h.months)}%`, top: `${py(h.s.monthly)}%` }}
                >
                  {`hidden: ${h.months} months, ${rub(h.s.monthly)}, more than ${before.months}`}
                </span>
              )
            })()}
            {/* Above the line's low end, not on it: the last terms' dots sit there. */}
            <span
              aria-hidden
              className="text-meta absolute right-1.5 -translate-y-full bg-paper px-0.5 font-mono text-graphite"
              style={{ top: `calc(${py(minPay)}% - 0.5rem)` }}
            >
              {rub(minPay)} a month
            </span>
          </div>
          <div aria-hidden className="text-meta mt-1 flex justify-between font-mono text-graphite">
            <span>1 month</span>
            <span>{maxM} months</span>
          </div>
          <p className="text-meta mt-1.5 max-w-[36rem] font-mono text-graphite">
            {all.length === 1
              ? 'Under the monthly floor at any longer term: settles in one payment.'
              : `Monthly payment by term. ${offered.length} terms offered up to ${all.length} months${hidden ? `; ${hidden} hidden (hollow): at a step in the discount ladder a longer term would cost more a month` : ''}. Dashed lines are the ladder’s steps.`}
          </p>
        </section>
    </FigureFrame>

    <FigureFrame
      id="fig-login"
      number="Fig. 2"
      title="What each login code costs the debtor’s legal allowance"
      subtitle="230-FZ, Russia’s debt-collection law: article 7 caps the messages a debtor receives, article 8 lets them refuse contact"
      caption={loginCaption}
      table={loginTable}
      rail={loginRail}
      // On a phone its clock and the interaction state show under it: they are what +10 minutes and +1 day change.
      railBelow
      hint="Request a code, move the simulated clock, and request again: the meters show what each code spends"
    >
        <section aria-labelledby="st-b">
          <h2 id="st-b" className="text-meta font-mono font-normal tracking-normal text-graphite">
            The login’s statutory cost, in messages
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* Both labels in one cell, the one not shown kept invisible: the press changes its own words, never its
                width, so the controls beside it stay under the pointer. */}
            <button type="button" onClick={request} className={CONTROL}>
              <span className="grid text-center">
                <span className="invisible [grid-area:1/1]" aria-hidden>
                  {inEpisode ? 'Request a login code' : 'Send the code again'}
                </span>
                <span className="[grid-area:1/1]">{inEpisode ? 'Send the code again' : 'Request a login code'}</span>
              </span>
            </button>
            <button type="button" onClick={() => setNow((t) => t + 10 * MIN)} className={CONTROL}>
              +10 minutes
            </button>
            <button type="button" onClick={() => setNow((t) => t + DAY)} className={CONTROL}>
              +1 day
            </button>
            <button
              type="button"
              onClick={() => {
                setNow(0)
                setAllowance({ episodes: [], refused: false })
                setOutcome(null)
              }}
              className={CONTROL}
            >
              Reset
            </button>
            <label className="text-meta ml-1 inline-flex min-h-9 items-center gap-2 py-1 font-mono text-ink">
              <input
                type="checkbox"
                checked={allowance.refused}
                onChange={(e) => {
                  // Read now: the updater runs later, when the event's currentTarget is already gone.
                  const refused = e.currentTarget.checked
                  setAllowance((a) => ({ ...a, refused }))
                }}
                className="size-5 accent-[var(--color-ink)]"
              />
              Interaction refused (art. 8)
            </label>
          </div>

          <div className="mt-3 grid gap-2">
            {WINDOWS.map((w) => {
              const n = used(allowance, now, w.ms)
              return (
                <div key={w.key} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-3">
                  <span className="text-meta font-mono text-graphite">{w.label}</span>
                  <span className="flex flex-wrap gap-1" aria-hidden>
                    {Array.from({ length: w.cap }, (_, k) => (
                      <span key={k} className={`size-3 border ${k < n ? 'border-indigo bg-indigo' : 'border-rule'} transition-colors duration-150 ease-out`} />
                    ))}
                  </span>
                  <span className="text-meta tabular text-right text-ink">
                    {n}/{w.cap}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-note mt-3 min-h-[3em]" aria-live="polite">
            {/* Through the blur only once an answer arrives: the page's first sentence is there when it loads. */}
            <span key={asked} className={`block ${asked ? 'transition-[filter] duration-[120ms] ease-out starting:blur-[3px] motion-reduce:transition-none' : ''}`}>
              {said}
            </span>
          </p>
          <p className="text-note mt-1 max-w-[36rem] text-graphite">{callCaps}</p>
        </section>
    </FigureFrame>
    </>
  )
}
