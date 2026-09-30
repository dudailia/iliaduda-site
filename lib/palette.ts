import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The six colour tokens as app/globals.css declares them, by day and by night,
 * for images drawn at build time: an image cannot read the page's custom
 * properties. Read from the stylesheet itself, as tests/contrast.test.ts
 * does, so they cannot drift from it. Server only (it reads the file).
 */

export const TOKENS = ['ink', 'paper', 'graphite', 'rule', 'indigo', 'indigo-wash'] as const
export type Token = (typeof TOKENS)[number]
export type Palette = Record<Token, string>

export function palette(): { light: Palette; dark: Palette } {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
  const light = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
  const dark = /@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
  const read = (block: string, theme: string) =>
    Object.fromEntries(
      TOKENS.map((t) => {
        const m = new RegExp(`--color-${t}:\\s*(#[0-9a-fA-F]{6});`).exec(block)
        if (!m) throw new Error(`--color-${t} not found in the ${theme} theme`)
        return [t, m[1]!]
      }),
    ) as Palette
  return { light: read(light, 'light'), dark: read(dark, 'dark') }
}
