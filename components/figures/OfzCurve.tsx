import { fact, value } from '@/content/facts'
import curve from '@/content/data/ofz-curve.json'
import { zcy } from '@/lib/gcurve'
import { OfzLive, type Day, type Mark } from './ofz/Live'

/**
 * The figure on the BCS entry: the OFZ zero-coupon curve on every trading day
 * of July and August 2023, the two months I wrote daily briefings on
 * government bond movements.
 *
 * Public data only. content/data/ofz-curve.json is written by
 * scripts/ofz_curve.mjs from the Moscow Exchange and cross-checked against the
 * Bank of Russia; tests/gcurve.test.ts reproduces every published yield from
 * the parameters drawn here. It opens on 15 August, the day of the
 * extraordinary rate decision, because that is the session the figure is for.
 */

const days: Day[] = curve.days.map((d) => ({
  date: d.date,
  params: d.params,
  bonds: d.bonds as [number, number][],
}))

const at = (date: string) => days.findIndex((d) => d.date === date)
const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const long = (iso: string) => fmt.format(new Date(`${iso}T00:00:00Z`))
const short = (iso: string) => long(iso).replace(/(\d+) (\w{3})\w*/, '$1 $2')
const y3m = (i: number) => zcy(days[i]!.params, 0.25)
const y10 = (i: number) => zcy(days[i]!.params, 10)
const pc = (y: number) => `${y.toFixed(2)}%`
const bps = (x: number) => `${Math.round(x * 100)} bp`

// The two decisions: announced 21 July (in effect from the 24th), and 15
// August, in effect the same day.
const JULY = at('2023-07-21')
const AUG = at('2023-08-15')
const FIRST = 0
const LAST = days.length - 1
const hikeJuly = value('bcKeyRateJuly') - value('bcKeyRateJune')
const hikeAug = value('bcKeyRateAug') - value('bcKeyRateJuly')

const marks: Mark[] = [
  { index: FIRST, label: short(days[FIRST]!.date) },
  { index: JULY, label: short(days[JULY]!.date), sub: `+${bps(hikeJuly)}` },
  { index: AUG, label: short(days[AUG]!.date), sub: `+${bps(hikeAug)}` },
  { index: LAST, label: short(days[LAST]!.date) },
]

const description =
  `The OFZ zero-coupon yield curve on each of ${fact('bcTradingDays').value} trading days, ${long(days[FIRST]!.date)} to ${long(days[LAST]!.date)} 2023. ` +
  `On ${long(days[FIRST]!.date)} it sloped steeply upward: 3-month ${pc(y3m(FIRST))}, 10-year ${pc(y10(FIRST))}, with the key rate at ${fact('bcKeyRateJune').value}%. ` +
  `The Bank of Russia raised the key rate to ${fact('bcKeyRateJuly').value}% on ${long(days[JULY]!.date)}, and to ${fact('bcKeyRateAug').value}% at an extraordinary meeting on ${long(days[AUG]!.date)}. ` +
  `That session the 3-month yield went from ${pc(y3m(AUG - 1))} to ${pc(y3m(AUG))} while the 10-year stayed at ${pc(y10(AUG))}, and the slope from 10-year to 3-month fell from ${bps(y10(AUG - 1) - y3m(AUG - 1))} to ${bps(y10(AUG) - y3m(AUG))}. ` +
  `On ${long(days[LAST]!.date)} the 3-month was ${pc(y3m(LAST))} and the 10-year ${pc(y10(LAST))}.`

const TERMS = [0.25, 1, 5, 10] as const

const table = (
  <table>
    <caption>OFZ zero-coupon yields by trading day, July–August 2023, percent</caption>
    <thead>
      <tr>
        <th scope="col">Trading day</th>
        {TERMS.map((t) => (
          <th key={t} scope="col">{t < 1 ? `${t * 12}-month` : `${t}-year`}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {days.map((d) => (
        <tr key={d.date}>
          <th scope="row">{long(d.date)}</th>
          {TERMS.map((t) => (
            <td key={t}>{zcy(d.params, t).toFixed(2)}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
)

const caption = (
  <>
    The Bank of Russia raised the key rate by {bps(hikeJuly)} on {long(days[JULY]!.date)}, then by{' '}
    {bps(hikeAug)} at an extraordinary meeting on {long(days[AUG]!.date)}. That session the 3-month
    yield rose {bps(y3m(AUG) - y3m(AUG - 1))} and the 10-year did not move: a curve that had sloped
    up by {bps(y10(AUG - 1) - y3m(AUG - 1))} was left at {bps(y10(AUG) - y3m(AUG))}. Curves are the
    exchange&rsquo;s own daily fit, redrawn from its published parameters; dots are the OFZ issues it
    was fitted to, at their duration.
  </>
)

export function OfzCurve({ inline = false }: { inline?: boolean }) {
  return (
    <OfzLive
      days={days}
      keyRate={curve.keyRate}
      marks={marks}
      start={AUG}
      description={description}
      frame={{
        id: 'fig-ofz-curve',
        number: 'Fig. 1',
        title: 'The OFZ curve through two rate decisions, summer 2023',
        subtitle: `zero-coupon yield · Moscow Exchange G-curve · every trading day, ${short(days[FIRST]!.date)} – ${short(days[LAST]!.date)} 2023 · public data`,
        caption,
        table,
        inline,
      }}
    />
  )
}
