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

/** The simulated clock starts at 09:00 on day 1; past midnight it is the next day (it read "day 1, 00:00"). */
const START = 9 * 60 * MIN
const clock = (t: number) => {
  const at = t + START
  const day = Math.floor(at / DAY) + 1
  const m = Math.floor((at % DAY) / MIN)
  return `day ${day}, ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function message(o: Outcome | null): string {
  if (!o) return 'No code requested yet.'
  if (o.ok) return o.spent ? 'Code sent. One contact spent from every window.' : 'Resent inside the same verification episode. Nothing more spent.'
  if (o.reason === 'refused') return 'Not sent: the debtor has refused interaction. The site stays open; nothing is sent.'
  return `Not sent: ${o.window.cap} of ${o.window.cap} in the last ${o.window.label}. The allowance reopens at ${clock(o.nextAt)}, when the oldest of them ages out.`
}

export function SettlementLive({
  caption,
  loginCaption,
  loginTable,
  callCaps,
}: {
  caption: ReactNode
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
  /** The lines under a debt's plot: on a phone its first hidden term in words, and the plot's note. */
  const ladderNote = (d: number, shown: boolean) => {
    const all = terms(d)
    const offered = offeredTerms(d)
    const hidden = all.filter((t) => !t.offered).length
    const h = all.find((t) => !t.offered)
    const before = h && all.filter((t) => t.offered && t.months < h.months).at(-1)
    return (
      <>
        {/* In the plot it ran off its left edge and over the lowest payment's label. */}
        {h && before ? (
          <p aria-hidden {...(shown ? { 'data-hidden-term-line': '' } : {})} className="text-meta mt-1 font-mono text-ink sm:hidden">
            {`Hollow: ${h.months} months at ${rub(h.s.monthly)}, more a month than ${before.months} months at ${rub(before.s.monthly)}.`}
          </p>
        ) : null}
        {/* Whole on paper: it was cut mid-sentence across two sheets. */}
        <p className="text-meta mt-1.5 max-w-[36rem] font-mono text-graphite print:break-inside-avoid">
          {all.length === 1
            ? 'Under the monthly floor at any longer term: settles in one payment.'
            : (
              <>
                {`Monthly payment by term. ${offered.length} terms offered up to ${all.length}\u00a0months`}
                {hidden ? (
                  <>
                    {`; ${hidden} hidden (hollow`}
                    <span className="hidden sm:inline">{hidden > 1 ? ', the first magnified in the corner' : ', magnified in the corner'}</span>
                    {'): at a step in the discount ladder a longer term would cost more a month'}
                  </>
                ) : null}
                {'. Dashed lines are the ladder’s steps.'}
              </>
            )}
        </p>
      </>
    )
  }

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
    // In figures: digits, with spaces or a separator between thousands and kopecks, and a ₽ if the reader adds one
    // ("1e4" is not ten thousand roubles).
    if (!/\d/.test(v) || /[^\d\s.,\u00a0\u202f₽-]/.test(v)) return { text: 'An amount in rubles, in figures.', invalid: true }
    // A minus is not a payment: "-5" is not 5 ₽.
    if (!(roubles > 0) || /-\s*\d/.test(v)) return { text: 'More than 0 ₽ a month.', invalid: true }
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
    if (Number.isFinite(roubles) && roubles > 0 && !/-\s*\d/.test(v) && !/[^\d\s.,\u00a0\u202f₽-]/.test(v)) {
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
  /** The clock and the refusal the outcome was given under: once either moves, it is no longer the answer. */
  const [outcomeAt, setOutcomeAt] = useState({ now: 0, refused: false })
  // Requests made, so a repeated outcome still reads as an answer: its sentence arrives again, through a 3px blur.
  const [asked, setAsked] = useState(0)
  const request = () => {
    const r = requestCode(allowance, now)
    setAllowance(r.next)
    setOutcome(r.outcome)
    setOutcomeAt({ now, refused: allowance.refused })
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
        // One payment is its own last: the row says what it saves, as the phone's does (the rail said the same sum three times).
        s.months === 1 ? { label: 'Saves', value: rub(s.saved) } : { label: 'Last payment', value: rub(s.last) },
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
  // A refusal to send goes stale once the clock passes the time it named: then it says the allowance has reopened. One
  // for the debtor's refusal goes stale when the refusal is withdrawn (the rail said "allowed" beside it).
  // An answer stands until the clock or the refusal moves; then the line says what the next request would meet, asked
  // of the allowance as it stands (nothing spent). "Code sent" stayed beside a refusal and an emptied day's meter, and
  // "Resent inside the same episode" after the episode had closed. A refusal withdrawn, and a cap reopened, say so; a
  // block that still holds as it was keeps its words.
  const next = requestCode(allowance, now).outcome
  const stale = !!outcome && (now !== outcomeAt.now || allowance.refused !== outcomeAt.refused)
  const capWords = (o: Outcome) => (!o.ok && o.reason === 'cap' ? `${o.window.cap} of ${o.window.cap} in the last ${o.window.label}, until ${clock(o.nextAt)}` : '')
  const nextWords = (o: Outcome) =>
    o.ok
      ? o.spent
        ? 'A code can be requested: it would spend one contact from every window.'
        : 'Still inside the verification episode: a request resends the same code.'
      : o.reason === 'refused'
        ? 'The debtor has refused interaction: no code can be sent.'
        : `Not now: ${capWords(o)}.`
  const sameBlock = !!outcome && !outcome.ok && !next.ok && next.reason === outcome.reason && (next.reason !== 'cap' || (outcome.reason === 'cap' && next.nextAt === outcome.nextAt))
  const said = !outcome || !stale || sameBlock
    ? message(outcome)
    : !outcome.ok && outcome.reason === 'refused' && !allowance.refused
      ? next.ok
        ? 'The refusal is withdrawn: a code can be requested again.'
        : `The refusal is withdrawn, but the cap still holds: ${capWords(next)}.`
      : !outcome.ok && outcome.reason !== 'refused' && now >= outcome.nextAt
        ? next.ok
          ? `The allowance reopened at ${clock(outcome.nextAt)}: the next code can be sent.`
          : !next.ok && next.reason === 'refused'
            ? `The allowance reopened at ${clock(outcome.nextAt)}, but the debtor has refused interaction: nothing is sent.`
            : nextWords(next)
        : nextWords(next)

  // Monthly payment against term: every term up to the floor, the offered ones
  // joined, the pruned ones left hanging above the line where a longer term
  // would cost more a month. The ladder's steps are the dashed rules.
  const maxM = all.length
  const maxPay = Math.max(...all.map((t) => t.s.monthly))
  const minPay = Math.min(...all.map((t) => t.s.monthly))
  // Inset 2% each side, so the first and last dots sit inside the frame.
  const px = (m: number) => (maxM === 1 ? 50 : 2 + ((m - 1) / (maxM - 1)) * 96)
  const py = (v: number) => (maxPay === minPay ? 50 : 6 + (1 - (v - minPay) / (maxPay - minPay)) * 88)
  // The floor's label stands at the right end of the plot, a little over the line's low end, and over every dot under
  // its span (the right 42% of a phone's plot, the narrowest): a short ladder still has dots there (7,500 ₽ at 360px:
  // the 4-month dot sat under the label). Its foot in % of the plot, 3.5% (a dot's radius and a gap) over the highest.
  const floorFoot = Math.min(
    ...all.filter((t) => px(t.months) >= 56 && py(t.s.monthly) > py(minPay) - 26).map((t) => py(t.s.monthly) - 3.5),
  )
  const stepPath = offered.map((t, k) => `${k ? 'L' : 'M'}${px(t.months).toFixed(2)} ${py(t.s.monthly).toFixed(2)}`).join('')

  return (
    <>
    <FigureFrame
      id="fig-settlement"
      breakable
      number="Fig. 1"
      vt="debt-portal"
      title="A settlement, with only the terms worth choosing"
      subtitle="the portal’s arithmetic · illustrative discount ladder, not the client’s terms"
      caption={caption}
      // The sr-only table and live line in the mono face: their ₽ is then the mono supplement this page fetches anyway,
      // not a serif one for text no one sees (7,217 B).
      // The terms of the debt chosen, as the plot shows them (the server's table stayed at 60,000 ₽ whichever was picked).
      table={
        <div className="font-mono">
          <table>
            <caption>{`Offered terms for a debt of ${rub(debt)}`}</caption>
            <thead>
              <tr>
                <th scope="col">Months</th>
                <th scope="col">Discount</th>
                <th scope="col">Monthly</th>
                <th scope="col">Last payment</th>
              </tr>
            </thead>
            <tbody>
              {offered.map((t) => (
                <tr key={t.months}>
                  <td>{t.months}</td>
                  <td>{`${t.s.bp / 100}%`}</td>
                  <td>{rub(t.s.monthly)}</td>
                  <td>{rub(t.s.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
      rail={rail}
      railBelow={false}
    >
        {/* Named by its label, not a heading: the paper's outline is its sections, and no figure's title is a heading. */}
        <section aria-labelledby="st-a">
          <p id="st-a" className="text-meta font-mono font-normal tracking-normal text-graphite">
            Settlement calculator
          </p>
          <div role="radiogroup" aria-label="Debt" className="mt-2 flex flex-wrap gap-2 pointer-coarse:gap-y-3.5">
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

          {/* The two labels share a top; the slider sits on the amount box's middle line. */}
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem] sm:items-start sm:gap-6">
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
                className="mt-1 h-6 w-full sm:my-[calc((2.3125rem-1.5rem)/2+0.25rem)] pointer-coarse:mt-[calc(0.25rem-10px)] pointer-coarse:mb-[-2px] pointer-coarse:h-11 pointer-coarse:align-top sm:pointer-coarse:my-[calc((2.3125rem-1.5rem)/2+0.25rem-10px)]"
                style={rangeFill(i, 0, offered.length - 1)}
              />
            </label>
            {/* A typed amount does nothing on paper; the term above it says what is shown. */}
            <label className="block print:hidden">
              <span className="text-meta font-mono text-graphite">Can pay per month, ₽</span>
              <input
                inputMode="numeric"
                enterKeyHint="done"
                autoComplete="off"
                value={typed}
                onChange={(e) => onTyped(e.currentTarget.value)}
                placeholder="e.g. 4000"
                aria-invalid={typedNote.invalid || undefined}
                aria-describedby="settlement-typed"
                className="text-note tabular mt-1 w-full rounded-sm border border-graphite bg-paper px-2 py-1.5 text-ink placeholder:text-graphite aria-invalid:border-ink aria-invalid:shadow-[inset_0_0_0_1px_var(--color-ink)] pointer-coarse:text-small"
              />
            </label>
            {/* What the amount chose, for the eye at once, under the field it answers (beside the slider it sat under the
                term, a column away from what was typed): the longest answer's lines kept, two under a phone's full-width
                field and three in the narrow column, so the page does not move as it appears or changes. */}
            <p id="settlement-typed" className="text-meta mt-1 min-h-[2lh] font-mono text-graphite sm:col-start-2 sm:-mt-4 sm:min-h-[3lh]">
              {typedNote.text}
            </p>
            <p className="sr-only font-mono" aria-live="polite">
              {heard}
            </p>
          </div>

          {/* Sideways on a phone the readings stand beside the chart, one under another: under it with the chart, they
              took the chart below a 380px screen while the reader set the term. */}
          <div className="short:mt-5 short:grid short:grid-cols-[minmax(0,1fr)_12rem] short:items-start short:gap-x-6">
          {/* Not a live region: these follow the reader's own inputs, which speak for themselves. */}
          <dl className="text-meta mt-4 grid grid-cols-2 gap-x-6 gap-y-2 font-mono sm:grid-cols-4 short:order-last short:mt-0 short:grid-cols-1 lg:hidden">
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

          <div className="min-w-0">
          {/* Sideways on a phone 144px tall, room still for the hidden term's 7rem inset. */}
          <div className="relative mt-5 h-36 sm:h-44 short:mt-0 short:h-36 print:break-inside-avoid" role="img" aria-label={`Monthly payment by term for ${rub(debt)}: ${offered.length} terms offered, ${hidden} hidden because a shorter term costs less a month.`}>
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
              style={{ left: `calc(${px(1)}% + 0.5rem)`, top: `${py(maxPay)}%` }}
            >
              {all.length > 1 ? `${rub(maxPay)} in one payment` : `${rub(maxPay)} a month`}
            </span>
            {/* The figure's claim, named where it is: the first hidden term and what it would cost, against the shorter
                term that costs less. The step is tens of rubles on an axis of tens of thousands, a fraction of a
                pixel, so from a phone's width up it is drawn magnified in the empty corner above it, on a scale of its
                own; on a phone, where the corner is too small, a line under the axis names it (below). */}
            {(() => {
              const h = all.find((t) => !t.offered)
              const before = h && all.filter((t) => t.offered && t.months < h.months).at(-1)
              if (!h || !before) return null
                            // The step and its two sides only: the shorter term, the hidden one, and the next (a wider window's own fall
              // from month to month was larger than the step, and shrank it back to a few pixels).
              const win = all.filter((t) => t.months >= before.months && t.months <= h.months + 1)
              const lo = Math.min(...win.map((t) => t.s.monthly))
              const hi = Math.max(...win.map((t) => t.s.monthly))
              const wx = (m: number) => 10 + ((m - win[0]!.months) / Math.max(1, win.at(-1)!.months - win[0]!.months)) * 80
              const wy = (v: number) => (hi === lo ? 50 : 18 + (1 - (v - lo) / (hi - lo)) * 64)
              const line = win.filter((t) => t.offered).map((t, k) => `${k ? 'L' : 'M'}${wx(t.months).toFixed(2)} ${wy(t.s.monthly).toFixed(2)}`).join('')
              return (
                <>
                  <div aria-hidden data-hidden-term="" className="text-meta absolute top-1.5 right-1.5 hidden h-[7rem] w-[17rem] flex-col border border-rule bg-paper px-2 py-1 font-mono sm:flex">
                    <span className="whitespace-nowrap text-ink">{`hidden: ${h.months} months, ${rub(h.s.monthly)}`}</span>
                    <div className="relative min-h-0 flex-1">
                      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
                        <path d={line} fill="none" stroke="var(--color-indigo)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                      </svg>
                      {win.map((t) => (
                        <span
                          key={t.months}
                          data-inset-term={t.months}
                          className={`absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                            t.months === s.months ? 'bg-ink' : t.offered ? 'bg-indigo' : 'size-2.5 border-2 border-ink bg-paper'
                          }`}
                          style={{ left: `${wx(t.months)}%`, top: `${wy(t.s.monthly)}%` }}
                        />
                      ))}
                    </div>
                    <span className="whitespace-nowrap text-graphite">{`${before.months} months costs less: ${rub(before.s.monthly)}`}</span>
                  </div>
                </>
              )
            })()}
            {/* Above the line's low end, clear of it: the last terms' dots sit there, and where the line still falls
                toward them (a short ladder on a phone) a label at half the height lay on the line and the last dots. */}
            <span
              aria-hidden
              className="text-meta absolute right-1.5 -translate-y-full bg-paper px-0.5 font-mono text-graphite"
              style={{ top: Number.isFinite(floorFoot) ? `min(calc(${py(minPay)}% - 1rem), ${floorFoot}%)` : `calc(${py(minPay)}% - 1rem)` }}
            >
              {rub(minPay)} a month
            </span>
          </div>
          <div aria-hidden className="text-meta mt-1 flex justify-between font-mono text-graphite">
            <span>1 month</span>
            <span>{maxM} months</span>
          </div>
          {/* Under the plot: on a phone the hidden term in a sentence, and the plot's note. Every debt's are laid in one cell,
              the others unseen, so the room is the longest one's and choosing a debt moves nothing under the figure. */}
          <div className="grid">
            {DEBTS.map((d) => (
              <div key={d} aria-hidden={d !== debt || undefined} className={`[grid-area:1/1] ${d === debt ? '' : 'invisible'}`}>
                {ladderNote(d, d === debt)}
              </div>
            ))}
          </div>
          </div>
          </div>
        </section>
    </FigureFrame>

    <FigureFrame
      id="fig-login"
      number="Fig. 2"
      title="What each login code costs the debtor’s legal allowance"
      subtitle="230-FZ, Russia’s debt-collection law: article 7 caps the messages a debtor receives, article 8 lets them refuse contact"
      // The note on calls closes the caption: before the hint, it read as a second caption over the figure.
      caption={
        <>
          {loginCaption} {callCaps}
        </>
      }
      table={<div className="font-mono">{loginTable}</div>}
      rail={loginRail}
      // On a phone its clock and the interaction state show under the meters (below): they are what +10 minutes and
      // +1 day change, so they are read with the meters, before the note on calls.
      railBelow={false}
      hint="Request a code, move the simulated clock, and request again: the meters show what each code spends"
    >
        <section aria-labelledby="st-b">
          <p id="st-b" className="text-meta font-mono font-normal tracking-normal text-graphite">
            The login’s statutory cost, in messages
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 pointer-coarse:gap-y-3.5">
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
            <label className="text-meta ml-1 inline-flex min-h-9 pointer-coarse:min-h-11 cursor-pointer items-center gap-2 py-1 font-mono text-ink">
              {/* The site's own box, in its tokens (the browser's was a 2.4:1 gray by day and a gray slab by night): a
                  graphite border on paper, ink with a paper tick when checked. */}
              <span className="relative inline-grid size-5 shrink-0">
                <input
                  type="checkbox"
                  checked={allowance.refused}
                  onChange={(e) => {
                    // Read now: the updater runs later, when the event's currentTarget is already gone.
                    const refused = e.currentTarget.checked
                    setAllowance((a) => ({ ...a, refused }))
                  }}
                  className="peer size-5 cursor-pointer appearance-none rounded-sm border border-graphite bg-paper transition-colors duration-150 ease-out checked:border-ink checked:bg-ink hover:border-ink focus-visible:transition-none forced-colors:appearance-auto"
                />
                <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none invisible absolute inset-0 size-5 peer-checked:visible forced-colors:hidden">
                  <path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="var(--color-paper)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              Interaction refused (art. 8)
            </label>
          </div>

          <div className="mt-3 grid gap-2">
            {WINDOWS.map((w) => {
              const n = used(allowance, now, w.ms)
              // The count beside its squares, not at the far end of the row. On a phone the label and count columns are
              // as wide as "24 hours" and "16/16", so the thirty-day row fits a 312px column.
              return (
                <div key={w.key} className="grid grid-cols-[4.25rem_minmax(0,1fr)_2.5rem] items-center sm:grid-cols-[5.5rem_auto_3rem] justify-start gap-3">
                  <span className="text-meta font-mono text-graphite">{w.label}</span>
                  {/* One row at any width: on a phone the thirty-day meter's sixteen boxes are a little smaller, and under
                      22rem (a phone with a large font setting) smaller still, so the row fits its column. */}
                  <span className="flex gap-0.5 sm:flex-wrap sm:gap-1" aria-hidden>
                    {Array.from({ length: w.cap }, (_, k) => (
                      <span key={k} className={`size-[9px] shrink-0 border max-[22rem]:size-[6px] sm:size-3 ${k < n ? 'border-indigo bg-indigo' : 'border-rule'} transition-colors duration-150 ease-out`} />
                    ))}
                  </span>
                  <span className="text-meta tabular text-right text-ink">
                    {n}/{w.cap}
                  </span>
                </div>
              )
            })}
          </div>
          {/* Room for the longest answer: two lines, three on a phone, so an answer arriving moves nothing below it. */}
          <p className="text-note mt-3 min-h-[2lh] max-sm:min-h-[3lh]" aria-live="polite">
            {/* Through the blur only once an answer arrives: the page's first sentence is there when it loads. */}
            <span key={asked} className={`block ${asked ? 'transition-[filter] duration-[120ms] ease-out starting:blur-[3px] motion-reduce:transition-none' : ''}`}>
              {said}
            </span>
          </p>
          <div className="mt-3 lg:hidden">{loginRail}</div>
        </section>
    </FigureFrame>
    </>
  )
}
