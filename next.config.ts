import type { NextConfig } from 'next'

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
