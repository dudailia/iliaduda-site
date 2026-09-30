import { OG_SIZE, paperOg } from '@/lib/og'

export const alt = 'Ilia Duda — working paper: one market, three views'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return paperOg('market', 'Fig. 1 · one market · three views')
}
