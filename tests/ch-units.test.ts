import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * No layout width may be expressed in `ch`.
 *
 * `ch` is the advance width of "0" in the font currently in use, so any length
 * in ch changes the moment a webfont swaps in. `--measure` fed the page's
 * max-width, which meant the entire layout reflowed horizontally on font load:
 * CLS 0.0000 on localhost, where the font is there before first paint, and
 * 0.035 on the deployment.
 *
 * A metric-adjusted fallback does not solve it — size-adjust scales glyphs, but
 * the measure has to stop depending on which font is loaded at all. This gate
 * exists because the local Lighthouse run could not see the problem, and a gate
 * that only passes in the environment where the bug cannot occur is not a gate.
 */

const ROOTS = ['app', 'components']

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|css)$/.test(name)) out.push(p)
  }
  return out
}

const files = ROOTS.flatMap((r) => walk(join(process.cwd(), r)))

describe('layout widths do not depend on the loaded font', () => {
  it('scans the styled source', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('uses no ch unit anywhere', () => {
    const hits: string[] = []
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (line.trim().startsWith('*') || line.trim().startsWith('//')) return
          if (/\b\d+(\.\d+)?ch\b/.test(line)) {
            hits.push(`${relative(process.cwd(), file)}:${i + 1}  ${line.trim()}`)
          }
        })
    }
    expect(hits, `ch units found:\n${hits.join('\n')}`).toEqual([])
  })
})
