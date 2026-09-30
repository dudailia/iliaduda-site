# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: recruiters and hiring teams for finance co-ops — quant/risk, investments and asset management, investment banking, and data science in finance. They skim dozens of candidate sites, usually arriving from a résumé link, LinkedIn or an email, and give the first screen about thirty seconds. Secondary: the engineers or quants they forward a link to, who will open the repository and check whether the claims hold.

## Product Purpose

Ilia Duda's online résumé and portfolio. It exists to get him a six-month co-op starting January 2027. Success is a recruiter knowing within one screen who he is, what he is looking for and when, and how to reach him — and a technical reader finding that every number on the site survives being checked.

## Positioning

The site reads as a working paper whose figures are alive: each project is a short paper with one real, interactive figure, and every sourced number on it carries a citation to the file it came from (`content/facts.ts`, enforced by tests); everything else is computed on the page from the model it describes. A neighbouring portfolio can copy the look; it cannot copy numbers that come with provenance.

## Operating Context

- Owner: Ilia Duda, Northeastern University, B.S. Mathematics and Business Administration, expected May 2028. Base: Boston, MA.
- Availability (confirmed 2026-09-24): open to a 6-month co-op from January 2027; open on location — Boston, New York, San Francisco or London.
- Target roles: quant/risk, investments/asset management, investment banking, data science in finance.
- Contact: duda.i@northeastern.edu · linkedin.com/in/ilia-duda · github.com/dudailia.
- Deployed on Vercel (project `iliaduda-site`, Git integration). `iliaduda.com` is the intended domain; it does not resolve yet.
- Links are pasted into email, so figure anchors and routes are permanent.

## Capabilities and Constraints

- Next.js 16 App Router, React 19, Tailwind 4, TypeScript strict. Hand-authored SVG figures; no chart library.
- Hard budgets: mobile Lighthouse performance ≥ 90; accessibility 100; zero third-party requests; total transfer per page within its budget (home 275,000 B; /market 335,000 B; /order-book and /iv-surface 300,000 B; every other page 261,000 B; fonts 76,000 B a page, 87,000 B where the Greek-and-maths supplement is fetched; set by the owner, 2026-09-28, and held by `lighthouserc*.json`); CLS ≤ 0.01. WebGL must be lazy-loaded, paused off-screen, with a static fallback; `prefers-reduced-motion` means static figures.
- Strict CSP (`script-src 'self' 'unsafe-inline'`, no `blob:`, no eval, `connect-src 'self'`).
- Glacier Capital Systems (proprietary options trading firm; Quantitative Analyst and Engineer, remote, Jan 2026 – present) is described at the level the owner cleared on 2026-09-30: the tools he builds that automate the traders' investment workflows, the real-time dashboards, the analysis and research tooling, and the stack. Never strategies, parameters, data, code, internal names/paths, env vars, test counts, performance numbers, returns, Sharpe, tickers or strategy-vs-benchmark charts.
- Never invent metrics, clients, users or results. Missing facts ship as visible TODO placeholders and are listed for the owner.
- When sources conflict, the September 2026 résumé wins and the conflict is listed.
- Nothing paid is enabled. Vercel Web Analytics (free, cookieless, served from the site's own origin) counts visits on production, by the owner's decision of 2026-09-29.

## Brand Commitments

- Keep and elevate the incumbent identity: the site reads like a research paper — serif text, figures labelled "Fig. N", limitation notes in the margin beside the claim they qualify.
- Positioning (confirmed 2026-09-24): the site sells Ilia to top quant, trading and investment firms. Every statement true, framed at its strongest: lead with what he built, the hard problems solved and the depth it proves. No self-undermining or defensive lines; omitting a weakness is fine, inventing a strength is not. Limits appear only where a sharp reader expects them (e.g. synthetic data), phrased as rigour. Unconfirmed users, customers, revenue, returns or results are never claimed — TODO and ask.
- Indigo appears only inside figures and marks the value being claimed.
- One orchestrated motion moment per page (its Fig. 1's signature, once per visit); everything else is calm.
- The site demonstrates rigour; it never announces it (the word "honest" is banned by test).

## Evidence on Hand

- Sourced facts for cricstate, CloseBooks, the debt-settlement portal, AdConfirm, startup-investment analysis and nucarbon in `content/facts.ts`.
- The owner's own résumé, which is not publishable as it stands (it carries detail the site keeps private, and a phone number). The site's résumé PDF is printed from /cv at build time.
- Public repos: github.com/dudailia/cricstate, closebooks-app, startup-investment-analysis, nucarbon.
- Headshot: supplied by the owner (public/).
- Other client work awaits the owner's sign-off before publication.
- Absent, must not be fabricated: customer or revenue numbers for any project, any figure from the trading work.

## Product Principles

1. Hiring essentials first: name, positioning, availability, résumé and contact are above the fold on every screen size.
2. Every number has provenance; synthetic data is labelled synthetic where it is shown.
3. Figures are real and interactive, and respond to the reader rather than performing at them. The exceptions are each page's live Fig. 1 (the home figure, /market's one market, the order book, the IV surface): each opens with one signature moment per visit and then stays alive at rest (its data moving, the view drifting and leaning with the reader), with a Pause.
4. Confidentiality outranks impressiveness.
5. Fast and accessible is part of the argument, and it is measured, not asserted.

## Accessibility & Inclusion

WCAG 2.1 AA minimum, gated at Lighthouse accessibility 100: visible focus, 4.5:1 text contrast in both themes, keyboard-operable figures with prose descriptions of their values, one h1 and ordered headings, reduced motion honoured.
