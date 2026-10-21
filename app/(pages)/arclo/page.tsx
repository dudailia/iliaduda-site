import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Shell } from '@/components/Layout'
import { ArcloReel } from '@/components/figures/ArcloReel'
import { ArcloSystem } from '@/components/figures/ArcloSystem'
import { fact, type FactKey } from '@/content/facts'
import { otherWork } from '@/content/papers'
import { pageMeta } from '@/lib/meta'

const words = (k: FactKey) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][fact(k).value] ?? String(fact(k).value)

/** Under Other work on the homepage, not in the Contents (content/papers.ts), so its page carries its own words. */
const ARCLO = {
  title: 'Arclo: a brand system with a template engine and an export pipeline',
  abstract: `A brand system for a fictional city e-bike and e-scooter service, taken from a blank brief to a live site in ${words('arDays')} day. One set of tokens drives every deliverable: ${words('arTemplates')} social templates in ${words('arColorways')} colorways with a live editor, a CMYK print flyer with bleed, HTML5 banners and a motion set, each drawn once and exported by one pipeline.`,
  description: 'A brand system for a fictional e-bike and e-scooter service, built in one day: one token set drives its templates, live editor, print, banners and motion.',
  byline: otherWork.find((o) => o.slug === 'arclo')!.status,
}

export const metadata = pageMeta('/arclo', ARCLO.title, ARCLO.description)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function Arclo() {
  return (
    <Shell>
      <article>
        <CaseStudyTitle byline={ARCLO.byline} level="h1" title={ARCLO.title} standfirst={<p>{ARCLO.abstract}</p>} />

        <ArcloSystem />

        <Section heading="What it is">
          <p>
            Arclo is a fictional city e-bike and e-scooter brand. I built its brand system for a
            student graphic designer application at Northeastern, from a blank brief to a live site
            in {words('arDays')} day, and built it as a product: a design system, a template engine
            and an export pipeline, so a new post, size or colorway is an edit and an export rather
            than a redraw.
          </p>
          <p>
            I built it with Claude Code, directing the work and reviewing every piece of it.
          </p>
        </Section>

        <Section heading="The design system">
          <p>
            The system lives in Figma as variables, text styles and components, and the same values
            live in code, where every template, banner and motion piece reads them. The one-page
            brand guideline is drawn from those same values, so it cannot drift from the work it
            describes.
          </p>
        </Section>

        <Section heading="The template engine">
          <p>
            {cap(words('arTemplates'))} reusable social templates, Route of the week, Event announcement and
            Ride tips, each ship in {words('arColorways')} colorways. Each one separates what changes
            from what holds: a route card takes a ride time, two places, a mode and a route shape,
            and its layout, type and color come from the system.
          </p>
          <p>
            The live editor on the site is that template as a tool. Type a place and a ride time and
            the card updates, the number counting to its new value and the route redrawing, and it
            downloads the exact post from the same markup the page shows.
          </p>
        </Section>

        <ArcloReel />

        <Section heading="The export pipeline">
          <p>
            Every still deliverable is registered once, with its exact pixel size and its formats,
            and one export-only route draws any of them alone on the page. One command then renders
            every file from the same React pieces the site shows: the social posts as PNG and JPEG,
            the US Letter flyer as a CMYK PDF with bleed and crop marks, static and animated HTML5
            banners built with GSAP, and a motion set rendered with Remotion: animated posts, a logo
            sting and kinetic type.
          </p>
        </Section>

        <Meta
          rows={[
            ['live', <a key="l" href="https://arclo-portfolio.vercel.app">arclo-portfolio.vercel.app</a>],
            ['figma', <a key="f" href="https://www.figma.com/design/k4VUGQOIStDVtyWj9flAXf">The Figma source</a>],
            ['stack', 'Figma (variables, text styles, components) · Next.js · GSAP · Remotion · Vercel · Claude Code'],
          ]}
        />
      </article>
    </Shell>
  )
}
