import type { Page } from '@playwright/test'

/**
 * Whether a figure's story (its `data-seq`) reaches 'done' before both `ms` of wall time and `frames` of the page's
 * frames have passed. A story's clock moves only on drawn frames, at most 100ms a frame (components/stage/useStage.ts),
 * so on a shared CI runner, where WebKit draws WebGL slowly, it takes longer in seconds but never in frames: a story of
 * S ms ends within S / 100 drawn frames however slow they are, and within S ms at a display's rate. A fixed window in
 * seconds alone failed there (the home figure twice on main, the IV surface on a PR touching neither); a story that
 * stalls still fails this.
 */
export const storyEnds = (page: Page, stage: string, frames: number, ms = 15_000) =>
  page.evaluate(
    ({ stage, frames, ms }) =>
      new Promise<boolean>((res) => {
        const el = document.querySelector(stage)
        if (!el) return res(false)
        const t0 = performance.now()
        let n = 0
        const step = () => {
          if (el.getAttribute('data-seq') === 'done') return res(true)
          if (++n > frames && performance.now() - t0 > ms) return res(false)
          requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }),
    { stage, frames, ms },
  )
