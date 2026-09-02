import type { MetadataRoute } from 'next'
import { projects } from '@/content/projects'

const SITE = 'https://iliaduda.com'

/**
 * cricstate is not listed: it renders on the home page and /cricstate is a
 * permanent redirect to that anchor, so listing it would advertise a redirect.
 * The figure anchors (#fig-materiality, #fig-tenant-isolation, …) are not
 * sitemap entries — fragments are not separate URLs — but they are permanent,
 * because they get pasted into email and that is how this site gets used.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: SITE, lastModified: now, priority: 1 },
    ...projects.map((p) => ({
      url: `${SITE}${p.href}`,
      lastModified: now,
      priority: 0.8,
    })),
  ]
}
