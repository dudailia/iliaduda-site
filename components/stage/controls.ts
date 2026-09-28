/**
 * A figure control (Pause, Replay, Fly through, Reset): exactly 32px tall, the height each figure keeps for its row of
 * them, so a live figure's buttons arrive in room already kept and nothing under the figure moves
 * (tests/e2e/steady.spec.ts). Under a finger its target reaches 44px tall, past the box, so the row keeps its room. A
 * press shrinks it a little; the border darkens under a pointer.
 */
export const CONTROL =
  "relative pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-1.5 pointer-coarse:before:content-[''] text-meta inline-flex h-8 items-center justify-center rounded-sm border border-graphite px-2.5 font-mono whitespace-nowrap text-ink transition-[border-color,scale] duration-150 ease-out hover:border-ink active:scale-[0.97]"
