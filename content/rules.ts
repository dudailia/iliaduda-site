import type { Fact } from './facts'

/**
 * Rules from shipped code that a live figure runs in the browser. Kept apart
 * from facts.ts (which spreads them into the one table the gates read) so a
 * client figure imports these numbers and not every project's.
 */
export const rules = {
  // ── CloseBooks categorisation (closebooks-app @6fdbb82d) ────────────────
  cbSmallAmount: {
    value: 20,
    unit: 'none',
    label: 'amount in dollars below which confidence is reduced',
    source: 'closebooks-app @6fdbb82d — src/lib/categorize.ts:113-115, calibrateConfidence',
  },
  cbSmallPenalty: {
    value: 0.08,
    unit: 'none',
    label: 'confidence taken off a small amount',
    source: 'closebooks-app @6fdbb82d — src/lib/categorize.ts:113-115',
  },
  cbShortCap: {
    value: 0.6,
    unit: 'none',
    label: 'confidence cap for a description too short to carry information',
    source: 'closebooks-app @6fdbb82d — src/lib/categorize.ts:118-123 (one word, all digits, or four characters or fewer)',
  },
  cbUnknownCap: {
    value: 0.55,
    unit: 'none',
    label: 'confidence cap for an account not in the client’s chart',
    source: 'closebooks-app @6fdbb82d — src/lib/coaValidation.ts:57-69, coa_account_unknown',
  },
  cbDirectionCap: {
    value: 0.6,
    unit: 'none',
    label: 'confidence cap for a debit to revenue or a credit to expense',
    source: 'closebooks-app @6fdbb82d — src/lib/coaValidation.ts:33-38, 75-79, coa_direction_review',
  },
  cbThreshold: {
    value: 0.85,
    unit: 'none',
    label: 'confidence at or above which an unflagged row is approved',
    source: 'closebooks-app @6fdbb82d — src/lib/categorize.ts:9 AUTO_APPROVE_THRESHOLD; coaValidation.ts:85',
  },

  // ── 230-ФЗ art. 7 contact caps, as the portal encodes them ──────────────
  // Two separate ceilings: the statute treats a call and an electronic
  // message as different things.
  dgCallsDay: {
    value: 1,
    unit: 'count',
    label: 'calls per day',
    source: 'dg-website/src/content/ru/knowledge.ts:93 — 230-ФЗ art. 7',
  },
  dgCallsWeek: {
    value: 2,
    unit: 'count',
    label: 'calls per week',
    source: 'dg-website/src/content/ru/knowledge.ts:93 — 230-ФЗ art. 7',
  },
  dgCallsMonth: {
    value: 8,
    unit: 'count',
    label: 'calls per month',
    source: 'dg-website/src/content/ru/knowledge.ts:93 — 230-ФЗ art. 7',
  },
  dgMessagesDay: {
    value: 2,
    unit: 'count',
    label: 'messages per day',
    source: 'dg-website/src/content/ru/knowledge.ts:93 — 230-ФЗ art. 7',
  },
  dgMessagesWeek: {
    value: 4,
    unit: 'count',
    label: 'messages per week',
    source: 'dg-website/src/content/ru/knowledge.ts:93 — 230-ФЗ art. 7',
  },
  dgMessagesMonth: {
    value: 16,
    unit: 'count',
    label: 'messages per month',
    source: 'dg-website/src/content/ru/knowledge.ts:93 — 230-ФЗ art. 7',
  },

  // ── Settlement calculator mechanics (portal src/lib/settlement) ─────────
  dgOtpPerEpisode: {
    value: 1,
    unit: 'count',
    label: 'contacts one verification episode spends',
    source: 'dg-website/src/lib/contact/assumptions.ts:32 — OTP_COUNTS_AS_INTERACTION, conservative reading pending counsel',
  },
  dgOtpMinutes: {
    value: 5,
    unit: 'none',
    label: 'minutes a login code stays valid, the length of one verification episode',
    source: 'dg-website/src/adapters/fixture/otp.ts:13',
  },
} as const satisfies Record<string, Fact>

export type RuleKey = keyof typeof rules
export const rule = (k: RuleKey): number => rules[k].value
