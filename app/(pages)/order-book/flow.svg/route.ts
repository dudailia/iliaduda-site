import { posterFlow } from '@/lib/market/flow'
import { flowPosterSvg } from '@/lib/orderbook/flowPoster'

// Built once, with the page, from the same seeded market the page's figures start from (lib/orderbook/flowPoster.ts).
export const dynamic = 'force-static'

export function GET() {
  return new Response(flowPosterSvg(posterFlow()), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } })
}
