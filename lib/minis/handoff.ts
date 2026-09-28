/**
 * A miniature hands its market's simulated time to the paper it opens (the Contents' market and order-book minis), so
 * the paper's figure goes on from the moment the reader saw: the market is deterministic, so the paper runs the same
 * seeded market to that moment and carries on. Kept for the visit's next page only: a stale or foreign one is ignored.
 */
const KEY = 'mini-handoff'
/** How long a hand-off waits for its page, ms, and the furthest past the figure's own moment it may take it, seconds. */
const FRESH = 15_000
const REACH = 600

export function handOff(slug: string, t: number, now = Date.now()): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ slug, t, at: now }))
  } catch {}
}

/** The time handed to `slug`'s figure, if fresh: never before `from` (its own moment), nor more than ten minutes on. */
export function handedTo(slug: string, from: number, now = Date.now()): number | null {
  try {
    const h = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { slug?: unknown; t?: unknown; at?: unknown } | null
    if (!h || h.slug !== slug || typeof h.t !== 'number' || typeof h.at !== 'number' || !(now - h.at < FRESH && now >= h.at)) return null
    return Math.min(from + REACH, Math.max(from, h.t))
  } catch {
    return null
  }
}

/** Spent: the page has taken it. */
export function spend(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {}
}
