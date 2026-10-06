import type { MakeMini } from './paint'

/** Each paper's live miniature, loaded only when its thumbnail is on screen (components/thumbs/ContentsLive.tsx). */
export const MINIS: Record<string, () => Promise<{ make: MakeMini }>> = {
  market: () => import('./minis/market'),
  closebooks: () => import('./minis/closebooks'),
  cricstate: () => import('./minis/cricstate'),
  'order-book': () => import('./minis/order-book'),
  'iv-surface': () => import('./minis/iv-surface'),
  'startup-investments': () => import('./minis/startup-investments'),
  'debt-portal': () => import('./minis/debt-portal'),
  membrane: () => import('./minis/membrane'),
}
