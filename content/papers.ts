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
/** A count under ten in words, as prose sets it ("eight integrations"), from the same fact. */
const words = (k: FactKey) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][fact(k).value] ?? n(k)

export interface Paper {
  readonly slug: string
  readonly href: string
  readonly title: string
  /** Two sentences, plain English, what it shows before what it lacks. */
  readonly abstract: string
  /** The paper page's own opening, when the abstract (kept whole for the metadata) is longer than a first screen
   *  should carry: at most 45 words. */
  readonly standfirst?: string
  /** The Contents' line for it: what was built and what it shows, in 30 words or fewer, from the abstract. */
  readonly dek: string
  /** What the Contents' thumbnail draws, where its byline does not already say: its data's nature. */
  readonly figureNote?: string
  /** Role · dates, as on the résumé. */
  readonly byline: string
  /**
   * `pending` renders on preview deployments only and is never in the sitemap
   * or the production build — for work whose owner has not yet agreed to
   * publication.
   */
  readonly status: 'published' | 'pending'
  /**
   * The paper as one résumé line, for /cv. Only papers that are not already a
   * role on the CV carry one; the rest are written up under Experience.
   */
  readonly cv?: string
  /** A short name for the CV's run-in heading. */
  readonly cvName?: string
}

export const papers: readonly Paper[] = [
  {
    slug: 'market',
    href: '/market',
    title: 'One market, three views',
    abstract:
      'One simulated market runs in your browser, and its Hawkes order book, a year of its futures and an arbitrage-free SSVI vol surface are drawn from it in the same frame. Press Liquidity shock: a sell sweeps the bids, and all three views take it at once.',
    standfirst:
      'One simulated market, drawn three ways in the same frame as it runs in your browser: its order book, a year of its futures and the volatility surface its stress drives. A liquidity shock lands in all three at once; what follows is the model’s own.',
    dek: 'One simulated market runs in your browser, drawn three ways in one frame: its order book, a year of futures, its vol surface. A liquidity shock hits all three.',
    cv: 'A deterministic Hawkes limit order book in a Web Worker, bit-identical in Chromium, WebKit, Firefox and Node, driving Monte Carlo price paths and an arbitrage-free SSVI surface.',
    byline: 'Independent work · September 2026 · synthetic data',
    status: 'published',
  },
  {
    slug: 'closebooks',
    href: '/closebooks',
    title: 'CloseBooks: a multi-tenant month-end close with an LLM in the loop',
    abstract: `A multi-tenant month-end close for CPA firms that I designed, built and deployed alone: ${n('cbApiRoutes')} API routes over Postgres with row-level security, and an LLM pipeline that maps every bank line to the client’s chart of accounts with a confidence it has to earn, or a reviewer’s approval, before it is exported.`,
    dek: 'A multi-tenant month-end close for CPA firms that I built alone: an LLM pipeline maps every bank line to the client’s accounts, and only confident or reviewer-approved lines export.',
    figureNote: 'synthetic feed',
    byline: 'Founder and sole engineer · April 2026 – present',
    status: 'published',
  },
  {
    slug: 'membrane',
    href: '/membrane',
    title: 'The vibrating drum: Fourier–Bessel series on a circular membrane',
    abstract:
      'A drum that rings in exactly the Fourier–Bessel modes the reader keeps, released from the initial shapes of a directed study’s exercises (MATH 4992, Spring 2026). Its Bessel functions and their zeros are computed in the page with no library and agree with SciPy’s to within a trillionth, and its coefficients match the exercises’ to four places.',
    standfirst:
      'A drum that rings in exactly the modes the reader keeps, released from the shapes of the exercises. Its Bessel functions and their zeros are computed in the page with no library, and agree with SciPy’s to within a trillionth.',
    dek: 'A drum ringing in the Fourier–Bessel modes the reader keeps, from a directed study’s exercises: Bessel functions and zeros computed in the page with no library, held to SciPy.',
    byline: 'Directed study · MATH 4992 · Spring 2026',
    status: 'published',
  },
  {
    slug: 'cricstate',
    href: '/cricstate',
    title: 'What ball-by-ball cricket predicts beyond the scoreboard',
    abstract: `A leakage-audited model of T20 cricket, built on ${n('crDeliveries')} T20 and ODI deliveries. Gradient boosting on match state cuts log-loss on win probability ${Math.round(fact('crT2Skill').value)}% below the base rate (${fact('crT2Nll').value.toFixed(3)} against ${fact('crT2Base').value.toFixed(3)}) on held-out matches, and the study measured what player identity adds before building on it: ${fact('crIdentityGain').value}%, under the bar.`,
    dek: `A leakage-audited model of T20 cricket, built on ${n('crDeliveries')} T20 and ODI deliveries: gradient boosting on match state cuts win-probability log-loss ${Math.round(fact('crT2Skill').value)}% below the base rate on held-out matches.`,
    byline: 'Independent research · July 2026',
    status: 'published',
    cvName: 'cricstate',
    cv: `Leakage-audited T20 win-probability model, built on ${n('crDeliveries')} T20 and ODI deliveries: gradient boosting on match state cuts held-out log-loss ${Math.round(fact('crT2Skill').value)}% below the base rate; temporal splits, leakage canaries in CI, paired bootstrap.`,
  },
  {
    slug: 'order-book',
    href: '/order-book',
    title: 'Order flow that remembers: a Hawkes-driven limit order book',
    standfirst: `A synthetic limit order book driven by a six-kind Hawkes process, simulated exactly in your browser at about 300 events a second and drawn as terrain. Most market orders are set off by earlier ones; Fig. 2 shows what set off any one.`,
    abstract: `A synthetic limit order book whose order flow is a six-kind Hawkes process, simulated exactly in your browser at about 300 events a second and drawn as terrain, with the flow beside it: most market orders are set off by earlier ones, and you can read what set off any one. It steps in whole quanta and computes its own exponentials, so the server and every browser draw one market from one seed (Chromium, WebKit and Firefox are tested to agree), and a time-rescaling test checks the simulation against the model.`,
    dek: 'A synthetic limit order book driven by a six-kind Hawkes process, simulated exactly in your browser and drawn as terrain: read the odds of what set off any market order.',
    byline: 'Independent work · September 2026 · synthetic data',
    status: 'published',
  },
  {
    slug: 'iv-surface',
    href: '/iv-surface',
    title: 'An implied-volatility surface free of static arbitrage',
    standfirst: `A synthetic SSVI surface shaped like an equity index, in live 3D, with implied and local volatility and the Greeks at any point. It takes a simulated volatility shock and stays free of static arbitrage through every frame; Fig. 2 lets you break the condition.`,
    abstract: `A synthetic SSVI surface shaped like an equity index, in live 3D, with implied and local volatility and Black–Scholes Greeks at any point. It takes a simulated volatility shock, the short end lifting and the skew steepening, and stays free of static arbitrage through every frame of it; the tests check Gatheral and Jacquier’s conditions on a dense grid, and Fig. 2 lets you break them.`,
    dek: 'A synthetic SSVI volatility surface in live 3D, with local vol and Black–Scholes Greeks at any point, that takes a shock and stays free of static arbitrage in every frame.',
    byline: 'Independent work · September 2026 · synthetic data',
    status: 'published',
    cvName: 'Implied-volatility surface free of static arbitrage',
    cv: 'A synthetic SSVI surface free of static arbitrage, with Dupire local volatility and Black–Scholes Greeks at any point, the no-arbitrage conditions asserted by tests on a dense grid; drawn live in raw WebGL2.',
  },
  {
    slug: 'startup-investments',
    href: '/startup-investments',
    title: 'Ranking startup segments, and how much the answer depends on the data',
    abstract: `A composite model ranks ${n('siMassSegments')} startup segments on growth and size across ${n('siRowsFinal')} funding records. Re-executing my capstone exactly, then changing one data decision at a time, measures how much the recommendation depends on them — three treatments give three different top picks — and finds the segments that hold up under all three.`,
    dek: `A composite model ranks ${n('siMassSegments')} startup segments on growth and size; changing one data decision at a time gives three treatments three top picks, and shows which segments hold up.`,
    byline: 'Data-analytics capstone, Yandex Practicum · December 2025 · Python, pandas',
    status: 'published',
    cvName: 'Startup segment ranking',
    cv: `Re-executed my capstone ranking of ${n('siMassSegments')} startup segments over ${n('siRowsFinal')} funding records, varying one data decision at a time: three treatments, three top picks, and the segments robust to all three.`,
  },
  {
    slug: 'debt-portal',
    href: '/debt-portal',
    title: 'A debt-settlement portal built to Russian federal law',
    abstract: `A self-service portal where people settle a debt without a phone call, built end to end as sole developer for a licensed Russian collection organisation. Federal law set the architecture: personal data stays in the country, and every login code is counted against a legal contact allowance, the conservative reading of an unsettled question; both are enforced in code and at build time.`,
    dek: 'A self-service portal for settling a debt without a phone call, built end to end as sole developer for a licensed Russian collection organisation, with federal law enforced in code.',
    figureNote: 'illustrative terms',
    byline: 'Sole Developer and Project Lead · July 2026 – present',
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
    // From the public repository (github.com/dudailia/nucarbon): its only contributor, built on 6 May 2026 (a later
    // commit only replaced the README).
    status: 'Developer · May 2026 · Northeastern Sustainability Incubator · deployed',
  },
  {
    slug: 'adconfirm',
    href: '/adconfirm',
    name: 'AdConfirm',
    what: `Advertising inside invoices and receipts, across ${words('acIntegrations')} accounting and point-of-sale integrations, with metered billing`,
    status: 'Co-Founder · May 2026 – present',
  },
]

/** Published everywhere; pending only where the deployment allows it. */
export function visiblePapers(isProduction: boolean): readonly Paper[] {
  return papers.filter((p) => p.status === 'published' || !isProduction)
}
