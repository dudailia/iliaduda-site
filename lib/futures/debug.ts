/**
 * The ?debug=1 report for the home figure: what a reader screenshots from a
 * phone when the figure misbehaves. It answers, on one screen, the questions a
 * fix starts from: whether the figure went live and, if not, why; the GPU
 * tier and the formats it chose; what the browser offers; how fast it runs.
 * Pure: the overlay gathers the facts, this lays them out.
 */

export interface GlInfo {
  version: string
  shading: string
  vendor: string
  renderer: string
  maxTexture: number
  maxRenderbuffer: number
  maxSamples: number
  vertexUnits: number
  extensions: string[]
  /** Whether each format can be rendered to here (and rgba16f blended and sampled back). */
  probes: Record<'rgba16f' | 'rgba32ui' | 'r32ui' | 'rgba8' | 'rgba32f' | 'floatBlend', boolean>
}

export interface LiveInfo {
  state: 'server' | 'starting' | 'live' | 'declined'
  /** The still frame's reason, as the figure shows it. */
  reason: string | null
  tier: string | null
  quality: number
  fps: number
  dpr: number
  stage: readonly [number, number]
  canvas: readonly [number, number] | null
  seq: string
  flying: boolean
  reduced: boolean
  saveData: boolean
  ua: string
  /** What the running renderer reports about itself, when there is one. */
  renderer: Record<string, string | number> | null
}

const yes = (b: boolean) => (b ? 'yes' : 'no')
const size = (s: readonly [number, number] | null) => (s ? `${Math.round(s[0])}×${Math.round(s[1])}` : 'none')

export function rows(gl: GlInfo | null, live: LiveInfo): { k: string; v: string }[] {
  const out: { k: string; v: string }[] = []
  const put = (k: string, v: string | number) => out.push({ k, v: String(v) })
  put('figure', live.state === 'declined' ? `declined: ${live.reason ?? 'no reason given'}` : live.state)
  put('tier', `${live.tier ?? 'none'} · quality ${live.quality} · ${live.fps} fps`)
  for (const [k, v] of Object.entries(live.renderer ?? {})) put(k, v)
  put('sequence', `${live.seq}${live.flying ? ' · flying' : ''}`)
  put('screen', `dpr ${live.dpr} · stage ${size(live.stage)} · canvas ${size(live.canvas)}`)
  put('asks', `reduced motion ${yes(live.reduced)} · save data ${yes(live.saveData)}`)
  if (!gl) {
    put('webgl2', 'none')
  } else {
    put('webgl2', `${gl.version} · ${gl.shading}`)
    put('renderer', `${gl.renderer} (${gl.vendor})`)
    put('limits', `texture ${gl.maxTexture} · renderbuffer ${gl.maxRenderbuffer} · samples ${gl.maxSamples} · vertex textures ${gl.vertexUnits}`)
    put('probes', (['rgba16f', 'rgba32ui', 'r32ui', 'rgba8', 'rgba32f'] as const).map((f) => `${f} ${yes(gl.probes[f])}`).join(' · '))
    // What the first version needed, and an iPhone does not have: blending into 32-bit float.
    put('float blend', yes(gl.probes.floatBlend))
    put(`extensions (${gl.extensions.length})`, [...gl.extensions].sort().join(' '))
  }
  put('browser', live.ua)
  return out
}

export const asText = (r: { k: string; v: string }[]) => r.map(({ k, v }) => `${k}: ${v}`).join('\n')
