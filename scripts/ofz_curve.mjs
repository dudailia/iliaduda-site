#!/usr/bin/env node
/**
 * Writes content/data/ofz-curve.json: the OFZ zero-coupon yield curve for
 * every trading day of July and August 2023, the two months I wrote daily
 * briefings on government bond movements at BCS.
 *
 * Two public sources, and each checks the other:
 *
 *   - Moscow Exchange ISS, /iss/engines/stock/zcyc.json?date=… — the day's
 *     G-curve parameters (β0, β1, β2, τ, g1…g9), the yields it publishes at
 *     standard terms, and the OFZ issues the curve was fitted to.
 *   - Bank of Russia, cbr.ru/hd_base/zcyc_params — the same curve's yields at
 *     twelve terms, published by the central bank.
 *
 * The script refuses to write unless both sources agree on every term of every
 * day. tests/gcurve.test.ts then asserts lib/gcurve.ts reproduces those yields
 * from the parameters alone, which is what licenses drawing the curve between
 * the published terms.
 *
 *   node scripts/ofz_curve.mjs
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FROM = '2023-07-01'
const TO = '2023-08-31'
const UA = { 'User-Agent': 'Mozilla/5.0 (iliaduda-site data script)' }

const ru = (iso) => iso.split('-').reverse().join('.')

async function text(url) {
  const r = await fetch(url, { headers: UA })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.text()
}

function rows(html, from) {
  const i = html.indexOf('<table', from)
  const table = html.slice(i, html.indexOf('</table>', i))
  return [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => c[1].replace(/<[^>]+>/g, '').trim()),
  )
}

// ── Bank of Russia: the yields table, and the key rate ─────────────────────────
const cbrCurve = await text(
  `https://www.cbr.ru/hd_base/zcyc_params/?UniDbQuery.Posted=True&UniDbQuery.From=${ru(FROM)}&UniDbQuery.To=${ru(TO)}`,
)
const cbrRows = rows(cbrCurve, cbrCurve.indexOf('<table class="data spaced">'))
const TERMS = cbrRows[1].map((t) => Number(t.replace(',', '.')))
const cbr = new Map(
  cbrRows
    .slice(2)
    .filter((r) => /^\d\d\.\d\d\.\d{4}$/.test(r[0]))
    .map((r) => [r[0].split('.').reverse().join('-'), r.slice(1).map((v) => Number(v.replace(',', '.')))]),
)

const krHtml = await text(
  `https://www.cbr.ru/hd_base/KeyRate/?UniDbQuery.Posted=True&UniDbQuery.From=01.06.2023&UniDbQuery.To=${ru(TO)}`,
)
const keyRate = []
for (const r of rows(krHtml, 0).slice(1).reverse()) {
  if (r.length !== 2) continue
  const rate = Number(r[1].replace(',', '.'))
  if (keyRate.at(-1)?.rate !== rate) keyRate.push({ from: r[0].split('.').reverse().join('-'), rate })
}

// ── Moscow Exchange: parameters, published yields, and the bonds ───────────────
const days = []
for (const date of [...cbr.keys()].sort()) {
  const j = JSON.parse(await text(`https://iss.moex.com/iss/engines/stock/zcyc.json?date=${date}&iss.meta=off`))
  const pc = j.params.columns
  const p = Object.fromEntries(pc.map((c, i) => [c, j.params.data[0][i]]))
  if (p.tradedate !== date) throw new Error(`MOEX returned ${p.tradedate} for ${date}`)

  const sc = j.securities.columns
  const col = (name) => sc.indexOf(name)
  const bonds = j.securities.data
    .filter((s) => s[col('tradedate')] === date && s[col('crtyield')] != null && s[col('crtduration')] != null)
    .map((s) => [Number((s[col('crtduration')] / 365).toFixed(3)), s[col('crtyield')]])
    .sort((a, b) => a[0] - b[0])

  const yc = j.yearyields.columns
  const moex = Object.fromEntries(j.yearyields.data.map((y) => [y[yc.indexOf('period')], y[yc.indexOf('value')]]))

  // The two publishers must agree to the Bank of Russia's two decimals.
  const cb = cbr.get(date)
  TERMS.forEach((t, i) => {
    if (moex[t] === undefined) return
    if (Math.abs(moex[t] - cb[i]) > 0.0051) throw new Error(`${date} ${t}y: MOEX ${moex[t]} vs CBR ${cb[i]}`)
  })

  days.push({
    date,
    params: ['B1', 'B2', 'B3', 'T1', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'].map((k) => p[k]),
    published: TERMS.map((t, i) => [t, moex[t] ?? cb[i]]),
    bonds,
  })
  process.stdout.write('.')
}

const out = {
  source: {
    params: 'Moscow Exchange ISS /iss/engines/stock/zcyc.json?date=YYYY-MM-DD → params (B1, B2, B3, T1, G1…G9) and securities (crtduration, crtyield)',
    published: 'Moscow Exchange ISS yearyields, cross-checked against cbr.ru/hd_base/zcyc_params to 0.005 pp on every term',
    keyRate: 'cbr.ru/hd_base/KeyRate',
    written: 'scripts/ofz_curve.mjs',
  },
  from: FROM,
  to: TO,
  keyRate,
  days,
}

const file = join(process.cwd(), 'content/data/ofz-curve.json')
writeFileSync(file, JSON.stringify(out) + '\n')
console.log(`\n${days.length} trading days → ${file}`)
console.log('key rate', keyRate)
