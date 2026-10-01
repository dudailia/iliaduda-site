import { OG_SIZE, ogFan, paperCard } from '@/lib/og'

export const alt = 'Ilia Duda — nucarbon: a carbon model for campus AI use'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return paperCard({ kicker: 'nucarbon', title: 'A carbon model for campus AI use, built to be argued with', art: await ogFan(0.45) })
}
