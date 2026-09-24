/**
 * Who, where, how to reach, and at what URL. The masthead, running head,
 * footer, metadata, JSON-LD, sitemap and robots all read from here, so the
 * availability line cannot say one thing in the header and another in the
 * structured data.
 */

export const PERSON = {
  name: 'Ilia Duda',
  base: 'Boston, MA',
  school: 'Northeastern University',
  degree: 'B.S. Mathematics and Business Administration',
  graduation: 'May 2028',
  email: 'duda.i@northeastern.edu',
  linkedin: 'https://www.linkedin.com/in/ilia-duda',
  github: 'https://github.com/dudailia',
} as const

export const AVAILABILITY = {
  line: 'Open to a 6-month co-op from January 2027',
  roles: ['Quant and risk', 'Investments', 'Investment banking', 'Data science in finance'],
  locations: ['Boston', 'New York', 'San Francisco', 'London'],
} as const

/** One line, used by the masthead and the metadata description. */
export const POSITIONING =
  'Mathematics and Business Administration at Northeastern, class of 2028. I work on quantitative finance and the systems around it: research stacks, market tooling and applied LLM infrastructure.'

/**
 * The résumé is linked only once the file exists. A portfolio whose résumé
 * link 404s makes the reader's argument for them, so until the PDF is in
 * public/ the link goes to the CV section on /about and says so.
 */
export const RESUME = {
  pdf: '/ilia-duda-resume.pdf',
  // TODO(owner): set to true when public/ilia-duda-resume.pdf is supplied.
  published: false,
  fallback: '/about#cv',
} as const

export const resumeLink = RESUME.published
  ? { href: RESUME.pdf, label: 'Résumé (PDF)' }
  : { href: RESUME.fallback, label: 'CV' }

/**
 * The canonical origin, resolved without any project setting or env var of our
 * own. Vercel exposes VERCEL_PROJECT_PRODUCTION_URL on every deployment: it is
 * the production domain — the vercel.app host today, iliaduda.com once that
 * domain is attached — so canonical URLs switch over by themselves.
 *
 * `origin` is where this particular build is served from. On a preview it is
 * the preview URL, so Open Graph images resolve on the deployment being shared
 * rather than pointing at a production that does not have them yet.
 */
function https(host: string | undefined): string | undefined {
  return host ? `https://${host}` : undefined
}

const production = https(process.env.VERCEL_PROJECT_PRODUCTION_URL)
const deployment =
  process.env.VERCEL_ENV === 'preview' ? https(process.env.VERCEL_URL) : undefined

export const SITE = {
  canonical: production ?? 'http://localhost:3000',
  origin: deployment ?? production ?? 'http://localhost:3000',
  /** Previews render pending work; production never does. */
  isProduction: process.env.VERCEL_ENV === 'production',
} as const
