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
    title: 'An implied-volatility surface that cannot be arbitraged',
    abstract: `A synthetic SSVI surface in the shape of an equity index, drawn live, with implied and local volatility and Black–Scholes Greeks read off any point. Its hand-set parameters meet Gatheral and Jacquier’s sufficient conditions for no static arbitrage, and the tests check butterfly and calendar arbitrage on a dense grid rather than trusting that the theorem’s hypotheses were met.`,
    byline: 'Independent work · September 2026 · synthetic data',
    status: 'published',
  },
  {
    slug: 'closebooks',
    href: '/closebooks',
    title: 'CloseBooks: an AI month-end close for CPA firms',
    abstract: `A multi-tenant month-end close I designed, built and deployed alone: ${n('cbApiRoutes')} API routes over Postgres with row-level tenant isolation, Stripe billing across three tiers, and a categorisation pipeline on the Claude API that maps every bank line to the client’s chart of accounts with a confidence it has to earn. Low-confidence rows go to a human; an account that does not exist in the client’s chart cannot be exported at all.`,
    byline: 'Founder and sole engineer · January 2026 – present',
    status: 'published',
  },
  {
    slug: 'cricstate',
    href: '/cricstate',
    title: 'What ball-by-ball cricket predicts beyond the scoreboard',
    abstract: `A leakage-audited modelling study over ${n('crDeliveries')} deliveries replayed exactly from ${n('crMatches')} matches. Gradient boosting on match state reaches ${fact('crT2Skill').value}% skill on T20 win probability and ${fact('crStateGain').value}% on the next ball, calibrated on validation data only; player identity was measured before anything was built on it, added ${fact('crIdentityGain').value}%, and fell under the ${fact('crJustifyBar').value.toFixed(0)}% materiality bar, so the more complex model was not built.`,
    byline: 'Independent research · July 2026',
    status: 'published',
  },
  {
    slug: 'startup-investments',
    href: '/startup-investments',
    title: 'Ranking startup segments, and how much the answer depends on the data',
    abstract: `A composite model ranks ${n('siMassSegments')} mass-market startup segments on growth, compound growth, total funding and company count across ${n('siRowsFinal')} cleaned funding records. Re-executing the analysis exactly and then changing one data-handling decision at a time shows how fragile the recommendation is — the top pick moves three times — and isolates the segments that rank near the top under every treatment.`,
    byline: 'Data-analytics capstone, Yandex Practicum · December 2025 · Python, pandas',
    status: 'published',
  },
  {
    slug: 'debt-portal',
    href: '/debt-portal',
    title: 'A debt-settlement portal built to Russian federal law',
    abstract: `A ${n('dgRoutes')}-route self-service portal where people settle a debt without a phone call, for a licensed Russian collection agency. The statutes set the architecture: data localisation removed foreign hosting, and a legal cap on creditor contact means a login code spends part of a person’s allowance.`,
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
