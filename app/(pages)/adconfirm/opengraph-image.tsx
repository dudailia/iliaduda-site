import { SOURCES } from '@/components/figures/SchemaReconciliation'
import { otherWork } from '@/content/papers'
import { OG_SIZE, ogRegister, paperCard } from '@/lib/og'

export const alt = 'Ilia Duda — AdConfirm: eight vendors who disagree about what money is'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return paperCard({
    kicker: 'Fig. 1 · eight schemas, one target type',
    title: 'Eight vendors who disagree about what money is',
    byline: `AdConfirm · ${otherWork.find((o) => o.slug === 'adconfirm')!.status}`,
    figure: ogRegister(SOURCES.map((s) => [s.name, s.lineItems ? `${s.auth} · line items` : `${s.auth} · none`, !s.lineItems] as const)),
  })
}
