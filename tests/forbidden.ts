/**
 * Phrases that are unsupportable anywhere on this site, with the reason each
 * was banned. One list, read by both gates: tests/copy.test.ts scans source
 * with comments stripped, tests/e2e/copy.spec.ts scans what a reader actually
 * receives. They used to keep separate copies, and the rendered-output copy
 * had quietly fallen five patterns behind.
 */
export const FORBIDDEN: readonly (readonly [RegExp, string])[] = [
  [/real money/i, 'not supportable — no project handles customer money'],
  [/real clients/i, 'not supportable — CloseBooks has no paying customers'],
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
  [/\bvs\.?\s+(the\s+)?(SPY|S&P)|\bS&P\s?500\b/i, 'no strategy-versus-benchmark comparison'],
  [/\b(SPY|SMCI|NVDA|TSLA|AAPL|QQQ)\b/, 'no tickers'],
  [/version delta/i, 'Glacier internal system name'],
  [/worker\.py|fly\.toml|glacier_v2|WORKER_[A-Z_]+/, 'Glacier internal paths and settings'],
  [/\bDTE\b|\bOTM\b/, 'Glacier strategy parameters'],
]
