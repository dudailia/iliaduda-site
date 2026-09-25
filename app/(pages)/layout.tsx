import { RunningHead } from '@/components/RunningHead'

/**
 * Every page except home carries the running head. Home has the masthead
 * instead, so it owns its own <main>; the route group keeps that difference in
 * one place rather than in a client-side pathname check.
 */
/**
 * Arriving on a paper through the contents view transition: if the paper's
 * figure is not on screen, the morph would fly off the bottom of the page, so
 * its name is dropped and the page simply crossfades. Inline and early, because
 * pagereveal fires before the first frame.
 */
const VT_REVEAL = `addEventListener('pagereveal',function(e){if(!e.viewTransition)return;var el=[].slice.call(document.querySelectorAll('[style*="view-transition-name"]'))[0];if(!el)return;var r=el.getBoundingClientRect();if(r.top>innerHeight*0.85||r.bottom<0){el.style.viewTransitionName='none';}});`

export default function PagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: VT_REVEAL }} />
      <RunningHead />
      <main id="main">{children}</main>
    </>
  )
}
