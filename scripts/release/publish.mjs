#!/usr/bin/env node
/**
 * release:publish <version> [--dry-run]
 *
 * Steps 9-11 of the /release pipeline: build artifacts and create the GitHub
 * Release.
 *
 *  1. Validate on main, at the tagged commit, with the working tree clean.
 *  2. Run `npm run dist` (5-10 min hot loop).
 *  3. Verify the expected artifacts exist with the right version string.
 *  4. Strip ## Internal section from release notes; create the GitHub Release.
 *  5. Upload the artifacts. For prereleases, skip latest.yml so stable users
 *     aren't offered the build via electron-updater (per CLAUDE.md).
 *
 * The skill is expected to have hit the build-readiness gate (step 8) before
 * this runs — npm ci, dist/ cleared if needed, user confirmed they're ready
 * for the long-running build.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  parseArgs,
  run,
  repoRoot,
  info,
  fail,
  repo,
  stripInternalSection,
} from './lib.mjs'

const { tag, version, isPrerelease, dryRun } = parseArgs(process.argv)

info(`publish ${tag}${isPrerelease ? ' (prerelease)' : ''}${dryRun ? ' (dry-run)' : ''}`)

const status = run('git status --porcelain', { capture: true })
if (status) fail(`Working tree is dirty:\n${status}`)

const currentBranch = run('git branch --show-current', { capture: true })
if (currentBranch !== 'main') fail(`Expected to be on main, currently on ${currentBranch || '(detached)'}`)

const headSha = run('git log -1 --format=%H', { capture: true })
const tagSha = run(`git rev-list -n 1 ${tag}`, { capture: true })
if (headSha !== tagSha) {
  fail(`HEAD (${headSha.slice(0, 7)}) is not the tagged commit (${tagSha.slice(0, 7)}). Run release:promote first.`)
}

const notesPath = join(repoRoot, 'release-notes', `${tag}.md`)
if (!existsSync(notesPath)) fail(`release-notes/${tag}.md not found`)
const notes = readFileSync(notesPath, 'utf8')

const artifacts = [
  `RaceLayer-${version}.exe`,
  `RaceLayer-${version}.exe.blockmap`,
  `RaceLayer-portable-${version}.exe`,
]
if (!isPrerelease) artifacts.push('latest.yml')

info(`building artifacts (npm run dist)`)
run('npm run dist', { dryRun })

if (!dryRun) {
  const missing = artifacts.filter((f) => !existsSync(join(repoRoot, 'dist', f)))
  if (missing.length) fail(`Missing dist/ artifacts after build: ${missing.join(', ')}`)
}

const publicNotes = stripInternalSection(notes)
const publicNotesPath = join(tmpdir(), `release-publish-${tag}.md`)
if (dryRun) {
  console.log(`  [dry-run] write public release notes to ${publicNotesPath}`)
} else {
  writeFileSync(publicNotesPath, publicNotes, 'utf8')
}

const releaseFlag = isPrerelease ? '--prerelease' : '--latest'
if (dryRun) {
  console.log(`  [dry-run] gh release create ${tag} --title "${tag}" --notes-file ${publicNotesPath} ${releaseFlag}`)
  console.log(`  [dry-run] gh release upload ${tag} ${artifacts.map((f) => `dist/${f}`).join(' ')}`)
  info('dry-run complete')
  process.exit(0)
}

info(`creating GitHub Release ${tag}`)
run(
  `gh release create ${tag} --repo ${repo} --title "${tag}" --notes-file "${publicNotesPath}" ${releaseFlag}`,
)

info(`uploading ${artifacts.length} artifact${artifacts.length === 1 ? '' : 's'}`)
const uploadArgs = artifacts.map((f) => `dist/${f}`).join(' ')
run(`gh release upload ${tag} ${uploadArgs} --repo ${repo}`)

info(`publish complete: https://github.com/${repo}/releases/tag/${tag}`)
