/**
 * Every number rendered anywhere on this site lives here, and every entry
 * carries the file it was verified against.
 *
 * tests/facts.test.ts fails the build if any entry has an empty `source`, and
 * tests/figures.test.ts fails the build if a figure component contains a
 * numeric literal that did not come through this module. That is the whole
 * point: a number without provenance cannot reach the page.
 *
 * Numbers that could not be verified during the audit were dropped rather than
 * softened. Several claims that appeared in earlier versions of this portfolio
 * are absent for exactly that reason.
 */

export type Unit =
  | 'percent'
  | 'count'
  | 'megabytes'
  | 'kilobytes'
  | 'nats'
  | 'milliseconds'
  | 'seconds'
  | 'kwh'
  | 'kg'
  | 'weight'
  | 'years'
  | 'none'

export interface Fact {
  readonly value: number
  readonly unit: Unit
  readonly label: string
  /** Non-empty, and specific enough to re-check. Enforced by test. */
  readonly source: string
  /**
   * `synthetic` marks a value that was chosen rather than measured — the
   * parameters of an illustrative model. Its source must name the module that
   * uses it and say "synthetic", and any page that draws it must label the
   * figure synthetic where the figure is (tests/facts.test.ts, e2e synthetic).
   */
  readonly kind?: 'measured' | 'synthetic'
}

const facts = {
  // ── Implied-volatility surface (synthetic) ────────────────────────────────
  // Hand-set SSVI parameters for the hero figure and paper 1. Not fitted to
  // any market data and not any employer's model. Chosen so the surface looks
  // like an equity index — downward skew, a volatility term structure that
  // decays from the short end — and satisfies Gatheral and Jacquier's
  // sufficient no-arbitrage conditions, which tests/svi.test.ts checks.
  ivSigmaShort: {
    value: 0.26,
    unit: 'none',
    label: 'at-the-money volatility at the short end',
    source: 'lib/svi.ts — synthetic, set by hand',
    kind: 'synthetic',
  },
  ivSigmaLong: {
    value: 0.19,
    unit: 'none',
    label: 'long-run at-the-money volatility',
    source: 'lib/svi.ts — synthetic, set by hand',
    kind: 'synthetic',
  },
  ivKappa: {
    value: 1.5,
    unit: 'none',
    label: 'term-structure decay rate, per year',
    source: 'lib/svi.ts — synthetic, set by hand',
    kind: 'synthetic',
  },
  ivRho: {
    value: -0.62,
    unit: 'none',
    label: 'skew, ρ',
    source: 'lib/svi.ts — synthetic, set by hand',
    kind: 'synthetic',
  },
  ivEta: {
    value: 1.1,
    unit: 'none',
    label: 'curvature, η',
    source: 'lib/svi.ts — synthetic, set by hand; η(1+|ρ|) ≤ 2',
    kind: 'synthetic',
  },
  ivGamma: {
    value: 0.5,
    unit: 'none',
    label: 'power-law exponent, γ',
    source: 'lib/svi.ts — synthetic, set by hand',
    kind: 'synthetic',
  },
  ivForward: {
    value: 100,
    unit: 'none',
    label: 'forward price',
    source: 'lib/bs.ts — synthetic, a round number with rates and dividends at zero',
    kind: 'synthetic',
  },

  // ── cricstate ──────────────────────────────────────────────────────────────
  // The figure axis. One unit throughout: relative NLL improvement over the
  // B0 marginal baseline on the T1/T20 cell, post-calibration.
  crIdentityGain: {
    value: 0.31,
    unit: 'percent',
    label: 'player identity',
    source: 'cricstate/results/summary.json → /identity_t1_t20_test/relative_nll_pct',
  },
  crLatentGain: {
    value: 0.024,
    unit: 'percent',
    label: 'per-match latent',
    source: 'cricstate/report/paper.md:191-197 — "a negligible 0.024% on validation"',
  },
  crStateGain: {
    value: 4.17,
    unit: 'percent',
    label: 'match state',
    source: 'cricstate/docs/LEADERBOARD.md — t1/t20 B3_gbm skill vs B0 +0.0417',
  },
  crJustifyBar: {
    value: 1.0,
    unit: 'percent',
    label: 'justifies further work',
    source: 'cricstate/report/paper.md:97-102 — REL_JUSTIFY',
  },
  crAmbiguousFloor: {
    value: 0.3,
    unit: 'percent',
    label: 'ambiguous below',
    source: 'cricstate/report/paper.md:97-102 — REL_AMBIG_LO',
  },
  crMatches: {
    value: 16754,
    unit: 'count',
    label: 'matches replayed',
    source: 'cricstate/docs/STATS.md — n_matches',
  },
  crDeliveries: {
    value: 4748382,
    unit: 'count',
    label: 'deliveries',
    source: 'cricstate/docs/STATS.md — n_deliveries',
  },
  crFilesSeen: {
    value: 22211,
    unit: 'count',
    label: 'match files in the snapshot',
    source: 'cricstate/docs/STATS.md — 22211 = 16754 parsed + 5457 quarantined',
  },
  crQuarantined: {
    value: 5457,
    unit: 'count',
    label: 'quarantined with a coded reason',
    source: 'cricstate/docs/STATS.md — quarantine histogram',
  },
  crTestFiles: {
    value: 24,
    unit: 'count',
    label: 'test files',
    source: 'cricstate — find tests -name "test_*.py" | wc -l (its README says 25 and is off by one)',
  },
  crTestLines: {
    value: 2310,
    unit: 'count',
    label: 'lines of tests',
    source: 'cricstate — wc -l over tests/test_*.py',
  },
  crGoldens: {
    value: 11,
    unit: 'count',
    label: 'golden fixtures',
    source: 'cricstate/tests/golden/GOLDENS.md',
  },
  crBootstrapResamples: {
    value: 10000,
    unit: 'count',
    label: 'bootstrap resamples',
    source: 'cricstate/src/evalkit/bootstrap.py — B_RESAMPLES',
  },
  crT2Skill: {
    value: 29.22,
    unit: 'percent',
    label: 'skill vs baseline, T2/T20',
    source: 'cricstate/docs/LEADERBOARD.md — t2/t20 B3_gbm skill +0.2922',
  },

  // ── CloseBooks ─────────────────────────────────────────────────────────────
  cbApiRoutes: {
    value: 100,
    unit: 'count',
    label: 'API routes',
    source: 'closebooks-app @6fdbb82d — find src/app/api -name route.ts | wc -l (README says 101, stale)',
  },
  cbDashboardPages: {
    value: 87,
    unit: 'count',
    label: 'dashboard pages',
    source: 'closebooks-app @6fdbb82d — find src/app/dashboard -name page.tsx | wc -l',
  },
  cbMigrations: {
    value: 15,
    unit: 'count',
    label: 'SQL migrations',
    source: 'closebooks-app @6fdbb82d — ls supabase/migrations | wc -l',
  },
  cbServiceRoleRoutes: {
    value: 17,
    unit: 'count',
    label: 'routes using the service-role key',
    source: 'closebooks-app — grep SUPABASE_SERVICE_ROLE_KEY across src/app/api',
  },
  cbTypeErrors: {
    value: 70,
    unit: 'count',
    label: 'type errors surfaced',
    source: 'closebooks-app commit d20043be; README.md:15',
  },
  cbFakeDelay: {
    value: 1500,
    unit: 'milliseconds',
    label: 'simulated network delay, deleted',
    source: 'closebooks-app commit 47f14e21 — the removed setTimeout in the TIN check',
  },
  cbBatchSize: {
    value: 20,
    unit: 'count',
    label: 'transactions per model call',
    source: 'closebooks-app/src/lib/categorize.ts:5-9 — BATCH_SIZE',
  },
  cbAutoApprove: {
    value: 0.85,
    unit: 'none',
    label: 'auto-approve confidence threshold',
    source: 'closebooks-app/src/lib/categorize.ts:5-9 — AUTO_APPROVE_THRESHOLD',
  },
  cbHistoryBefore: {
    value: 62,
    unit: 'megabytes',
    label: 'history before the purge',
    source: 'github-audit/cb-BACKUP.git — du -sh (20,494 node_modules objects)',
  },
  cbHistoryAfter: {
    value: 3.3,
    unit: 'megabytes',
    label: 'history after the purge',
    source: 'github-audit/cb-purge.git — du -sh (0 node_modules objects)',
  },

  // ── Debt-settlement portal ────────────────────────────────────────────────
  dgRoutes: {
    value: 25,
    unit: 'count',
    label: 'public routes',
    source: 'dg-website/src/content/ru/routes.ts — 25 path entries',
  },
  dgUnitTests: {
    value: 226,
    unit: 'count',
    label: 'declared unit tests',
    source: 'dg-website/tests — 224 it( + 2 test( across 22 files, plus 9 it.each blocks',
  },
  dgE2eCases: {
    value: 146,
    unit: 'count',
    label: 'executed end-to-end cases',
    source: 'dg-website — 73 test( x 2 Playwright projects (playwright.config.ts:34-42)',
  },
  // 230-ФЗ art. 7. Two separate ceilings, because the statute treats a phone
  // call and an electronic message as different things.
  dgCallsDay: {
    value: 1,
    unit: 'count',
    label: 'calls per day',
    source: 'dg-website/src/content/ru/knowledge.ts:93 — 230-ФЗ art. 7',
  },
  dgCallsWeek: {
    value: 2,
    unit: 'count',
    label: 'calls per week',
    source: 'dg-website/src/content/ru/knowledge.ts:93 — 230-ФЗ art. 7',
  },
  dgCallsMonth: {
    value: 8,
    unit: 'count',
    label: 'calls per month',
    source: 'dg-website/src/content/ru/knowledge.ts:93 — 230-ФЗ art. 7',
  },
  dgMessagesDay: {
    value: 2,
    unit: 'count',
    label: 'messages per day',
    source: 'dg-website/src/content/ru/knowledge.ts:93 — 230-ФЗ art. 7',
  },
  dgMessagesWeek: {
    value: 4,
    unit: 'count',
    label: 'messages per week',
    source: 'dg-website/src/content/ru/knowledge.ts:93 — 230-ФЗ art. 7',
  },
  dgMessagesMonth: {
    value: 16,
    unit: 'count',
    label: 'messages per month',
    source: 'dg-website/src/content/ru/knowledge.ts:93 — 230-ФЗ art. 7',
  },
  dgClsGate: {
    value: 0.05,
    unit: 'none',
    label: 'CLS gate',
    source: 'dg-website/lighthouserc.json:185-270 — cumulative-layout-shift maxNumericValue',
  },
  dgClsMeasured: {
    value: 0,
    unit: 'none',
    label: 'CLS measured',
    source: 'dg-website/.lighthouseci/lhr-*.json — 0 on every audited route, 5 routes x 5 runs',
  },
  dgThirdParty: {
    value: 0,
    unit: 'count',
    label: 'third-party requests permitted',
    source: 'dg-website/lighthouserc.json:245-251 — resource-summary:third-party:count',
  },
  dgSpuriousFailures: {
    value: 35,
    unit: 'count',
    label: 'spurious gate failures',
    source: 'dg-website/lighthouserc.json:2-16 — comment keys parsed as unknown audit IDs',
  },
  dgFalseReadiness: {
    value: 0.84,
    unit: 'seconds',
    label: 'declared ready after launch',
    source: 'dg-website/lighthouserc.json:38-56',
  },

  // ── AdConfirm ─────────────────────────────────────────────────────────────
  acIntegrations: {
    value: 8,
    unit: 'count',
    label: 'accounting and point-of-sale integrations',
    source: 'adconfirm/apps/backend/src/adapters — 8 adapter modules',
  },
  acMillicentsPerImpression: {
    value: 200,
    unit: 'count',
    label: 'millicents per impression at a £2 CPM',
    source: 'adconfirm/apps/backend/src/modules/money.ts:1-9',
  },
  acMinPayoutPence: {
    value: 500,
    unit: 'count',
    label: 'minimum payout, pence',
    source: 'adconfirm/apps/backend/src/workers/payoutWorker.ts — MIN_PAYOUT_MILLICENTS 500000',
  },
  acAdaptersWithoutLineItems: {
    value: 3,
    unit: 'count',
    label: 'adapters that cannot populate line items',
    source: 'adconfirm — Square (square.ts:187), Sage (sage.ts:257), EposNow line-item gap',
  },

  // ── startup-investment-analysis ───────────────────────────────────────────
  siRowsRaw: {
    value: 54294,
    unit: 'count',
    label: 'records before cleaning',
    source: 'startup-investment-analysis notebook cell 80',
  },
  siRowsCleaned: {
    value: 40907,
    unit: 'count',
    label: 'after dropping records with no funding or date',
    source: 'startup-investment-analysis notebook cell 46',
  },
  siOutliersRemoved: {
    value: 5244,
    unit: 'count',
    label: 'companies removed by per-segment IQR fences',
    source: 'startup-investment-analysis notebook cell 80',
  },
  siRowsFinal: {
    value: 35589,
    unit: 'count',
    label: 'records scored',
    source: 'startup-investment-analysis notebook cell 80',
  },
  siLossPct: {
    value: 34.5,
    unit: 'percent',
    label: 'cumulative data loss',
    source: 'startup-investment-analysis notebook cell 80 — 54294 to 35589',
  },
  siSegments: {
    value: 395,
    unit: 'count',
    label: 'unique segments',
    source: 'startup-investment-analysis notebook cell 61',
  },
  siVenture: {
    value: 18821,
    unit: 'count',
    label: 'venture-funded companies',
    source: 'startup-investment-analysis notebook cell 84',
  },
  siSeed: {
    value: 13376,
    unit: 'count',
    label: 'seed-funded companies',
    source: 'startup-investment-analysis notebook cell 84',
  },
  siWeightGrowth: {
    value: 0.35,
    unit: 'weight',
    label: '2014 growth',
    source: 'startup-investment-analysis notebook cell 119',
  },
  siWeightCagr: {
    value: 0.3,
    unit: 'weight',
    label: 'CAGR',
    source: 'startup-investment-analysis notebook cell 119',
  },
  siWeightFunding: {
    value: 0.2,
    unit: 'weight',
    label: 'total funding',
    source: 'startup-investment-analysis notebook cell 119',
  },
  siWeightCompanies: {
    value: 0.15,
    unit: 'weight',
    label: 'company count',
    source: 'startup-investment-analysis notebook cell 119',
  },
  siWeightZeroed: {
    value: 65,
    unit: 'percent',
    label: 'of the weight silently scored zero when a segment is missing from growth_df',
    source: 'startup-investment-analysis notebook cell 119 — growth 0.35 + CAGR 0.30',
  },

  // ── nucarbon ──────────────────────────────────────────────────────────────
  ncStudents: {
    value: 20000,
    unit: 'count',
    label: 'studentPopulation',
    source: 'nucarbon/lib/data.ts:1-8 — no cited source in the repo',
  },
  ncFaculty: {
    value: 4000,
    unit: 'count',
    label: 'facultyStaff',
    source: 'nucarbon/lib/data.ts:1-8 — no cited source in the repo',
  },
  ncQueriesPerDay: {
    value: 8,
    unit: 'count',
    label: 'avgQueriesPerPersonPerDay',
    source: 'nucarbon/lib/data.ts:1-8 — no cited source in the repo',
  },
  ncEnergyPerQuery: {
    value: 0.003,
    unit: 'kwh',
    label: 'energyPerQueryKwh',
    source: 'nucarbon/lib/data.ts:1-8; Samsi et al. 2023 range cited in MethodologyBadge.tsx:104-124',
  },
  ncCo2PerKwh: {
    value: 0.386,
    unit: 'kg',
    label: 'co2PerKwhKg',
    source: 'nucarbon/lib/data.ts:1-8; EPA eGRID 2023 NEWE subregion, MethodologyBadge.tsx:104-124',
  },
  ncConstants: {
    value: 6,
    unit: 'count',
    label: 'constants every figure derives from',
    source: 'nucarbon/lib/data.ts:1-8',
  },
  ncTools: {
    value: 8,
    unit: 'count',
    label: 'tools with assumed adoption rates',
    source: 'nucarbon/lib/data.ts:21-86',
  },
  ncSelfReportedError: {
    value: 40,
    unit: 'percent',
    label: 'error the app reports on its own output',
    source: 'nucarbon/app/executive/page.tsx:457',
  },
} as const satisfies Record<string, Fact>

export type FactKey = keyof typeof facts
export { facts }

/** Read a fact. Figures and copy must go through this, never a literal. */
export function fact(key: FactKey): Fact {
  return facts[key]
}

/** Read just the number, for use in figure geometry. */
export function value(key: FactKey): number {
  return facts[key].value
}
