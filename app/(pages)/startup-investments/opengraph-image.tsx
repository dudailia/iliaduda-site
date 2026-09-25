import { OG_SIZE, paperOg } from '@/lib/og'

export const alt = 'Ilia Duda — working paper: startup-investments'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return paperOg('startup-investments', 'Fig. 1 · one model, three treatments of the data')
}
