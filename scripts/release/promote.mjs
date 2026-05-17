#!/usr/bin/env node
/**
 * release:promote <version> [--dry-run]
 *
 * Steps 5-7 of the /release pipeline: land release/<tag> on main and tag it.
 *
 *  1. Validate clean tree, on release/<tag>, release notes already _Released_.
 *  2. Open the release -> main PR with a digest body (Internal section stripped).
 *  3. Wait for CI, merge with `gh pr merge --merge` (merge commit, not squash —
 *     preserves the per-feature commits on main so auto-close keywords fire).
 *  4. Pull main, capture the merge commit SHA.
 *  5. Create an annotated tag on the merge SHA, push the tag.
 *
 * Exits non-zero on CI failure or precondition violation. Skill still owns the
 * build-readiness gate (step 8) that fires after this script returns.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
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

const { tag, dryRun } = parseArgs(process.argv)

info(`promote ${tag}${dryRun ? ' (dry-run)' : ''}`)

const status = run('git status --porcelain', { capture: true })
if (status) fail(`Working tree is dirty:\n${status}`)

const currentBranch = run('git branch --show-current', { capture: true })
if (currentBranch !== `release/${tag}`) {
  fail(`Expected to be on release/${tag}, currently on ${currentBranch || '(detached)'}`)
}

run('git fetch origin', { dryRun })
run('git pull --ff-only', { dryRun })

const notesPath = join(repoRoot, 'release-notes', `${tag}.md`)
let notes
try {
  notes = readFileSync(notesPath, 'utf8')
} catch {
  fail(`release-notes/${tag}.md not found`)
}
if (/^_Unreleased_$/m.test(notes)) {
  fail(`release-notes/${tag}.md still says _Unreleased_ — run release:finalize first`)
}

// Build the PR body: release-notes minus the # title line + Internal section.
const publicNotes = stripInternalSection(notes.replace(/^# .*\n+/m, ''))
const bodyPath = join(tmpdir(), `release-promote-${tag}.md`)
const body = `## ${tag}\n\n${publicNotes}`
mkdirSync(tmpdir(), { recursive: true })
if (dryRun) {
  console.log(`  [dry-run] write PR body to ${bodyPath} (${body.length} chars)`)
} else {
  writeFileSync(bodyPath, body, 'utf8')
}

if (dryRun) {
  console.log(`  [dry-run] gh pr create --base main --head release/${tag} ...`)
  console.log(`  [dry-run] gh pr checks <num> --watch`)
  console.log(`  [dry-run] gh pr merge <num> --merge`)
  console.log('  [dry-run] git checkout main && git pull')
  console.log(`  [dry-run] git tag -a ${tag} -m "${tag}" <merge-sha>`)
  console.log(`  [dry-run] git push origin ${tag}`)
  info('dry-run complete')
  process.exit(0)
}

const prUrl = run(
  `gh pr create --base main --head release/${tag} --repo ${repo} --title "Release ${tag}" --body-file "${bodyPath}"`,
  { capture: true },
)
info(`release PR: ${prUrl}`)
const prNum = prUrl.match(/\/pull\/(\d+)/)?.[1]
if (!prNum) fail(`Could not parse PR number from gh output: ${prUrl}`)

info(`waiting for CI on PR #${prNum}`)
run(`gh pr checks ${prNum} --repo ${repo} --watch`)

info(`merging PR #${prNum} (merge commit, not squash)`)
run(`gh pr merge ${prNum} --repo ${repo} --merge`)

info('updating local main')
run('git checkout main')
run('git pull')

const mergeSha = run('git log -1 --format=%H', { capture: true })
info(`merge commit: ${mergeSha}`)

info(`tagging ${tag} on ${mergeSha.slice(0, 7)}`)
run(`git tag -a ${tag} -m "${tag}" ${mergeSha}`)
run(`git push origin ${tag}`)

info(`promote complete: tagged ${tag} on ${mergeSha}`)
