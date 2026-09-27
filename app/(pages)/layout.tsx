import { RunningHead } from '@/components/RunningHead'

/**
 * Arriving on a paper: the figure morphs out of its contents thumbnail only
 * when that is how the reader came (the contents said so, and only for this
 * figure) and the figure is on screen; otherwise its name is dropped and the
 * page simply crossfades, with no figure left hanging over it. Inline and
 * early, because pagereveal fires before the first frame.
 *
 * When the morph does play, it marks the page (data-vt-arrival): the figure
 * has just grown out of its thumbnail, finished, and a figure that then wiped
 * itself and replayed, or played its signature, would be a second entrance on
 * top of the first. So the signature marks the pre-paint script set are
 * dropped (the posters show in the morph's last frame, and the stories wait
 * for another visit), and the replaying figures read the mark and stay
 * finished; their replay buttons are still there. See lib/arrival.ts.
 *
 * Leaving: back to the contents with the figure on screen, it is the
 * thumbnail's again (components/Contents.tsx); anywhere else, it goes with the
 * page.
 */
const VT_REVEAL = `addEventListener('pagereveal',function(e){if(!e.viewTransition)return;var d=document.documentElement,want=null;try{want=sessionStorage.getItem('vt-morph');sessionStorage.removeItem('vt-morph')}catch(x){}var el=document.querySelector('[style*="view-transition-name"]');if(!el)return;var r=el.getBoundingClientRect();if(!want||el.style.viewTransitionName!==want||r.top>innerHeight*0.85||r.bottom<0){el.style.viewTransitionName='none';return}d.dataset.vtArrival='1';for(var k in d.dataset)if(/Seq$/.test(k))delete d.dataset[k]});addEventListener('pageswap',function(e){if(!e.viewTransition)return;var el=document.querySelector('[style*="view-transition-name"]');if(!el)return;var to=null;try{to=new URL(e.activation.entry.url).pathname}catch(x){}var r=el.getBoundingClientRect();if(to==='/'&&r.bottom>0&&r.top<innerHeight){try{sessionStorage.setItem('vt-back',el.style.viewTransitionName)}catch(x){}}else el.style.viewTransitionName='none'});`

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
