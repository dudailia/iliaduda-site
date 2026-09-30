// The owner's tool for the withheld-word gate (tests/forbidden.ts): reads words or two-word phrases from stdin, one a
// line, and prints each one's keyed digest (HMAC-SHA-256 under WITHHELD_KEY, the first 32 hex digits). It prints the
// digests only, never a word and never the key. The key comes from WITHHELD_KEY or the gitignored .withheld-key.
import { createHmac } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

const key = process.env.WITHHELD_KEY?.trim() || (existsSync('.withheld-key') ? readFileSync('.withheld-key', 'utf8').trim() : '')
if (!key) {
  console.error('No key: set WITHHELD_KEY or create .withheld-key (see tests/forbidden.ts).')
  process.exit(1)
}
const words = readFileSync(0, 'utf8')
  .split('\n')
  .map((w) => w.trim().toLowerCase().replace(/\s+/g, ' '))
  .filter(Boolean)
for (const w of words) console.log(`  '${createHmac('sha256', key).update(w).digest('hex').slice(0, 32)}',`)
