# iliaduda.com

Personal site. Next.js 16, TypeScript, Tailwind 4, deployed on Vercel.

Seven case studies, one figure each, no product screenshots. The figures are
hand-authored SVG — no chart library — and every number in them comes from
`content/facts.ts`, where each entry carries the file it was verified against.

## Running it

```
pnpm install
pnpm dev
```

## The gates

Everything below fails the build rather than warning. The site makes claims
about its own accessibility and layout stability, so those claims are checked
rather than asserted.

```
pnpm typecheck        # strict, plus noUncheckedIndexedAccess
pnpm lint
pnpm test             # provenance, retracted copy, contrast
pnpm build
pnpm test:e2e         # axe, focus rings, off-origin requests, 360px, fonts
pnpm test:lh          # accessibility 100, CLS, zero third-party requests
pnpm check:all        # all of the above, in order
```

`pnpm test` is four gates:

- **`facts.test.ts`** — every entry in `content/facts.ts` must cite a source
  specific enough to re-check. A number without provenance cannot reach a page.
- **`figures.test.ts`** — a figure may not hardcode a value that `facts.ts`
  already holds, and may not render a bare number as a text node. Scoped per
  project, so a cricstate figure is checked against cricstate numbers.
- **`copy.test.ts`** — a set of claims a self-audit retracted cannot be
  restored. `tests/e2e/copy.spec.ts` repeats the check against rendered output,
  because a template can assemble a phrase from pieces a source scan sees
  separately.
- **`contrast.test.ts`** — WCAG ratios computed from the tokens in
  `app/globals.css`, so the gate cannot drift from the palette.

Measured on the worst of five Lighthouse runs per route: accessibility 100,
performance 100, best practices 100, SEO 100, CLS 0.0000, 227 KB total transfer,
zero third-party requests.

## Notes

- Two self-hosted variable typefaces, latin subset, 71.7 KB combined. No Google
  Fonts, no CDN.
- No scroll-triggered motion anywhere. The only transitions are link colour on
  hover and focus.
- The OTF files in `assets/og-fonts/` are build-time input for the Open Graph
  image, which cannot read woff2. They are deliberately outside `public/`.
- No analytics.

## Still to do

- Real headshot and résumé PDF. Both are omitted rather than stubbed — a
  portfolio whose own résumé download 404s makes the reader's argument for them.
- `iliaduda.com` DNS.
