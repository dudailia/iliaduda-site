/**
 * Experience and education, worded from the owner's current résumé
 * (Ilia_Duda_Resume-3, supplied 2026-09-24), which wins wherever sources
 * disagree — except where it carries Glacier internals, which stay off. Shared by the home page (brief) and /about (full).
 *
 * Glacier Capital Systems is a proprietary trading firm and appears at résumé
 * level only: title, dates, what is built and the stack. No strategies,
 * parameters, data, internal names, test counts or performance numbers — and
 * tests/copy.test.ts fails the build on the obvious ways that could slip in.
 */

export interface Role {
  readonly id: string
  readonly org: string
  /** What the organisation is, in a few words, for a reader who has not heard of it. */
  readonly orgNote: string
  readonly title: string
  readonly place?: string
  readonly dates: string
  /** One sentence for the home page. */
  readonly brief: string
  /** Résumé-level bullets for /about. */
  readonly detail: readonly string[]
  /** The same facts cut to fit one printed page, for /cv. Falls back to detail. */
  readonly cv?: readonly string[]
  /** Set when a bullet still needs the owner's sign-off before production. */
  readonly draft?: string
  /** The paper this role is written up in. */
  readonly href?: string
  /** A figure on /about that belongs to this role. */
  readonly figure?: string
}

export const roles: readonly Role[] = [
  {
    id: 'glacier',
    org: 'Glacier Capital Systems',
    orgNote: 'proprietary options trading firm',
    title: 'Quantitative Analyst and Engineer',
    place: 'Remote',
    dates: 'January 2026 – present',
    brief: 'Sole engineer on the firm’s Python research stack for options, and the real-time dashboard that puts its output in front of the trader.',
    detail: [
      'Sole engineer on the firm’s Python research stack for options: volatility modelling, options-chain analysis, candidate scoring and market scanning.',
      'Built a trade-validation service in Python and TypeScript that checks a proposed trade against the firm’s written rules and returns a verdict with its reasoning.',
      'Built the real-time alert dashboard — Next.js on Vercel, Supabase, and a Python worker on Fly.io — replacing a cron-and-email pipeline, and moved strategy configuration out of code so non-engineers can tune it without a deploy.',
    ],
    cv: [
      'Sole engineer on the firm’s Python research stack for options: volatility modelling, options-chain analysis, candidate scoring and market scanning.',
      'Built a trade-validation service in Python and TypeScript that checks a proposed trade against the firm’s written rules and returns a verdict with its reasoning.',
      'Built the real-time alert dashboard (Next.js, Supabase, a Python worker on Fly.io) that replaced a cron-and-email pipeline; moved strategy configuration out of code.',
    ],
  },
  {
    id: 'debt-portal',
    org: 'Debt-settlement portal',
    orgNote: 'licensed Russian collection agency',
    title: 'Sole Developer and Project Lead',
    place: 'Remote',
    dates: 'July 2026 – present',
    brief: 'Built a regulated consumer product end to end: debt lookup, a settlement calculator, SMS authentication and card and SBP payment, under 152-FZ and 230-FZ.',
    detail: [
      'Only developer on a self-service debt-settlement portal for a licensed collection organisation: debt lookup, a settlement calculator, SMS authentication, and card and SBP payment.',
      'Architecture set by statute: 152-FZ data localisation rules out foreign hosting and CDNs, and the 230-FZ contact cap means the login SMS itself spends part of a debtor’s legal allowance, so the limits are enforced in code.',
      'Next.js 16 with Turbopack and Tailwind 4, hosted on Yandex Cloud.',
    ],
    cv: [
      'Only developer, end to end: debt lookup, a settlement calculator in integer kopecks, SMS authentication.',
      'Built to 152-FZ data localisation and the 230-FZ contact cap, enforced in code and by build gates; Next.js 16, Yandex Cloud.',
    ],
    href: '/debt-portal',
  },
  {
    id: 'closebooks',
    org: 'CloseBooks',
    orgNote: 'month-end close for accounting firms',
    title: 'Founder',
    dates: 'January 2026 – present',
    brief: 'Built and deployed a multi-tenant month-end close product for CPA firms on my own, with an AI categorisation pipeline on the Claude API.',
    detail: [
      'Built and deployed a multi-tenant month-end close product for CPA firms on my own: Next.js and TypeScript, Supabase Postgres with row-level security, and Stripe billing across three subscription tiers.',
      'Wrote the categorisation pipeline on the Anthropic Claude API: it parses bank statements from CSV and PDF, maps each line to the client’s chart of accounts with a confidence score, and routes low-confidence rows to an exception queue for a human to approve.',
      'Gated export behind chart-of-accounts validation, so a suggested account that does not resolve against the client’s chart cannot leave the system.',
    ],
    cv: [
      'Built and deployed alone a multi-tenant month-end close for CPA firms: Next.js, TypeScript, Supabase Postgres with row-level security, Stripe billing in three tiers.',
      'Categorisation pipeline on the Claude API: parses CSV and PDF bank statements and maps each line to the client’s chart of accounts with a confidence score; low-confidence rows go to a human.',
    ],
    href: '/closebooks',
  },
  {
    id: 'adconfirm',
    org: 'AdConfirm',
    orgNote: 'advertising inside invoices and receipts',
    title: 'Co-Founder',
    dates: 'May 2026 – present',
    brief: 'Co-founded a product placing ads inside invoices and receipts, with metered billing and Stripe Connect payouts.',
    detail: [
      'Co-founded a product placing ads inside invoices and receipts, with metered billing and Stripe Connect payouts to the businesses hosting the placements.',
      'Built eight accounting and point-of-sale integrations onto one invoice type, and a billing ledger in millicents so a fifth-of-a-penny impression is exact.',
    ],
    cv: [
      'Co-founded a product placing ads inside invoices and receipts; built eight accounting and point-of-sale integrations onto one invoice type, a millicent billing ledger and Stripe Connect payouts.',
    ],
    href: '/adconfirm',
  },
  {
    id: 'bcs',
    org: 'BCS Bank',
    orgNote: 'Investment Banking Division',
    title: 'Investment Banking Intern',
    place: 'Moscow',
    dates: 'July – August 2023',
    brief: 'Covered Russian energy, metals and banking; built DCF, comparable-company and sensitivity models; wrote daily briefings on government bonds through two rate hikes.',
    detail: [
      'Covered the Russian energy, metals and banking sectors.',
      'Built DCF, comparable-company and sensitivity models.',
      'Wrote daily market briefings on OFZ government bond movements, index activity and Bank of Russia policy, through two key-rate increases in five weeks.',
    ],
    cv: [
      'Covered Russian energy, metals and banking; built DCF, comparable-company and sensitivity models.',
      'Wrote daily briefings on OFZ, index activity and Bank of Russia policy through two rate rises in five weeks.',
    ],
    figure: '/about#fig-ofz-curve',
  },
  {
    id: 'monito',
    org: 'Monito',
    orgNote: 'Young Enterprise UK',
    title: 'Co-Founder and Financial Director',
    place: 'UK',
    dates: '2022 – 2023',
    brief: 'Won UK National Company of the Year and reached the European Finals.',
    detail: [
      'Won UK National Company of the Year and reached the European Finals.',
      'Owned the budget and the financial reporting as financial director.',
    ],
    cv: [
      'Won UK National Company of the Year and reached the European Finals.',
    ],
  },
]

export const education = {
  school: 'Northeastern University, College of Science',
  degree: 'B.S. Mathematics and Business Administration, Fintech concentration',
  dates: 'Expected May 2028',
  honours: 'Dean’s List, Fall 2025',
  coursework: [
    'MATH 4581 Statistics and Stochastic Processes',
    'MATH 3081 Probability and Statistics',
    'MATH 2331 Linear Algebra',
    'MATH 4545 Fourier Series and Partial Differential Equations',
    'FINA 4335 Computational Methods in Finance',
    'FINA 3303 Investments',
    'FINA 2730 Fintech',
    'ACCT 1201 Financial Accounting',
  ],
  school2: 'Bromsgrove School and The King’s School, Canterbury',
  school2Note: 'A-Levels including Further Mathematics',
} as const

export const certifications = [
  'Anthropic — Claude Code in Action',
  'DataCamp — AI Engineer for Data Scientists Associate',
  'IBM — Generative AI in Action',
  'Yandex Practicum — Data analytics',
] as const

/**
 * Monito's competition, round by round, from the timeline on the owner's
 * earlier site. Each round is won to reach the next.
 */
export const monitoRounds = [
  { round: 'Worcestershire and Warwickshire', result: 'Regional award', date: 'January 2023' },
  { round: 'West Midlands', result: 'Company of the Year', date: 'March 2023' },
  { round: 'United Kingdom', result: 'National Company of the Year', date: 'May 2023' },
  { round: 'Europe', result: 'European Finals', date: 'July 2023' },
] as const

/** Skills as on the résumé, for /about and /cv. */
export const SKILLS = [
  [
    'Quantitative',
    'Options pricing and Black–Scholes, Greeks, volatility surface modelling, calibration, temporal cross-validation, bootstrap confidence intervals, hypothesis testing, Fama–French and CAPM regression.',
  ],
  [
    'Languages',
    'Python (pandas, NumPy, SciPy, scikit-learn, PyTorch), TypeScript, JavaScript, SQL. English and Russian, both fluent.',
  ],
  [
    'Platforms',
    'Next.js, React, Supabase (Postgres, Auth, Realtime), Vercel, Fly.io, Stripe, Yandex Cloud, Tailwind, Git, Jupyter; the Anthropic Claude API and LLM pipelines.',
  ],
] as const

export const languages = 'English and Russian, both fluent.'
