/**
 * Marching squares: iso-lines of a scalar field sampled on a regular grid,
 * joined into polylines. Used at build time to draw the hero figure's poster —
 * a contour map of implied volatility — so the first paint is the real surface
 * in two dimensions rather than a placeholder waiting for WebGL.
 *
 * No saddle disambiguation beyond the centre-value rule: the fields drawn here
 * are smooth and monotone enough in each direction that ambiguous cells are
 * rare, and a wrong choice in one is a one-cell kink, not a wrong level.
 */

export type Pt = readonly [number, number]

/**
 * `values[j * nx + i]` is the field at column i, row j. Returns polylines in
 * grid coordinates (0..nx-1, 0..ny-1).
 */
export function contour(values: ArrayLike<number>, nx: number, ny: number, level: number): Pt[][] {
  const at = (i: number, j: number) => values[j * nx + i]!
  const lerp = (a: number, b: number) => (level - a) / (b - a)
  const segs: [Pt, Pt][] = []

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1)
      const code = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0)
      if (code === 0 || code === 15) continue
      const top: Pt = [i + lerp(a, b), j]
      const right: Pt = [i + 1, j + lerp(b, c)]
      const bottom: Pt = [i + lerp(d, c), j + 1]
      const left: Pt = [i, j + lerp(a, d)]
      const centreHigh = (a + b + c + d) / 4 > level
      switch (code) {
        case 1: case 14: segs.push([left, bottom]); break
        case 2: case 13: segs.push([bottom, right]); break
        case 3: case 12: segs.push([left, right]); break
        case 4: case 11: segs.push([top, right]); break
        case 6: case 9: segs.push([top, bottom]); break
        case 7: case 8: segs.push([left, top]); break
        case 5:
          if (centreHigh) segs.push([left, top], [bottom, right])
          else segs.push([left, bottom], [top, right])
          break
        case 10:
          if (centreHigh) segs.push([left, bottom], [top, right])
          else segs.push([left, top], [bottom, right])
          break
      }
    }
  }
  return join(segs)
}

/** Stitch segments sharing endpoints into polylines. */
function join(segs: [Pt, Pt][]): Pt[][] {
  const key = (p: Pt) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`
  const ends = new Map<string, number[]>()
  segs.forEach(([p, q], n) => {
    for (const e of [key(p), key(q)]) {
      const list = ends.get(e)
      if (list) list.push(n)
      else ends.set(e, [n])
    }
  })
  const used = new Uint8Array(segs.length)
  const lines: Pt[][] = []

  const extend = (line: Pt[], forward: boolean) => {
    for (;;) {
      const tip = forward ? line[line.length - 1]! : line[0]!
      const next = (ends.get(key(tip)) ?? []).find((n) => !used[n])
      if (next === undefined) return
      used[next] = 1
      const [p, q] = segs[next]!
      const far = key(p) === key(tip) ? q : p
      if (forward) line.push(far)
      else line.unshift(far)
    }
  }

  for (let n = 0; n < segs.length; n++) {
    if (used[n]) continue
    used[n] = 1
    const line: Pt[] = [segs[n]![0], segs[n]![1]]
    extend(line, true)
    extend(line, false)
    lines.push(line)
  }
  return lines
}

/** An SVG path for a polyline, rounded to a tenth of a unit. */
export function pathD(line: readonly Pt[]): string {
  return line.map(([x, y], n) => `${n ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')
}
