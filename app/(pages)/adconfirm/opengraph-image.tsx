import { OG_SIZE, ogFan, paperCard } from '@/lib/og'

export const alt = 'Ilia Duda — AdConfirm: advertising inside invoices, billed to the millicent'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return paperCard({ kicker: 'AdConfirm', title: 'Advertising inside invoices, billed to the millicent', art: await ogFan(0.45) })
}
