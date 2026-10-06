#!/usr/bin/env node
/**
 * Prints /cv to public/ilia-duda-resume.pdf. Runs after `next build`, as part
 * of `pnpm build`, so the PDF is always the page as built: same facts, same
 * typefaces, same print stylesheet a reader gets from their own browser.
 *
 * It fails the build — rather than shipping a two-page résumé — if the page
 * prints to more than one sheet on Letter or on A4.
 *
 * Chromium: Playwright's locally; on a Vercel build, where no browser is
 * installed, the self-contained build from @sparticuz/chromium, which detects
 * the Vercel build image itself.
 */

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const PORT = Number(process.env.CV_PDF_PORT ?? 3217)
const ORIGIN = `http://127.0.0.1:${PORT}`
const OUT = join(process.cwd(), 'public/ilia-duda-resume.pdf')
const MARGIN = { top: '0.5in', bottom: '0.5in', left: '0.55in', right: '0.55in' }

const pages = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length

async function launch() {
  if (process.env.VERCEL && process.platform === 'linux') {
    const { default: sparticuz } = await import('@sparticuz/chromium')
    return chromium.launch({ executablePath: await sparticuz.executablePath(), args: sparticuz.args, headless: true })
  }
  return chromium.launch()
}

async function ready(deadline) {
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${ORIGIN}/cv`)
      if (r.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('next start did not answer /cv in time')
}

const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT), '-H', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'inherit'],
  env: process.env,
})

let browser
try {
  await ready(Date.now() + 60_000)
  browser = await launch()
  const page = await browser.newPage()
  await page.emulateMedia({ media: 'print', colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto(`${ORIGIN}/cv`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)

  // Printed from fixed instances of the same two faces (scripts/cv-fonts.py): a variable font prints as Type 3, which
  // some résumé screeners and viewers handle badly. Same outlines and metrics, so the page lays out as it does on screen.
  // Served at the page's own origin (its content security policy allows fonts from 'self' only).
  await page.route(`${ORIGIN}/__cv-fonts/*`, (route) =>
    route.fulfill({ contentType: 'font/woff2', body: readFileSync(join(process.cwd(), 'scripts/cv-fonts', new URL(route.request().url()).pathname.split('/').pop())) }),
  )
  const face = (family, file, weight) => `@font-face{font-family:${family};font-weight:${weight};src:url(/__cv-fonts/${file}) format('woff2')}`
  await page.addStyleTag({
    content: [
      face('cvSerif', 'serif-400.woff2', 400),
      face('cvSerif', 'serif-600.woff2', 600),
      face('cvSerif', 'serif-700.woff2', 700),
      face('cvMono', 'mono-400.woff2', 400),
      'html{--font-serif-face:cvSerif,Georgia,serif!important;--font-mono-face:cvMono,ui-monospace,monospace!important}',
    ].join(''),
  })
  await page.evaluate(async () => {
    await Promise.all(['400 1em cvSerif', '600 1em cvSerif', '700 1em cvSerif', '400 1em cvMono'].map((f) => document.fonts.load(f)))
    await document.fonts.ready
  })
  const unfixed = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('.cv, .cv *')].map((el) => getComputedStyle(el).fontFamily.split(',')[0].trim()))].filter(
      (f) => !/^"?cv(Serif|Mono)"?$/.test(f),
    ),
  )
  if (unfixed.length) throw new Error(`/cv: text not in the fixed print faces: ${unfixed.join(', ')}`)

  // Chromium paints positioned boxes after in-flow content, and writes the
  // PDF's text layer in paint order. One absolutely positioned bullet dash
  // once put every bullet after the Skills section in the extracted text —
  // invisible on the page, and exactly what a résumé parser reads.
  const positioned = await page.evaluate(() =>
    [...document.querySelectorAll('.cv, .cv *')].flatMap((el) =>
      [null, '::before', '::after']
        .filter((pseudo) => getComputedStyle(el, pseudo).position !== 'static')
        .map((pseudo) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${pseudo ?? ''}`),
    ),
  )
  if (positioned.length) throw new Error(`/cv must have no positioned boxes (PDF text order): ${positioned.join(', ')}`)

  const print = (format) => page.pdf({ format, margin: MARGIN, printBackground: false, tagged: true, outline: false })
  const letter = await print('Letter')
  const a4 = await print('A4')
  const counts = { Letter: pages(letter), A4: pages(a4) }
  if (counts.Letter !== 1 || counts.A4 !== 1) {
    throw new Error(`/cv must print to exactly one page; got ${JSON.stringify(counts)}`)
  }
  writeFileSync(OUT, letter)
  console.log(`cv-pdf: /cv → public/ilia-duda-resume.pdf (${(letter.length / 1024).toFixed(0)} KB, one page on Letter and A4)`)
} finally {
  await browser?.close()
  server.kill()
}
