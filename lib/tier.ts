import type { GL } from './gl'

export type Tier = 'software' | 'low' | 'mid' | 'high'

/**
 * How much this device can take. A software rasteriser (SwiftShader,
 * llvmpipe — what headless audits run on) gets the lightest scene; a coarse
 * pointer with few cores gets `low`, and any other coarse pointer `mid`,
 * which is where every iPhone lands: Safari reports its GPU only as "Apple
 * GPU" and its core count is no guide, and an iPhone that runs WebGL2 is
 * capable. Everything else starts at `high`, and the stage's frame-time
 * governor steps down if the frames say otherwise.
 */
export function deviceTier(gl: GL): Tier {
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
  if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) return 'software'
  const coarse = matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse && /apple/i.test(renderer)) return 'mid'
  if (coarse && cores <= 4) return 'low'
  if (coarse) return 'mid'
  return 'high'
}
