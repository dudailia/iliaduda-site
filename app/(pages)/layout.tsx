import { RunningHead } from '@/components/RunningHead'

/**
 * Arriving on a paper through the contents view transition: if the paper's
 * figure is not on screen, the morph would fly off the bottom of the page, so
 * its name is dropped and the page simply crossfades. Inline and early, because
 * pagereveal fires before the first frame.
 *
 * When the morph does play, it marks the page (data-vt-arrival): the figure
 * has just grown out of its thumbnail, finished, and a figure that then wiped
 * itself and replayed would be a second entrance on top of the first. The
 * replaying figures read the mark and stay finished; their replay button is
 * still there. See lib/arrival.ts.
 */
const VT_REVEAL = `addEventListener('pagereveal',function(e){if(!e.viewTransition)return;var el=[].slice.call(document.querySelectorAll('[style*="view-transition-name"]'))[0];if(!el)return;var r=el.getBoundingClientRect();if(r.top>innerHeight*0.85||r.bottom<0){el.style.viewTransitionName='none';}else{document.documentElement.dataset.vtArrival='1';}});`

/**
 * Every page except home carries the running head. Home has the masthead
 * instead, so it owns its own <main>; the route group keeps that difference in
 * one place rather than in a client-side pathname check.
 */
export default function PagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: VT_REVEAL }} />
      <RunningHead />
      <main id="main">{children}</main>
    </>
  )
}
