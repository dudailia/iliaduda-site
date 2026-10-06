import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReactNode } from 'react'
import { ImageResponse } from 'next/og'
import { PERSON } from './site'
import { thumbFor, TH, TW } from './thumbs'

/**
 * Open Graph cards in the site's own register: paper, ink, one indigo figure.
 * Each paper passes a small SVG drawn from the same data as its live figure,
 * so the link preview on LinkedIn is the figure itself, not a stock banner.
 *
 * Fonts are OTF from assets/og-fonts — ImageResponse cannot read woff2, and
 * these must not sit in public/ as a second copy of the site's typefaces.
 */

/**
 * 1200 × 627, LinkedIn's share size. LinkedIn crops the card in places (a Featured tile is near square), so
 * everything that must be read sits in the centred 600 × 600 square: SAFE. The figure fills the whole card behind it.
 */
export const OG_SIZE = { width: 1200, height: 627 } as const
const SAFE = { x: (OG_SIZE.width - 600) / 2, y: (OG_SIZE.height - 600) / 2, w: 600, h: 600 } as const

/**
 * The share cards are night cards: the site's dark palette, with each figure's own lines glowing across the card.
 * A dark card with light type reads in a light feed and a dark one alike, where a paper card blurred into a light one.
 */
export const OG = {
  night: '#0F1220',
  text: '#F2F0EB',
  muted: '#AEB3C4',
  glow: '#A3ADF5',
  dim: '#5A6396',
  // The light palette, kept for the site's printable cards.
  paper: '#FAF9F7',
  ink: '#16181C',
  graphite: '#5B6068',
  rule: '#DEDCD7',
  indigo: '#2F3A8C',
  wash: '#E4E6F2',
} as const

export async function fonts() {
  const [serif, mono] = await Promise.all([
    readFile(join(process.cwd(), 'assets/og-fonts/SourceSerif4-Regular.otf')),
    readFile(join(process.cwd(), 'assets/og-fonts/SourceCodePro-Regular.otf')),
  ])
  return [
    { name: 'Source Serif 4', data: serif, style: 'normal' as const, weight: 400 as const },
    { name: 'Source Code Pro', data: mono, style: 'normal' as const, weight: 400 as const },
  ]
}

/** A glowing stroke: a wide faint line under a thin bright one (the rasteriser has no blur filter to rely on). */
function glowPath(d: string, key: string, color: string, bright: number, w: number) {
  return [
    <path key={`${key}h`} d={d} fill="none" stroke={color} strokeOpacity={bright * 0.16} strokeWidth={w * 7} strokeLinecap="round" />,
    <path key={`${key}m`} d={d} fill="none" stroke={color} strokeOpacity={bright * 0.32} strokeWidth={w * 3} strokeLinecap="round" />,
    <path key={`${key}c`} d={d} fill="none" stroke={color} strokeOpacity={bright} strokeWidth={w} strokeLinecap="round" />,
  ]
}

/** The home figure's fan: its poster's own futures, glowing, those that pay brighter. `strength` dims it. */
export async function ogFan(strength = 1): Promise<ReactNode> {
  const { strands } = await import('./futures/poster')
  const { MODEL } = await import('./futures/mc')
  const { VB } = await import('./futures/world')
  const all = strands(MODEL.sigma, MODEL.strike)
  return (
    <svg width={OG_SIZE.width} height={OG_SIZE.height} viewBox={`0 0 ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMid slice">
      {all.flatMap((st, i) => glowPath(st.d, `s${i}`, st.pays ? OG.glow : OG.dim, (st.pays ? 0.75 : 0.5) * strength, 2.2))}
    </svg>
  )
}

/** A paper's miniature figure as the card's art: context dim, the claim glowing. */
export function ogThumb(slug: string, strength = 1): ReactNode {
  const t = thumbFor(slug)
  if (!t) return null
  return (
    // Whole, inset from the edges (a crop cut the cricket line off at the top); the card's centre is the words'.
    <svg width={OG_SIZE.width} height={OG_SIZE.height} viewBox={`${-TW * 0.06} ${-TH * 0.08} ${TW * 1.12} ${TH * 1.16}`} preserveAspectRatio="xMidYMid meet">
      {t.quiet?.map(([x, y, w, h], i) => <rect key={`q${i}`} x={x} y={y} width={w} height={h} fill={OG.dim} fillOpacity={0.35 * strength} />)}
      {t.bars?.map(([x, y, w, h], i) => <rect key={`b${i}`} x={x} y={y} width={w} height={h} fill={OG.glow} fillOpacity={0.8 * strength} />)}
      {t.context.flatMap((d, i) => glowPath(d, `c${i}`, OG.dim, 0.8 * strength, 1.8))}
      {t.claim.flatMap((d, i) => glowPath(d, `p${i}`, OG.glow, 0.95 * strength, 2.6))}
    </svg>
  )
}

/**
 * The card: the art across it, a dark well behind the words so they read over any line, and the words in SAFE —
 * a mono line above, the title, a mono line below, and the site's address.
 */
export async function shareCard({
  above,
  title,
  titleSize = 54,
  below,
  art,
}: {
  above: string
  title: string
  titleSize?: number
  below?: string
  art: ReactNode
}) {
  const { SITE } = await import('./site')
  const host = SITE.public.replace(/^https?:\/\//, '')
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', backgroundColor: OG.night, fontFamily: 'Source Serif 4' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: OG_SIZE.width, height: OG_SIZE.height, display: 'flex' }}>{art}</div>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: OG_SIZE.width,
            height: OG_SIZE.height,
            display: 'flex',
            backgroundImage: `radial-gradient(ellipse 380px 300px at 50% 50%, ${OG.night}F2 0%, ${OG.night}C8 55%, ${OG.night}00 100%)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: SAFE.x,
            top: SAFE.y,
            width: SAFE.w,
            height: SAFE.h,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            color: OG.text,
          }}
        >
          <div style={{ display: 'flex', fontFamily: 'Source Code Pro', fontSize: 22, color: OG.muted }}>{above}</div>
          {/* 20px inside the square on each side, so no line of the title reaches the safe zone's edge. A compound keeps
              its hyphen with both halves (U+2011, which the serif carries): "multi-" never ends a line. A title with an
              en-dash compound ("Fourier–Bessel") is set word by word, so a line breaks only at a space: the renderer
              breaks after an en dash, and a word joiner after it drew as a gap. */}
          {/(?<=\p{L})–(?=\p{L})/u.test(title) ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '0.25em', fontSize: titleSize, lineHeight: 1.12, letterSpacing: '-0.015em', marginTop: 22, maxWidth: SAFE.w - 40 }}>
              {/* A one-letter word goes with the word after it: "on a" ended a line. */}
              {title.split(' ').reduce<string[]>((ws, w) => (ws.length && ws[ws.length - 1]!.length === 1 ? [...ws.slice(0, -1), `${ws[ws.length - 1]}\u00a0${w}`] : [...ws, w]), []).map((w, i) => (
                <div key={i} style={{ display: 'flex' }}>
                  {w.replace(/(?<=\p{L})-(?=\p{L})/gu, '\u2011')}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', fontSize: titleSize, lineHeight: 1.12, letterSpacing: '-0.015em', marginTop: 22, maxWidth: SAFE.w - 40, textWrap: 'balance' }}>
              {title.replace(/(?<=\p{L})-(?=\p{L})/gu, '\u2011')}
            </div>
          )}
          {below ? (
            <div style={{ display: 'flex', fontSize: 28, color: OG.text, marginTop: 22, maxWidth: SAFE.w, lineHeight: 1.3 }}>{below}</div>
          ) : null}
          <div style={{ display: 'flex', fontFamily: 'Source Code Pro', fontSize: 22, color: OG.glow, marginTop: 30 }}>{host}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts() },
  )
}

/** A card for a page that is not a paper: its own title over the art given. */
export async function paperCard({ kicker, title, art }: { kicker: string; title: string; art: ReactNode }) {
  return shareCard({ above: `${PERSON.name} · ${kicker}`, title, art })
}

/** The whole card for a paper, from its contents entry: its title over its own figure. */
export async function paperOg(slug: string) {
  const { papers } = await import('@/content/papers')
  const p = papers.find((x) => x.slug === slug)!
  // Coursework is named as coursework, on the card as on the page.
  const kind = p.byline.startsWith('Directed study') ? 'directed study' : 'working paper'
  return shareCard({ above: `${PERSON.name} · ${kind}`, title: p.title, titleSize: p.title.length > 48 ? 46 : 54, art: ogThumb(slug) })
}
