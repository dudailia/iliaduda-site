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
import { writeFileSync } from 'node:fs'
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
