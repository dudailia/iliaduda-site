# Why these are gates and not scripts

The site argues that a measurement should be checked before it is trusted. These
workflows are that argument applied to the site itself, so every check below
fails the build rather than printing a warning:

| Gate | What it stops |
|---|---|
| `facts.test.ts` | A number reaching a page without a source recorded next to it. |
| `figures.test.ts` | A figure hardcoding a value that `content/facts.ts` already holds, or rendering a bare number as text. Scoped per project, so a cricstate figure is checked against cricstate numbers — a gate wider than its subject gets exempted, and an exemption is where the next defect lives. |
| `copy.test.ts` | Restoring a claim that a self-audit retracted. |
| `contrast.test.ts` | A palette edit that breaks contrast, computed from `app/globals.css` so it cannot drift from the real tokens. |
| `a11y.spec.ts` | Any axe violation on any route, including `best-practice` rules — a WCAG-only scope let a heading-order defect through while Lighthouse scored 0.98. Also fails on a `<figure>` whose `<desc>` does not state values. |
| `keyboard.spec.ts` | An interactive element with no visible focus ring. |
| `origin.spec.ts` | Any request leaving the deployment origin. |
| `responsive.spec.ts` | Horizontal scroll at 360px. |
| `fonts.spec.ts` | The self-hosted faces silently not being the ones in use. Both font-naming collisions this project hit were invisible on screen. |
| `lighthouserc.json` | Accessibility below 100, CLS above 0.005, or a third-party request — with `pessimistic` aggregation on every boolean assertion. |
