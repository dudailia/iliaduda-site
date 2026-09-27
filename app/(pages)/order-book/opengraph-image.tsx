import { OG_SIZE, paperOg } from '@/lib/og'

export const alt = 'Ilia Duda — working paper: order-book'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return paperOg('order-book', 'Fig. 1 · a synthetic order book · Hawkes order flow')
}
