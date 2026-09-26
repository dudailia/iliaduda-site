import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// E2E_PORT lets two checkouts run their suites side by side without one
// reusing the other's server.
const PORT = Number(process.env.E2E_PORT ?? 4400)
const BASE = `http://127.0.0.1:${PORT}`
// A WebKit build to run in place of Playwright's own: PW_WEBKIT, or, where it
// is installed, the macOS 15 build of the same revision. On macOS 26.0 the
// macOS 26 build crashes in WKWebView as it opens a page (an AppKit mismatch),
// and the macOS 15 build runs.
const WEBKIT = process.env.PW_WEBKIT ?? [join(homedir(), 'Library/Caches/ms-playwright/webkit-2336-mac15/pw_run.sh')].find((p) => existsSync(p))

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: BASE, trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /webkit/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 780 } }, testIgnore: /webkit/ },
    // WebKit at an iPhone's size, touch and pixel ratio. It is WebKit for the
    // desktop, so it has the desktop's WebGL: the iPhone's missing extensions
    // are tested in Chromium (hero-formats.spec.ts), and a real phone checks the rest.
    {
      name: 'iphone',
      use: { ...devices['iPhone 15'], ...(WEBKIT ? { launchOptions: { executablePath: WEBKIT } } : {}) },
      testMatch: /webkit\.spec\.ts/,
    },
  ],
  /**
   * Runs against `next start`, not `next dev`. The development server injects a
   * dev indicator and unminified assets, so auditing it would be measuring an
   * environment no real visitor uses — which is the thing this site says not to
   * do. Readiness is an HTTP fact: Playwright polls the URL until it answers.
   */
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
