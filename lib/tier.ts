import type { GL } from './gl'

export type Tier = 'software' | 'low' | 'mid' | 'high'

/**
 * How much this device can take. A software rasteriser (SwiftShader,
 * llvmpipe — what headless audits run on) gets the lightest scene; a coarse
 * pointer or few cores gets `low` or `mid`; everything else starts at `high`
 * and the stage's frame-time governor steps down if the frames say otherwise.
 */
export function deviceTier(gl: GL): Tier {
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
  if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) return 'software'
  const coarse = matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse && cores <= 4) return 'low'
  if (coarse) return 'mid'
  return 'high'
}
