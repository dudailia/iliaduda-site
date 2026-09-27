import { surfacePosterSvg } from '@/lib/surface/posterFile'
import { CALM } from '@/lib/surface/ssvi'

// Built once, with the page, from the calm parameters the figure rests at (lib/surface/posterFile.ts).
export const dynamic = 'force-static'

export function GET() {
  return new Response(surfacePosterSvg(CALM), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } })
}
