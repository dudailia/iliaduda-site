import type { Metadata, Viewport } from 'next'
import { Footer } from '@/components/Footer'
import { SkipLink } from '@/components/SkipLink'
import { sourceCodePro, sourceSerif } from '@/lib/fonts'
import { AVAILABILITY, PERSON, POSITIONING, SITE } from '@/lib/site'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'

export const metadata: Metadata = {
  // The deployment's own origin, so a preview's Open Graph image resolves on
  // the preview. Canonical URLs are set per page from SITE.canonical.
  metadataBase: new URL(SITE.origin),
  title: {
    default: 'Ilia Duda',
    template: '%s — Ilia Duda',
  },
  description: `${POSITIONING} ${AVAILABILITY.line}.`,
  twitter: { card: 'summary_large_image' },
  // Indexed and followed is the default, said by nothing; only a preview says noindex (and the 404 its own).
  ...(SITE.isProduction || !process.env.VERCEL_ENV ? {} : { robots: { index: false } }),
  authors: [{ name: PERSON.name, url: PERSON.github }],
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#111316' },
  ],
}

/**
 * Structured data for the person the site is about. It reads from the same
 * module as the masthead, so the availability a search engine sees is the one
 * a visitor sees.
 */
const person = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: PERSON.name,
  url: SITE.canonical,
  email: `mailto:${PERSON.email}`,
  description: `${POSITIONING} ${AVAILABILITY.line}.`,
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Boston',
    addressRegion: 'MA',
    addressCountry: 'US',
  },
  jobTitle: 'Quantitative Analyst and Engineer',
  affiliation: { '@type': 'CollegeOrUniversity', name: PERSON.school },
  knowsAbout: [
    'Quantitative finance',
    'Options pricing',
    'Implied volatility',
    'Statistical modelling',
    'Python',
    'TypeScript',
  ],
  knowsLanguage: ['en', 'ru'],
  sameAs: [PERSON.linkedin, PERSON.github],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sourceSerif.variable} ${sourceCodePro.variable}`}>
      {/* The site's address for print: a printed link carries its full target (globals.css, print). */}
      <body style={{ ['--print-origin' as string]: JSON.stringify(SITE.public.replace(/^https?:\/\//, '')) }}>
        <SkipLink />
        {children}
        <Footer />
        <script
          type="application/ld+json"
          // JSON-LD is data, not script; `<` is escaped so no string in it can
          // close the tag early.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(person).replace(/</g, '\\u003c') }}
        />
        {/* Vercel Web Analytics, on the production deployment only: its script and its counts are the site's own origin
            (/_vercel/insights), without cookies; a preview or a local build has no such path, so it is not asked for. */}
        {SITE.isProduction ? <Analytics /> : null}
      </body>
    </html>
  )
}
