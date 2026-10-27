import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TestResult } from '../components/figures/toxicflow/TestResult'
import { bundle, ci, num, replay, source, testRun, type TestBlock } from '../lib/toxicflow/data'
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
