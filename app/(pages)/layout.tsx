import { RunningHead } from '@/components/RunningHead'

/**
 * Every page except home carries the running head. Home has the masthead
 * instead, so it owns its own <main>; the route group keeps that difference in
 * one place rather than in a client-side pathname check.
 */
export default function PagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RunningHead />
      <main id="main">{children}</main>
    </>
  )
}
