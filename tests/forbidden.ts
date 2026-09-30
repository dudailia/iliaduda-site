import { createHash, createHmac } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

/**
 * Phrases that are unsupportable anywhere on this site, with the reason each
 * was banned. One list, read by both gates: tests/copy.test.ts scans source
 * with comments stripped, tests/e2e/copy.spec.ts scans what a reader actually
 * receives. They used to keep separate copies, and the rendered-output copy
 * had quietly fallen five patterns behind.
 */
export const FORBIDDEN: readonly (readonly [RegExp, string])[] = [
  [/real money/i, 'not supportable — no project handles customer money'],
  [/real clients/i, 'no customer claims without a source'],
  [/production[- ]grade/i, 'superlative that cannot be defended'],
  [/battle[- ]tested/i, 'superlative that cannot be defended'],
  // Narrowed from /enterprise/ after it flagged "Young Enterprise UK", which is
  // the actual name of the organisation. The ban is on the self-description,
  // not on the word.
  [/\benterprise[-\s](ready|grade|class|scale)\b/i, 'superlative that cannot be defended'],
  [/state street/i, 'removed from the site entirely'],
  [/first real[- ]time/i, 'unsupportable and unfalsifiable'],
  [/1,247/, 'a fixed reference dataset, never an aggregation across firms'],
  [/automated 1099 filing/i, 'there is no IRS e-file integration'],
  [/\bhonest(y|ly)?\b/i, 'the site demonstrates this; it must never announce it'],
  [/\bpassionate\b/i, 'register'],
  [/\bworld[- ]class\b/i, 'superlative'],
  [/\bcutting[- ]edge\b/i, 'superlative'],
  [/\bseamless(ly)?\b/i, 'register'],
  [/\bbest[- ]in[- ]class\b/i, 'superlative'],

  // Positioning (2026-09-24): the site sells its subject at his strongest and
  // never undermines him. Omitting a weakness is allowed; announcing one in
  // these words is not. Truth gates above and below still apply.
  [/no paying customers/i, 'positioning: defensive'],
  [/no longer maintain/i, 'positioning: defensive'],
  [/measures nothing/i, 'positioning: defensive'],
  [/null result/i, 'positioning: a negative result is framed as the measurement it is'],
  [/lying to users/i, 'positioning: defensive'],
  [/declined to build/i, 'positioning: defensive'],
  [/not a forecast/i, 'positioning: defensive'],
  [/\bthin test suite\b|\bthe test suite is thin\b/i, 'positioning: defensive'],
  [/should not pretend/i, 'positioning: defensive'],
  [/flattering version/i, 'positioning: defensive'],

  // cricstate. Part of the design was frozen before the test split was read
  // and part was not, so the stronger word is retracted everywhere.
  [/pre-?registered|pre-?registration/i, 'retracted: the materiality bands were not frozen first'],
  [/93\s?%/, 'retracted pairing with the identity result'],

  // Trading work is described at résumé level only. No performance, no
  // benchmark comparison, no tickers, no internals — ever, on any page.
  [/\bsharpe\b/i, 'no performance metrics for any trading work'],
  // Not followed by a colon, so a WebGL option key (`alpha: false`) is code,
  // not a claim; the word in any sentence is still caught.
  [/\balpha\b(?!\s*:)/i, 'no performance metrics for any trading work'],
  [/\bmax(imum)? drawdown\b/i, 'no performance metrics for any trading work'],
  [/[+−-]\s?\d+(\.\d+)?\s?%\s+(total\s+)?returns?\b/i, 'no returns for any trading work'],
  [/\bvs\.?\s+(the\s+)?S&P|\bS&P\s?500\b/i, 'no strategy-versus-benchmark comparison'],
  [/\b[A-Z]+_[A-Z_]+=|\benv(ironment)? var(iable)?s?\b/, 'no environment settings of any trading work'],

  // No phone number on the site, but the owner's on /cv (ALLOWED_PHONE, below).
  [/\+\d[\d\s().-]{8,}\d|\(\d{3}\)\s?\d{3}[\s.-]\d{4}\b/, 'no phone number on the public site'],
  // The owner's call (2026-09-30): no grade point average anywhere.
  [/\bGPA\b|grade point average/i, 'no GPA on the site'],
]

/**
 * Words the trading work must never show (its internal names, paths, parameters and instruments), kept here only as
 * SHA-256 digests (the first 24 hex digits): a public list of what must stay private would publish it. Every word and
 * every pair of adjacent words of a text is hashed and looked up, lower-cased, so the gate is as strict as a pattern.
 */
const WITHHELD = new Set([
  '34da9e97f85556a74e2f1a48',
  'ef0ecc97a9e678e23ad77ea3',
  '660f7078dc0b381a350960ea',
  'c09ba16f44fd78506bd35fdb',
  '76e4952ce4de5226bdeb05a9',
  'a709ab3e88f5f3fa43f3094f',
  '57d4aa377250296d19d9f55f',
  '2bd5cad708abec6f1cb5698c',
  '3067ff6517b69abd1db7dbd4',
  '35da52e03109190fb247b712',
  '199dc38e1a4d3008afbe8de8',
  'a95bc16631ae2b6fadb455ee',
])

/**
 * The same words as keyed digests: HMAC-SHA-256 under WITHHELD_KEY, the first 32 hex digits. Without the key no
 * dictionary recovers them, which an unkeyed digest does not promise. The key is a GitHub Actions secret in CI and a
 * gitignored file (.withheld-key) on the owner's machine; the owner fills this list with scripts/withheld-digest.mjs,
 * and once it holds every word the unkeyed list above goes. With keyed digests listed and no key, the gate fails
 * rather than passing unchecked.
 */
const WITHHELD_KEYED = new Set<string>([])
function withheldKey(): string | null {
  const env = process.env.WITHHELD_KEY?.trim()
  if (env) return env
  return existsSync('.withheld-key') ? readFileSync('.withheld-key', 'utf8').trim() || null : null
}
const KEY = WITHHELD_KEYED.size ? withheldKey() : null
if (WITHHELD_KEYED.size && !KEY) throw new Error('tests/forbidden.ts: WITHHELD_KEY is not set (a GitHub Actions secret in CI, .withheld-key locally)')

/** The withheld words a text contains, as their digests (never the words themselves). */
export function withheld(text: string): string[] {
  const words = (text.toLowerCase().match(/[a-z0-9_.&]+/g) ?? []).map((w) => w.replace(/^\.+|\.+$/g, '')).filter(Boolean)
  const hits: string[] = []
  const check = (t: string) => {
    const d = createHash('sha256').update(t).digest('hex').slice(0, 24)
    if (WITHHELD.has(d)) hits.push(d)
    if (KEY) {
      const k = createHmac('sha256', KEY).update(t).digest('hex').slice(0, 32)
      if (WITHHELD_KEYED.has(k)) hits.push(k)
    }
  }
  words.forEach((w, i) => {
    check(w)
    if (i > 0) check(`${words[i - 1]} ${w}`)
  })
  return hits
}

/**
 * The one phone number the site may show: the owner's, on /cv (and so in the PDF printed from it), and where it is
 * written down (lib/site.ts, as its label and its tel: link). Anywhere else, the phone ban above still fails it.
 */
export const ALLOWED_PHONE = {
  forms: ['(617) 918-3964', '+16179183964'],
  routes: ['/cv'],
  files: ['lib/site.ts'],
} as const

/** The text a ban is checked against, where `where` is a route or a repo-relative file: the allowed number taken out
 *  only where it is allowed. */
export function allowPhone(text: string, where: string): string {
  const here = (ALLOWED_PHONE.routes as readonly string[]).includes(where) || (ALLOWED_PHONE.files as readonly string[]).includes(where)
  return here ? ALLOWED_PHONE.forms.reduce((t, f) => t.split(f).join(''), text) : text
}
