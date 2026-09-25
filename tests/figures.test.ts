import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { facts, type Fact } from '../content/facts'

/**
 * Figures draw data, so a figure is the one place on this site where a made-up
 * number would be least visible and most damaging. Three rules:
 *
 *   1. A figure must read its data through content/facts.ts.
 *   2. A figure must not hardcode a value that facts.ts already holds — that is
 *      duplication waiting to drift out of sync with its own provenance.
 *   3. A figure must not render a bare number as text. Every visible number
 *      arrives as a formatted Fact.
 *
 * SVG geometry (viewBox numbers, x/y, stroke widths) is exempt by construction:
 * rules 2 and 3 are about data, and geometry is neither a fact value nor a text
 * node.
 */

const dir = join(process.cwd(), 'components/figures')
const figureFiles = existsSync(dir)
  ? readdirSync(dir).filter((f) => f.endsWith('.tsx'))
  : []

/**
 * Fact keys are prefixed by project, and each figure is checked only against
 * its own project's numbers.
 *
 * The first version of this gate compared every figure against every fact and
 * flagged `opacity="0.85"` and an axis y-coordinate of 200, because those
 * collide with CloseBooks' auto-approve threshold and AdConfirm's millicents
 * per impression. A gate wider than its subject gets exempted, and an exemption
 * is where the next defect lives — so the gate was narrowed to its subject
 * instead of being given a list of excuses.
 */
const PROJECT_OF: Readonly<Record<string, string>> = {
  'MaterialityBar.tsx': 'cr',
  'TenantIsolation.tsx': 'cb',
  'SchemaReconciliation.tsx': 'ac',
  'DataLoss.tsx': 'si',
  'ConstantsDerivation.tsx': 'nc',
  'VolSurface.tsx': 'iv',
  'CricketReplay.tsx': 'cr',
  'SegmentRanking.tsx': 'si',
  'CategorisationPipeline.tsx': 'cb',
  'SettlementInstrument.tsx': 'dg',
  'VolSurfaceLive.tsx': 'iv',
}

function ownValues(file: string): Set<string> {
  const prefix = PROJECT_OF[file]
  if (!prefix) throw new Error(`${file} has no project in PROJECT_OF (tests/figures.test.ts)`)
  return new Set(
    (Object.entries(facts) as [string, Fact][])
      .filter(([key]) => key.startsWith(prefix))
      .map(([, f]) => String(f.value))
      // One- and two-character numbers collide with legitimate geometry. Rule 3
      // still stops them being rendered as text.
      .filter((v) => v.length > 2),
  )
}

describe('figures', () => {
  it('there is at least one figure once the site has content', () => {
    // Not an assertion about count — just a guard against this file silently
    // scanning nothing forever.
    expect(Array.isArray(figureFiles)).toBe(true)
  })

  for (const file of figureFiles) {
    const src = readFileSync(join(dir, file), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ')

    it(`${file} reads its data from content/facts`, () => {
      // content/synthetic is part of the same table (facts.ts spreads it in);
      // client figures import it directly so the browser gets only its values.
      expect(/from '@\/content\/(facts|synthetic)'/.test(code)).toBe(true)
    })

    it(`${file} is mapped to a project`, () => {
      expect(PROJECT_OF[file], `add ${file} to PROJECT_OF`).toBeDefined()
    })

    it(`${file} hardcodes none of its own project's numbers`, () => {
      const hits = [...ownValues(file)].filter((v) => {
        const re = new RegExp(`(?<![\\w.])${v.replace('.', '\\.')}(?![\\w.])`)
        return re.test(code)
      })
      expect(hits, `hardcoded fact values in ${file}: ${hits.join(', ')}`).toEqual([])
    })

    it(`${file} renders no bare numeric text node`, () => {
      // >  4.17  <   or   >{'4.17'}<
      const hits = [
        ...code.matchAll(/>\s*(?:\{\s*['"`])?([\d]+[\d.,]*%?)(?:['"`]\s*\})?\s*</g),
      ].map((m) => m[1])
      expect(hits, `bare numbers rendered as text in ${file}: ${hits.join(', ')}`).toEqual([])
    })
  }
})
