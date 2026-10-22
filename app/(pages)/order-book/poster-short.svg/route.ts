import { posterFlow } from '@/lib/market/flow'
import { posterSvg } from '@/lib/orderbook/posterFile'

// Built once, with the page, from the same seeded market the page's figure starts from (lib/orderbook/posterFile.ts).
export const dynamic = 'force-static'

export function GET() {
  return new Response(posterSvg(posterFlow(), 'short'), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } })
}
