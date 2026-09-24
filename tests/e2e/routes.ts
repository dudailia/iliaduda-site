import { otherWork, visiblePapers } from '../../content/papers'

/** Every route the audits run against, derived from the contents so a new
 *  page cannot be listed without appearing in the accessibility, keyboard and
 *  overflow gates. The e2e server is a local production build, which is not a
 *  Vercel production deployment — so pending papers are audited too. */
export const ROUTES = [
  '/',
  '/about',
  ...visiblePapers(false).map((p) => p.href),
  ...otherWork.map((o) => o.href),
] as const

/** Old URLs that must keep working. */
export const REDIRECTS = [
  ['/glacier', '/about#glacier'],
  ['/digital-group', '/debt-portal'],
] as const
