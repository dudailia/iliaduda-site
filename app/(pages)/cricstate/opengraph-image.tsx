import { OG_SIZE, paperOg } from '@/lib/og'

export const alt = 'Ilia Duda — working paper: cricstate'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return paperOg('cricstate', 'Fig. 1 · the 2026 T20 World Cup final, ball by ball')
}
