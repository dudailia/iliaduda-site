import type { Metadata } from 'next'
import { sourceCodePro, sourceSerif } from '@/lib/fonts'
import { Footer } from '@/components/Footer'
import { SkipLink } from '@/components/SkipLink'
import './globals.css'

const SITE = 'https://iliaduda.com'

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'Ilia Duda',
    template: '%s — Ilia Duda',
  },
  description:
    'Mathematics and Business Administration at Northeastern University. Quantitative finance and the systems around it: research stacks, market tooling, and applied LLM infrastructure.',
  openGraph: {
    type: 'website',
    url: SITE,
    siteName: 'Ilia Duda',
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
  authors: [{ name: 'Ilia Duda', url: 'https://github.com/dudailia' }],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sourceSerif.variable} ${sourceCodePro.variable}`}>
      <body>
        <SkipLink />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
