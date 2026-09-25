import { defineConfig, devices } from '@playwright/test'

// E2E_PORT lets two checkouts run their suites side by side without one
// reusing the other's server.
const PORT = Number(process.env.E2E_PORT ?? 4400)
const BASE = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: BASE, trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 780 } } },
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
