import { OG_SIZE, ogFan, paperCard } from '@/lib/og'

export const alt = 'Ilia Duda — CV, one page'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return paperCard({ kicker: 'CV', title: 'CV, on one page', art: await ogFan(0.45) })
}
