import { fact, value } from '@/content/facts'
import ranking from '@/content/data/startup-ranking.json'
import { RankingLive, type Row, type Variant } from './ranking/Live'

/**
 * Fig. 1 of the startup-investments paper: one composite score, three
 * treatments of the same data, three different top picks.
 *
 * The rows come from content/data/startup-ranking.json, written by
 * scripts/startup_ranking.py, which executes the capstone notebook's own cells
 * and asserts that variant A reproduces the notebook's scores exactly. Nothing
 * here recomputes a score; the figure only reorders what the script wrote.
 */

type Segment = (typeof ranking.segments)[number]

const w = (k: Parameters<typeof value>[0]) => value(k).toFixed(2)

function spearman(k1: Variant, k2: Variant): number {
  const s = ranking.segments
  const n = s.length
  const d2 = s.reduce((acc, x: Segment) => acc + (x[k1].rank - x[k2].rank) ** 2, 0)
  return 1 - (6 * d2) / (n * (n * n - 1))
}

export const VARIANTS = [
  {
    key: 'a',
    label: 'As written',
    note: `Segments missing from the growth table score zero on ${fact('siWeightZeroed').value}% of the weight.`,
  },
  {
    key: 'b',
    label: 'Lookup fixed',
    note: 'Every segment gets its real 2014 change, negative where funding fell, and the notebook’s own CAGR.',
  },
  {
    key: 'c',
    label: 'Both fixed',
    note: 'CAGR measured from each segment’s first funded year, instead of from 2000 with a $0 start read as $1.',
  },
] as const satisfies readonly { key: Variant; label: string; note: string }[]

const TABLE = (

        <table>
          <caption>Rank of each segment under the three treatments</caption>
          <thead>
            <tr>
              <th scope="col">Segment</th>
              {VARIANTS.map((v) => (
                <th key={v.key} scope="col">{v.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...ranking.segments].sort((x: Segment, y: Segment) => x.a.rank - y.a.rank).map((s: Segment) => (
              <tr key={s.name}>
                <th scope="row">{s.name}</th>
                <td>{s.a.rank}</td>
                <td>{s.b.rank}</td>
                <td>{s.c.rank}</td>
              </tr>
            ))}
          </tbody>
        </table>
      
)

const CAPTION = (rhoB: number) => (

        <>
          The weights never change; only the handling of the data does. Fixing the growth lookup
          alone leaves the ranking almost uncorrelated with the capstone&rsquo;s original
          (Spearman ρ = {rhoB.toFixed(2)}), which is the whole argument for treating a
          model&rsquo;s data pipeline as part of the model.
        </>
      
)

export function SegmentRanking() {
  const rows: Row[] = ranking.segments.map((s: Segment) => ({
    name: s.name,
    zeroed: !s.inGrowthTable,
    a: s.a,
    b: s.b,
    c: s.c,
  }))
  const rho = { a: 1, b: spearman('a', 'b'), c: spearman('a', 'c') }
  const top = (k: Variant) => ranking.segments.find((s: Segment) => s[k].rank === 1)!.name
  const top3 = (k: Variant) =>
    [...ranking.segments]
      .sort((x: Segment, y: Segment) => x[k].rank - y[k].rank)
      .slice(0, 3)
      .map((s: Segment) => s.name)
      .join(', ')

  const description =
    `Top segments by composite score under three treatments of the same ${value('siRowsFinal').toLocaleString('en-US')} funding records. ` +
    `As written, the top three are ${top3('a')}. ` +
    `With the growth lookup fixed the top pick becomes ${top('b')}, and the rank correlation with the original falls to ${rho.b.toFixed(2)}. ` +
    `With the CAGR start fixed as well, the top pick is ${top('c')}.`

  return (
    <RankingLive
      rows={rows}
      variants={VARIANTS}
      rho={rho}
      description={description}
      frame={{
        id: 'fig-ranking',
        number: 'Fig. 1',
        vt: 'startup-investments',
        title: 'One model, three treatments of the data, three top picks',
        subtitle: `composite score 0–100 · ${value('siMassSegments')} mass segments · growth ${w('siWeightGrowth')} · CAGR ${w('siWeightCagr')} · funding ${w('siWeightFunding')} · companies ${w('siWeightCompanies')}`,
        caption: CAPTION(rho.b),
        table: TABLE,
      }}
    />
  )
}
