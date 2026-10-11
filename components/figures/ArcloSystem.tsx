import type { ReactNode } from 'react'
import { fact, type FactKey } from '@/content/facts'
import { FigureFrame, Readouts } from '../FigureFrame'

/**
 * Fig. 1 of /arclo: how one set of tokens becomes every deliverable. Laid out in HTML, as /market's Fig. 2 is, so its
 * words are the page's own at every width: four stages, the flow running down, each stage's parts beside its name
 * from `sm`. The stages are the build's own (arclo-portfolio @7b08ccc): src/brand/tokens.ts, the templates in
 * src/pieces/social.tsx, the registry and export-only route in src/pieces/registry.tsx and src/app/render, and
 * scripts/export/run.mjs.
 */

const words = (k: FactKey) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][fact(k).value] ?? String(fact(k).value)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Stage({ label, title, children, claim = false }: { label: string; title: string; children: ReactNode; claim?: boolean }) {
  return (
    <div className={`grid min-w-0 grid-cols-1 border px-4 py-3 sm:grid-cols-[10.5rem_minmax(0,1fr)] sm:gap-x-5 ${claim ? 'border-indigo bg-indigo-wash' : 'border-rule bg-paper'}`}>
      <div>
        <p className="text-meta font-mono text-graphite">{label}</p>
        <p className="text-note mt-1 font-semibold text-pretty text-ink">{title}</p>
      </div>
      <ul className="text-note mt-1.5 grid gap-y-1 text-graphite sm:mt-0 sm:block sm:columns-2 sm:gap-x-5 sm:pt-0.5 sm:[&>li]:mb-1 [&>li]:break-inside-avoid">{children}</ul>
    </div>
  )
}

/** The flow from one stage down to the next. */
function Flow() {
  return (
    <div className="flex items-center justify-center text-ink" aria-hidden="true">
      <svg className="h-6 w-2.5" viewBox="0 0 10 24">
        <line x1="5" y1="1" x2="5" y2="23" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d="M1 17 L5 23 L9 17" fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

export function ArcloSystem() {
  const templates = words('arTemplates')
  const colorways = words('arColorways')
  const days = words('arDays')
  const rows = [
    { label: 'Social templates', value: cap(templates) },
    { label: 'Colorways each', value: cap(colorways) },
    { label: 'Brief to live site', value: `${cap(days)} day` },
  ]
  return (
    <FigureFrame
      id="fig-system"
      number="Fig. 1"
      title="One set of tokens, through the templates and one export pipeline, to every deliverable."
      subtitle="Arclo · fictional brand · the build’s own stages"
      vt="arclo"
      railBelow={false}
      rail={<Readouts rows={rows} />}
      caption={
        <>
          Every still is registered once at its exact pixel size, and one export-only route draws any of them alone. One
          command then writes every file from the same React pieces the site renders: PNG and JPEG, the print flyer as a
          CMYK PDF with crop marks, the banner packages and the video. A token changed once reaches every deliverable on
          the next export.
        </>
      }
      table={
        <table>
          <caption>The four stages, in order.</caption>
          <tbody>
            <tr>
              <th scope="row">Tokens</th>
              <td>Figma variables, text styles and components; the same values in code</td>
            </tr>
            <tr>
              <th scope="row">Templates</th>
              <td>{`${cap(templates)} social templates in ${colorways} colorways each, and a live editor`}</td>
            </tr>
            <tr>
              <th scope="row">Export pipeline</th>
              <td>every piece registered once, drawn alone at its size, written by one command</td>
            </tr>
            <tr>
              <th scope="row">Deliverables</th>
              <td>a brand guideline, social posts, a US Letter print flyer, HTML5 banners and a motion set</td>
            </tr>
          </tbody>
        </table>
      }
    >
      <div className="grid grid-cols-1 gap-1.5">
        <Stage label="Figma and code" title="One set of tokens" claim>
          <li>Figma variables, text styles and components</li>
          <li>the same values in code, read by every piece</li>
        </Stage>
        <Flow />
        <Stage label="Templates" title={`${cap(templates)} templates, ${colorways} colorways each`}>
          <li>Route of the week</li>
          <li>Event announcement</li>
          <li>Ride tips</li>
          <li>a live editor on the same components</li>
        </Stage>
        <Flow />
        <Stage label="Export pipeline" title="Every piece at its exact size">
          <li>registered once</li>
          <li>drawn alone by one route</li>
          <li>written by one command</li>
        </Stage>
        <Flow />
        <Stage label="Deliverables" title="Print, web and motion">
          <li>a one-page brand guideline</li>
          <li>a US Letter flyer, CMYK with bleed</li>
          <li>HTML5 banners, static and animated</li>
          <li>animated posts, a logo sting, kinetic type</li>
        </Stage>
      </div>
      <div className="mt-4 lg:hidden">
        <Readouts across rows={rows} />
      </div>
    </FigureFrame>
  )
}
