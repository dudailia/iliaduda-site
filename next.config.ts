import type { NextConfig } from 'next'

/**
 * Content Security Policy. Everything is same-origin: no CDN, no analytics, no
 * third-party script, and the origin e2e gate asserts it.
 *
 * One exception, and only on preview deployments: Vercel injects its preview
 * toolbar (comments and feedback) from vercel.live. Blocking it was harmless
 * but logged a CSP violation on every page view, and a preview that prints
 * console errors cannot be used to prove the site prints none. So previews
 * admit exactly the toolbar's origins; production never does, and nothing on
 * the site itself loads from them.
 */
const preview = process.env.VERCEL_ENV === 'preview'
const toolbar = preview ? ' https://vercel.live' : ''
const csp = [
  "default-src 'self'",
  `img-src 'self' data:${preview ? ' blob: https://vercel.live https://vercel.com' : ''}`,
  `style-src 'self' 'unsafe-inline'${toolbar}`,
  `font-src 'self'${preview ? ' https://vercel.live https://assets.vercel.com' : ''}`,
  `script-src 'self' 'unsafe-inline'${toolbar}`,
  `connect-src 'self'${preview ? ' https://vercel.live wss://ws-us3.pusher.com' : ''}`,
  `frame-src${preview ? ' https://vercel.live' : " 'none'"}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const nextConfig: NextConfig = {
  // Type errors fail the build. This is the default in Next 16 and it is
  // written down anyway, because the last project I audited had it switched
  // off, and that is how a call to a function which exists nowhere in the
  // codebase reached production.
  //
  // Next 16 dropped the `eslint` key from this config — lint is no longer part
  // of `next build` — which is exactly why `pnpm lint` is its own CI job rather
  // than something the build is assumed to cover.
  typescript: { ignoreBuildErrors: false },

  // Do not generate AGENTS.md / CLAUDE.md into the repository root.
  agentRules: false,

  poweredByHeader: false,

  // The other security headers stay in vercel.json; the CSP lives here because
  // it has to know which kind of deployment it is on.
  async headers() {
    return [{ source: '/(.*)', headers: [{ key: 'Content-Security-Policy', value: csp }] }]
  },

  // Old URLs have been pasted into email, so they keep working. Permanent (308)
  // because these are moves, not experiments.
  async redirects() {
    return [
      // Glacier is described at résumé level on /about, not as a paper.
      { source: '/glacier', destination: '/about#glacier', permanent: true },
      { source: '/digital-group', destination: '/debt-portal', permanent: true },
    ]
  },
}

export default nextConfig
