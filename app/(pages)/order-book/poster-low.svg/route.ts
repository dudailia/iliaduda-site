import { posterFlow } from '@/lib/market/flow'
import { posterSvg } from '@/lib/orderbook/posterFile'

// An iPhone SE's frame, held upright (lib/orderbook/poster.ts, POSTERS). Built once, with the page, from the same
// seeded market the page's figure starts from (lib/orderbook/posterFile.ts).
export const dynamic = 'force-static'

export function GET() {
  return new Response(posterSvg(posterFlow(), 'low'), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } })
}
