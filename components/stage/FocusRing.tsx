/**
 * The keyboard's focus ring for a stage whose canvas would paint over the
 * stage's own outline: drawn over it, as the next sibling of the stage (which
 * carries `peer`), inside a `relative` box the size of the stage. Inset on a
 * phone, where the stage runs to the screen's edges; just outside the stage
 * from the small-tablet width up, clear of the labels along its edges.
 */
export function FocusRing() {
  return <span aria-hidden className="pointer-events-none absolute inset-1 z-10 rounded-sm opacity-0 outline-2 outline-ink peer-focus-visible:opacity-100 sm:-inset-1" />
}
