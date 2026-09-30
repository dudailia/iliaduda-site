import { rule } from '@/content/rules'

/**
 * CloseBooks' categorisation rules, ported for the live figure. What the model
 * returns is synthetic here; what happens to it afterwards is the shipped
 * logic, rule for rule:
 *
 *   calibrateConfidence  closebooks-app src/lib/categorize.ts:109-126
 *   resolveAgainstCoa    closebooks-app src/lib/coaValidation.ts:40-89
 *
 * The model's stated confidence is an input to be corrected, not an answer:
 * it is taken down for small amounts and capped for descriptions too short to
 * carry information; then the suggested account is resolved against the
 * client's own chart, and a suggestion that does not resolve, or that posts a
 * debit to revenue or a credit to expense, is capped below the approval
 * threshold whatever the model claimed.
 */

export type AccountType = 'revenue' | 'expense' | 'asset' | 'liability' | 'equity'
export interface Account {
  readonly code: string
  readonly name: string
  readonly type: AccountType
}

export interface Line {
  readonly date: string
  readonly description: string
  readonly amount: number
  readonly type: 'debit' | 'credit'
  /** What the model suggested, and how sure it said it was. Synthetic. */
  readonly suggested: { readonly code: string; readonly name: string }
  readonly stated: number
}

export type Status = 'approved' | 'pending' | 'flagged'

export interface Step {
  readonly why: string
  readonly to: number
}

export interface Result {
  readonly steps: readonly Step[]
  readonly confidence: number
  readonly status: Status
  readonly account: Account | null
}

const norm = (s: string) =>
  s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim()

function tooShort(description: string): boolean {
  const d = description.trim()
  return d.split(/\s+/).length <= 1 || /^\d+$/.test(d) || d.length <= 4
}

export function categorise(line: Line, chart: readonly Account[]): Result {
  const steps: Step[] = []
  let c = Math.min(1, Math.max(0, line.stated))

  if (line.amount < rule('cbSmallAmount')) {
    c -= rule('cbSmallPenalty')
    steps.push({ why: `under $${rule('cbSmallAmount')}`, to: c })
  }
  if (tooShort(line.description) && c > rule('cbShortCap')) {
    c = rule('cbShortCap')
    steps.push({ why: 'description too short', to: c })
  }
  c = Math.min(1, Math.max(0, c))

  const byCode = chart.find((a) => norm(a.code) === norm(line.suggested.code))
  const account = byCode ?? chart.find((a) => norm(a.name) === norm(line.suggested.name)) ?? null

  if (!account) {
    c = Math.min(c, rule('cbUnknownCap'))
    steps.push({ why: `${line.suggested.code} is not in this client’s chart`, to: c })
    return { steps, confidence: c, status: 'flagged', account: null }
  }

  let flagged = false
  const wrongWay =
    (line.type === 'debit' && account.type === 'revenue') || (line.type === 'credit' && account.type === 'expense')
  if (wrongWay) {
    c = Math.min(c, rule('cbDirectionCap'))
    flagged = true
    steps.push({ why: `${line.type} to ${/^[aeiou]/.test(account.type) ? 'an' : 'a'} ${account.type} account`, to: c })
  }

  const status: Status = !flagged && c >= rule('cbThreshold') ? 'approved' : 'pending'
  return { steps, confidence: c, status, account }
}

/** The export gate: only approved or human-edited rows whose account is in the chart. */
export function exportable(status: Status | 'edited', account: Account | null): boolean {
  return (status === 'approved' || status === 'edited') && account !== null
}
