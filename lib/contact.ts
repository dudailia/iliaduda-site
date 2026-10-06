import { rule } from '@/content/rules'

/**
 * The statutory contact allowance the portal's login spends, ported for the
 * live figure (portal src/lib/contact/statutory-counter.ts).
 *
 * 230-ФЗ art. 7 caps creditor-initiated electronic messages at 2 a day, 4 a
 * week and 16 a month. The portal reads "day", "week" and "month" as ROLLING
 * windows of 24 hours, 7 days and 30 days — a calendar day would allow four
 * messages in three minutes either side of midnight, and 30 days is the
 * stricter reading of a month. Whether a login code the debtor asked for
 * counts at all is unsettled; the portal ships the conservative reading, as a
 * compile-time constant: one verification episode spends one contact, and a
 * resend inside the episode spends nothing more.
 *
 * Order of checks, as shipped: a refusal of interaction (art. 8) first, then
 * every cap. When caps block a send, the figure states when the allowance
 * reopens: the moment every window is back under its cap. (The
 * portal's own lockout screen is more conservative — now plus the window —
 * which is safe for a debtor but not a time to print as "the next moment".)
 */

const HOUR = 3_600_000
export const WINDOWS = [
  { key: 'day', label: '24 hours', ms: 24 * HOUR, cap: rule('dgMessagesDay') },
  { key: 'week', label: '7 days', ms: 7 * 24 * HOUR, cap: rule('dgMessagesWeek') },
  { key: 'month', label: '30 days', ms: 30 * 24 * HOUR, cap: rule('dgMessagesMonth') },
] as const
export const EPISODE_MS = rule('dgOtpMinutes') * 60_000

export interface Allowance {
  /** When each verification episode began. */
  readonly episodes: readonly number[]
  readonly refused: boolean
}

export type Outcome =
  | { readonly ok: true; readonly spent: 0 | 1 }
  | { readonly ok: false; readonly reason: 'refused' }
  | { readonly ok: false; readonly reason: 'cap'; readonly window: (typeof WINDOWS)[number]; readonly nextAt: number }

export const used = (a: Allowance, now: number, ms: number) => a.episodes.filter((t) => t > now - ms && t <= now).length

export function requestCode(a: Allowance, now: number): { next: Allowance; outcome: Outcome } {
  if (a.refused) return { next: a, outcome: { ok: false, reason: 'refused' } }
  const open = a.episodes.at(-1)
  if (open !== undefined && now - open < EPISODE_MS) return { next: a, outcome: { ok: true, spent: 0 } }
  // Every window at its cap blocks, and each reopens when enough of its contacts have aged out to leave it under the
  // cap: its (count − cap + 1)th oldest. Counts only fall as time passes, so the allowance reopens at the latest of
  // those moments, and the window that sets it is the one that binds. (Reporting the first window at its cap named a
  // day the weekly cap still blocked, and then said "the next code can be sent" when it could not.)
  let block: { window: (typeof WINDOWS)[number]; nextAt: number } | null = null
  for (const w of WINDOWS) {
    const inWindow = a.episodes.filter((t) => t > now - w.ms && t <= now).sort((x, y) => x - y)
    if (inWindow.length < w.cap) continue
    const nextAt = inWindow[inWindow.length - w.cap]! + w.ms
    if (!block || nextAt > block.nextAt) block = { window: w, nextAt }
  }
  if (block) return { next: a, outcome: { ok: false, reason: 'cap', ...block } }
  return { next: { ...a, episodes: [...a.episodes, now] }, outcome: { ok: true, spent: 1 } }
}
