import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Frozen, TagLink } from '../components/figures/toxicflow/Protocol'
import { Conclusions } from '../components/figures/toxicflow/Conclusions'
import { CanaryStory, type Verdict } from '../components/figures/toxicflow/Story'
import { intensity } from '../components/figures/toxicflow/HawkesToy'
import { reached } from '../lib/toxicflow/conclusions'
import { book, height } from '../lib/toxicflow/hero'
import { TestResult } from '../components/figures/toxicflow/TestResult'
import { papers } from '../content/papers'
import { REPO, bundle, ci, commitUrl, num, replay, source, testRun, type TestBlock } from '../lib/toxicflow/data'
import { AFTER_RUN, STATUS, prereg, type PreregTag } from '../lib/toxicflow/prereg'
import { ALLOWED_PREREG, FORBIDDEN, allowPrereg, exempt } from './forbidden'
import { replayData } from '../lib/toxicflow/replay'

/**
 * /toxic-flow shows the toxic-flow study's own numbers and nothing typed by hand: the data is copied byte for byte by
 * scripts/toxic-flow-data.mjs, which records the commit, and the page and its figures only read and format it.
 */

const DATA = join(process.cwd(), 'content/data/toxic-flow')
const SOURCES = ['app/(pages)/toxic-flow', 'components/figures/toxicflow', 'lib/toxicflow'].flatMap((d) =>
  readdirSync(join(process.cwd(), d)).filter((f) => /\.tsx?$/.test(f)).map((f) => join(process.cwd(), d, f)),
)

describe('the toxic-flow data', () => {
  it('is the files the recorded commit holds, unchanged since the copy', () => {
    expect(source.commit).toMatch(/^[0-9a-f]{40}$/)
    const sha = (source as unknown as { sha256: Record<string, string> }).sha256
    for (const f of ['toxic-flow.json', 'replay_window.json']) {
      expect(createHash('sha256').update(readFileSync(join(DATA, f))).digest('hex'), f).toBe(sha[f])
    }
  })

  it('has every test-day value null until the test run', () => {
    expect(Object.values(bundle.test.keys).every((v) => v === null)).toBe(testRun() === false)
    expect(Object.values(bundle.test.h1_cell_means_bp).every((v) => v === null)).toBe(true)
  })

  it('replays each strategy’s committed day, and the minute it shows', () => {
    const d = replayData()
    expect(d.t).toHaveLength(replay.book.length)
    for (const s of d.strategies) {
      expect(s.reproduces).toMatch(/^results\/[0-9a-f]{12}\/metrics\.parquet$/)
      expect(s.bid).toHaveLength(d.t.length)
    }
    // Ticks round-trip to the prices they came from.
    const b0 = replay.book[0]!.bids[0]![0]!
    expect(d.base + d.bids[0]![0]![0] * d.tick).toBeCloseTo(b0, 6)
    // Every quote fits the chart's range in ticks from the mid.
    expect(d.offLo).toBeLessThan(0)
    expect(d.offHi).toBeGreaterThan(0)
  })
})

describe('no number on /toxic-flow is typed by hand', () => {
  // Every number the bundle holds, as the page would print it: a hit in the source means a value was copied, not read.
  const values: number[] = []
  const walk = (o: unknown): void => {
    if (typeof o === 'number') values.push(o)
    else if (Array.isArray(o)) o.forEach(walk)
    else if (o && typeof o === 'object') Object.values(o).forEach(walk)
  }
  walk(bundle)
  const printed = new Set(
    values.flatMap((v) => [3, 4].map((d) => Math.abs(v).toFixed(d))).filter((s) => s.length >= 5 && !/^0\.0+$/.test(s)),
  )
  for (const file of SOURCES) {
    it(`${file.slice(process.cwd().length + 1)} copies none of the study’s numbers`, () => {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ')
      const hits = [...printed].filter((s) => new RegExp(`(?<![\\w.])${s.replace('.', '\\.')}(?![\\w])`).test(code))
      expect(hits).toEqual([])
    })
  }
})

describe('the test section', () => {
  const render = (t: TestBlock) => renderToStaticMarkup(createElement(TestResult, { t }))

  it('is empty-handed while the keys are null: the page shows the conclusion table instead', () => {
    expect(testRun(bundle.test)).toBe(false)
  })

  it('prints the run’s own sentence and numbers once the keys are filled', () => {
    const keys = Object.fromEntries(Object.keys(bundle.test.keys).map((k) => [k, null])) as Record<string, number | string | boolean | null>
    Object.assign(keys, {
      h1_statement: 'No detectable difference between the Hawkes overlay and a decay-weighted trade count.',
      h1_mean_bp: -0.0042,
      h1_ci_low_bp: -0.012,
      h1_ci_high_bp: 0.0031,
      h1_days_positive: 7,
      h1_n_days: 16,
      h1_cells_same_sign: false,
    })
    const t: TestBlock = { ...bundle.test, keys }
    expect(testRun(t)).toBe(true)
    const html = render(t)
    expect(html).toContain('No detectable difference')
    expect(html).toContain(num(-0.0042, 4, true))
    expect(html).toContain(ci([-0.012, 0.0031]))
    expect(html).toContain('7 of 16')
  })
})

describe('"pre-registered", only once the bundle records the tag', () => {
  const html = (tag: PreregTag | null) => renderToStaticMarkup(createElement('div', null, createElement(Frozen, { tag }), createElement(TagLink, { tag })))
  const tag: PreregTag = {
    name: 'prereg-v1',
    object: 'a'.repeat(40),
    commit: 'b'.repeat(40),
    tagged_at: '2026-11-02T09:30:00-05:00',
  }

  it('says drafted while the tag is not recorded: no "pre-registered" in the title, no link to a tag', () => {
    const p = prereg(bundle.title, null)
    expect(p.statusLine).toBe('Pre-registration drafted. Test results pending.')
    expect(p.title).not.toMatch(/pre-?regist/i)
    expect(p.title.length).toBeGreaterThan(0)
    expect(bundle.title.startsWith(p.title)).toBe(true)
    const h = html(null)
    expect(h).toContain('The pre-registration, drafted.')
    expect(h).toContain(`${REPO}/tags`)
    expect(h).toContain('not yet created')
    expect(h).not.toContain('/releases/tag/')
    expect(h).not.toContain('frozen by')
    expect(p.afterRun).toBe('One of these sentences will appear here after the test run fixed in the pre-registration.')
  })

  it('says pre-registered once it is, with the study’s whole title and links to the tag and its commit', () => {
    const p = prereg(bundle.title, tag)
    expect(p.statusLine).toBe('Pre-registered. Test results pending.')
    expect(p.title).toBe(bundle.title)
    const h = html(tag)
    expect(h).toContain(`href="${REPO}/releases/tag/prereg-v1"`)
    expect(h).toContain(`href="${commitUrl(tag.commit)}"`)
    expect(h).toContain(`href="${REPO}/blob/prereg-v1/PREREGISTRATION.md"`)
    expect(h).toContain('2 November 2026')
    expect(h).not.toContain('not yet created')
    expect(p.afterRun).toBe('One of these sentences will appear here after the pre-registered test run.')
  })

  // What the rendered-page gate (tests/e2e/copy.spec.ts) decides for /toxic-flow, for a page holding either line.
  const fails = (text: string, t: PreregTag | null) =>
    FORBIDDEN.some(([r]) => !exempt(r, '/toxic-flow', t) && r.test(allowPrereg(text, '/toxic-flow', t)))
  const noun = 'The pre-registration, drafted. PREREGISTRATION.md fixes the question.'

  it('lets the page body name the pre-registration in both states, and call anything pre-registered only with the tag', () => {
    expect(fails(`${noun} ${AFTER_RUN.drafted}`, null)).toBe(false)
    expect(fails(`${noun} ${AFTER_RUN.registered}`, null)).toBe(true)
    expect(fails('A pre-registered test', null)).toBe(true)
    expect(fails(`${noun} ${AFTER_RUN.registered}`, tag)).toBe(false)
    expect(fails(`${noun} ${AFTER_RUN.drafted}`, tag)).toBe(false)
    // Elsewhere the noun is still banned in either state.
    expect(FORBIDDEN.some(([r]) => !exempt(r, '/about', null) && r.test(allowPrereg(noun, '/about', null)))).toBe(true)
  })

  it('prints the line the bundle’s state calls for', () => {
    const page = readFileSync(join(process.cwd(), 'app/(pages)/toxic-flow/page.tsx'), 'utf8')
    expect(page).toContain('{PROTOCOL.afterRun}')
    expect(page).not.toMatch(/One of these sentences/)
  })

  it('shows the copied bundle’s own state on the card, the page and the copy gates', () => {
    const now = prereg(bundle.title)
    expect(now.statusLine).toBe(source.prereg_tag ? STATUS.registered : STATUS.drafted)
    const card = papers.find((p) => p.slug === 'toxic-flow')!
    expect(card.title).toBe(now.title)
    expect(card.statusLine).toBe(now.statusLine)
    // Second in the Contents, the owner's placement.
    expect(papers.findIndex((p) => p.slug === 'toxic-flow')).toBe(1)
    // The copy ban's exception elsewhere: this state's title and status line, and nothing else.
    expect([...ALLOWED_PREREG.forms]).toEqual([now.title, now.statusLine])
  })
})

describe('the visual layer reads only the bundle', () => {
  it('marks each fill out at 1 s by the study’s own rule: the mid at the last step at or before exchange time + 1 s', () => {
    const d = replayData()
    let checked = 0
    for (const [name, s] of Object.entries(replay.strategies)) {
      const lane = d.strategies.find((x) => x.name === name)!
      for (const f of s.fills) {
        const side = f.side === 'buy' ? 1 : -1
        const at = f.exch_t_ms + 1000
        const last = replay.book[replay.book.length - 1]!
        const got = lane.fills.find((x) => x[0] === f.exch_t_ms && x[2] === side)![3]
        if (at > last.t_ms + replay.step_ms) {
          expect(got).toBeNull()
          continue
        }
        const step = [...replay.book].reverse().find((b) => b.t_ms <= at)!
        const mid = (step.bids[0]![0]! + step.asks[0]![0]!) / 2
        expect(got).toBeCloseTo((1e4 * side * (mid - f.price)) / f.price, 9)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('opens the card whose template the run’s sentence fits, and none before the run', () => {
    const rows = bundle.preregistered_conclusions.rows
    expect(reached(rows, bundle.test.keys)).toEqual({ h1: null, canary: null })
    // Each template, filled with numbers, reaches its own card and no other.
    for (const r of rows) {
      const said = r.statement.replace(/\bX\b/g, '0.0123').replace(/\bL\b/g, '−0.004').replace(/\bU\b/g, '0.028').replace(/\bMDE\b/g, '0.0231')
      expect(reached(rows, { h1_statement: said }).h1, r.key).toBe(r.key)
    }
    expect(reached(rows, { h1_statement: 'A sentence no template has.' }).h1).toBeNull()
  })

  it('shows every card sealed before the run, and opens the reached one with the run’s numbers after it', () => {
    const rows = bundle.preregistered_conclusions.rows
    const before = renderToStaticMarkup(createElement(Conclusions, { rows, t: bundle.test, after: AFTER_RUN.drafted }))
    expect(before.match(/data-state="sealed"/g)).toHaveLength(rows.length)
    expect(before).toContain(AFTER_RUN.drafted)
    const nd = rows.find((r) => r.key === 'no_detectable_difference')!
    const said = nd.statement.replace(/\bMDE\b/g, '0.0231')
    const keys = { ...bundle.test.keys, h1_statement: said, h1_mean_bp: -0.0042, h1_ci_low_bp: -0.012, h1_ci_high_bp: 0.0031, h1_days_positive: 7, h1_n_days: 16 }
    const after = renderToStaticMarkup(createElement(Conclusions, { rows, t: { ...bundle.test, keys }, after: AFTER_RUN.drafted }))
    expect(after).toContain('data-conclusion="no_detectable_difference" data-state="open"')
    expect(after.match(/data-state="sealed"/g)).toHaveLength(rows.length - 1)
    expect(after).toContain(said)
    expect(after).toContain('7 of 16')
    expect(after).not.toContain(AFTER_RUN.drafted)
  })

  it('draws C2 for v1 (superseded) and v2 on one axis, each bar from 0 to its mean in the bundle', () => {
    const v = (name: string, c: (typeof bundle.validation.comparisons)[number]): Verdict => ({
      name,
      what: '',
      commit: '',
      href: '',
      mean: c.mean_bp!,
      lo: c.bootstrap_ci_bp[0]!,
      hi: c.bootstrap_ci_bp[1]!,
      stats: '',
    })
    const c1 = bundle.v1.c2_minus_b1
    const c2 = bundle.validation.comparisons.find((c) => c.a === 'C2' && c.b === 'B1')!
    // The same comparison on the same cell and days, so the two bars share an axis.
    expect([c1.a, c1.b, c1.cell, Object.keys(c1.per_day_bp)]).toEqual([c2.a, c2.b, c2.cell, Object.keys(c2.per_day_bp)])
    const bar = bundle.mde.c2_threshold_bp
    const h = renderToStaticMarkup(createElement(CanaryStory, { v1: v('v1 (superseded)', c1), v2: v('v2', c2), bar, barLabel: '', passes: true }))
    const min = Math.min(0, c1.bootstrap_ci_bp[0]!, c2.bootstrap_ci_bp[0]!) * 1.08
    const max = Math.max(0, c1.bootstrap_ci_bp[1]!, c2.bootstrap_ci_bp[1]!, bar) * 1.08
    const pos = (x: number) => ((x - min) / (max - min)) * 100
    for (const [name, mean] of [['v1 (superseded)', c1.mean_bp!], ['v2', c2.mean_bp!]] as const) {
      const m = h.match(new RegExp(`data-bar="${name.replace(/[()]/g, '\\$&')}"[^>]*style="left:([\\d.]+)%;width:([\\d.]+)%`))!
      expect(m, name).not.toBeNull()
      const [left, width] = [Number(m[1]), Number(m[2])]
      expect(Math.min(left, left + width)).toBeCloseTo(Math.min(pos(0), pos(mean)), 6)
      expect(left + width).toBeCloseTo(Math.max(pos(0), pos(mean)), 6)
    }
    expect(c1.mean_bp!).toBeLessThan(0)
  })

  it('lifts the toy’s intensities by the fitted α and decays them at the fitted β', () => {
    const p = bundle.hawkes_fit.params
    expect(intensity(p, [], 100)).toEqual([p.mu_b, p.mu_s])
    // Strictly earlier events only: at the event's own instant nothing has changed.
    expect(intensity(p, [[100, 1]], 100)).toEqual([p.mu_b, p.mu_s])
    const [b, s] = intensity(p, [[100, 1]], 100 + 1e-9)
    expect(b).toBeCloseTo(p.mu_b + p.alpha_bb, 6)
    expect(s).toBeCloseTo(p.mu_s + p.alpha_sb, 6)
    const half = (Math.LN2 / p.beta) * 1000
    const [b2] = intensity(p, [[0, 1]], half)
    expect(b2 - p.mu_b).toBeCloseTo(p.alpha_bb / 2, 6)
    const [bs, ss] = intensity(p, [[0, -1]], 1e-9)
    expect(bs).toBeCloseTo(p.mu_b + p.alpha_bs, 6)
    expect(ss).toBeCloseTo(p.mu_s + p.alpha_ss, 6)
  })

  it('scales the title’s book by the minute’s own levels: nothing for an empty level, all of it for the largest', () => {
    const d = replayData()
    const b = book(d)
    expect(height(0, b)).toBe(0)
    expect(height(b.top, b)).toBeCloseTo(1, 12)
    expect(height(b.lot, b)).toBeGreaterThan(0)
    expect(height(b.lot, b)).toBeLessThan(height(b.top / 2, b))
    for (let i = 0; i < d.t.length; i++) for (const [p] of [...d.bids[i]!, ...d.asks[i]!]) expect(Math.abs(p - b.mids[i]!)).toBeLessThanOrEqual(b.reach)
  })
})
