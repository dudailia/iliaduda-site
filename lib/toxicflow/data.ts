import bundleJson from '@/content/data/toxic-flow/toxic-flow.json'
import replayJson from '@/content/data/toxic-flow/replay_window.json'
import sourceJson from '@/content/data/toxic-flow/source.json'
import type { PreregTag } from './prereg'

/**
 * The toxic-flow study, as its own repository publishes it for this page (site/toxic-flow.json and
 * site/replay_window.json, copied by scripts/toxic-flow-data.mjs, which records the commit in source.json). Every
 * number /toxic-flow shows is read from these three files; this module types them and formats what it reads.
 */

export type Ci = readonly [number | null, number | null]

export interface Comparison {
  readonly a: string
  readonly b: string
  readonly cell: string
  readonly label: string
  readonly source: string
  readonly n_days: number
  readonly days_dropped: readonly string[]
  readonly mean_bp: number | null
  readonly bootstrap_ci_bp: Ci
  readonly t_ci_bp: Ci
  readonly days_positive: number
  readonly per_day_bp: Readonly<Record<string, number | null>>
  readonly p?: number
}

export interface Stat {
  readonly ci: readonly [number, number]
  readonly days: number
  readonly days_above_0: number
  readonly mean: number
}

export interface SignalSplit {
  readonly days: readonly string[]
  readonly table: Readonly<Record<string, { readonly m: Stat; readonly u: Stat }>>
  readonly hawkes_minus_ewma_u: Readonly<Record<string, Stat>>
}

interface StrategyDay {
  readonly bef_bp: number
  readonly fills: number
  readonly markout_1s_bp: number
  readonly markout_60s_bp: number
  readonly toxic_share: number
  readonly pulled_runs_per_hour?: number
}

export interface Bundle {
  readonly title: string
  readonly note: string
  readonly units: { readonly bef: string; readonly bp: string }
  readonly primary_cell: string
  readonly cells: readonly string[]
  readonly splits: { readonly train: readonly string[]; readonly val: readonly string[]; readonly test: readonly string[] }
  readonly runs: Readonly<Record<string, { readonly hash: string; readonly source: string }>>
  readonly design_history: readonly { readonly date: string | null; readonly commit: string | null; readonly event: string }[]
  readonly preregistered_conclusions: {
    readonly source: string
    readonly rows: readonly { readonly key: string; readonly outcome: string; readonly statement: string }[]
  }
  readonly hawkes_fit: {
    readonly branching_ratio: number
    readonly memory_ms: number
    readonly n_events: number
    readonly params: Readonly<Record<string, number>>
    readonly se: Readonly<Record<string, number>>
    readonly source: string
  }
  readonly mde: {
    readonly c2_threshold_bp: number
    readonly mde_bp: number
    readonly n_test: number
    readonly s_bp: number
    readonly s_train_bp: number
    readonly s_val_bp: number
  }
  readonly training: {
    readonly days: readonly string[]
    readonly comparisons: readonly Comparison[]
    readonly grids: {
      readonly B0_B1_mean_bef_bp: { readonly B0: Readonly<Record<string, number>>; readonly B1: Readonly<Record<string, number>>; readonly source: string }
      readonly B1_minus_B0: Readonly<Record<string, Comparison | string>>
      readonly glft_v1_mean_bef_bp: { readonly B1: Readonly<Record<string, number>>; readonly source: string }
    }
    readonly strategies: Readonly<Record<string, Readonly<Record<string, { readonly mean: StrategyDay }>>>>
  }
  readonly validation: {
    readonly days: readonly string[]
    readonly comparisons: readonly Comparison[]
    readonly c3_mean_bef_bp: { readonly risk_averse: { readonly high: number; readonly zero: number }; readonly source: string }
    readonly strategies: Readonly<Record<string, Readonly<Record<string, { readonly mean: StrategyDay; readonly source: string }>>>>
  }
  readonly matched_p: { readonly rows: readonly (Comparison & { readonly p: number })[] }
  readonly fill_hold: {
    readonly hold_s: number
    readonly pull_share: { readonly train: { readonly B3: number; readonly F: number }; readonly val: { readonly B3: number; readonly F: number } }
  }
  readonly signal_information: { readonly note: string; readonly source: string; readonly splits: { readonly train: SignalSplit; readonly val: SignalSplit } }
  readonly glft: {
    readonly by_gamma: readonly { readonly gamma: number; readonly best_mean_bef_bp: number; readonly median_fills: number }[]
    readonly chosen_gamma: number
    readonly chosen_mean_bef_bp: number
    readonly chosen_mean_fills: number
    readonly mid_distance_corr: number
    readonly mid_vs_distance: readonly { readonly day: string; readonly median_bid_dist_ticks: number; readonly mid: number }[]
    readonly touch_b1_mean_fills: number
  }
  readonly test: TestBlock
}

/** The test run's keys: all null until the pre-registered run fills them. */
export interface TestBlock {
  readonly note: string
  readonly keys: Readonly<Record<string, number | string | boolean | null>>
  readonly h1_cell_means_bp: Readonly<Record<string, number | null>>
  readonly h1_per_day_bp: Readonly<Record<string, number | null>>
  readonly no_print_share: unknown
  readonly summary_source: string | null
}

export interface Replay {
  readonly day: string
  readonly rule: string
  readonly note: string
  readonly cell: string
  readonly step_ms: number
  readonly book_levels: number
  readonly window_utc: readonly [string, string]
  readonly book: readonly { readonly t_ms: number; readonly bids: readonly (readonly number[])[]; readonly asks: readonly (readonly number[])[] }[]
  readonly trades: readonly { readonly t_ms: number; readonly price: number; readonly qty: number; readonly side: string }[]
  readonly signals: {
    readonly t_ms: readonly number[]
    readonly hawkes_lambda_b: readonly number[]
    readonly hawkes_lambda_s: readonly number[]
  }
  readonly strategies: Readonly<
    Record<
      string,
      {
        readonly day_result: { readonly break_even_fee_bps: number; readonly fills: number; readonly reproduces: string }
        readonly params: Readonly<Record<string, string | number>>
        readonly quotes: readonly { readonly t_ms: number; readonly bid: number | null; readonly ask: number | null; readonly position: number }[]
        readonly fills: readonly { readonly exch_t_ms: number; readonly price: number; readonly qty: number; readonly side: string }[]
        readonly pulls: readonly { readonly start_ms: number; readonly end_ms: number; readonly side: string }[]
      }
    >
  >
}

export const bundle = bundleJson as unknown as Bundle
export const replay = replayJson as unknown as Replay
export const source = sourceJson as { readonly repo: string; readonly commit: string; readonly committed_at: string; readonly prereg_tag: PreregTag | null }

export const REPO = source.repo
/** A file of the toxic-flow repository at the commit the data was copied from. */
export const at = (path: string) => `${REPO}/blob/${source.commit}/${path}`
export const commitUrl = (sha: string) => `${REPO}/commit/${sha}`
export { TAG } from './prereg'

// ── Formatting ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The study's numbers are small differences in basis points; the site sets a minus as U+2212, as its other papers do.

const MINUS = '−'
/** A number to `d` decimals, with a true minus sign; `sign` adds a plus to a positive one. */
export function num(x: number, d: number, sign = false): string {
  const s = Math.abs(x).toFixed(d)
  if (Number(s) === 0) return s
  return x < 0 ? `${MINUS}${s}` : sign ? `+${s}` : s
}
/** A difference in basis points: four decimals, signed. */
export const bp = (x: number | null, d = 4) => (x == null ? 'n/a' : num(x, d, true))
/** An interval, [low, high]. */
export const ci = (c: Ci, d = 4) => `[${c[0] == null ? 'n/a' : num(c[0], d)}, ${c[1] == null ? 'n/a' : num(c[1], d)}]`
export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`
export const int = (x: number) => Math.round(x).toLocaleString('en-US')
/** Whether an interval holds 0. */
export const holdsZero = (c: Ci) => c[0] != null && c[1] != null && c[0] <= 0 && c[1] >= 0

/** "2024-06-01" as "1 June 2024". */
export function day(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
export const month = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

// ── Names ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A queue model and a latency, as the grid names them ("risk_averse/high"). */
export const QUEUES = ['risk_averse', 'power3', 'power2', 'log'] as const
export const LATENCIES = ['low', 'high'] as const
export const QUEUE_NAME: Record<string, string> = { risk_averse: 'risk-averse', power3: 'power, n = 3', power2: 'power, n = 2', log: 'log' }
export const cellName = (cell: string) => {
  const [q, l] = cell.split('/') as [string, string]
  return `${QUEUE_NAME[q] ?? q}, ${l} latency`
}

/** One validation comparison, by its two sides and (where two share them) its label. */
export function comparison(a: string, b: string, label?: string): Comparison {
  const c = bundle.validation.comparisons.find((x) => x.a === a && x.b === b && (label === undefined || x.label.includes(label)))
  if (!c) throw new Error(`no validation comparison ${a} − ${b}${label ? ` (${label})` : ''} in the bundle`)
  return c
}

/** Whether the test run has filled its keys. Until then the page shows only what was committed before it. */
export function testRun(t: TestBlock = bundle.test): boolean {
  return t.keys.h1_statement != null
}
