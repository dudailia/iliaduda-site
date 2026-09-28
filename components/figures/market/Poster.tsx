/**
 * /market's still frames of the book and the futures, as the page shows them before the market runs and where it
 * does not: the images drawn at build (lib/market/poster.ts, served from app/(pages)/market/), and the axes' words
 * over them in the page's type, where the live views place theirs.
 */

const pct = (f: number) => `${(f * 100).toFixed(2)}%`
/** A still frame's file: the calm one, or the one two seconds after a shock. */
const file = (name: string, moment: 'calm' | 'shock') => `/market/${name}${moment === 'shock' ? '-shock' : ''}.svg`

export function BookPoster({ ticks, usd, moment = 'calm' }: { ticks: readonly { p: number; y: number }[]; usd: (ticks: number) => string; moment?: 'calm' | 'shock' }) {
  return (
    <div className="absolute inset-0" data-market-poster="book" data-moment={moment}>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn at build time and served as it is; next/image would only add a client runtime */}
      <img src={file('book', moment)} alt="" decoding="async" loading={moment === 'shock' ? 'lazy' : undefined} className="absolute inset-y-0 left-0 h-full w-[calc(100%-5rem)] sm:w-[calc(100%-3.5rem)]" />
      {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
      <img src={file('ladder', moment)} alt="" decoding="async" loading={moment === 'shock' ? 'lazy' : undefined} className="absolute inset-y-0 right-6 h-full w-14 sm:right-0" />
      {ticks.map((t) => (
        <span key={t.p} className="text-meta absolute left-6 -translate-y-1/2 rounded-sm bg-paper/85 px-0.5 font-mono leading-none text-graphite sm:left-1" style={{ top: pct(t.y) }}>
          {usd(t.p)}
        </span>
      ))}
    </div>
  )
}

export function FanPoster({ ticks, moment = 'calm' }: { ticks: readonly { d: number; y: number }[]; moment?: 'calm' | 'shock' }) {
  return (
    <div className="absolute inset-0" data-market-poster="fan" data-moment={moment}>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn at build time and served as it is; next/image would only add a client runtime */}
      <img src={file('fan', moment)} alt="" decoding="async" loading={moment === 'shock' ? 'lazy' : undefined} className="absolute top-2 left-8 h-[calc(100%-1rem)] w-[calc(100%-6.25rem)] sm:left-2 sm:w-[calc(100%-3.25rem)]" />
      {ticks.map((t) => (
        <span
          key={t.d}
          className="text-meta absolute right-7 -translate-y-1/2 font-mono leading-none text-graphite sm:right-1"
          style={{ top: `calc(0.5rem + (100% - 1rem) * ${t.y.toFixed(4)})` }}
        >
          {`$${Math.round(t.d).toLocaleString('en-US')}`}
        </span>
      ))}
    </div>
  )
}
