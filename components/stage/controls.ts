/**
 * A figure control (Pause, Replay, Fly through, Reset): exactly 32px tall, the height each figure keeps for its row of
 * them, so a live figure's buttons arrive in room already kept and nothing under the figure moves
 * (tests/e2e/steady.spec.ts). Under a finger its target reaches 44px tall, past the box (7px beyond the padding box the
 * inset is measured from, inside the 1px border), so the row keeps its room. A
 * press shrinks it a little; the border darkens under a pointer and on a press (over 150ms), and with the keyboard's
 * focus at once: keyboard steps are never animated.
 */
export const CONTROL =
  "relative pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-[7px] pointer-coarse:before:content-[''] text-meta inline-flex h-8 items-center justify-center rounded-sm border border-graphite px-2.5 font-mono whitespace-nowrap text-ink transition-[border-color,scale] duration-150 ease-out hover:border-ink focus-visible:border-ink focus-visible:transition-[scale] active:scale-[0.97] active:border-ink"

/**
 * An option in a radio group (a treatment, a debt amount): the control's size, target and focus, but a choice changes
 * fill rather than pressing in. Selected: ink fill, paper text; where the system forces its own colors (a Windows
 * contrast theme drops the fill), a Highlight outline. A click fades the fill over 150ms; an arrow key moves it at once,
 * in both the option it leaves and the one it reaches (keyboard steps are never animated).
 */
export const option = (on: boolean) =>
  `relative pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-[7px] pointer-coarse:before:content-[''] text-meta inline-flex h-8 items-center justify-center rounded-sm border px-2.5 font-mono whitespace-nowrap transition-[border-color,background-color,color] duration-150 ease-out focus-visible:border-ink focus-visible:transition-none in-[[role=radiogroup]:has(:focus-visible)]:transition-none ${on ? 'border-ink bg-ink text-paper forced-colors:[outline:2px_solid_Highlight]' : 'border-graphite text-ink hover:border-ink'}`
