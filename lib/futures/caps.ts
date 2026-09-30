/**
 * What the drawing buffers are made of on this device. Pricing never needs a
 * float render target (it keeps float bits in 32-bit integer targets, which
 * every WebGL2 device renders to). The density the paths add up to is half
 * float where the device can render to it and blend it, as most can, iPhones
 * included through EXT_color_buffer_half_float; otherwise it is eight-bit,
 * stored at a fraction of its value so the buffer spans the whole tone curve,
 * with each fragment's rounding dithered so faint paths still add up.
 *
 * `?gl=rgba8` forces the eight-bit path, so it can be seen and tested on a
 * device that would never take it.
 */

export type Density = 'rgba16f' | 'rgba8'
export type GlOverride = 'rgba8' | 'half'

export function glOverride(search: string): GlOverride | null {
  const v = new URLSearchParams(search).get('gl')
  return v === 'rgba8' || v === 'half' ? v : null
}

/** A forced choice can only give up precision the device has, never add what it lacks. */
export function densityFormat(probe: { half: boolean }, override: GlOverride | null): Density {
  return override === 'rgba8' || !probe.half ? 'rgba8' : 'rgba16f'
}

/** Density is stored multiplied by this. */
export const DENSITY_SCALE: Record<Density, number> = { rgba16f: 1, rgba8: 1 / 8 }
