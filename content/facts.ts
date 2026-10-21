/**
 * Every sourced number on this site lives here, and every entry carries the
 * file it was verified against; everything else is computed on the page from
 * the model it describes.
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

import { rules } from './rules'
import { synthetic } from './synthetic'

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

const VS_SNAP = 'vol-surface-live paper/data/snapshot-2026-10-20T0154Z.json'
const VS_CMP = 'vol-surface-live paper/data/model-comparison-2026-10-19.json'
const VS_VRP = 'vol-surface-live paper/data/vrp-2026-10-20T0223Z.json'

const facts = {
  // Synthetic parameters for the hero figure live in ./synthetic, so the
  // browser bundle carries seven numbers rather than this whole table.
  ...synthetic,
  // Rules a client figure runs live; see ./rules.
  ...rules,

  // ── cricstate ──────────────────────────────────────────────────────────────
  // The figure axis. One unit throughout: relative NLL improvement over the
  // level below on the T1/T20 cell, post-calibration (match state over the B0 marginal baseline; identity over match
  // state; the latent on validation).
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
  crT2Nll: {
    value: 0.49036,
    unit: 'nats',
    label: 'B3 test NLL, T2/T20',
    source: 'cricstate/docs/LEADERBOARD.md:76-83 — B3_gbm 0.49036 [0.47547, 0.50519]; reproduced by scripts/cricket_replay.py',
  },
  crT2Base: {
    value: 0.69275,
    unit: 'nats',
    label: 'marginal-baseline test NLL, T2/T20',
    source: 'cricstate/docs/LEADERBOARD.md:76-83 — B0_marginal 0.69275',
  },
  crT2TestMatches: {
    value: 1489,
    unit: 'count',
    label: 'held-out T20 matches in the T2 test cell',
    source: 'cricstate/docs/LEADERBOARD.md:76 — test n = 1,489 matches',
  },
  crFeatures: {
    value: 27,
    unit: 'count',
    label: 'whitelisted match-state features',
    source: 'cricstate/src/evalkit/features.py — FEATURE_COLUMNS; artifacts/t2/t20/B3_gbm/fingerprint.json n_features',
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
    value: 17,
    unit: 'count',
    label: 'SQL migrations',
    source: 'closebooks-app @ce76fb20 — ls supabase/migrations | wc -l',
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
  siMassSegments: {
    value: 48,
    unit: 'count',
    label: 'mass segments the model ranks',
    source: 'startup-investment-analysis notebook cell 119 — mass_market_segments excluding unknown; content/data/startup-ranking.json',
  },
  siGrowingSegments: {
    value: 10,
    unit: 'count',
    label: 'ranked segments whose 2014 funding rose, so present in growth_df',
    source: 'startup-investment-analysis notebook cell 101 — growth_2014 > 0; scripts/startup_ranking.py',
  },
  siZeroedSegments: {
    value: 38,
    unit: 'count',
    label: 'ranked segments scored zero on growth and CAGR',
    source: 'startup-investment-analysis notebook cells 101 and 119 — absent from growth_df; scripts/startup_ranking.py',
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
    // eGRID2021's US average, 852.3 lb CO2e/MWh = 0.3866 kg/kWh (the owner, 2026-10-06). The app had labelled it eGRID 2023
    // NEWE, whose rate is 543 lb/MWh (0.246 kg/kWh); its label is corrected to the real source too.
    source: 'nucarbon/lib/data.ts:1-8; EPA eGRID2021 US average, 852.3 lb CO2e/MWh, MethodologyBadge.tsx:104-124',
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

  // ── BCS: the OFZ curve, July–August 2023 ──────────────────────────────────
  // Public market data, written by scripts/ofz_curve.mjs from the Moscow
  // Exchange and cross-checked against the Bank of Russia.
  bcTradingDays: {
    value: 44,
    unit: 'count',
    label: 'trading days drawn',
    source: 'content/data/ofz-curve.json → days (every date in cbr.ru/hd_base/zcyc_params, 03.07.2023–31.08.2023)',
  },
  bcKeyRateJune: {
    value: 7.5,
    unit: 'percent',
    label: 'key rate into July',
    source: 'cbr.ru/hd_base/KeyRate — 7.50 in effect from 01.06.2023',
  },
  bcKeyRateJuly: {
    value: 8.5,
    unit: 'percent',
    label: 'key rate from 24 July',
    source: 'cbr.ru/hd_base/KeyRate — 8.50 from 24.07.2023; Bank of Russia press release, 21 July 2023',
  },
  bcKeyRateAug: {
    value: 12,
    unit: 'percent',
    label: 'key rate from 15 August',
    source: 'cbr.ru/hd_base/KeyRate — 12.00 from 15.08.2023; Bank of Russia press release, extraordinary meeting of 15 August 2023',
  },

  // ── vol-surface: the live BTC and ETH surface ─────────────────────────────
  // Every value is read from files archived in the public vol-surface-live repository (paper/data): one live bundle as
  // the worker on Fly.io served it, SSVI against eSSVI on every snapshot of 19 October 2026 (`python -m
  // volsurf.evaluate`), and implied against realized volatility from Deribit's public API.

  // One live snapshot.
  vsBtcAtm30: { value: 36.51, unit: 'percent', label: 'BTC 30-day ATM implied vol, eSSVI', source: `${VS_SNAP}: BTC.essvi.tenors.30d.atm` },
  vsBtcRr30: { value: -4.06, unit: 'none', label: 'BTC 30-day 25-delta risk reversal, eSSVI, vol points', source: `${VS_SNAP}: BTC.essvi.tenors.30d.rr25` },
  vsBtcRr30Ssvi: { value: -3.66, unit: 'none', label: 'BTC 30-day 25-delta risk reversal, SSVI, vol points', source: `${VS_SNAP}: BTC.tenors.30d.rr25` },
  vsEthAtm30: { value: 49.59, unit: 'percent', label: 'ETH 30-day ATM implied vol, eSSVI', source: `${VS_SNAP}: ETH.essvi.tenors.30d.atm` },
  vsBtcRaw: { value: 884, unit: 'count', label: 'BTC option quotes in the snapshot', source: `${VS_SNAP}: BTC.cleaning.n_raw` },
  vsBtcKept: { value: 328, unit: 'count', label: 'BTC quotes kept for the fit', source: `${VS_SNAP}: BTC.cleaning.n_kept` },
  vsBtcExpiries: { value: 9, unit: 'count', label: 'BTC expiries fitted', source: `${VS_SNAP}: BTC.expiries.length` },
  vsBtcRhoShort: { value: -0.24, unit: 'none', label: 'Most negative eSSVI rho across BTC expiries', source: `${VS_SNAP}: min BTC.essvi.rho (-0.2396)` },
  vsBtcRhoLong: { value: -0.14, unit: 'none', label: 'Least negative eSSVI rho across BTC expiries', source: `${VS_SNAP}: max BTC.essvi.rho (-0.1449)` },
  vsBtcEssviWorst: { value: 2.7, unit: 'none', label: 'Worst eSSVI expiry RMSE, vol points (25DEC26)', source: `${VS_SNAP}: max BTC.essvi.expiries[].rmse_vol_pts (2.7032)` },
  vsBtcMinG: { value: 0.259, unit: 'none', label: 'Lowest Durrleman g(k) on the BTC eSSVI surface', source: `${VS_SNAP}: BTC.essvi.min_g` },
  vsBtcIvGapMedian: { value: 0.0017, unit: 'none', label: 'Median |our IV − Deribit IV|, vol points, 20 comparisons', source: `${VS_SNAP}: BTC.iv_check.median_gap_pts` },
  vsBtcArbMid: { value: 9, unit: 'count', label: 'BTC raw-quote butterfly failures at mid', source: `${VS_SNAP}: BTC.arbitrage.counts.mid.butterfly` },
  vsBtcArbTrade: { value: 0, unit: 'count', label: 'BTC raw-quote failures tradeable at quoted prices', source: `${VS_SNAP}: sum BTC.arbitrage.counts.tradeable` },
  // A day of snapshots.
  vsCmpBtcSnapshots: { value: 65, unit: 'count', label: 'BTC snapshots compared, 17:22 to 24:00 UTC, 19 October 2026', source: `${VS_CMP}: [BTC].snapshots` },
  vsCmpBtcHoldoutEssvi: { value: 1.2, unit: 'none', label: 'Median held-out RMSE, eSSVI, BTC, vol points', source: `${VS_CMP}: [BTC].median.essvi_holdout (1.2038)` },
  vsCmpBtcHoldoutSsvi: { value: 1.51, unit: 'none', label: 'Median held-out RMSE, SSVI, BTC, vol points', source: `${VS_CMP}: [BTC].median.ssvi_holdout (1.5069)` },
  vsCmpEthHoldoutEssvi: { value: 1.42, unit: 'none', label: 'Median held-out RMSE, eSSVI, ETH, vol points', source: `${VS_CMP}: [ETH].median.essvi_holdout (1.4247)` },
  vsCmpEthHoldoutSsvi: { value: 1.82, unit: 'none', label: 'Median held-out RMSE, SSVI, ETH, vol points', source: `${VS_CMP}: [ETH].median.ssvi_holdout (1.8213)` },
  vsCmpBtcInsideEssvi: { value: 68, unit: 'percent', label: 'Median share of BTC quotes with the eSSVI fit inside bid/ask', source: `${VS_CMP}: [BTC].median.essvi_inside_median (0.6842)` },
  vsCmpBtcInsideSsvi: { value: 40, unit: 'percent', label: 'Median share of BTC quotes with the SSVI fit inside bid/ask', source: `${VS_CMP}: [BTC].median.ssvi_inside_median (0.4043)` },
  vsCmpEthRmseEssvi: { value: 1.53, unit: 'none', label: 'Median in-sample per-expiry RMSE, eSSVI, ETH', source: `${VS_CMP}: [ETH].median.essvi_rmse_median (1.5338)` },
  vsCmpEthRmseSsvi: { value: 1.39, unit: 'none', label: 'Median in-sample per-expiry RMSE, SSVI, ETH', source: `${VS_CMP}: [ETH].median.ssvi_rmse_median (1.3912)` },
  vsCmpMinG: { value: 0.2556, unit: 'none', label: 'Lowest eSSVI g(k) over all 129 snapshots', source: `${VS_CMP}: min of [*].median.min_essvi_min_g` },
  // Implied against realized (generated 02:22 UTC, 20 October 2026).
  vsVrpBtcDvol: { value: 37.3, unit: 'none', label: 'BTC DVOL at 00:00 UTC, 20 October 2026', source: `${VS_VRP}: currencies.BTC.latest.dvol (37.33)` },
  vsVrpBtcRealized: { value: 24.4, unit: 'none', label: 'BTC realized vol over the previous 30 days', source: `${VS_VRP}: currencies.BTC.latest.realized_30d (24.431)` },
  vsVrpBtcDays: { value: 335, unit: 'count', label: 'Days with a forward gap, 21 Oct 2025 to 20 Sep 2026', source: `${VS_VRP}: currencies.BTC.forward.days` },
  vsVrpBtcShare: { value: 89, unit: 'percent', label: 'Share of days DVOL exceeded the following 30 days realized vol, BTC', source: `${VS_VRP}: currencies.BTC.forward.share_positive (0.8925)` },
  vsVrpBtcMedian: { value: 11.9, unit: 'none', label: 'Median forward gap, BTC, vol points', source: `${VS_VRP}: currencies.BTC.forward.median_gap (11.889)` },
  vsVrpEthShare: { value: 90, unit: 'percent', label: 'Share of days DVOL exceeded the following 30 days realized vol, ETH', source: `${VS_VRP}: currencies.ETH.forward.share_positive (0.8985)` },
  vsVrpEthMedian: { value: 17.7, unit: 'none', label: 'Median forward gap, ETH, vol points', source: `${VS_VRP}: currencies.ETH.forward.median_gap (17.688)` },
  // Bitcoin against ether, eSSVI, same snapshot as above.
  vsEthRr30: { value: -3.46, unit: 'none', label: 'ETH 30-day 25-delta risk reversal, eSSVI', source: `${VS_SNAP}: ETH.essvi.tenors.30d.rr25` },
  vsEthBf30: { value: 1.81, unit: 'none', label: 'ETH 30-day 25-delta butterfly, eSSVI', source: `${VS_SNAP}: ETH.essvi.tenors.30d.bf25 (1.805)` },
  vsBtcBf30: { value: 1.05, unit: 'none', label: 'BTC 30-day 25-delta butterfly, eSSVI', source: `${VS_SNAP}: BTC.essvi.tenors.30d.bf25 (1.0475)` },
  // Local volatility, eSSVI, same snapshot.
  vsBtcLvLo: { value: 30.3, unit: 'percent', label: 'Lowest BTC local vol on the grid', source: `${VS_SNAP}: min BTC.essvi.local_vol.vol (30.28)` },
  vsBtcLvHi: { value: 79.1, unit: 'percent', label: 'Highest BTC local vol on the grid', source: `${VS_SNAP}: max BTC.essvi.local_vol.vol (79.064)` },
  vsBtcLvBlank: { value: 434, unit: 'count', label: 'Blank BTC local vol cells (beyond 3 ATM standard deviations)', source: `${VS_SNAP}: null cells in BTC.essvi.local_vol.vol` },
  vsLvCells: { value: 792, unit: 'count', label: 'Local vol grid cells (33 strikes by 24 maturities)', source: `${VS_SNAP}: len(k) * len(T)` },
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
