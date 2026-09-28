import { ladderSvg } from '@/lib/market/poster'

// /market's still frame of the ladder (lib/market/poster.ts), built once with the page from the seeded market at the
// moment the live figure starts from.
export const dynamic = 'force-static'

export function GET() {
  return new Response(ladderSvg(), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } })
}
