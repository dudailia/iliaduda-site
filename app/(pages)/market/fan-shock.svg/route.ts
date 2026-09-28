import { fanSvg } from '@/lib/market/poster'

// /market's still frame of the fan one simulated second after a liquidity shock (lib/market/poster.ts), for a reader
// whose figure does not run live: Liquidity shock swaps it in. Built once with the page.
export const dynamic = 'force-static'

export function GET() {
  return new Response(fanSvg('shock'), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } })
}
