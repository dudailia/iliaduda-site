import localFont from 'next/font/local'

/**
 * Both faces are self-hosted variable woff2, latin subset, committed to
 * public/fonts. There is no Google Fonts request and no CDN in the critical
 * path.
 *
 * Two naming collisions to avoid. Neither broke rendering when they were here
 * — both resolved by luck, which is the reason to write them down:
 *
 *  1. next/font/local derives the generated @font-face family name from the
 *     EXPORTED BINDING NAME. `export const serif` produced a family literally
 *     called "serif". It still matched, because a quoted family name is looked
 *     up before the generic keyword — but the site was then one unquoted
 *     reference away from silently rendering in Times. Hence sourceSerif.
 *  2. `variable: '--font-serif'` alongside a theme token
 *     `--font-serif: var(--font-serif), Georgia, serif` is a self-reference.
 *     The html-scoped value won, so the cascade papered over it and the
 *     computed family came out with the fallback list appended twice. Hence
 *     the *-face suffix: the token that consumes the face is not the face.
 *
 * Neither of these is visible on screen, so tests/e2e/fonts.spec.ts asserts the
 * computed family by name and asserts document.fonts reports both as loaded.
 *
 * `adjustFontFallback` derives a size-adjusted fallback from the real font's
 * metrics, so the swap from fallback to webfont moves no text. That is what
 * keeps CLS at zero rather than merely low.
 */

export const sourceSerif = localFont({
  src: '../public/fonts/source-serif-4-latin-var.woff2',
  weight: '200 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-serif-face',
  adjustFontFallback: 'Times New Roman',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
})

export const sourceCodePro = localFont({
  src: '../public/fonts/source-code-pro-latin-var.woff2',
  weight: '200 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-mono-face',
  // Was false, which meant the mono face had no metric-matched fallback and
  // mono text reflowed when it swapped in. Invisible locally, worth ~0.005 CLS
  // on the deployment. The base family matters less than the adjustment: the
  // generated fallback is size-adjusted to Source Code Pro's own metrics, so
  // the swap moves nothing.
  adjustFontFallback: 'Arial',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
})
