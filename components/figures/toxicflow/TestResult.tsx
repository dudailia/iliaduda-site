import { bp, ci, num, type TestBlock } from '@/lib/toxicflow/data'

/** What the test run filled in, once it has: the sentence it reached and the numbers under it. */
export function TestResult({ t }: { t: TestBlock }) {
  const k = t.keys
  const n = (key: string) => (typeof k[key] === 'number' ? (k[key] as number) : null)
  const rows: [string, string][] = [
    ['H1, B3 − B2b', `${bp(n('h1_mean_bp'))} bp, bootstrap ${ci([n('h1_ci_low_bp'), n('h1_ci_high_bp')])}, t ${ci([n('h1_t_low_bp'), n('h1_t_high_bp')])}`],
    ['days above 0', `${k.h1_days_positive ?? 'n/a'} of ${k.h1_n_days ?? 'n/a'}`],
    ['same sign in every cell', k.h1_cells_same_sign == null ? 'n/a' : k.h1_cells_same_sign ? 'yes' : 'no'],
    ['H2, B3 − B2', `${bp(n('h2_mean_bp'))} bp ${ci([n('h2_ci_low_bp'), n('h2_ci_high_bp')])}`],
    ['H3, B3 − B1', `${bp(n('h3_mean_bp'))} bp ${ci([n('h3_ci_low_bp'), n('h3_ci_high_bp')])}`],
    ['H4, B2b − B1', `${bp(n('h4_mean_bp'))} bp ${ci([n('h4_ci_low_bp'), n('h4_ci_high_bp')])}`],
    ['B3 − F', `${bp(n('f_b3_mean_bp'))} bp ${ci([n('f_b3_ci_low_bp'), n('f_b3_ci_high_bp')])}`],
    ['C1 − R1', `${bp(n('c1_r1_mean_bp'))} bp ${ci([n('c1_r1_ci_low_bp'), n('c1_r1_ci_high_bp')])}`],
    ['MDE', `${bp(n('mde_bp'))} bp`],
    ['selectivity, B3 to B2b notional', k.selectivity_ratio == null ? 'n/a' : num(k.selectivity_ratio as number, 2)],
  ]
  return (
    <>
      <p className="text-ink">{String(k.h1_statement)}</p>
      {k.canary_statement ? <p>{String(k.canary_statement)}</p> : null}
      <dl className="text-note mt-5 grid grid-cols-1 gap-y-2 border-t border-rule pt-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
        {rows.map(([a, b]) => (
          <div key={a} className="sm:contents">
            <dt className="text-meta font-mono text-graphite">{a}</dt>
            <dd className="text-meta font-mono tabular text-ink">{b}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

