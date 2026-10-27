#!/usr/bin/env node
/**
 * Copies the toxic-flow project page's data into this repo: site/toxic-flow.json and site/replay_window.json from the
 * toxic-flow repository, byte for byte, into content/data/toxic-flow/, with source.json recording the commit they were
 * copied at and each file's SHA-256. /toxic-flow reads nothing else, so every number on it traces to that commit.
 *
 *   node scripts/toxic-flow-data.mjs [path to the toxic-flow checkout]   (default ~/Projects/toxic-flow)
 *
 * It refuses a checkout whose site/ differs from its HEAD, or whose HEAD is not on the public remote: the commit it
 * records has to be one a reader can open.
 *
 * It also records the tag that freezes the protocol, prereg-v1, once the public remote lists the same annotated tag the
 * checkout holds: its commit and its tagger's date. Until then source.json says null, and the page and its Contents card
 * say the pre-registration is drafted, not that the study is pre-registered.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const REPO = 'https://github.com/dudailia/toxic-flow'
const TAG = 'prereg-v1'
const FILES = ['toxic-flow.json', 'replay_window.json']
const src = resolve(process.argv[2] ?? join(homedir(), 'Projects', 'toxic-flow'))
const out = resolve(import.meta.dirname, '..', 'content', 'data', 'toxic-flow')

const git = (...args) => execFileSync('git', ['-C', src, ...args], { encoding: 'utf8' }).trim()
/** Like git, but '' where git finds nothing. */
const gitOr = (...args) => {
  try {
    return git(...args)
  } catch {
    return ''
  }
}

const dirty = git('status', '--porcelain', '--', 'site')
if (dirty) throw new Error(`${src}/site has changes not in a commit:\n${dirty}`)
const commit = git('rev-parse', 'HEAD')
const remote = git('ls-remote', 'origin')
if (!remote.split('\n').some((l) => l.startsWith(commit))) {
  throw new Error(`${commit} is not on ${REPO} yet: push it first, so the recorded commit can be opened`)
}

// The tag, only as the public remote has it: the tag object there must be the annotated tag object here.
const local = gitOr('rev-parse', '-q', '--verify', `refs/tags/${TAG}`)
const pushed = remote.split('\n').find((l) => l.endsWith(`\trefs/tags/${TAG}`))?.split('\t')[0] ?? ''
let tag = null
if (pushed && !local) throw new Error(`${REPO} has ${TAG} but ${src} does not: fetch the tags first`)
if (local && !pushed) console.warn(`${TAG} is not on ${REPO} yet: recorded as null, so the page says the pre-registration is drafted`)
if (local && pushed) {
  if (git('cat-file', '-t', local) !== 'tag') throw new Error(`${TAG} is a lightweight tag: the protocol is frozen by an annotated one`)
  if (pushed !== local) throw new Error(`${TAG} on ${REPO} (${pushed}) is not the tag here (${local})`)
  tag = {
    name: TAG,
    object: local,
    commit: git('rev-parse', `${TAG}^{commit}`),
    tagged_at: git('for-each-ref', '--format=%(taggerdate:iso-strict)', `refs/tags/${TAG}`),
  }
}

mkdirSync(out, { recursive: true })
const files = {}
for (const f of FILES) {
  copyFileSync(join(src, 'site', f), join(out, f))
  files[f] = createHash('sha256').update(readFileSync(join(out, f))).digest('hex')
}
const source = {
  repo: REPO,
  commit,
  committed_at: git('show', '-s', '--format=%cI', commit),
  subject: git('show', '-s', '--format=%s', commit).slice(0, 200),
  copied_from: FILES.map((f) => `site/${f}`),
  sha256: files,
  prereg_tag: tag,
}
writeFileSync(join(out, 'source.json'), `${JSON.stringify(source, null, 2)}\n`)
console.log(`content/data/toxic-flow/ at ${commit.slice(0, 7)} (${source.committed_at}), ${TAG} ${tag ? `at ${tag.commit.slice(0, 7)} (${tag.tagged_at})` : 'not recorded'}`)
