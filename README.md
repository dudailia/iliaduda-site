# iliaduda.com

Ilia Duda's résumé and portfolio, set as a working paper whose figures are
alive. Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, on Vercel.

The home page opens on Fig. 1: a million simulated futures for one stock,
priced by Monte Carlo on the reader's GPU and checked live against
Black–Scholes, drawn in three dimensions with the terminal histogram on the
expiry wall. Pricing keeps its floats as bits in integer render targets, so it
runs without float render targets on hardware WebGL2, iPhones included; `?debug=1` reports what the figure
chose on this device and why. Readers without the live figure get the same
view as a still frame on a 2D canvas.

Seven papers, each built around one live figure: one simulated market drawn
three ways at once (`/market`), CloseBooks' categorisation pipeline, a T20 World
Cup final replayed ball by ball, a limit order book driven by a Hawkes process
(`/order-book`), an implied-volatility surface drawn in raw WebGL2, a
startup-segment ranking under three treatments of the data, and a
debt-settlement portal's arithmetic and statutory contact limits.
There are also two shorter write-ups (nucarbon, AdConfirm), an About page with
the OFZ yield curve through the Bank of Russia's summer 2023 rate decisions, and
a one-page CV that the build prints to PDF.

`/market` runs one deterministic synthetic market (`lib/market/`: Hawkes order
flow into a limit order book, advanced in whole quanta of 1/60 of a simulated
second, with its own `exp` and `log`) in a module Web Worker loaded from the
site's own origin, and draws its order book, a year of its futures and its
vol surface from the same frame of it. The market comes out the same to the bit
in Node, V8, JavaScriptCore and SpiderMonkey from the same seed and the same
log of shocks (`tests/e2e/market-engines.spec.ts`); the futures, drawn with the
platform's own exponential, are the one part that is not claimed bit for bit.
The home figure's volatility is that market's realised volatility where
`/market` opens, worked out by the server and again by the browser.

The worker and the page speak one protocol (`lib/market/protocol.ts`): the page
asks for a frame each time it draws, lending the worker one of a small pool of
transferable buffers (no `SharedArrayBuffer`, so no cross-origin isolation
headers), and gets back the market's clock, book, ladder, new depth rows, new
trades, its realised volatility and stress, and, when one is finished, a year
of futures from the mid. The worker moves the market on by the time since the
page's last frame, at most a tenth of a simulated second a frame, so a tab left
in the background or a phone that drops frames finds the market where it left
it and never races through the missed minutes; the time it held is counted and
shown. It measures itself: futures drawn a second, its busy share, and so its
headroom. The Contents' miniatures of `/market` and `/order-book` run the same
engine on the page's own thread, four milliseconds a frame, and a click hands
the miniature's moment to the paper, which runs the same seeded market to it.

What "deterministic" covers: from the same seed and the same log of shocks, the
order flow, the book, the tape, the realised volatility and the stress are the
same to the last bit, however the market is stepped (single quanta, whole
seconds, one long jump, slices across frames) and in whichever engine runs it.
The engine computes every exponential, logarithm and power with its own
routines (`lib/market/detmath.ts`), since engines may round the platform's
differently. What it does not cover: the futures fan (drawn with the platform's
exponential, checked statistically instead), the drawing, and how many frames
a device shows.

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
| One market (`/market`) | a seeded synthetic market, labelled simulated | `lib/market/params.ts`, `lib/market/engine.ts` |
| Order book (`/order-book`) | the same seeded market, labelled simulated | `lib/market/params.ts`, `lib/market/flow.ts` |
| IV surface (`/iv-surface`) | synthetic SSVI parameters, labelled synthetic | `content/synthetic.ts`, `lib/surface/ssvi.ts`, `lib/svi.ts` |
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
- **`figures.test.ts`**: a figure's server wrapper (`components/figures/*.tsx`,
  which reads the facts and hands them to its live island) may not hardcode a
  value `facts.ts` already holds, or render a bare number as text.
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
- The market (`tests/market-*.test.ts`, `tests/futures-fan.test.ts`):
  - one market however it is stepped, and a pinned hash that tells apart two
    doubles one unit in the last place apart;
  - `dexp` and `dlog` within two units in the last place of `Math.*`, and no
    platform exponential anywhere in the engine;
  - calibration over ten seeds: 200–400 events a simulated second, realised
    volatility 20–30% a year, a spread of a tick or two, the stationary rate
    within 2% of (I − B)⁻¹μ, and the book's invariants over a million events;
  - the time-rescaling test (each type's compensator between its events is
    Exp(1)), parent attribution summing to one, and the immigrant share the
    theory gives;
  - the liquidity shock: what it does within a second, how it relaxes, that it
    replays, and that fifty presses in a second leave every state bounded;
  - the surface free of static arbitrage at every stress, and the fan's
    quantiles, martingale and Black–Scholes price within Monte Carlo error.
- **`lighthouse-config.test.ts`**: both Lighthouse configs measure every route,
  each under exactly one budget.
- **e2e**: axe including best-practice rules in both themes, a visible focus
  ring on everything in the tab order, zero off-origin requests, no horizontal
  scroll at 360/768/1440, no rail item over another, the self-hosted faces in
  use, each figure doing the one thing it exists to show, the CV PDF served as
  one page, and the old URLs redirecting. The live figures run on Chromium with
  a GPU, on WebKit as an iPhone (`--project=iphone`), and `/market`'s market in
  Chromium, WebKit and Firefox against the hash Node computes
  (`market-engines.spec.ts`).

Measured on the preview deployment (29 September 2026, `redesign` at 3f745af), mobile Lighthouse, two runs on
each of twelve routes, against each page's budget (`lighthouserc.prod.json`):

| | |
|---|---|
| Performance | 93–100 |
| Accessibility | 100 |
| CLS | 0 |
| Transfer, home | 260,162–260,197 B (budget 275,000) |
| Transfer, `/market` | 304,270–304,384 B (budget 335,000) |
| Transfer, `/order-book`, `/iv-surface` | 278,039–283,906 B (budget 300,000) |
| Transfer, every other page | 222,053–246,243 B (budget 261,000) |
| Third-party requests | 0 |

Lighthouse's phone draws WebGL in software, so it measures the still frames; the live figures load after its trace
on a device that can run them. `/market`'s best-practices score on a preview (96) is Vercel's login wall refusing
the worker's scripts to a headless browser; production has no wall.

## Notes

- Two self-hosted variable typefaces, latin subset. No font CDN and no third-party script; the CSP only admits
  Vercel's toolbar, and only on previews. Vercel Web Analytics counts visits on production only, from the site's own
  origin (/_vercel/insights) and without cookies.
- The OTF files in `assets/og-fonts/` are build-time input for the Open Graph
  cards (`ImageResponse` cannot read woff2), kept outside `public/`.
- Canonical URLs: `lib/site.ts` falls back to `iliaduda-site.vercel.app` until
  `iliaduda.com` resolves. When it does, set `DOMAIN_LIVE = true` there and point
  `lighthouserc.prod.json` at the domain.
- Dark mode follows the system setting. Every page prints as a document in the
  light palette.
