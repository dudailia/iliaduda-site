import { OG_SIZE, ogThumb, paperCard } from '@/lib/og'

export const alt = 'Ilia Duda — about: experience, education, and the OFZ curve through two rate rises'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return paperCard({ kicker: 'about', title: 'Experience, education, and the OFZ curve through two rate rises', art: ogThumb('bcs') })
}
