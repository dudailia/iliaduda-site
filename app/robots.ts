import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    // /lab holds unlinked hero prototypes; production 404s them anyway.
    rules: [{ userAgent: '*', allow: '/', disallow: '/lab' }],
    sitemap: `${SITE.canonical}/sitemap.xml`,
  }
}
