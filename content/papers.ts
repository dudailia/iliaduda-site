import { fact, type FactKey } from './facts'

/**
 * The contents of the issue: every paper and every piece of other work, in the
 * order a finance reader should meet them. The home page, footer, sitemap and
 * e2e route list all read this, so a paper cannot exist without being listed
 * or be listed without existing.
 *
 * Abstracts are claim first. A limit belongs beside the claim it qualifies —
 * in the paper, in a margin note — and never stands alone as the headline.
 * Numbers arrive through facts.ts like everywhere else.
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
    title: 'CloseBooks: month-end close for small CPA firms',
    abstract: `An AI-assisted month-end close, designed, built and deployed solo: ${n('cbApiRoutes')} API routes over Postgres with row-level tenant isolation, a Claude categorisation pipeline, Stripe billing and a QuickBooks journal push. Before launch I audited it as a sceptic would, and four screens that reported actions which never happened now report what actually occurred.`,
    byline: 'Founder and sole engineer · January 2026 – present',
    status: 'published',
  },
  {
    slug: 'cricstate',
    href: '/cricstate',
    title: 'What ball-by-ball cricket predicts beyond the scoreboard',
    abstract: `Gradient boosting on match state beats a marginal baseline by ${fact('crStateGain').value}% in log-likelihood on the next ball, and by ${fact('crT2Skill').value}% skill on T20 win probability, over ${n('crDeliveries')} deliveries replayed exactly from ${n('crMatches')} matches. Player identity adds ${fact('crIdentityGain').value}%, under the ${fact('crJustifyBar').value.toFixed(0)}% bar for further work, so the hierarchical model was declined on its own evidence.`,
    byline: 'Independent research · July 2026',
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
    slug: 'startup-investments',
    href: '/startup-investments',
    name: 'Startup investment analysis',
    what: `Ranking ${n('siSegments')} market segments across ${n('siRowsCleaned')} startup funding records`,
    status: 'Yandex Practicum capstone · descriptive analysis',
  },
  {
    slug: 'nucarbon',
    href: '/nucarbon',
    name: 'nucarbon',
    what: 'A dashboard estimating the carbon cost of AI use across a university campus',
    status: 'Deployed · a model with its assumptions shown',
  },
  {
    slug: 'adconfirm',
    href: '/adconfirm',
    name: 'AdConfirm',
    what: `Advertising inside invoices and receipts, across ${n('acIntegrations')} accounting and point-of-sale integrations, with metered billing`,
    // TODO(owner): current status. The September résumé says co-founder, May
    // 2026 – present; the previous site said no longer maintained.
    status: 'Co-founder · TODO: confirm current status',
  },
]

/** Published everywhere; pending only where the deployment allows it. */
export function visiblePapers(isProduction: boolean): readonly Paper[] {
  return papers.filter((p) => p.status === 'published' || !isProduction)
}
