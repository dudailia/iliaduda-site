import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const alt = 'Ilia Duda — quantitative finance and the systems around it'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Typographic card, no photo — partly because there is no headshot in this
 * repository yet, and mostly because a link preview of a name and a subject
 * survives being scaled into a chat window better than a face does.
 *
 * The fonts here are OTF and live in assets/, not public/. ImageResponse
 * rasterises at build time and cannot read woff2 ("Unsupported OpenType
 * signature wOF2"), and these files must not be in public/ — they would then be
 * two fetchable copies of typefaces the site already self-hosts in the format
 * browsers actually want. Build-time input, not a served asset.
 */
export default async function OpengraphImage() {
  const serif = await readFile(join(process.cwd(), 'assets/og-fonts/SourceSerif4-Regular.otf'))
  const mono = await readFile(join(process.cwd(), 'assets/og-fonts/SourceCodePro-Regular.otf'))

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#FAF9F7',
          color: '#16181C',
          padding: '72px 80px',
          fontFamily: 'SourceSerif',
        }}
      >
        <div style={{ display: 'flex', fontFamily: 'SourceMono', fontSize: 26, color: '#5B6068' }}>
          Boston, MA
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 92, letterSpacing: '-0.02em' }}>Ilia Duda</div>
          <div style={{ fontSize: 36, color: '#5B6068', marginTop: 18, maxWidth: 880 }}>
            Quantitative finance and the systems around it — research stacks, market tooling, and
            applied LLM infrastructure.
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            fontFamily: 'SourceMono',
            fontSize: 24,
            color: '#2F3A8C',
            borderTop: '1px solid #DEDCD7',
            paddingTop: 24,
          }}
        >
          iliaduda.com
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'SourceSerif', data: serif, style: 'normal', weight: 400 },
        { name: 'SourceMono', data: mono, style: 'normal', weight: 400 },
      ],
    },
  )
}
