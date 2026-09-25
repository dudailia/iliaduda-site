import { OG_SIZE, ogThumb, paperCard } from '@/lib/og'
import { PERSON } from '@/lib/site'

export const alt = 'Ilia Duda — about: experience, education, and the OFZ curve through two rate hikes'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return paperCard({
    kicker: 'Fig. 1 · the OFZ curve, 15 August 2023',
    title: 'Experience, education, and the OFZ curve through two rate hikes',
    byline: `About · ${PERSON.school} · class of ${PERSON.graduation.replace(/\D+/g, '')}`,
    figure: ogThumb('bcs'),
  })
}
