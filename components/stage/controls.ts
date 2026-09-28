/**
 * A figure control (Pause, Replay, Fly through, Reset): exactly 32px tall, the height each figure keeps for its row of
 * them, so a live figure's buttons arrive in room already kept and nothing under the figure moves
 * (tests/e2e/steady.spec.ts). A press shrinks it a little; the border darkens under a pointer.
 */
export const CONTROL =
  'text-meta inline-flex h-8 items-center justify-center rounded-sm border border-graphite px-2.5 font-mono whitespace-nowrap text-ink transition-[border-color,scale] duration-150 ease-out hover:border-ink active:scale-[0.97]'
