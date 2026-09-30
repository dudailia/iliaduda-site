import { CONTEXT_MIX, mixHex, TH, TW, type Pts, type Shape } from '@/lib/minis/shape'

/** The colours a miniature draws in: the thumbnail's own (components/PaperThumb.tsx). */
export interface MiniPalette {
  paper: string
  rule: string
  indigo: string
  wash: string
}

export const palette = (): MiniPalette => {
  const s = getComputedStyle(document.documentElement)
  const v = (n: string) => s.getPropertyValue(n).trim()
  // The context tone the thumbnail's SVG strokes with (lib/minis/shape.ts, CONTEXT_CSS), mixed here.
  return { paper: v('--color-paper'), rule: mixHex(v('--color-graphite'), v('--color-paper'), CONTEXT_MIX), indigo: v('--color-indigo'), wash: v('--color-indigo-wash') }
}

/** A running miniature: `ready` once it can draw its first frame, which is the thumbnail; then a frame at its own time. */
export interface Mini {
  ready(): boolean
  draw(g: CanvasRenderingContext2D, w: number, h: number, t: number, dt: number, pal: MiniPalette): void
  /** For the engine's minis: the simulated time the market is at, handed to the paper through the morph. */
  time?(): number
  /** Whether its own time `t` is between two of its moves (none mid-glide): a mini losing its turn plays on to one. */
  atRest?(t: number): boolean
}
export type MakeMini = (svg: SVGSVGElement) => Mini

const path = (g: CanvasRenderingContext2D, pts: Pts, sx: number, sy: number) => {
  g.beginPath()
  pts.forEach(([x, y], i) => (i ? g.lineTo(x * sx, y * sy) : g.moveTo(x * sx, y * sy)))
  g.stroke()
}

/** Draws a shape as the thumbnail does: context in its context tone at 1px, bars and the claim (1.5px) in indigo. */
export function paint(g: CanvasRenderingContext2D, sh: Shape, w: number, h: number, pal: MiniPalette): void {
  const sx = w / TW, sy = h / TH
  g.fillStyle = pal.paper
  g.fillRect(0, 0, w, h)
  g.lineJoin = 'round'
  g.strokeStyle = pal.rule
  g.lineWidth = 1
  for (const p of sh.context) path(g, p, sx, sy)
  g.fillStyle = pal.wash
  for (const [x, y, bw, bh] of sh.quiet ?? []) g.fillRect(x * sx, y * sy, bw * sx, bh * sy)
  g.fillStyle = pal.indigo
  for (const [x, y, bw, bh] of sh.bars ?? []) g.fillRect(x * sx, y * sy, bw * sx, bh * sy)
  g.strokeStyle = pal.indigo
  g.lineWidth = 1.5
  for (const p of sh.claim) path(g, p, sx, sy)
}

/** The thumbnail's own marks, read back from its SVG: for the minis that move over the build's picture. */
export function readShape(svg: SVGSVGElement): Shape {
  const pts = (d: string): Pts => {
    const n = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
    const out: [number, number][] = []
    for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i]!, n[i + 1]!])
    return out
  }
  const paths = [...svg.querySelectorAll('path')]
  const isClaim = (p: SVGPathElement) => p.getAttribute('stroke')?.includes('indigo') ?? false
  return {
    context: paths.filter((p) => !isClaim(p)).map((p) => pts(p.getAttribute('d') ?? '')),
    claim: paths.filter(isClaim).map((p) => pts(p.getAttribute('d') ?? '')),
    bars: [...svg.querySelectorAll('rect:not([data-quiet])')].map((r) => ['x', 'y', 'width', 'height'].map((a) => Number(r.getAttribute(a))) as [number, number, number, number]),
    quiet: [...svg.querySelectorAll('rect[data-quiet]')].map((r) => ['x', 'y', 'width', 'height'].map((a) => Number(r.getAttribute(a))) as [number, number, number, number]),
  }
}

/** The point a fraction `u` (0 to 1) of the way along a polyline, by length. */
export function along(pts: Pts, u: number): readonly [number, number] {
  let total = 0
  const seg: number[] = []
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1])
    seg.push(d)
    total += d
  }
  let left = Math.max(0, Math.min(1, u)) * total
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i]! || i === seg.length - 1) {
      const f = seg[i]! > 0 ? Math.min(1, left / seg[i]!) : 0
      const a = pts[i]!, b = pts[i + 1]!
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
    }
    left -= seg[i]!
  }
  return pts[0] ?? [0, 0]
}

/** A dot riding the claim, with a paper halo, faded by `o`. */
export function dot(g: CanvasRenderingContext2D, x: number, y: number, o: number, pal: MiniPalette): void {
  if (o <= 0) return
  g.globalAlpha = o
  g.fillStyle = pal.paper
  g.beginPath()
  g.arc(x, y, 4.5, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = pal.indigo
  g.beginPath()
  g.arc(x, y, 2.75, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 1
}

/** The point on a polyline a fraction `u` (0 to 1) of the way across it: at a steady pace in x (a match's balls). */
export function alongX(pts: Pts, u: number): readonly [number, number] {
  if (pts.length < 2) return pts[0] ?? [0, 0]
  const x0 = pts[0]![0], x1 = pts[pts.length - 1]![0]
  const x = x0 + (x1 - x0) * Math.max(0, Math.min(1, u))
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!
    if (x <= b[0] || i === pts.length - 1) {
      const f = b[0] > a[0] ? Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0]))) : 0
      return [x, a[1] + (b[1] - a[1]) * f]
    }
  }
  return pts[pts.length - 1]!
}
