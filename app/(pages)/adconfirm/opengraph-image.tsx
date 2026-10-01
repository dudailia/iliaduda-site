import { OG_SIZE, ogFan, paperCard } from '@/lib/og'

export const alt = 'Ilia Duda — AdConfirm: eight vendors who disagree about what money is'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return paperCard({ kicker: 'AdConfirm', title: 'Eight vendors who disagree about what money is', art: await ogFan(0.45) })
}
