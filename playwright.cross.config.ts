import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

/**
 * The whole e2e suite in the other two engines, at a laptop's size and a phone's: `pnpm test:e2e:cross`, for a release
 * pass (the gate runs Chromium at both sizes, and WebKit and Firefox only for the specs written for them).
 *
 * Left out, because they test Chromium's own machinery rather than the site: the clock spec (a 30 Hz frame clock), the
 * software-rendering specs (they force SwiftShader with Chromium flags), and in Firefox the morph spec (Firefox has no
 * cross-document view transitions: a paper simply opens). The 2026-10-06 release pass also saw, and found to be the
 * harness rather than the site: Firefox quoting a font's name in computed styles (fonts.spec), Safari's Tab skipping
 * links by default (keyboard.spec's skip link; Option-Tab reaches it), WebKit's tests unable to build a
 * DeviceOrientationEvent or scroll a mobile wheel, Firefox's lack of mobile emulation (a coarse pointer, a phone's
 * running head), and a few timing tolerances.
 *
 * WebKit on macOS 26: Playwright's own build crashes there, and a spec's own `launchOptions` (the GPU flags) replace the
 * executable set below. Point PLAYWRIGHT_BROWSERS_PATH at a folder whose webkit-2336 is the macOS 15 build (and the rest
 * links to ~/Library/Caches/ms-playwright), so every launch finds it.
 */

const WEBKIT =
  process.env.PW_WEBKIT ??
  ['Library/Caches/pw-webkit-2336-mac15/pw_run.sh', 'Library/Caches/ms-playwright/webkit-2336-mac15/pw_run.sh'].map((p) => join(homedir(), p)).find((p) => existsSync(p))
const webkit = WEBKIT ? { launchOptions: { executablePath: WEBKIT } } : {}

export default defineConfig({
  ...base,
  projects: [
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 }, ...webkit }, testIgnore: /clock|software/ },
    { name: 'webkit-phone', use: { ...devices['iPhone 15'], ...webkit }, testIgnore: /clock|software/ },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } }, testIgnore: /clock|software|morph/ },
    // Firefox has no mobile emulation: a phone's viewport and touch.
    { name: 'firefox-phone', use: { ...devices['Desktop Firefox'], viewport: { width: 390, height: 844 }, hasTouch: true }, testIgnore: /clock|software|morph/ },
  ],
})
