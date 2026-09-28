import { marketFrame } from '@/lib/market/poster'
import { surfacePosterSvg } from '@/lib/surface/posterFile'

// /market's vol surface as a still frame, in a phone's framing: the IV paper's surface at the market's stress at the moment
// the live figure starts from (lib/market/surface.ts), built once with the page.
export const dynamic = 'force-static'

export function GET() {
  return new Response(surfacePosterSvg(marketFrame().surface, 'tall'), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } })
}
