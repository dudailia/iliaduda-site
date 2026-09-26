# iliaduda.com

Ilia Duda's résumé and portfolio, set as a working paper whose figures are
alive. Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, on Vercel.

The home page opens on Fig. 1: a million simulated futures for one stock,
priced by Monte Carlo on the reader's GPU and checked live against
Black–Scholes.

Five papers, each built around one live figure: an implied-volatility surface
drawn in raw WebGL2, CloseBooks' categorisation pipeline, a T20 World Cup final
replayed ball by ball, a startup-segment ranking under three treatments of the
data, and a debt-settlement portal's arithmetic and statutory contact limits.
There are also two shorter write-ups (nucarbon, AdConfirm), an About page with
the OFZ yield curve through the Bank of Russia's summer 2023 rate decisions, and
a one-page CV that the build prints to PDF.

The figures are hand-authored SVG and WebGL, with no chart library. Every
number in them comes from `content/facts.ts`, where each entry names the file
it was verified against.

The visual system is written down in [`DESIGN.md`](DESIGN.md), and the product
brief in [`PRODUCT.md`](PRODUCT.md).

## Running it

```
pnpm install
pnpm dev
```

`pnpm build` runs `next build` and then `scripts/cv-pdf.mjs`. That script prints
`/cv` with the print stylesheet to `public/ilia-duda-resume.pdf`, the file the
masthead links. It fails the build if the page runs past one sheet on Letter or
A4, or if anything inside the sheet is absolutely positioned (Chromium writes a
PDF's text layer in paint order, and positioned boxes paint last). Locally it
uses Playwright's Chromium; on Vercel it uses `@sparticuz/chromium`, since the
build image has no browser.

## Where the numbers come from

| Figure | Data | Written by |
|---|---|---|
| Futures (home Fig. 1) | synthetic GBM parameters, labelled simulated | `content/synthetic.ts`, `lib/futures/mc.ts` |
| IV surface (`/iv-surface`) | synthetic SSVI parameters, labelled synthetic | `content/synthetic.ts`, `lib/svi.ts` |
| cricstate replay | the 2026 Men's T20 World Cup final | `scripts/cricket_replay.py`, run inside the cricstate repo; asserts the paper's test NLL |
| startup ranking | the capstone notebook's own cells | `scripts/startup_ranking.py`; asserts variant A reproduces the notebook |
| CloseBooks pipeline | a synthetic feed through the product's ported rules | `content/data/closebooks-feed.ts`, `lib/closebooks.ts` |
| debt portal | an illustrative ladder; 230-FZ windows | `lib/settlement.ts`, `lib/contact.ts` |
| OFZ curve (`/about`) | Moscow Exchange G-curve parameters, July–August 2023, cross-checked against the Bank of Russia | `scripts/ofz_curve.mjs` |

## The gates

Everything below fails rather than warns.

```
pnpm typecheck        # strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess
pnpm lint
pnpm test             # vitest: provenance, figures, copy, contrast, the maths
pnpm build            # includes the one-page CV check
pnpm test:e2e         # Playwright: axe, focus, origin, overflow, rail, figures, CV
pnpm test:lh          # Lighthouse budgets on a local production build
pnpm check:all        # all of the above, in order
```

- **`facts.test.ts`**: every number cites a source specific enough to re-check,
  and chosen (synthetic) values say so.
- **`figures.test.ts`**: a figure may not hardcode a value `facts.ts` already
  holds, or render a bare number as text.
- **`copy.test.ts`** and **`e2e/copy.spec.ts`**: the banned phrases in
  `tests/forbidden.ts` are checked in source and in rendered output. They cover
  retracted claims, superlatives, defensive lines, any performance metric for
  trading work, and phone numbers.
- **`contrast.test.ts`**: WCAG ratios for both themes, computed from the tokens
  in `app/globals.css`.
- **`svi.test.ts`**, **`gcurve.test.ts`**, **`settlement.test.ts`**,
  **`contact.test.ts`**, **`closebooks.test.ts`**: the figures' maths.
  - no static arbitrage anywhere the surface is drawn, and Greeks against finite
    differences;
  - every published OFZ yield reproduced from the curve's parameters, within
    0.005 pp;
  - kopeck-exact settlement arithmetic;
  - the rolling contact windows;
  - the categorisation rules.
- **e2e**: axe including best-practice rules in both themes, a visible focus
  ring on everything in the tab order, zero off-origin requests, no horizontal
  scroll at 360/768/1440, no rail item over another, the self-hosted faces in
  use, each figure doing the one thing it exists to show, the CV PDF served as
  one page, and the old URLs redirecting.

Measured on the preview deployment (25 September 2026), mobile Lighthouse, two runs on each of ten routes:

| | |
|---|---|
| Performance | 93–100 |
| Accessibility | 100 |
| Best practices | 100 |
| CLS | 0 |
| Transfer | 233–258 KB (budget 260) |
| Third-party requests | 0 |

## Notes

- Two self-hosted variable typefaces, latin subset. No font CDN, no analytics
  and no third-party script; the CSP only admits Vercel's toolbar, and only on
  previews.
- The OTF files in `assets/og-fonts/` are build-time input for the Open Graph
  cards (`ImageResponse` cannot read woff2), kept outside `public/`.
- Canonical URLs: `lib/site.ts` falls back to `iliaduda-site.vercel.app` until
  `iliaduda.com` resolves. When it does, set `DOMAIN_LIVE = true` there and point
  `lighthouserc.prod.json` at the domain.
- Dark mode follows the system setting. Every page prints as a document in the
  light palette.
