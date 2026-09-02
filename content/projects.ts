/**
 * The index entries. One line each: name, one clause on what it is, and where
 * it actually stands. A row of cards would be the default and would undo the
 * register, so this renders as a typeset list separated by rules.
 *
 * `status` is the load-bearing field. It is written the way it would be written
 * if the reader were going to open the repository next — because they are.
 */

export interface ProjectEntry {
  readonly slug: string
  readonly name: string
  /** One clause. No adjectives that cannot be checked. */
  readonly what: string
  readonly status: string
  readonly href: string
}

export const projects: readonly ProjectEntry[] = [
  {
    slug: 'closebooks',
    name: 'CloseBooks',
    what: 'AI-assisted month-end close for CPA firms, built solo',
    status: 'deployed; billing in Stripe test mode, so no paying customers',
    href: '/closebooks',
  },
  {
    slug: 'glacier',
    name: 'Glacier Capital Systems',
    what: 'Python research stack and a real-time alert dashboard for an options trading firm',
    status: 'sole engineer; under client confidentiality',
    href: '/glacier',
  },
  {
    slug: 'digital-group',
    name: 'Debt-settlement portal',
    what: 'a self-service portal whose architecture was decided by Russian federal law',
    status: 'in active development; sole developer',
    href: '/digital-group',
  },
  {
    slug: 'adconfirm',
    name: 'AdConfirm',
    what: 'advertising placement inside invoices and receipts, with metered billing',
    status: 'co-founded and built it; I no longer maintain it',
    href: '/adconfirm',
  },
  {
    slug: 'startup-investments',
    name: 'Startup investment analysis',
    what: 'segment ranking over 40,000-plus startup funding records',
    status: 'course capstone; descriptive, not a forecast',
    href: '/startup-investments',
  },
  {
    slug: 'nucarbon',
    name: 'nucarbon',
    what: 'a dashboard estimating the carbon cost of campus AI use',
    status: 'deployed; it models rather than measures, and says so',
    href: '/nucarbon',
  },
]
