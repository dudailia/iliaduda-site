import { roles } from '@/content/experience'
import { OG_SIZE, ogRegister, paperCard } from '@/lib/og'

export const alt = 'Ilia Duda — CV, one page'
export const size = OG_SIZE
export const contentType = 'image/png'

const short = (d: string) => d.replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]+/g, '$1')

export default function Image() {
  return paperCard({
    kicker: 'Experience',
    title: 'CV, on one page',
    byline: 'Experience · research · education · skills',
    // 17px: the longest organisation and its date share the 460px box.
    figure: ogRegister(roles.map((r) => [r.org, short(r.dates)] as const), 17),
  })
}
