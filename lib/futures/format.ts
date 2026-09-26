/**
 * An estimate and its ± 2 SE, to the precision the error allows: two
 * significant figures of the band, and two to four decimals. A still frame's
 * CPU estimate reads 11.32 ± 0.28, the finished GPU run 11.3486 ± 0.0022.
 */
export function withError(mean: number, se: number): string {
  const band = 2 * se
  const d = Math.min(4, Math.max(2, 1 - Math.floor(Math.log10(Math.max(band, 1e-12)))))
  return `${mean.toFixed(d)} ± ${band.toFixed(d)}`
}
