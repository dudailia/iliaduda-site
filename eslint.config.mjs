import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Every navigation on this site is a document navigation, on purpose: the
    // cross-document view transition (contents thumbnail into a paper's
    // figure, the running head holding still) only runs on one, and the
    // client router's runtime stays off pages that do not otherwise need it.
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local, gitignored audit scripts and captures.
    ".audit/**",
    ".lighthouseci/**",
    ".lighthouseci-prod/**",
  ]),
]);

export default eslintConfig;
