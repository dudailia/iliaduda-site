'use client'

import { useState, type ReactNode } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { DOMAIN, ETA_BOUND, gWithEta, P } from '@/lib/svi'

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

export function BoundLive({ caption, table, description }: { caption: ReactNode; table: ReactNode; description: string }) {
  const [eta, setEta] = useState(P.eta)
  const ks = Array.from({ length: N + 1 }, (_, i) => K0 + ((K1 - K0) * i) / N)
  const gs = ks.map((k) => gWithEta(k, T, eta))
  const lo = Math.min(-0.5, ...gs)
  // Headroom over the peak, so the curve never touches the frame.
  const top = Math.max(1.1, ...gs)
  const hi = top + (top - lo) * 0.08
  const x = (i: number) => (i / N) * 100
  const y = (v: number) => ((hi - v) / (hi - lo)) * 100
  const path = gs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join('')
  // The region below zero, filled between the curve and the axis.
  const neg = gs.map((v, i) => [x(i), y(Math.min(0, v))] as const)
  const negPath = `M0 ${y(0)}${neg.map(([a, b]) => `L${a.toFixed(2)} ${b.toFixed(2)}`).join('')}L100 ${y(0)}Z`
  const minG = Math.min(...gs)
  const at = ks[gs.indexOf(minG)]!
  const arbitrage = minG < 0
  const sufficient = eta * (1 + Math.abs(P.rho)) <= 2

  return (
    <FigureFrame
      id="fig-bound"
      number="Fig. 2"
      title="Push the curvature until the surface breaks"
      subtitle={`Durrleman’s g(k) at the shortest expiry drawn · the implied density is negative where g < 0 · ρ held at ${P.rho}`}
      caption={caption}
      table={table}
      rail={
        <Readouts
          rows={[
            { label: 'Curvature η', value: eta.toFixed(2) },
            { label: 'η(1 + |ρ|)', value: `${(eta * (1 + Math.abs(P.rho))).toFixed(2)} ${sufficient ? '≤' : '>'} 2` },
            { label: 'Sufficient condition', value: sufficient ? 'holds' : 'no longer guarantees' },
            { label: 'Lowest g', value: `${minG.toFixed(3)} at k = ${at.toFixed(2)}` },
            { label: 'Butterfly arbitrage', value: arbitrage ? 'present' : 'none' },
          ]}
        />
      }
    >
      <div className="relative h-56" role="img" aria-label={description}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <rect x={0} y={0} width={100} height={100} fill="none" stroke="var(--color-graphite)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={100} y1={y(0)} y2={y(0)} stroke="var(--color-ink)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={((0 - K0) / (K1 - K0)) * 100} x2={((0 - K0) / (K1 - K0)) * 100} y1={0} y2={100} stroke="var(--color-rule)" strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {arbitrage ? <path d={negPath} fill="var(--color-indigo-wash)" stroke="none" /> : null}
          <path d={path} fill="none" stroke="var(--color-indigo)" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
        </svg>
        <span aria-hidden className="text-meta absolute left-1.5 bg-paper px-0.5 font-mono text-ink" style={{ top: `calc(${y(0)}% + 2px)` }}>
          g = 0
        </span>
        {arbitrage ? (
          <span aria-hidden className="text-meta absolute bg-paper px-0.5 font-mono text-indigo" style={{ left: `${Math.min(70, Math.max(2, ((at - K0) / (K1 - K0)) * 100 + 2))}%`, top: `calc(${y(minG)}% - 1.25rem)` }}>
            negative density
          </span>
        ) : null}
      </div>
      <div aria-hidden className="text-meta mt-1 flex justify-between font-mono text-graphite">
        <span>{Math.round(Math.exp(K0) * 100)}% strike</span>
        <span>at the money</span>
        <span>{Math.round(Math.exp(K1) * 100)}%</span>
      </div>

      <label className="mt-4 block">
        <span className="text-meta font-mono text-graphite">Curvature η — the surface uses {P.eta}; the sufficient bound is {ETA_BOUND.toFixed(2)}</span>
        <input
          type="range"
          min={0.4}
          max={ETA_MAX}
          step={0.01}
          value={eta}
          onChange={(e) => setEta(Number(e.currentTarget.value))}
          aria-valuetext={`eta ${eta.toFixed(2)}; ${arbitrage ? `butterfly arbitrage, lowest g ${minG.toFixed(3)}` : 'no butterfly arbitrage'}`}
          className="mt-1 h-6 w-full accent-[var(--color-indigo)]"
        />
      </label>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setEta(P.eta)}
          className="text-meta rounded-sm border border-rule px-2.5 py-1.5 font-mono transition-transform duration-150 ease-out active:scale-[0.97]"
        >
          Back to the surface’s η
        </button>
      </div>
    </FigureFrame>
  )
}
