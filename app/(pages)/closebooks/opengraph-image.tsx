import { OG_SIZE, paperOg } from '@/lib/og'

export const alt = 'Ilia Duda — working paper: closebooks'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return paperOg('closebooks', 'Fig. 1 · a bank feed through the pipeline · synthetic feed')
}
