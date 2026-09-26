import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * What ships with a page is decided by its import graph, not by what renders.
 *
 * Next ships every client component a page's server graph imports, whether the
 * page renders it or not. Every page's metadata imports its opengraph-image
 * module, and the home contents import the thumbnails, so the image and
 * thumbnail code must reach no 'use client' file. One stray import (the IV
 * thumbnail's contour levels, read from the figure module) once put the whole
 * IV-surface island on every page of the site.
 *
 * And a figure island ships with the page, while its renderer loads later, on
 * devices that will draw it. A module the two share goes out with the island,
 * whole, so GPU code must not sit in a module the island imports.
 */

const ROOT = process.cwd()
const TRY = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx']
const SPEC = /(?:^|[\s;])(import|export)(\s+type)?\s[^'";]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null
  if (base === null) return null // a package, not ours
  for (const ext of TRY) {
    const p = base + ext
    if (existsSync(p) && statSync(p).isFile()) return p
  }
  throw new Error(`cannot resolve ${spec} from ${relative(ROOT, from)}`)
}

/** Every source file reachable from entry by runtime imports; `lazy` follows import() too. */
function reached(entry: string, lazy: boolean): string[] {
  const seen = new Set<string>()
  const stack = [entry]
  while (stack.length > 0) {
    const file = stack.pop()!
    if (seen.has(file) || !/\.(tsx?|m?js)$/.test(file)) continue
    seen.add(file)
    for (const m of readFileSync(file, 'utf8').matchAll(SPEC)) {
      if (m[2]) continue // import type: erased, no runtime edge
      if (m[5] && !lazy) continue
      const spec = m[3] ?? m[4] ?? m[5]
      const next = spec ? resolve(file, spec) : null
      if (next) stack.push(next)
    }
  }
  return [...seen]
}

const isClient = (file: string) => /^\s*['"]use client['"]/.test(readFileSync(file, 'utf8'))

/** Every 'use client' file the entry's graph reaches, lazy imports included. */
const clientFilesReached = (entry: string) => reached(entry, true).filter(isClient).map((f) => relative(ROOT, f)).sort()

/** The names a module exports as values. */
const exportsOf = (file: string) =>
  [...readFileSync(file, 'utf8').matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!)

function ogImages(dir = join(ROOT, 'app'), out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) ogImages(p, out)
    else if (/^opengraph-image\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('server-only graphs that every page imports', () => {
  const entries = [join(ROOT, 'lib/og.tsx'), join(ROOT, 'lib/thumbs.ts'), join(ROOT, 'components/PaperThumb.tsx'), ...ogImages()]

  it('finds the routes it guards', () => {
    expect(ogImages().length).toBeGreaterThanOrEqual(9)
  })

  it.each(entries.map((e) => [relative(ROOT, e), e]))('%s reaches no client component', (_, entry) => {
    expect(clientFilesReached(entry)).toEqual([])
  })

  it('the walker sees a client component when one is reached', () => {
    // The guard is only as good as the walker: the home page does reach one.
    expect(clientFilesReached(join(ROOT, 'app/page.tsx'))).toContain('components/figures/futures/Live.tsx')
  })
})

describe('figure islands', () => {
  // Shader compilation, render targets and the flythrough camera are needed
  // only once a renderer draws, so they must load with it.
  const RENDERER_ONLY = ['compile', 'program', 'drawFullscreen', 'target', 'disposeTarget', 'perspective', 'lookAt', 'viewProjection']

  it.each(['components/stage/useStage.ts', 'components/figures/futures/Live.tsx'])('%s leaves GPU code to the lazy renderer', (entry) => {
    const names = new Set(reached(join(ROOT, entry), false).flatMap(exportsOf))
    expect(RENDERER_ONLY.filter((n) => names.has(n))).toEqual([])
  })

  it('the renderer, imported lazily, is where that code is', () => {
    const names = new Set(reached(join(ROOT, 'components/figures/futures/renderer.ts'), false).flatMap(exportsOf))
    expect(RENDERER_ONLY.filter((n) => !names.has(n))).toEqual([])
  })
})
