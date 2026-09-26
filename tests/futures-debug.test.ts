import { describe, expect, it } from 'vitest'
import { asText, rows, type GlInfo, type LiveInfo } from '@/lib/futures/debug'

/**
 * The ?debug=1 overlay: what a phone's owner screenshots when the figure
 * misbehaves. Its report has to answer, on one screen, the questions a fix
 * starts from: did it go live, and if not why; what GPU tier and which
 * formats it chose; which extensions the browser offers; how fast it runs.
 */

const gl: GlInfo = {
  version: 'WebGL 2.0',
  shading: 'WebGL GLSL ES 3.00',
  vendor: 'Apple Inc.',
  renderer: 'Apple GPU',
  maxTexture: 16384,
  maxRenderbuffer: 16384,
  maxSamples: 4,
  vertexUnits: 16,
  extensions: ['WEBGL_lose_context', 'EXT_color_buffer_half_float', 'EXT_texture_filter_anisotropic'],
  probes: { rgba16f: true, rgba32ui: true, r32ui: true, rgba8: true, rgba32f: false, floatBlend: false },
}

const live: LiveInfo = {
  state: 'live',
  reason: null,
  tier: 'mid',
  quality: 3,
  fps: 59,
  dpr: 3,
  stage: [393, 596],
  canvas: [786, 1192],
  seq: 'done',
  flying: false,
  reduced: false,
  saveData: false,
  ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',
  renderer: { density: 'rgba16f', strands: 3072, grid: 256, batches: 12, paths: 268435456, rate: '41.2M/s', camera: 'rest' },
}

const get = (r: { k: string; v: string }[], k: string) => r.find((x) => x.k === k)?.v

describe('the debug report', () => {
  it('leads with whether the figure is live, and why not when it is not', () => {
    expect(rows(gl, live)[0]).toEqual({ k: 'figure', v: 'live' })
    const declined = rows(gl, { ...live, state: 'declined', reason: 'Still frame: this browser draws WebGL in software.', renderer: null })
    expect(declined[0]).toEqual({ k: 'figure', v: 'declined: Still frame: this browser draws WebGL in software.' })
  })

  it('names the tier, the formats chosen, the probes and the speed', () => {
    const r = rows(gl, live)
    expect(get(r, 'tier')).toBe('mid · quality 3 · 59 fps')
    expect(get(r, 'density')).toBe('rgba16f')
    expect(get(r, 'probes')).toBe('rgba16f yes · rgba32ui yes · r32ui yes · rgba8 yes · rgba32f no')
    expect(get(r, 'float blend')).toBe('no')
    expect(get(r, 'strands')).toBe('3072')
    expect(get(r, 'screen')).toBe('dpr 3 · stage 393×596 · canvas 786×1192')
  })

  it('lists every extension, sorted, so a screenshot can be read against the code', () => {
    expect(get(rows(gl, live), 'extensions (3)')).toBe('EXT_color_buffer_half_float EXT_texture_filter_anisotropic WEBGL_lose_context')
  })

  it('says so plainly when there is no WebGL2 at all', () => {
    const r = rows(null, { ...live, state: 'declined', reason: 'Still frame: this browser has no WebGL2.', renderer: null, canvas: null })
    expect(get(r, 'webgl2')).toBe('none')
    expect(get(r, 'screen')).toBe('dpr 3 · stage 393×596 · canvas none')
  })

  it('copies as plain text, one line per row', () => {
    const t = asText(rows(gl, live))
    expect(t.split('\n')[0]).toBe('figure: live')
    expect(t).toContain('\nrenderer: Apple GPU (Apple Inc.)\n')
  })
})
