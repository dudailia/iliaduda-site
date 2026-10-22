import { OG_SIZE, ogThumb, paperCard } from '@/lib/og'

export const alt = 'Ilia Duda — Arclo: a brand system with a template engine and an export pipeline'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return paperCard({ kicker: 'Arclo', title: 'A brand system with a template engine and an export pipeline', art: ogThumb('arclo') })
}
