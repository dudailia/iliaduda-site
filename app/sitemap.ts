import type { MetadataRoute } from 'next'
import { otherWork, visiblePapers } from '@/content/papers'
import { SITE } from '@/lib/site'

/**
 * Pending papers are never listed: visiblePapers(true) is the production view
 * whatever deployment builds this file. Figure anchors are not entries —
 * fragments are not separate URLs — but they are permanent, because they get
 * pasted into email and that is how this site gets used.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const url = (path: string) => `${SITE.canonical}${path}`
  return [
    { url: url('/'), lastModified: now, priority: 1 },
    ...visiblePapers(true).map((p) => ({ url: url(p.href), lastModified: now, priority: 0.8 })),
    { url: url('/about'), lastModified: now, priority: 0.8 },
    { url: url('/cv'), lastModified: now, priority: 0.8 },
    ...otherWork.map((o) => ({ url: url(o.href), lastModified: now, priority: 0.5 })),
  ]
}
