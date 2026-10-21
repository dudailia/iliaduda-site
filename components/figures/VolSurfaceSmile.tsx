import { Figure, type Arrangement } from '@/components/Figure'
import { ACCENT, GRAPHITE, INK, RULE, SMALL } from '@/components/figureKit'
import { fact } from '@/content/facts'
import snap from '@/lib/volsurface/snapshot.json'
import { essviSlice, sliceVol, ssviSlice } from '@/lib/volsurface/ssvi'

/**
 * Fig. 1 of /vol-surface: one expiry of the archived snapshot with both fits. Bid-to-ask bars and mid dots in indigo
 * (the measurement); eSSVI solid and SSVI dashed in ink (the models); quotes that fail a raw static-arbitrage check
 * ringed. Drawn from vol-surface-live paper/data/snapshot-2026-10-20T0154Z.json, not typed in.
 *
 * The page's one bold figure, so it ships two arrangements as the other papers' Fig. 1s do: the diagram width on a
 * phone, where its labels are the running text's size, and the measure from sm.
 */

const k0 = Math.min(...snap.k)
const k1 = Math.max(...snap.k)
// The vol axis in whole steps of five points around every quote.
const STEP = 5
const vLo = Math.floor((Math.min(...snap.bid) * 100) / STEP) * STEP
const vHi = Math.ceil((Math.max(...snap.ask) * 100) / STEP) * STEP
const ticks = Array.from({ length: (vHi - vLo) / STEP + 1 }, (_, i) => vLo + STEP * i)
const ssvi = ssviSlice(snap.ssvi.theta, snap.ssvi.rho, snap.ssvi.eta, snap.ssvi.gamma)
const essvi = essviSlice(snap.essvi.theta, snap.essvi.rho, snap.essvi.psi)
const ringed = snap.flags.filter((f) => f !== 0).length
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const inWords = (n: number) => WORDS[n] ?? String(n)

function arrangement(key: string, W: number, H: number, className: string): Arrangement {
  const PAD = { l: 34, r: 4, t: 8, b: 28 }
  const x = (k: number) => PAD.l + ((k - k0) / (k1 - k0)) * (W - PAD.l - PAD.r)
  const y = (v: number) => H - PAD.b - ((v * 100 - vLo) / (vHi - vLo)) * (H - PAD.t - PAD.b)
  const path = (sl: typeof ssvi) =>
    Array.from({ length: 81 }, (_, i) => k0 + ((k1 - k0) * i) / 80)
      .map((k, i) => `${i ? 'L' : 'M'}${x(k).toFixed(1)} ${y(sliceVol(k, sl, snap.T)).toFixed(1)}`)
      .join('')
  function Marks() {
    return (
      <g>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t / 100)} y2={y(t / 100)} stroke={RULE} />
            <text x={PAD.l - 6} y={y(t / 100)} dy="0.32em" textAnchor="end" className="font-mono" fontSize={SMALL} fill={GRAPHITE}>
              {`${t}%`}
            </text>
          </g>
        ))}
        <path d={path(ssvi)} fill="none" stroke={INK} strokeWidth={1.25} strokeDasharray="5 4" strokeOpacity={0.7} />
        <path d={path(essvi)} fill="none" stroke={INK} strokeWidth={1.5} />
        {snap.k.map((k, i) => (
          <g key={k}>
            <line x1={x(k)} x2={x(k)} y1={y(snap.bid[i]!)} y2={y(snap.ask[i]!)} stroke={ACCENT} strokeOpacity={0.5} strokeWidth={2} />
            <circle cx={x(k)} cy={y(snap.mid[i]!)} r={2.5} fill={ACCENT} />
            {snap.flags[i] !== 0 && <circle cx={x(k)} cy={y(snap.mid[i]!)} r={6} fill="none" stroke={INK} />}
          </g>
        ))}
        <text x={W - PAD.r} y={H - 6} textAnchor="end" className="font-mono" fontSize={SMALL} fill={GRAPHITE}>
          k = ln(K/F)
        </text>
      </g>
    )
  }
  return { key, viewBox: `0 0 ${W} ${H}`, width: W, height: H, Marks, className }
}

export function VolSurfaceSmile() {
  const n = snap.k.length
  return (
    <Figure
      id="fig-1"
      number="1"
      title={`Bitcoin options expiring ${snap.code}, 01:54 UTC on 20 October 2026`}
      description={`${n} quotes from bid to ask in implied vol, between ${vLo}% and ${vHi}%, against log-moneyness, with the eSSVI fit (solid) and the SSVI fit (dashed) drawn through their mids; ${ringed} quotes fail a raw static-arbitrage check at mid.`}
      caption={
        <>
          Bars run from bid to ask and dots are mids, against log-moneyness k. The solid line is eSSVI, the dashed line SSVI.
          Ringed, the {inWords(ringed)} quotes that fail a raw static-arbitrage check at mid. One of the{' '}
          {inWords(fact('vsBtcExpiries').value)} expiries fitted together; the live surface is at{' '}
          <a href="https://vol.iliaduda.com">vol.iliaduda.com</a>.
        </>
      }
      vt="vol-surface"
      arrangements={[arrangement('narrow', 336, 252, 'sm:hidden max-w-[336px]'), arrangement('wide', 620, 340, 'hidden sm:block max-w-[620px]')]}
    />
  )
}
