/** Every route the audits run against. Kept in one place so a new page cannot
 *  be added without appearing in the accessibility, keyboard and overflow
 *  gates. */
export const ROUTES = [
  '/',
  '/closebooks',
  '/glacier',
  '/digital-group',
  '/adconfirm',
  '/startup-investments',
  '/nucarbon',
] as const
