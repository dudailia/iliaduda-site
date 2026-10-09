import type { Metadata, Viewport } from 'next'
import { Footer } from '@/components/Footer'
import { SkipLink } from '@/components/SkipLink'
import { sourceCodePro, sourceSerif } from '@/lib/fonts'
import { AVAILABILITY, DESCRIPTION, PERSON, POSITIONING, SITE } from '@/lib/site'
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
  description: DESCRIPTION,
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
  jobTitle: 'Quantitative analyst and engineer',
  affiliation: { '@type': 'CollegeOrUniversity', name: PERSON.school },
  knowsAbout: [
    'Quantitative finance',
    'Options pricing',
    'Implied volatility',
    'Statistical modeling',
    'Python',
    'TypeScript',
  ],
  knowsLanguage: ['en', 'ru'],
  sameAs: [PERSON.linkedin, PERSON.github],
}

/**
 * A phone turned keeps the reader's place: the first block of text (or heading, or figure) still on screen stands where
 * it stood. The page turns scroll anchoring off (globals.css: WebKit's anchoring scrolled the page under a finger
 * working a figure), and without it a turn kept only the pixel offset: the paragraph being read landed 600–1,090px
 * above the screen as the text reflowed shorter. Put back at once, and again a frame later, once the figures have
 * taken their new sizes. And a touch listener that does nothing: iOS Safari applies :active only under one, and no
 * link or control showed its press under a finger.
 */
const KEEP_PLACE = `(function(){var a=null,w=innerWidth,t=0,S='p,li,dt,h1,h2,h3,figure';function pick(){t=0;a=null;if(scrollY<1)return;var e=document.querySelectorAll(S);for(var i=0;i<e.length;i++){var r=e[i].getBoundingClientRect();if(r.bottom>0&&r.height>0){a={el:e[i],top:r.top};return}}}function back(k){var d=k.el.getBoundingClientRect().top-k.top;if(Math.abs(d)>1)scrollBy(0,d)}addEventListener('scroll',function(){if(!t)t=requestAnimationFrame(pick)},{passive:true});addEventListener('touchstart',function(){},{passive:true});addEventListener('resize',function(){if(innerWidth===w)return;w=innerWidth;var k=a;if(!k)return;back(k);requestAnimationFrame(function(){back(k);requestAnimationFrame(function(){back(k);a=k})})})})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sourceSerif.variable} ${sourceCodePro.variable}`}>
      {/* The site's address for print: a printed link carries its full target (globals.css, print). */}
      <body style={{ ['--print-origin' as string]: JSON.stringify(SITE.public.replace(/^https?:\/\//, '')) }}>
        <SkipLink />
        <script dangerouslySetInnerHTML={{ __html: KEEP_PLACE }} />
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
