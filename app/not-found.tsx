import { Row, Shell } from '@/components/Layout'

export default function NotFound() {
  return (
    <Shell>
      <div className="pt-16 lg:pt-24">
        <Row rail="404">
          <h1 className="text-h2">That page is not here</h1>
          <p className="mt-4 max-w-[52ch] text-graphite">
            The link may be old, or I may have renamed something I said I would not rename. The
            case studies are listed in the footer.
          </p>
        </Row>
      </div>
    </Shell>
  )
}
