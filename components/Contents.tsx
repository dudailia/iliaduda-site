import { otherWork, visiblePapers } from '@/content/papers'
import { roles } from '@/content/experience'
import { SITE } from '@/lib/site'
import { Row } from './Layout'
import { PaperThumb } from './PaperThumb'

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

const VT_CLICK = `document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('[data-vt-contents] a[href]');if(!a)return;var li=a.closest('li');var t=li&&li.querySelector('[data-vt-thumb]');if(!t||!t.offsetWidth)return;t.style.viewTransitionName=t.dataset.vtThumb;t.style.viewTransitionClass='figure';},true);addEventListener('pageshow',function(){document.querySelectorAll('[data-vt-thumb]').forEach(function(t){t.style.viewTransitionName='';});});`

export function Contents() {
  const papers = visiblePapers(SITE.isProduction)
  return (
    <section aria-labelledby="contents" className="mt-16 lg:mt-24">
      {/* Opening a paper names only its own thumbnail for the view
          transition; every other thumbnail stays out of it. */}
      <script dangerouslySetInnerHTML={{ __html: VT_CLICK }} />
      <Row rail={<SectionHeading id="contents">Contents</SectionHeading>}>
        <ol className="grid list-none border-t border-rule" data-vt-contents>
          {papers.map((p) => (
            <li key={p.slug} className="grid gap-x-6 border-b border-rule py-6 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <div className="min-w-0">
                <h3 className="text-h3">
                  <a href={p.href} className="no-underline hover:underline">
                    {p.title}
                  </a>
                </h3>
                <p className="text-meta mt-1.5 font-mono text-graphite">
                  {p.byline}
                  {p.status === 'pending' ? ' · pending publication' : ''}
                </p>
                <p className="text-note mt-3 max-w-[38rem]">{p.abstract}</p>
              </div>
              <div className="hidden pt-1.5 sm:block">
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
    <section aria-labelledby="other-work" className="mt-14 lg:mt-20">
      <Row rail={<SectionHeading id="other-work">Other work</SectionHeading>}>
        <ul className="grid list-none border-t border-rule">
          {otherWork.map((o) => (
            <li key={o.slug} className="border-b border-rule py-4">
              <a href={o.href} className="text-body no-underline hover:underline">
                {o.name}
              </a>
              <span className="text-note mt-1 block max-w-[38rem]">{o.what}</span>
              <span className="text-meta mt-1 block font-mono text-graphite">{o.status}</span>
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
        <ul className="grid list-none gap-y-5 border-t border-rule pt-5">
          {roles.map((r) => (
            <li key={r.id}>
              <p>
                <span className="font-semibold">{r.org}</span>
                <span className="text-graphite">, {r.orgNote}</span>
              </p>
              <p className="text-meta mt-0.5 font-mono text-graphite">
                {[r.title, r.place, r.dates].filter(Boolean).join(' · ')}
              </p>
              <p className="text-note mt-1.5 max-w-[38rem]">
                {r.brief}
                {r.href ? (
                  <>
                    {' '}
                    <a href={r.href}>Read the paper</a>
                  </>
                ) : r.figure ? (
                  <>
                    {' '}
                    <a href={r.figure}>See the curve</a>
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-note mt-6 flex flex-wrap gap-x-5">
          <a href="/about" className="inline-block py-1">
            Every role in full, with education and coursework
          </a>
          <a href="/cv" className="inline-block py-1">
            The one-page CV
          </a>
        </p>
      </Row>
    </section>
  )
}
