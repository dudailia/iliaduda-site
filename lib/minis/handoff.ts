/**
 * A miniature hands its market's simulated time to the paper it opens (the Contents' market and order-book minis), so
 * the paper's figure goes on from the moment the reader saw: the market is deterministic, so the paper runs the same
 * seeded market to that moment and carries on. It is good for fifteen seconds, for that paper only, and spent when the
 * paper opens; a stale or foreign one is ignored.
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

/**
 * The pre-paint mark for a paper arrived at from its miniature: set before the first paint when a fresh hand-off for
 * `slug` waits (`data-{name}-handoff`), so the paper's still frames and readouts, which are at its own moment, wait
 * (app/globals.css) and the numbers arrive once, at the handed one; only where the figure can go live (motion welcome,
 * WebGL2 there, no save-data). The figure lifts the mark when it goes live; if it
 * never does, the mark lifts itself after six seconds and the still frames stand.
 */
export function handoffMark(name: string, slug: string): string {
  if (!/^[a-z]+$/.test(name) || !/^[a-z-]+$/.test(slug)) throw new Error('handoffMark: a lowercase name and slug')
  return `try{var h=JSON.parse(sessionStorage.getItem('${KEY}')||'null'),n=Date.now();if(h&&h.slug==='${slug}'&&n>=h.at&&n-h.at<${FRESH}&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&('WebGL2RenderingContext' in window)&&!(navigator.connection&&navigator.connection.saveData)){var r=document.documentElement;r.dataset.${name}Handoff='1';setTimeout(function(){delete r.dataset.${name}Handoff},6000)}}catch(e){}`
}
