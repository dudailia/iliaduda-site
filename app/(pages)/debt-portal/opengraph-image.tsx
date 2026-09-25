import { OG_SIZE, paperOg } from '@/lib/og'

export const alt = 'Ilia Duda — working paper: debt-portal'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return paperOg('debt-portal', 'Fig. 1 · a settlement schedule · illustrative terms')
}
