import { OG_SIZE, paperOg } from '@/lib/og'

export const alt = 'Ilia Duda — working paper: iv-surface'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return paperOg('iv-surface', 'Fig. 1 · implied volatility · synthetic SSVI')
}
