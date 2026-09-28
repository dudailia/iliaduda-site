import { bookSvg } from '@/lib/market/poster'

// /market's still frame of the book (lib/market/poster.ts), built once with the page from the seeded market at the
// moment the live figure starts from.
export const dynamic = 'force-static'

export function GET() {
  return new Response(bookSvg(), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } })
}
