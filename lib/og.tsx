import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReactNode } from 'react'
import { ImageResponse } from 'next/og'
import { AVAILABILITY, PERSON } from './site'
import { thumbFor, TH, TW } from './thumbs'

/**
 * Open Graph cards in the site's own register: paper, ink, one indigo figure.
 * Each paper passes a small SVG drawn from the same data as its live figure,
 * so the link preview on LinkedIn is the figure itself, not a stock banner.
 *
 * Fonts are OTF from assets/og-fonts — ImageResponse cannot read woff2, and
 * these must not sit in public/ as a second copy of the site's typefaces.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const

export const OG = {
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

/** The figure box on the card, for callers drawing into it. */
export const OG_FIG = { width: 460, height: 380 } as const

export async function paperCard({
  kicker,
  title,
  byline,
  figure,
}: {
  /** Mono line above the byline, e.g. "Fig. 1 · synthetic data". */
  kicker: string
  title: string
  byline: string
  /** An <svg> sized OG_FIG. */
  figure: ReactNode
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: OG.paper,
          color: OG.ink,
          padding: '64px 72px',
          fontFamily: 'Source Serif 4',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 560 }}>
          <div style={{ display: 'flex', fontFamily: 'Source Code Pro', fontSize: 22, color: OG.graphite }}>
            {PERSON.name} · working papers
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 50, lineHeight: 1.1, letterSpacing: '-0.015em' }}>{title}</div>
            <div style={{ display: 'flex', fontFamily: 'Source Code Pro', fontSize: 20, color: OG.graphite, marginTop: 22 }}>
              {byline}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Source Code Pro',
              fontSize: 20,
              color: OG.ink,
              borderTop: `1px solid ${OG.rule}`,
              paddingTop: 18,
            }}
          >
            {AVAILABILITY.line}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 40, width: OG_FIG.width }}>
          <div style={{ display: 'flex', fontFamily: 'Source Code Pro', fontSize: 18, color: OG.graphite, marginBottom: 14 }}>
            {kicker}
          </div>
          <div style={{ display: 'flex', width: OG_FIG.width, height: OG_FIG.height, borderTop: `1px solid ${OG.rule}`, paddingTop: 16 }}>
            {figure}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts() },
  )
}

/** A paper's miniature figure as a plain SVG for the card (no vector-effect:
 *  the rasteriser does not support it, so strokes are sized for the box). */
export function ogThumb(slug: string): ReactNode {
  const t = thumbFor(slug)
  if (!t) return null
  const sx = OG_FIG.width / TW
  return (
    <svg width={OG_FIG.width} height={Math.round(OG_FIG.width * (TH / TW))} viewBox={`0 0 ${TW} ${TH}`}>
      {t.context.map((d, i) => (
        <path key={`c${i}`} d={d} fill="none" stroke={OG.rule} strokeWidth={2 / sx} />
      ))}
      {t.bars?.map(([x, y, w, h], i) => <rect key={`b${i}`} x={x} y={y} width={w} height={h} fill={OG.indigo} />)}
      {t.claim.map((d, i) => (
        <path key={`p${i}`} d={d} fill="none" stroke={OG.indigo} strokeWidth={3 / sx} />
      ))}
    </svg>
  )
}

/**
 * A figure box that is a register rather than a chart: for pages whose figure
 * is a list (the CV's roles, AdConfirm's adapters, nucarbon's constants). The
 * rows are the page's own data, so the card still shows the thing itself.
 */
export function ogRegister(rows: readonly (readonly [string, string, boolean?])[], fontSize = 21): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: OG_FIG.width, fontFamily: 'Source Code Pro', fontSize }}>
      {rows.map(([k, v, claim]) => (
        <div
          key={k}
          style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: `1px solid ${OG.rule}` }}
        >
          <span style={{ color: claim ? OG.indigo : OG.ink }}>{k}</span>
          <span style={{ color: OG.graphite, flexShrink: 0 }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

/** The whole card for a paper, from its contents entry. */
export async function paperOg(slug: string, kicker: string) {
  const { papers } = await import('@/content/papers')
  const p = papers.find((x) => x.slug === slug)!
  return paperCard({ kicker, title: p.title, byline: p.byline, figure: ogThumb(slug) })
}
