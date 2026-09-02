import { projects } from '@/content/projects'
import { Row } from './Layout'

/**
 * Deliberately not a card grid. Identical rounded cards with a soft grey
 * shadow are the default this site is trying not to be, and they would flatten
 * six very different things into six identical rectangles.
 */
export function ProjectIndex() {
  return (
    <section className="mt-20 lg:mt-28">
      <Row
        rail={
          <h2 className="text-meta font-mono font-normal tracking-normal text-ink">
            Also built
          </h2>
        }
      >
        <ul className="grid list-none border-t border-rule">
          {projects.map((p) => (
            <li key={p.slug} className="border-b border-rule py-4">
              <a href={p.href} className="group block border-0">
                <span className="text-body block group-hover:underline group-hover:decoration-rule">
                  {p.name}
                </span>
                <span className="text-note mt-1 block max-w-[37.9rem] text-graphite">{p.what}</span>
                <span className="text-meta mt-1.5 block font-mono text-graphite">{p.status}</span>
              </a>
            </li>
          ))}
        </ul>
      </Row>
    </section>
  )
}
