import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A self-audit retracted a number of claims that appeared in earlier versions
 * of this portfolio. This gate makes restoring one a build failure rather than
 * a thing someone might notice in review.
 *
 * It scans source with comments stripped, so an explanatory comment about a
 * retracted claim is allowed but shipping the claim is not. Rendered output is
 * checked independently in tests/e2e/copy.spec.ts, because a template could
 * always assemble a forbidden phrase from pieces this scan sees separately.
 */

const ROOTS = ['app', 'components', 'content', 'lib']

/** Phrases that are unsupportable anywhere on this site. */
const FORBIDDEN: readonly (readonly [RegExp, string])[] = [
  [/real money/i, 'not supportable — no project handles customer money'],
  [/real clients/i, 'not supportable — CloseBooks has no paying customers'],
  [/production[- ]grade/i, 'superlative that cannot be defended'],
  [/battle[- ]tested/i, 'superlative that cannot be defended'],
  // Narrowed from /enterprise/ after it flagged "Young Enterprise UK", which is
  // the actual name of the organisation. The ban is on the self-description,
  // not on the word.
  [/\benterprise[-\s](ready|grade|class|scale)\b/i, 'superlative that cannot be defended'],
  [/state street/i, 'removed from the site entirely'],
  [/first real[- ]time/i, 'unsupportable and unfalsifiable'],
  [/1,247/, 'a fixed reference dataset, never an aggregation across firms'],
  [/automated 1099 filing/i, 'there is no IRS e-file integration'],
  [/\bhonest(y|ly)?\b/i, 'the site demonstrates this; it must never announce it'],
  [/\bpassionate\b/i, 'register'],
  [/\bworld[- ]class\b/i, 'superlative'],
  [/\bcutting[- ]edge\b/i, 'superlative'],
  [/\bseamless(ly)?\b/i, 'register'],
  [/\bbest[- ]in[- ]class\b/i, 'superlative'],
]

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|mdx)$/.test(name)) out.push(p)
  }
  return out
}

const files = ROOTS.flatMap((r) => {
  try {
    return walk(join(process.cwd(), r))
  } catch {
    return []
  }
})

describe('retracted claims cannot be restored', () => {
  it('finds source to scan', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const [pattern, why] of FORBIDDEN) {
    it(`never says ${pattern.source}`, () => {
      const hits: string[] = []
      for (const file of files) {
        const body = stripComments(readFileSync(file, 'utf8'))
        body.split('\n').forEach((line, i) => {
          if (pattern.test(line)) {
            hits.push(`${relative(process.cwd(), file)}:${i + 1}  ${line.trim()}`)
          }
        })
      }
      expect(hits, `${why}\n${hits.join('\n')}`).toEqual([])
    })
  }
})

/**
 * Claims that are false for one project and fine for another. "tested" is the
 * clearest case: cricstate has 24 test files and 2,310 lines of tests, and
 * CloseBooks has no test runner at all.
 */
describe('per-project claims stay inside the project they are true of', () => {
  it('does not describe CloseBooks as tested', () => {
    const path = join(process.cwd(), 'content/projects.ts')
    let src: string
    try {
      src = stripComments(readFileSync(path, 'utf8'))
    } catch {
      return // copy not written yet; the gate exists before the content does
    }
    const closebooks = /slug:\s*'closebooks'[\s\S]*?(?=\n {2}\},\n {2}\{|\n\]|$)/.exec(src)
    if (!closebooks) return
    // CloseBooks has no test runner at all, so any claim of coverage is false.
    // "Stripe test mode" is a factual description of a billing environment and
    // is not a coverage claim — an earlier version of this gate conflated them.
    const coverageClaim =
      /\b(well|fully|unit|integration|end-to-end|thoroughly)[-\s]tested\b|\btest (coverage|suite)\b|\bis tested\b|\bhas tests\b/i
    expect(coverageClaim.test(closebooks[0])).toBe(false)
  })
})
