import { ogFan, OG_SIZE, shareCard } from '@/lib/og'
import { PERSON } from '@/lib/site'

export const alt = 'Ilia Duda — Quantitative analyst and engineer at a proprietary options trading firm; Mathematics and Business Administration at Northeastern, class of 2028'
export const size = OG_SIZE
export const contentType = 'image/png'

/**
 * The home card: the hero's own fan of futures glowing across a night card, and the name and role in its centred
 * square, so a crop to a square (LinkedIn's Featured tile) still reads.
 */
export default async function OpengraphImage() {
  const year = PERSON.graduation.replace(/\D+/g, '').slice(-2)
  return shareCard({
    above: PERSON.base,
    title: PERSON.name,
    titleSize: 96,
    below: `Quantitative analyst and engineer · Northeastern ’${year}`,
    art: await ogFan(),
  })
}
