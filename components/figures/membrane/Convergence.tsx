'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { option } from '@/components/stage/controls'
import { useRadios } from '@/components/stage/radios'
import { rangeFill } from '@/components/stage/range'
import { besselJ, besselZeros } from '@/lib/membrane/bessel'
import { modeNorm, profileCoefficients, PROFILES, quad } from '@/lib/membrane/expand'
import { MODES_EXERCISE, MODES_MAX } from '@/lib/membrane/view'

/**
 * Fig. 2 of /membrane: one radial profile from the exercises (section 3.3), against its Fourier–Bessel series in J₀ or
 * J₁, for as many terms as the reader keeps. The series is the claim (indigo), the profile the context. A profile
 * that does not vanish at r = 1 is matched everywhere but there: every term is zero at the rim, so the series
 * overshoots on the way in, however many terms it keeps.
 */

const W = 1000
const H = 420
const PAD = { l: 64, r: 16, t: 16, b: 12 }
const N = 240
const num = (x: number, d = 4) => x.toFixed(d).replace('-', '−')

export function ConvergenceLive({ caption }: { caption: ReactNode }) {
  const [pid, setPid] = useState(PROFILES[0]!.id)
  const [order, setOrder] = useState<0 | 1>(0)
  const [terms, setTerms] = useState(MODES_EXERCISE)
  const p = PROFILES.find((x) => x.id === pid)!

  const model = useMemo(() => {
    const zs = besselZeros(order, terms)
    const c = profileCoefficients(p, order, terms)
    const xs = Array.from({ length: N + 1 }, (_, i) => i / N)
    const exact = xs.map((r) => p.radial(r))
    const series = xs.map((r) => c.reduce((s, cm, m) => s + cm * besselJ(order, zs[m]! * r), 0))
    const all = [...exact, ...series]
    const lo = Math.min(0, ...all), hi = Math.max(0, ...all)
    const pad = (hi - lo) * 0.08
    const whole = quad((r) => p.radial(r) ** 2 * r, 0, 1, 16, p.breaks ?? [])
    const kept = c.reduce((s, cm, m) => s + cm * cm * modeNorm(order, zs[m]!), 0)
    // As a share of the profile's own size: the same number Fig. 1 reads for the same profile struck as a drum.
    return { zs, c, xs, exact, series, lo: lo - pad, hi: hi + pad, err: Math.sqrt(Math.max(0, whole - kept) / whole) }
  }, [p, order, terms])
  const pids = PROFILES.map((x) => x.id)
  const profileRadio = useRadios(pid, (k) => setPid(k))
  const orderRadio = useRadios<0 | 1>(order, (k) => setOrder(k))
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`

  const X = (r: number) => PAD.l + r * (W - PAD.l - PAD.r)
  const Y = (v: number) => PAD.t + ((model.hi - v) / (model.hi - model.lo)) * (H - PAD.t - PAD.b)
  const line = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${X(model.xs[i]!).toFixed(1)} ${Y(v).toFixed(1)}`).join('')
  // The ends and zero, the low end left out when it would crowd zero.
  const span = model.hi - model.lo
  const ticks = [model.lo, 0, model.hi].filter((v, i) => i === 1 || Math.abs(v) > 0.18 * span).map((v) => Number(v.toFixed(1)))

  return (
    <FigureFrame
      id="fig-convergence"
      number="Fig. 2"
      title="A profile from the exercises, against its Fourier–Bessel series."
      subtitle={`${p.formula} · in J${order} · ${terms} term${terms === 1 ? '' : 's'}`}
      rail={
        <Readouts
          rows={[
            { label: 'Profile', value: p.formula },
            { label: 'Terms kept', value: String(terms) },
            { label: 'Error (L², relative)', value: pct(model.err) },
            { label: 'First coefficients', value: model.c.slice(0, 2).map((v) => num(v)).join(', ') },
          ]}
        />
      }
      hint="Pick a profile, the Bessel function to expand it in, and how many terms to keep."
      caption={caption}
    >
      {/* Axis labels in HTML, at the site's label size whatever the figure's width. */}
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby="fig-convergence-svg-title" aria-describedby="fig-convergence-svg-desc">
          <title id="fig-convergence-svg-title">{`${p.formula}, and its series in J${order} to ${terms} terms`}</title>
          <desc id="fig-convergence-svg-desc">{`The profile ${p.formula} on 0 to 1, with its Fourier–Bessel series in J${order} kept to ${terms} terms; the error in the mean is ${pct(model.err)} of the profile. Every term is zero at r = 1.`}</desc>
          <line x1={PAD.l} x2={W - PAD.r} y1={Y(0)} y2={Y(0)} stroke="var(--color-rule)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={X(1)} x2={X(1)} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-ink)" strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={line(model.exact)} fill="none" stroke="var(--color-graphite)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path d={line(model.series)} fill="none" stroke="var(--color-indigo)" strokeWidth={2.25} vectorEffect="non-scaling-stroke" />
        </svg>
        {ticks.map((v) => (
          <span
            key={v}
            aria-hidden
            className="text-meta absolute -translate-x-full -translate-y-1/2 pr-2 font-mono text-graphite tabular"
            style={{ left: `${(PAD.l / W) * 100}%`, top: `${(Y(v) / H) * 100}%` }}
          >
            {String(v).replace('-', '−')}
          </span>
        ))}
      </div>
      <div aria-hidden className="text-meta flex justify-between font-mono text-graphite" style={{ paddingLeft: `${(PAD.l / W) * 100}%`, paddingRight: `${(PAD.r / W) * 100}%` }}>
        <span>r = 0</span>
        <span className="text-ink">r = 1, the rim</span>
      </div>
      {/* The coefficients' sizes, on a log scale from 10 down to 10⁻⁴: what each further term adds. A slot for every
          term the slider can keep, under the plot's own r axis, so two terms are two bars of twenty, not two stubs. */}
      <div aria-hidden className="relative mt-4" style={{ marginLeft: `${(PAD.l / W) * 100}%`, marginRight: `${(PAD.r / W) * 100}%` }}>
        <div className="flex h-16 items-end border-b border-rule">
          {Array.from({ length: MODES_MAX }, (_, m) => {
            const v = model.c[m]
            const lg = v === undefined ? null : Math.log10(Math.max(Math.abs(v), 1e-4))
            return (
              <div key={m} className="flex h-full flex-1 items-end justify-center">
                {lg === null ? null : (
                  <span className={`w-1/2 max-w-3 ${m < MODES_EXERCISE ? 'bg-indigo' : 'bg-graphite/45'}`} style={{ height: `${Math.min(1, (lg + 4) / 5) * 100}%` }} />
                )}
              </div>
            )
          })}
        </div>
        <span className="text-meta absolute top-0 left-0 -translate-x-full -translate-y-1/2 pr-2 font-mono text-graphite tabular">10</span>
        <span className="text-meta absolute bottom-0 left-0 -translate-x-full translate-y-1/2 pr-2 font-mono text-graphite tabular">
          10<sup>−4</sup>
        </span>
        <div className="text-meta flex font-mono text-graphite tabular">
          {Array.from({ length: MODES_MAX }, (_, m) => (
            <span key={m} className="flex-1 text-center">
              {m === 0 || (m + 1) % 5 === 0 ? m + 1 : ''}
            </span>
          ))}
        </div>
      </div>
      <p aria-hidden className="text-meta mt-1 font-mono text-graphite">
        |coefficient| by term, log scale (the exercises&rsquo; two in indigo)
      </p>

      <div className="mt-3 grid gap-y-3">
        <div role="radiogroup" aria-label="Profile" className="flex flex-wrap gap-2">
          {PROFILES.map((x) => (
            <button key={x.id} {...profileRadio(x.id, pids)} className={option(x.id === pid)}>
              {x.label}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Expanded in" className="flex flex-wrap gap-2">
          {([0, 1] as const).map((n) => (
            <button key={n} {...orderRadio(n, [0, 1])} className={option(order === n)}>
              {`J${n}`}
            </button>
          ))}
        </div>
        <label className="block max-w-[28rem]">
          <span className="text-meta font-mono text-graphite">
            Terms <span className="tabular text-ink">{terms}</span>
          </span>
          <input
            type="range"
            min={1}
            max={MODES_MAX}
            step={1}
            value={terms}
            aria-valuetext={`${terms} terms`}
            onChange={(ev) => setTerms(Number(ev.currentTarget.value))}
            className="mt-0.5 block h-6 w-full"
            style={rangeFill(terms, 1, MODES_MAX)}
          />
        </label>
      </div>
    </FigureFrame>
  )
}
