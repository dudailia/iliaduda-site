'use client'

import { useState, type ReactNode } from 'react'
import { FigureFrame } from '@/components/FigureFrame'
import { EPISODE_MS, requestCode, used, WINDOWS, type Allowance, type Outcome } from '@/lib/contact'
import { offeredTerms, rub, terms, termForMonthly } from '@/lib/settlement'

/**
 * Two things the portal's debtor path has to get right, side by side: what a
 * settlement costs, and what the login that shows it is allowed to cost in
 * statutory contacts. Both are the portal's own mechanics; the discount ladder
 * is illustrative. Nothing here animates: every control is a direct change,
 * and the numbers simply are what they are.
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
  return `Not sent: ${o.window.cap} of ${o.window.cap} in the last ${o.window.label}. Next code no earlier than ${clock(o.nextAt)}.`
}

export function SettlementLive({ caption, table, callCaps }: { caption: ReactNode; table: ReactNode; callCaps: string }) {
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

  const chooseDebt = (d: number) => {
    setDebt(d)
    const o = offeredTerms(d)
    setIndex(Math.max(0, o.findIndex((t) => t.months >= 12)))
    setTyped('')
  }
  const onTyped = (v: string) => {
    setTyped(v)
    const roubles = Number.parseInt(v.replace(/[^\d]/g, ''), 10)
    if (Number.isFinite(roubles) && roubles > 0) {
      const months = termForMonthly(debt, roubles * 100)
      setIndex(offered.findIndex((t) => t.months === months))
    }
  }

  // ── contact allowance ───────────────────────────────────────────────────
  const [now, setNow] = useState(0)
  const [allowance, setAllowance] = useState<Allowance>({ episodes: [], refused: false })
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const request = () => {
    const r = requestCode(allowance, now)
    setAllowance(r.next)
    setOutcome(r.outcome)
  }
  const inEpisode = allowance.episodes.length > 0 && now - allowance.episodes.at(-1)! < EPISODE_MS

  const btn = 'text-meta rounded-sm border px-2.5 py-1.5 font-mono transition-transform duration-150 ease-out active:scale-[0.97]'

  return (
    <FigureFrame
      id="fig-settlement"
      number="Fig. 1"
      vt="debt-portal"
      title="A settlement, and what the login that shows it may cost"
      subtitle="the portal’s arithmetic and contact rules · illustrative discount ladder, not the client’s terms"
      caption={caption}
      table={table}
    >
      <div className="grid gap-y-8">
        {/* Panel A — the calculator */}
        <section aria-labelledby="st-a">
          <h3 id="st-a" className="text-meta font-mono font-normal tracking-normal text-graphite">
            Settlement calculator
          </h3>
          <div role="radiogroup" aria-label="Debt" className="mt-2 flex flex-wrap gap-2">
            {DEBTS.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={debt === d}
                onClick={() => chooseDebt(d)}
                className={`${btn} ${debt === d ? 'border-ink bg-ink text-paper' : 'border-rule text-ink'}`}
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
                }}
                className="mt-1 w-full accent-[var(--color-indigo)]"
              />
            </label>
            <label className="block">
              <span className="text-meta font-mono text-graphite">Can pay per month, ₽</span>
              <input
                inputMode="numeric"
                value={typed}
                onChange={(e) => onTyped(e.currentTarget.value)}
                placeholder="e.g. 4000"
                className="text-note tabular mt-1 w-full rounded-sm border border-rule bg-paper px-2 py-1.5 text-ink placeholder:text-graphite"
              />
            </label>
          </div>

          <dl className="text-meta mt-4 grid grid-cols-2 gap-x-6 gap-y-2 font-mono sm:grid-cols-4" aria-live="polite">
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

          {/* The schedule: one bar per payment, the last one shorter. */}
          <div className="mt-4 flex h-12 items-end gap-px" aria-hidden>
            {Array.from({ length: s.months }, (_, m) => (
              <span
                key={m}
                className="flex-1 bg-indigo"
                style={{ height: `${((m === s.months - 1 ? s.last : s.monthly) / s.monthly) * 100}%`, maxWidth: '1.5rem' }}
              />
            ))}
          </div>

          {/* Every term up to the floor; the hidden ones are worse in every way. */}
          <div className="mt-3 flex flex-wrap gap-px" aria-hidden>
            {all.map((t) => (
              <span
                key={t.months}
                title={t.offered ? `${t.months} months, offered` : `${t.months} months, hidden: costs more a month than a shorter term`}
                className={`h-2 w-2.5 ${t.months === s.months ? 'bg-ink' : t.offered ? 'bg-indigo-wash' : 'border border-rule'}`}
              />
            ))}
          </div>
          <p className="text-meta mt-1.5 font-mono text-graphite">
            {all.length === 1
              ? 'Under the monthly floor at any longer term: settles in one payment.'
              : `${offered.length} terms offered up to ${all.length} months${hidden ? `; ${hidden} hidden at the ladder’s cliffs, where a longer term would cost more a month` : ''}.`}
          </p>
        </section>

        {/* Panel B — the contact allowance */}
        <section aria-labelledby="st-b">
          <h3 id="st-b" className="text-meta font-mono font-normal tracking-normal text-graphite">
            The login’s statutory cost · 230-FZ art. 7, messages
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={request} className={`${btn} border-ink text-ink`}>
              {inEpisode ? 'Send the code again' : 'Request a login code'}
            </button>
            <button type="button" onClick={() => setNow((t) => t + 10 * MIN)} className={`${btn} border-rule text-ink`}>
              +10 minutes
            </button>
            <button type="button" onClick={() => setNow((t) => t + DAY)} className={`${btn} border-rule text-ink`}>
              +1 day
            </button>
            <label className="text-meta ml-1 inline-flex items-center gap-2 font-mono text-ink">
              <input
                type="checkbox"
                checked={allowance.refused}
                onChange={(e) => setAllowance((a) => ({ ...a, refused: e.currentTarget.checked }))}
                className="accent-[var(--color-indigo)]"
              />
              Interaction refused (art. 8)
            </label>
          </div>
          <p className="text-meta mt-2 font-mono text-graphite">Clock: {clock(now)}</p>

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
            {message(outcome)}
          </p>
          <p className="text-meta mt-1 font-mono text-graphite">{callCaps}</p>
        </section>
      </div>
    </FigureFrame>
  )
}
