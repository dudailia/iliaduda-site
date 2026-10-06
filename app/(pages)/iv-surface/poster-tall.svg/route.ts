import { surfacePosterSvg } from '@/lib/surface/posterFile'
import { CALM } from '@/lib/surface/ssvi'
import { PROBE_START } from '@/lib/surface/view'

// A phone's framing of the poster (lib/surface/view.ts, FRAMES.tall), built once with the page, from the calm
// parameters the figure rests at (lib/surface/posterFile.ts).
export const dynamic = 'force-static'

export function GET() {
  return new Response(surfacePosterSvg(CALM, 'tall', PROBE_START), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } })
}
