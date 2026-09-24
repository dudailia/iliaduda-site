/**
 * Experience and education, worded from the September 2026 résumé, which wins
 * wherever sources disagree. Shared by the home page (brief) and /about (full).
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
  /** Set when a bullet still needs the owner's sign-off before production. */
  readonly draft?: string
  readonly href?: string
}

export const roles: readonly Role[] = [
  {
    id: 'glacier',
    org: 'Glacier Capital Systems',
    orgNote: 'proprietary options trading firm',
    title: 'Quantitative Software Engineer',
    place: 'Remote',
    dates: 'January 2026 – present',
    brief: 'Python research tooling and a real-time internal dashboard for the trading desk.',
    detail: [
      'Sole software engineer. I build the firm’s Python research tooling and a real-time internal dashboard used in daily trading.',
      'Stack: Python, TypeScript, Next.js and PostgreSQL (Supabase), deployed on Vercel and Fly.io.',
      'Work spans data pipelines, validation, and the alerting path from research output to the trader’s screen.',
    ],
    draft:
      'TODO(owner): sign off these bullets. Borderline: “sole”, “used in daily trading”, the hosting providers, “alerting”.',
  },
  {
    id: 'debt-portal',
    org: 'Debt-settlement portal',
    orgNote: 'licensed Russian collection agency',
    title: 'Sole Developer and Project Lead',
    place: 'Remote',
    dates: 'July 2026 – present',
    brief: 'Debt lookup, a settlement calculator, SMS authentication and card and SBP payment, built to Russian federal law.',
    detail: [
      'Sole developer of a consumer debt-settlement portal covering debt lookup, a settlement calculator, SMS authentication and card and SBP payment.',
      'Architecture is set by statute: data localisation rules out foreign hosting and CDNs, and the contact-frequency cap means the login SMS itself can consume a debtor’s statutory allowance.',
    ],
    href: '/debt-portal',
  },
  {
    id: 'closebooks',
    org: 'CloseBooks',
    orgNote: 'month-end close for accounting firms',
    title: 'Founder',
    dates: 'January 2026 – present',
    brief: 'Month-end close automation on Next.js, Supabase, Stripe, the Anthropic API and QuickBooks.',
    detail: [
      'Month-end close automation for accounting firms on Next.js, Supabase, Stripe, the Anthropic API and a QuickBooks integration.',
      'Deployed and publicly reachable, with billing wired end to end in Stripe test mode and no paying customers yet.',
    ],
    href: '/closebooks',
  },
  {
    id: 'bcs',
    org: 'BCS Bank',
    orgNote: 'Investment Banking Division',
    title: 'Investment Banking Intern',
    place: 'Moscow',
    dates: 'July – August 2023',
    brief: 'OFZ government bond briefings and DCF models in Excel for deal teams.',
    detail: [
      'Wrote OFZ government bond briefings and built DCF models in Excel for deal teams working to deadline, with materials prepared for internal review.',
    ],
  },
  {
    id: 'monito',
    org: 'Monito',
    orgNote: 'Young Enterprise UK',
    title: 'Co-Founder and Financial Director',
    place: 'UK',
    dates: '2022 – 2023',
    brief: 'UK National Company of the Year, and on to the European Finals.',
    detail: [
      'Won UK National Company of the Year and went on to the European Finals.',
      'Owned the budget and the financial reporting, and presented results to competition judges and public audiences.',
    ],
  },
]

export const education = {
  school: 'Northeastern University, College of Science',
  degree: 'B.S. Mathematics and Business Administration, concentration in Fintech',
  dates: 'Expected May 2028',
  honours: 'Dean’s List, Autumn 2025',
  coursework: [
    'Statistics and Stochastic Processes',
    'Fourier Series and Partial Differential Equations',
    'Probability and Statistics',
    'Linear Algebra',
    'Computational Methods in Finance',
    'Investments',
    'Theory of Interest and Life Insurance (in progress)',
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

export const languages = 'English and Russian, both fluent.'
