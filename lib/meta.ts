import type { Metadata } from 'next'
import { SITE } from './site'

/**
 * Per-page metadata with its own canonical URL. Canonical is set page by page
 * rather than in the root layout because Next inherits `alternates` down the
 * tree: a root canonical would quietly declare every paper a duplicate of the
 * home page.
 */
export function pageMeta(path: string, title: string | undefined, description: string): Metadata {
  const url = `${SITE.canonical}${path === '/' ? '' : path}`
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: url },
    openGraph: {
      type: path === '/' ? 'profile' : 'article',
      url,
      siteName: 'Ilia Duda',
      locale: 'en_US',
      ...(title ? { title: `${title} — Ilia Duda` } : { title: 'Ilia Duda' }),
      description,
    },
  }
}
