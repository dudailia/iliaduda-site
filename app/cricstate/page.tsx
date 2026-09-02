import { permanentRedirect } from 'next/navigation'

/**
 * cricstate is rendered in full on the home page, so this route exists only so
 * that /cricstate is a shareable URL. A redirect rather than a second copy:
 * duplicating the case study to own a path would split the page's search
 * signal and give two anchors for one figure.
 */
export default function CricstateRoute(): never {
  permanentRedirect('/#cricstate')
}
