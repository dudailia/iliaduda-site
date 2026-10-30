import sourceJson from '../../content/data/toxic-flow/source.json'

/**
 * What /toxic-flow and its Contents card may say about the study's protocol. "Pre-registered" goes live only when it is
 * true: when the copied bundle records the annotated tag that freezes PREREGISTRATION.md, with its commit and tagger's
 * date (scripts/toxic-flow-data.mjs writes it into source.json once the public remote has the tag). Until then the
 * title loses its "pre-registered" sentence, the status line says the pre-registration is drafted, and the page body
 * names the document (the noun, true in both states) but never calls the study or its run pre-registered.
 *
 * Imports source.json only, so content/papers.ts and the copy gates can read it without the study's whole bundle.
 */

export const TAG = 'prereg-v1'

export interface PreregTag {
  readonly name: string
  /** The annotated tag object, as the public remote lists it. */
  readonly object: string
  readonly commit: string
  readonly tagged_at: string
}

export const STATUS = {
  registered: 'Pre-registered. Test results pending.',
  drafted: 'Pre-registration drafted. Test results pending.',
} as const

/** The test section's line while the test keys are null: the owner's words for each state. */
export const AFTER_RUN = {
  registered: 'One of these sentences will appear here after the pre-registered test run.',
  drafted: 'One of these sentences will appear here after the test run fixed in the pre-registration.',
} as const

const PREREG = /pre-?regist/i

export interface Prereg {
  readonly tag: PreregTag | null
  /** The study's title, without a sentence that says "pre-registered" while the tag is not recorded. */
  readonly title: string
  readonly statusLine: string
  /** The test section's line before the run. */
  readonly afterRun: string
}

export function prereg(title: string, tag: PreregTag | null = (sourceJson as { prereg_tag: PreregTag | null }).prereg_tag): Prereg {
  if (tag) return { tag, title, statusLine: STATUS.registered, afterRun: AFTER_RUN.registered }
  const kept = title
    .split(/(?<=[?.!])\s+/)
    .filter((s) => !PREREG.test(s))
    .join(' ')
  return { tag: null, title: kept, statusLine: STATUS.drafted, afterRun: AFTER_RUN.drafted }
}

/** The tag's page on GitHub. */
export const tagUrl = (repo: string, tag: PreregTag) => `${repo}/releases/tag/${tag.name}`
