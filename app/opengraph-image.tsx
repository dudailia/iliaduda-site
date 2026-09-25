import { ImageResponse } from 'next/og'
import { fonts, OG, OG_SIZE } from '@/lib/og'
import { AVAILABILITY, PERSON } from '@/lib/site'

export const alt = 'Ilia Duda — quantitative finance and the systems around it'
export const size = OG_SIZE
export const contentType = 'image/png'

/**
 * The home card: typographic, no photo. A name and a subject survive being
 * scaled into a chat window better than a face does, and indigo stays inside
 * figures here as everywhere — this card has none, so it has no indigo.
 */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: OG.paper,
          color: OG.ink,
          padding: '72px 80px',
          fontFamily: 'Source Serif 4',
        }}
      >
        <div style={{ display: 'flex', fontFamily: 'Source Code Pro', fontSize: 26, color: OG.graphite }}>{PERSON.base}</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 92, letterSpacing: '-0.02em' }}>{PERSON.name}</div>
          <div style={{ fontSize: 36, color: OG.graphite, marginTop: 18, maxWidth: 880 }}>
            Mathematics and Business Administration at Northeastern. Quantitative finance and the systems
            around it.
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            fontFamily: 'Source Code Pro',
            fontSize: 24,
            color: OG.ink,
            borderTop: `1px solid ${OG.rule}`,
            paddingTop: 24,
          }}
        >
          {AVAILABILITY.line}
        </div>
      </div>
    ),
    { ...size, fonts: await fonts() },
  )
}
