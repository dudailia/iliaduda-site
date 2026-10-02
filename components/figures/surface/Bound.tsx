'use client'

import { useState, type ReactNode } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { DOMAIN, ETA_BOUND, ETA_STEP, gWithEta, P } from '@/lib/svi'
import { CONTROL } from '@/components/stage/controls'
import { rangeFill } from '@/components/stage/range'

/** A typeset minus sign, as the margins everywhere else print one. */
const minus = (x: string) => x.replace('-', '−')

/**
 * Break the surface. Durrleman's g(k) at the shortest expiry, for a curvature
 * η the reader controls. Where g < 0 the smile implies a negative probability
 * density and a butterfly spread priced below zero: the arbitrage the paper's
 * parameters are chosen to rule out. The sufficient condition η(1 + |ρ|) ≤ 2
 * switches off long before arbitrage actually appears — the gap between the
 * two is what "sufficient, not necessary" looks like. No motion: the slider is
 * a direct control.
 */

const K0 = -0.6
const K1 = 0.4
const N = 240
const ETA_MAX = 4
const T = DOMAIN.tMin
/**
 * The scale is fixed, so moving η changes the curve and never the axes: from under the deepest dip the slider reaches
 * (−0.43 at η 4) to 3, over the hump at the surface's own η (1.64). Past 3 the hump is cut off at the top, with its
 * height written there.
 */
const LO = -0.6
const HI = 3
const GRID = [1, 2] as const

export function BoundLive({ caption, table, description }: { caption: ReactNode; table: ReactNode; description: string }) {
  const [eta, setEta] = useState(P.eta)
  const ks = Array.from({ length: N + 1 }, (_, i) => K0 + ((K1 - K0) * i) / N)
  const gs = ks.map((k) => gWithEta(k, T, eta))
  const x = (i: number) => (i / N) * 100
  const y = (v: number) => ((HI - v) / (HI - LO)) * 100
  const path = gs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join('')
  const peak = Math.max(...gs)
  const peakAt = gs.indexOf(peak)
  // The region below zero, filled between the curve and the axis.
  const neg = gs.map((v, i) => [x(i), y(Math.min(0, v))] as const)
  const negPath = `M0 ${y(0)}${neg.map(([a, b]) => `L${a.toFixed(2)} ${b.toFixed(2)}`).join('')}L100 ${y(0)}Z`
  const minG = Math.min(...gs)
  const lowest = gs.indexOf(minG)
  const at = ks[lowest]!
  const arbitrage = minG < 0
  // Where g comes back up through zero after its dip: the label stands just past it, under zero, where the curve is not.
  let up = lowest
  while (up < N && gs[up]! < 0) up++
  const sufficient = eta * (1 + Math.abs(P.rho)) <= 2

  return (
    <FigureFrame
      id="fig-bound"
      number="Fig. 2"
      title="Push the curvature until the surface breaks"
      subtitle={`Synthetic SSVI · Durrleman’s g(k) at the shortest expiry drawn · the implied density is negative where g < 0 · ρ held at ${minus(String(P.rho))}`}
      caption={caption}
      table={table}
      rail={
        <Readouts
          rows={[
            { label: 'Curvature η', value: eta.toFixed(2) },
            { label: 'η(1 + |ρ|)', value: `${(eta * (1 + Math.abs(P.rho))).toFixed(2)} ${sufficient ? '≤' : '>'} 2` },
            { label: 'Sufficient condition', value: sufficient ? 'holds' : 'no longer guarantees' },
            // Over the drawn window of k: with no dip, the lowest is at its edge, and g falls further out.
            { label: 'Lowest g drawn', value: `${minus(minG.toFixed(3))} at k\u00a0=\u00a0${minus(at.toFixed(2))}` },
            { label: 'Butterfly arbitrage', value: arbitrage ? 'present' : 'none' },
          ]}
        />
      }
    >
      <div className="relative h-56" role="img" aria-label={description}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-hidden" aria-hidden>
          {GRID.map((v) => (
            <line key={v} x1={0} x2={100} y1={y(v)} y2={y(v)} stroke="var(--color-rule)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={0} x2={100} y1={y(0)} y2={y(0)} stroke="var(--color-ink)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={((0 - K0) / (K1 - K0)) * 100} x2={((0 - K0) / (K1 - K0)) * 100} y1={0} y2={100} stroke="var(--color-rule)" strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {/* The claim: where the density is negative, in indigo, strong enough to see. */}
          {arbitrage ? <path d={negPath} fill="var(--color-indigo)" fillOpacity={0.35} stroke="none" /> : null}
          <path data-g="" d={path} fill="none" stroke="var(--color-indigo)" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
          <rect x={0} y={0} width={100} height={100} fill="none" stroke="var(--color-graphite)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </svg>
        <span aria-hidden className="text-meta absolute left-1.5 bg-paper px-0.5 font-mono text-ink" style={{ top: `calc(${y(0)}% + 2px)` }}>
          g = 0
        </span>
        {GRID.map((v) => (
          <span key={v} aria-hidden className="text-meta absolute left-1.5 bg-paper px-0.5 font-mono text-graphite" style={{ top: `calc(${y(v)}% + 2px)` }}>
            {v}
          </span>
        ))}
        {peak > HI ? (
          // The hump runs off the top of the scale: its height, written where it leaves.
          <span aria-hidden className="text-meta absolute top-1 -translate-x-1/2 bg-paper px-0.5 font-mono text-graphite" style={{ left: `${Math.min(88, Math.max(12, x(peakAt)))}%` }}>
            peak {peak.toFixed(2)}
          </span>
        ) : null}
        {arbitrage ? (
          <span aria-hidden className="text-meta absolute bg-paper px-0.5 font-mono text-indigo" style={{ left: `calc(${Math.min(72, x(up))}% + 6px)`, top: `calc(${y(0)}% + 2px)` }}>
            negative density
          </span>
        ) : null}
      </div>
      <div aria-hidden className="text-meta relative mt-1 flex justify-between font-mono text-graphite">
        <span>{Math.round(Math.exp(K0) * 100)}% strike</span>
        {/* Under its own dashed line (k = 0 is 60% along), not at the middle of the axis. */}
        <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap" style={{ left: `${((0 - K0) / (K1 - K0)) * 100}%` }}>
          at the money
        </span>
        <span>{Math.round(Math.exp(K1) * 100)}%</span>
      </div>

      <label className="mt-4 block">
        <span className="text-meta block font-mono text-graphite">Curvature η — the surface uses {P.eta}; the sufficient bound is {ETA_BOUND.toFixed(2)}</span>
        <input
          type="range"
          min={0.4}
          max={ETA_MAX}
          step={ETA_STEP}
          value={eta}
          onChange={(e) => setEta(Number(e.currentTarget.value))}
          aria-valuetext={`eta ${eta.toFixed(2)}; ${arbitrage ? `butterfly arbitrage, lowest g drawn ${minG.toFixed(3)}` : 'no butterfly arbitrage'}`}
          className="mt-1 h-6 w-full pointer-coarse:mt-[calc(0.25rem-10px)] pointer-coarse:mb-[-2px] pointer-coarse:h-11 pointer-coarse:align-top"
          style={rangeFill(eta, 0.4, ETA_MAX)}
        />
      </label>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setEta(P.eta)}
          className={CONTROL}
        >
          Back to the surface’s η
        </button>
      </div>
    </FigureFrame>
  )
}
