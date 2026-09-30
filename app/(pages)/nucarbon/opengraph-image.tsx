import { CONSTANTS } from '@/components/figures/ConstantsDerivation'
import { otherWork } from '@/content/papers'
import { OG_SIZE, ogRegister, paperCard } from '@/lib/og'

export const alt = 'Ilia Duda — nucarbon: a carbon model for campus AI use'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return paperCard({
    kicker: 'Fig. 1 · six constants feed every chart',
    title: 'A carbon model for campus AI use, built to be argued with',
    byline: `nucarbon · ${otherWork.find((o) => o.slug === 'nucarbon')!.status}`,
    figure: ogRegister(CONSTANTS.map((c) => [c.name, c.display, c.sourced] as const)),
  })
}
