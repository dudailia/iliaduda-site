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
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const REPO = 'https://github.com/dudailia/toxic-flow'
const FILES = ['toxic-flow.json', 'replay_window.json']
const src = resolve(process.argv[2] ?? join(homedir(), 'Projects', 'toxic-flow'))
const out = resolve(import.meta.dirname, '..', 'content', 'data', 'toxic-flow')

const git = (...args) => execFileSync('git', ['-C', src, ...args], { encoding: 'utf8' }).trim()

const dirty = git('status', '--porcelain', '--', 'site')
if (dirty) throw new Error(`${src}/site has changes not in a commit:\n${dirty}`)
const commit = git('rev-parse', 'HEAD')
const remote = git('ls-remote', 'origin')
if (!remote.split('\n').some((l) => l.startsWith(commit))) {
  throw new Error(`${commit} is not on ${REPO} yet: push it first, so the recorded commit can be opened`)
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
}
writeFileSync(join(out, 'source.json'), `${JSON.stringify(source, null, 2)}\n`)
console.log(`content/data/toxic-flow/ at ${commit.slice(0, 7)} (${source.committed_at})`)
