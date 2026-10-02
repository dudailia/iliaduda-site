import { cssColor } from '@/components/stage/env'
import { diffuse, linOf, rampLab, rampStops, rampT, srgbOf } from '@/lib/surface/look'
import { FRAME_H, poster, RAMP_CSS, type PosterData } from '@/lib/surface/poster'
import { MESH_CSS, meshMarkup } from '@/lib/surface/posterMarkup'
import { iv, type Params } from '@/lib/surface/ssvi'
import { apply, camera, EXPIRY_TICKS, kOfU, mvp, tOfV, wx, wy, wz, type FrameKind } from '@/lib/surface/view'

/**
 * The still frame's sheet, drawn smooth on a 2D canvas: the figure a reader
 * keeps where the live one does not run (reduced motion, no WebGL2), under the
 * poster's own walls, contours and ticks (lib/surface/posterMarkup.ts). The
 * poster's image has to share a few colours between its facets to stay small,
 * and they fall in steps along the grid; here every facet has its own colour
 * and its own light, the shader's arithmetic on the CPU (lib/surface/look.ts),
 * on a grid fine enough that no facet is seen as one.
 */

/** Facets across strike and expiry: a few pixels each on a laptop's stage. */
const NU = 120
const NV = 76

type V3 = readonly [number, number, number]
type Pal = { wash: readonly number[]; indigo: readonly number[]; ink: readonly number[]; dark: boolean }

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** Draws surface `p` through a framing's poster camera, filling the canvas's own box. */
export function drawSheet(canvas: HTMLCanvasElement, p: Params, kind: FrameKind, pal: Pal): void {
  const box = canvas.getBoundingClientRect()
  const w = Math.max(1, box.width), h = Math.max(1, box.height)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const g = canvas.getContext('2d')
  if (!g) return
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)
  const m = mvp(kind, camera(kind), w / h)
  const stops = rampStops(pal)

  // The grid in the world and on the canvas.
  const world: V3[] = []
  const screen: [number, number][] = []
  const vol: number[] = []
  for (let j = 0; j <= NV; j++)
    for (let i = 0; i <= NU; i++) {
      const k = kOfU(i / NU), T = tOfV(j / NV)
      const v = iv(p, k, T)
      const P: V3 = [wx(k), wy(v), wz(T)]
      const c = apply(m, P[0], P[1], P[2])
      world.push(P)
      screen.push([((c[0] / c[3]) * 0.5 + 0.5) * w, (1 - ((c[1] / c[3]) * 0.5 + 0.5)) * h])
      vol.push(v)
    }
  const at = (i: number, j: number) => j * (NU + 1) + i

  // Back row first; within a row, left to right (the camera is on the right), as the poster paints it.
  g.lineJoin = 'round'
  g.lineWidth = 0.75
  for (let j = 0; j < NV; j++)
    for (let i = 0; i < NU; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1)
      const n = cross(sub(world[c]!, world[a]!), sub(world[b]!, world[d]!))
      const l = Math.hypot(n[0], n[1], n[2]) || 1
      const up: V3 = n[1] < 0 ? [-n[0] / l, -n[1] / l, -n[2] / l] : [n[0] / l, n[1] / l, n[2] / l]
      const L = diffuse(up)
      const lin = linOf(rampLab(rampT((vol[a]! + vol[b]! + vol[c]! + vol[d]!) / 4), stops))
      const [r, gg, bb] = srgbOf([lin[0] * L, lin[1] * L, lin[2] * L])
      const col = `rgb(${Math.round(r * 255)} ${Math.round(gg * 255)} ${Math.round(bb * 255)})`
      g.beginPath()
      g.moveTo(screen[a]![0], screen[a]![1])
      g.lineTo(screen[b]![0], screen[b]![1])
      g.lineTo(screen[c]![0], screen[c]![1])
      g.lineTo(screen[d]![0], screen[d]![1])
      g.closePath()
      g.fillStyle = col
      g.fill()
      // Stroked in its own colour, so no seam of paper shows between two facets.
      g.strokeStyle = col
      g.stroke()
    }

  // By night the live figure's resting glow on every ticked smile (renderer.ts: 0.07, 14px, a Gaussian across it),
  // added as light, so the still frame rests as the live one does. Three widths stand in for the Gaussian.
  if (pal.dark) {
    const c = [0, 1, 2].map((i) => Math.round((pal.indigo[i]! + (pal.ink[i]! - pal.indigo[i]!) * 0.4) * 255))
    g.globalCompositeOperation = 'lighter'
    g.lineCap = 'round'
    g.strokeStyle = `rgb(${c[0]} ${c[1]} ${c[2]})`
    for (const [T] of EXPIRY_TICKS) {
      g.beginPath()
      for (let i = 0; i <= SMILE_N; i++) {
        const k = kOfU(i / SMILE_N)
        const q = apply(m, wx(k), wy(iv(p, k, T)) + 0.008, wz(T))
        const sx = ((q[0] / q[3]) * 0.5 + 0.5) * w, sy = (1 - ((q[1] / q[3]) * 0.5 + 0.5)) * h
        if (i) g.lineTo(sx, sy)
        else g.moveTo(sx, sy)
      }
      for (const [width, strength] of GLOW) {
        g.lineWidth = width
        g.globalAlpha = strength
        g.stroke()
      }
    }
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
  }
}

/** The smiles' resting glow as three strokes, widest faintest: together about the live glow's 0.07 at the centre. */
const GLOW: readonly (readonly [number, number])[] = [
  [14, 0.012],
  [8, 0.02],
  [3, 0.035],
]
const SMILE_N = 96

/**
 * The still frame put in place of a poster's picture, and drawn for surface `p`: the first time, the poster's image
 * ([data-iv-poster] [data-mesh], inside `root`) gives way to the sheet painted smooth on a canvas and, over it, inline,
 * the walls, contours and ticks, with their style beside them; every time, both are drawn for `p` in the page's
 * colours now. Returns the poster's data for `p`, for a figure that places marks of its own (the IV paper's notes).
 */
export function smoothStill(root: HTMLElement, p: Params, kind: FrameKind, probe?: { readonly k: number; readonly T: number }): PosterData {
  const d = poster(p, kind, probe)
  let mesh = root.querySelector('[data-iv-poster] [data-mesh]')
  if (mesh && mesh.tagName.toLowerCase() === 'img') {
    const sheet = document.createElement('canvas')
    sheet.setAttribute('class', 'absolute inset-0 h-full w-full')
    sheet.setAttribute('aria-hidden', 'true')
    sheet.setAttribute('data-fill', '')
    sheet.setAttribute('data-still-sheet', '')
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'absolute inset-0 h-full w-full overflow-visible')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('data-fill', '')
    svg.setAttribute('data-mesh', '')
    ;(mesh.closest('picture') ?? mesh).replaceWith(sheet, svg)
    mesh = svg
    const style = document.createElement('style')
    style.setAttribute('data-mesh-css', '')
    root.querySelector('[data-iv-poster]')?.prepend(style)
  }
  const sheet = root.querySelector<HTMLCanvasElement>('[data-iv-poster] [data-still-sheet]')
  if (sheet)
    drawSheet(sheet, p, kind, {
      wash: cssColor('--color-indigo-wash'),
      indigo: cssColor('--color-indigo'),
      ink: cssColor('--color-ink'),
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
    })
  if (mesh) {
    // Each framing's picture is its own width: a phone turned to landscape changes it.
    mesh.setAttribute('viewBox', `0 0 ${d.width} ${FRAME_H}`)
    mesh.innerHTML = meshMarkup(d, !sheet)
  }
  const style = root.querySelector('[data-iv-poster] style[data-mesh-css]')
  if (style) style.textContent = MESH_CSS + RAMP_CSS + d.css
  return d
}
