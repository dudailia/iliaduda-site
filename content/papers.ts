import { fact, type FactKey } from './facts'

/**
 * The contents of the issue: every paper and every piece of other work, in the
 * order a finance reader should meet them. The home page, footer, sitemap and
 * e2e route list all read this, so a paper cannot exist without being listed
 * or be listed without existing.
 *
 * Abstracts lead with what was built and what it shows, framed at their
 * strongest and never beyond what the facts support. A limit appears only
 * where a sharp reader would expect it, stated as rigour. Numbers arrive
 * through facts.ts like everywhere else.
 */

const n = (k: FactKey) => fact(k).value.toLocaleString('en-US')

export interface Paper {
  readonly slug: string
  readonly href: string
  readonly title: string
  /** Two sentences, plain English, what it shows before what it lacks. */
  readonly abstract: string
  /** Role · dates, as on the résumé. */
  readonly byline: string
  /**
   * `pending` renders on preview deployments only and is never in the sitemap
   * or the production build — for work whose owner has not yet agreed to
   * publication.
   */
  readonly status: 'published' | 'pending'
}

export const papers: readonly Paper[] = [
  {
    slug: 'iv-surface',
    href: '/iv-surface',
    title: 'An implied-volatility surface free of static arbitrage',
    abstract: `A synthetic SSVI surface shaped like an equity index, drawn live, with implied and local volatility and Black–Scholes Greeks at any point. Its parameters meet Gatheral and Jacquier’s conditions for no static arbitrage, the tests check them on a dense grid, and Fig. 2 lets you break them.`,
    byline: 'Independent work · September 2026 · synthetic data',
    status: 'published',
  },
  {
    slug: 'closebooks',
    href: '/closebooks',
    title: 'CloseBooks: a multi-tenant month-end close with an LLM in the loop',
    abstract: `A multi-tenant month-end close for CPA firms that I designed, built and deployed alone: ${n('cbApiRoutes')} API routes over Postgres with row-level isolation, and an LLM pipeline that maps every bank line to the client’s chart of accounts with a confidence it has to earn before anything is exported.`,
    byline: 'Founder and sole engineer · January 2026 – present',
    status: 'published',
  },
  {
    slug: 'cricstate',
    href: '/cricstate',
    title: 'What ball-by-ball cricket predicts beyond the scoreboard',
    abstract: `A leakage-audited model of T20 cricket over ${n('crDeliveries')} deliveries. Gradient boosting on match state cuts log-loss on win probability ${Math.round(fact('crT2Skill').value)}% below the base rate (${fact('crT2Nll').value.toFixed(3)} against ${fact('crT2Base').value.toFixed(3)}) on held-out matches, and the study measured what player identity adds before building on it: ${fact('crIdentityGain').value}%, under the bar.`,
    byline: 'Independent research · July 2026',
    status: 'published',
  },
  {
    slug: 'startup-investments',
    href: '/startup-investments',
    title: 'Ranking startup segments, and how much the answer depends on the data',
    abstract: `A composite model ranks ${n('siMassSegments')} startup segments on growth and size across ${n('siRowsFinal')} funding records. Re-executing my capstone exactly, then changing one data decision at a time, measures how much the recommendation depends on them — three treatments give three different top picks — and finds the segments that hold up under all three.`,
    byline: 'Data-analytics capstone, Yandex Practicum · December 2025 · Python, pandas',
    status: 'published',
  },
  {
    slug: 'debt-portal',
    href: '/debt-portal',
    title: 'A debt-settlement portal built to Russian federal law',
    abstract: `A self-service portal where people settle a debt without a phone call, built end to end as sole developer for a licensed Russian collection organisation. Federal law set the architecture: personal data stays in the country, and the login code itself spends a legal contact allowance, so both are enforced in code and at build time.`,
    byline: 'Sole developer and project lead · July 2026 – present',
    status: 'published',
  },
]

export interface OtherWork {
  readonly slug: string
  readonly href: string
  readonly name: string
  readonly what: string
  readonly status: string
}

export const otherWork: readonly OtherWork[] = [
  {
    slug: 'nucarbon',
    href: '/nucarbon',
    name: 'nucarbon',
    what: 'A dashboard estimating the carbon cost of AI use across a university campus',
    status: 'Northeastern Sustainability Incubator · deployed',
  },
  {
    slug: 'adconfirm',
    href: '/adconfirm',
    name: 'AdConfirm',
    what: `Advertising inside invoices and receipts, across ${n('acIntegrations')} accounting and point-of-sale integrations, with metered billing`,
    status: 'Co-founder · May 2026 – present',
  },
]

/** Published everywhere; pending only where the deployment allows it. */
export function visiblePapers(isProduction: boolean): readonly Paper[] {
  return papers.filter((p) => p.status === 'published' || !isProduction)
}
