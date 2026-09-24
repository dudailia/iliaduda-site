import type { Metadata, Viewport } from 'next'
import { Footer } from '@/components/Footer'
import { SkipLink } from '@/components/SkipLink'
import { sourceCodePro, sourceSerif } from '@/lib/fonts'
import { AVAILABILITY, PERSON, POSITIONING, SITE } from '@/lib/site'
import './globals.css'

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
  robots: SITE.isProduction || !process.env.VERCEL_ENV ? { index: true, follow: true } : { index: false },
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
      <body>
        <SkipLink />
        {children}
        <Footer />
        <script
          type="application/ld+json"
          // JSON-LD is data, not script; `<` is escaped so no string in it can
          // close the tag early.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(person).replace(/</g, '\\u003c') }}
        />
      </body>
    </html>
  )
}
