import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SITE } from '@/lib/site'

/**
 * Hero prototypes, for the owner to compare on the preview. Never indexed,
 * never linked from the site, disallowed in robots.txt, absent from the
 * sitemap, and a 404 on a production deployment.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

export default function LabLayout({ children }: { children: React.ReactNode }) {
  if (SITE.isProduction) notFound()
  return <main id="main">{children}</main>
}
