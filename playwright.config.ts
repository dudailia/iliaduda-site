import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices, firefox } from '@playwright/test'

// E2E_PORT lets two checkouts run their suites side by side without one
// reusing the other's server.
const PORT = Number(process.env.E2E_PORT ?? 4400)
const BASE = `http://127.0.0.1:${PORT}`
// A WebKit build to run in place of Playwright's own: PW_WEBKIT, or, where it
// is installed, the macOS 15 build of the same revision. On macOS 26.0 the
// macOS 26 build crashes in WKWebView as it opens a page (an AppKit mismatch),
// and the macOS 15 build runs. It lives outside Playwright's cache, because
// `playwright install` deletes every build there that it did not put there.
const WEBKIT =
  process.env.PW_WEBKIT ??
  ['Library/Caches/pw-webkit-2336-mac15/pw_run.sh', 'Library/Caches/ms-playwright/webkit-2336-mac15/pw_run.sh'].map((p) => join(homedir(), p)).find((p) => existsSync(p))

const FIREFOX = !!process.env.CI || existsSync(firefox.executablePath())

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: BASE, trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /webkit|clock/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 780 } }, testIgnore: /webkit|clock/ },
    // WebKit at an iPhone's size, touch and pixel ratio. It is WebKit for the
    // desktop, so it has the desktop's WebGL: the iPhone's missing extensions
    // are tested in Chromium (hero-formats.spec.ts), and a real phone checks the rest.
    {
      name: 'iphone',
      use: { ...devices['iPhone 15'], ...(WEBKIT ? { launchOptions: { executablePath: WEBKIT } } : {}) },
      testMatch: /(webkit|engines)\.spec\.ts/,
    },
    // SpiderMonkey, the third engine for one market (`playwright install firefox`). Locally it runs where Firefox is
    // installed; on CI, which installs it, always, so a missing browser fails rather than skipping the paper's claim.
    ...(FIREFOX ? [{ name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: /engines\.spec\.ts/ }] : []),
    // Timing that a busy machine would falsify (a 30 Hz frame clock): alone, once every other project has finished.
    {
      name: 'clock',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testMatch: /clock\.spec\.ts/,
      dependencies: ['desktop', 'mobile', 'iphone', ...(FIREFOX ? ['firefox'] : [])],
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
