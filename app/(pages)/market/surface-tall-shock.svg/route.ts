import { marketFrame } from '@/lib/market/poster'
import { surfacePosterSvg } from '@/lib/surface/posterFile'

// /market's vol surface one simulated second after a liquidity shock, in a phone's framing, at the market's stress then
// (lib/market/surface.ts), for a reader whose figure does not run live. Built once with the page.
export const dynamic = 'force-static'

export function GET() {
  return new Response(surfacePosterSvg(marketFrame('shock').surface, 'tall'), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } })
}
