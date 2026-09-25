import { fact } from '@/content/facts'
import { DOMAIN, ETA_BOUND, gWithEta, P } from '@/lib/svi'
import { BoundLive } from './surface/Bound'

/**
 * Fig. 2 of the IV-surface paper: where the no-arbitrage construction fails.
 * The onset is found numerically here, on the server, so the caption states
 * it rather than a guess.
 */
function onset(): number {
  const minG = (eta: number) => Math.min(...Array.from({ length: 401 }, (_, i) => gWithEta(-0.6 + i / 400, DOMAIN.tMin, eta)))
  let lo = P.eta, hi = 4
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (minG(mid) < 0) hi = mid
    else lo = mid
  }
  return hi
}

export function ArbitrageBound() {
  const breaks = onset()
  return (
    <BoundLive
      description={`Durrleman's g across strikes at the shortest expiry. At the surface's own curvature, ${fact('ivEta').value}, g stays positive everywhere. The sufficient condition stops guaranteeing that at eta ${ETA_BOUND.toFixed(2)}; g first dips below zero, near the money, at about ${breaks.toFixed(2)}.`}
      caption={
        <>
          The surface sits at η = {fact('ivEta').value}. The condition that guarantees no butterfly
          arbitrage stops holding at {ETA_BOUND.toFixed(2)}, but the density only turns negative
          near {breaks.toFixed(2)}, just by the money at the shortest expiry: a sufficient
          condition buys certainty by giving up room. Past it, a butterfly around that strike
          would cost less than nothing.
        </>
      }
      table={
        <table>
          <caption>Lowest g at the shortest expiry, by curvature</caption>
          <thead>
            <tr>
              <th scope="col">η</th>
              <th scope="col">Lowest g</th>
            </tr>
          </thead>
          <tbody>
            {[fact('ivEta').value, ETA_BOUND, breaks, 3.5].map((e) => (
              <tr key={e}>
                <td>{e.toFixed(2)}</td>
                <td>{Math.min(...Array.from({ length: 401 }, (_, i) => gWithEta(-0.6 + i / 400, DOMAIN.tMin, e))).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}
