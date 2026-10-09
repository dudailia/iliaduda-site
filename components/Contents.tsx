import { otherWork, visiblePapers } from '@/content/papers'
import { roles } from '@/content/experience'
import { SITE } from '@/lib/site'
import { TitleText } from './CaseStudy'
import { Items, Row, TAP, Whole } from './Layout'
import { PaperThumb } from './PaperThumb'
import { ContentsLive } from './thumbs/ContentsLive'

/**
 * The issue's table of contents. Deliberately a typeset list separated by
 * rules, not a card grid: identical rounded cards would flatten very
 * different pieces of work into identical rectangles, and a contents page is
 * the form this site's readers already know how to scan.
 *
 * Each entry leads with its title and its claim. The byline under it is the
 * résumé line — role and dates — because that is what a recruiter is matching
 * against.
 */

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-meta font-mono font-normal tracking-normal text-ink">
      {children}
    </h2>
  )
}

/**
 * The morph, from this side. Opening a paper names its thumbnail (and says so, for the paper's page to check: only a
 * morph that really happened counts as one); a click that opens a new tab or window names nothing, nor one on a phone,
 * upright or sideways (under 640px wide or 480px tall), where the paper comes in by a plain crossfade. Coming back from a
 * paper, the thumbnail it came from takes the figure's name for that one transition, so the figure shrinks back into
 * it: brought on screen first if the page landed away from it (the running head's link to /#contents lands on the
 * heading, and papers 5–7 sat below the fold, never morphing back); a page restored from the back-forward cache drops
 * any name a click left behind.
 */
const VT_CLICK = `document.addEventListener('click',function(e){if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var a=e.target.closest&&e.target.closest('[data-vt-contents] a[href]');if(!a)return;var li=a.closest('li');var t=li&&li.querySelector('[data-vt-thumb]');if(!t||!t.offsetWidth||innerWidth<640||innerHeight<480)return;t.style.viewTransitionName=t.dataset.vtThumb;t.style.viewTransitionClass='figure';try{sessionStorage.setItem('vt-morph',t.dataset.vtThumb)}catch(x){}},true);var back=null;addEventListener('pagereveal',function(e){var n=null;try{n=sessionStorage.getItem('vt-back');sessionStorage.removeItem('vt-back')}catch(x){}if(!e.viewTransition||!n)return;var t=document.querySelector('[data-vt-thumb="'+n+'"]');if(!t||!t.offsetWidth)return;var r=t.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight){t.scrollIntoView({block:'nearest',behavior:'instant'});r=t.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return}t.style.viewTransitionName=n;t.style.viewTransitionClass='figure';back=t;e.viewTransition.finished.then(function(){if(back===t){t.style.viewTransitionName='';back=null}})});addEventListener('pageshow',function(e){if(!e.persisted)return;document.querySelectorAll('[data-vt-thumb]').forEach(function(t){if(t!==back)t.style.viewTransitionName='';});});`

export function Contents() {
  const papers = visiblePapers(SITE.isProduction)
  return (
    <section aria-labelledby="contents" className="mt-16 lg:mt-24">
      {/* Opening a paper names only its own thumbnail for the view
          transition; every other thumbnail stays out of it. */}
      <script dangerouslySetInnerHTML={{ __html: VT_CLICK }} />
      <Row
        rail={
          <>
            <SectionHeading id="contents">Contents</SectionHeading>
            <ContentsLive />
          </>
        }
      >
        <ol role="list" className="grid list-none border-t border-rule" data-vt-contents>
          {papers.map((p) => (
            <li
              key={p.slug}
              // A phone reads the title, the byline, the figure (the column's width) and then its line; from sm the
              // figure sits beside the text, as a paper's does.
              className="grid grid-cols-1 gap-x-6 border-b border-rule py-6 print:break-inside-avoid [grid-template-areas:'title'_'byline'_'thumb'_'dek'] sm:grid-cols-[minmax(0,1fr)_9rem] sm:grid-rows-[auto_auto_1fr] sm:[grid-template-areas:'title_thumb'_'byline_thumb'_'dek_thumb']"
            >
              {/* Smaller only where a large Android font size leaves the page under 18.5rem: "Fourier–Bessel series",
                  held whole, ran past the screen's edge at 150%. */}
              <h3 className="text-h3 min-w-0 max-[18.5rem]:text-[1.25rem] max-[16rem]:text-[1.125rem] [grid-area:title]">
                {/* Under a finger an inline title reaches 44px a line by its padding (inline: nothing moves). */}
                <a href={p.href} className="underline decoration-transparent hover:decoration-ink pointer-coarse:py-[calc((44px-1lh)/2)]">
                  <TitleText title={p.title} />
                </a>
              </h3>
              <p className="text-meta mt-1.5 min-w-0 font-mono text-graphite [grid-area:byline]">
                <Items items={[...p.byline.split(' · '), p.figureNote, p.status === 'pending' && 'pending publication']} />
              </p>
              <p className="text-note mt-3 max-w-[38rem] min-w-0 [grid-area:dek]">
                <Whole text={p.dek} />
              </p>
              <div className="mt-4 [grid-area:thumb] sm:mt-0 sm:self-start sm:pt-1.5">
                <PaperThumb slug={p.slug} href={p.href} />
              </div>
            </li>
          ))}
        </ol>
      </Row>
    </section>
  )
}

export function OtherWork() {
  return (
    // Two entries: on paper the section prints whole, its heading never left at the foot of a sheet.
    <section aria-labelledby="other-work" className="mt-14 lg:mt-20 print:break-inside-avoid">
      <Row rail={<SectionHeading id="other-work">Other work</SectionHeading>}>
        <ul role="list" className="grid list-none border-t border-rule">
          {otherWork.map((o) => (
            <li key={o.slug} className="border-b border-rule py-4 print:break-inside-avoid">
              <a href={o.href} className="text-body underline decoration-transparent hover:decoration-ink pointer-coarse:inline-block pointer-coarse:py-[calc((44px-1lh)/2)]">
                {o.name}
              </a>
              {/* Title, its meta, then what it is: the order of every entry above it. */}
              <span className="text-meta mt-0.5 block font-mono text-graphite">
                <Items items={o.status} />
              </span>
              <span className="text-note mt-1.5 block max-w-[38rem]">{o.what}</span>
            </li>
          ))}
        </ul>
      </Row>
    </section>
  )
}

export function ExperienceBrief() {
  return (
    <section aria-labelledby="experience" className="mt-14 lg:mt-20">
      <Row rail={<SectionHeading id="experience">Experience</SectionHeading>}>
        {/* A block on paper, its gaps as margins: a grid list kept the heading above from holding to its first entry. */}
        <ul role="list" className="grid list-none gap-y-5 border-t border-rule pt-5 print:block print:space-y-5">
          {/* AdConfirm is named once on the home page, under Other work (the owner, 2026-10-06); /about and the CV list it. */}
          {roles.filter((r) => r.id !== 'adconfirm').map((r) => (
            // On paper an entry is whole: its last line never opens the next sheet alone.
            <li key={r.id} className="print:break-inside-avoid">
              <p>
                <span className="font-semibold">{r.org}</span>
                <span className="text-graphite">, {r.orgNote}</span>
              </p>
              <p className="text-meta mt-0.5 font-mono text-graphite">
                <Items items={[r.title, r.place, r.dates]} />
              </p>
              <p className="text-note mt-1.5 max-w-[38rem]">
                <Whole text={r.brief} />
                {r.href ? (
                  <>
                    {' '}
                    {/* Named in one string: an sr-only span was read as "Read the paper : X". */}
                    <a href={r.href} aria-label={`Read the paper: ${r.org}`} className="whitespace-nowrap">
                      Read the paper
                    </a>
                  </>
                ) : r.figure ? (
                  <>
                    {' '}
                    <a href={r.figure} aria-label={`See the curve: ${r.org}`} className="whitespace-nowrap">
                      See the curve
                    </a>
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-note mt-6 flex flex-wrap gap-x-5">
          <a href="/about" className={`inline-block py-1 ${TAP}`}>
            Every role in full, with education and coursework
          </a>
          <a href="/cv" className={`inline-block py-1 ${TAP}`}>
            The one-page CV
          </a>
        </p>
      </Row>
    </section>
  )
}
