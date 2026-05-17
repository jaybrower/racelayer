#!/usr/bin/env node
/**
 * release:finalize <version> [--dry-run]
 *
 * Steps 3-4 of the /release pipeline: open and land the chore/finalize-<tag> PR.
 *
 *  1. Validate clean tree.
 *  2. Fetch + verify release/<tag> exists on origin.
 *  3. Branch chore/finalize-<tag> off origin/release/<tag>.
 *  4. Validate release-notes/<tag>.md still _Unreleased_; bump package.json /
 *     CLAUDE.md version if they drifted; flip _Unreleased_ -> _Released today_.
 *  5. Commit, push, open the PR targeting release/<tag>.
 *  6. Wait for CI, squash-merge with --delete-branch, pull release/<tag>.
 *
 * On CI failure or any precondition violation, exits non-zero so the skill can
 * surface the failure to the user. The skill still owns scope confirmation
 * (step 2 of the pipeline) — this script runs after that gate.
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { parseArgs, run, repoRoot, today, info, fail, repo } from './lib.mjs'

const { tag, version, dryRun } = parseArgs(process.argv)

info(`finalize ${tag}${dryRun ? ' (dry-run)' : ''}`)

const status = run('git status --porcelain', { capture: true })
if (status) fail(`Working tree is dirty:\n${status}`)

run('git fetch origin', { dryRun })

const remoteBranches = run('git ls-remote --heads origin', { capture: true })
if (!remoteBranches.includes(`refs/heads/release/${tag}`)) {
  fail(`release/${tag} does not exist on origin`)
}

// Branch off the release branch *first* so subsequent file reads see the right state.
run(`git checkout -B chore/finalize-${tag} origin/release/${tag}`, { dryRun })

const notesPath = join(repoRoot, 'release-notes', `${tag}.md`)
let notes
try {
  notes = readFileSync(notesPath, 'utf8')
} catch {
  fail(`release-notes/${tag}.md not found on release/${tag}`)
}
if (!/^_Unreleased_$/m.test(notes)) {
  fail(`release-notes/${tag}.md is missing the "_Unreleased_" marker — already finalized?`)
}

const pkgPath = join(repoRoot, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const claudeMdPath = join(repoRoot, 'CLAUDE.md')
const claudeMd = readFileSync(claudeMdPath, 'utf8')
const claudeMdVersionRe = /Version: `([0-9][^`]*)`/
const claudeMdMatch = claudeMdVersionRe.exec(claudeMd)
if (!claudeMdMatch) fail('Could not find `Version: \\`X.Y.Z\\`` line in CLAUDE.md')

const filesToCommit = [`release-notes/${tag}.md`]
if (pkg.version !== version) {
  info(`bumping package.json: ${pkg.version} -> ${version}`)
  pkg.version = version
  if (!dryRun) writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  filesToCommit.push('package.json')
}
if (claudeMdMatch[1] !== version) {
  info(`bumping CLAUDE.md Version: ${claudeMdMatch[1]} -> ${version}`)
  const newClaudeMd = claudeMd.replace(claudeMdVersionRe, `Version: \`${version}\``)
  if (!dryRun) writeFileSync(claudeMdPath, newClaudeMd, 'utf8')
  filesToCommit.push('CLAUDE.md')
}

const newNotes = notes.replace(/^_Unreleased_$/m, `_Released ${today()}_`)
if (dryRun) {
  console.log(`  [dry-run] write release-notes/${tag}.md (flip _Unreleased_ -> _Released ${today()}_)`)
} else {
  writeFileSync(notesPath, newNotes, 'utf8')
}

run(`git add ${filesToCommit.join(' ')}`, { dryRun })
run(`git commit -m "chore: finalize ${tag} release"`, { dryRun })
run(`git push -u origin chore/finalize-${tag}`, { dryRun })

const body = `Finalizes the ${tag} release: flips release-notes/${tag}.md from _Unreleased_ to _Released ${today()}_.`
if (dryRun) {
  console.log(`  [dry-run] gh pr create --base release/${tag} ...`)
  info('dry-run complete')
  process.exit(0)
}

const prUrl = run(
  `gh pr create --base release/${tag} --repo ${repo} --title "chore: finalize ${tag} release" --body "${body}"`,
  { capture: true },
)
info(`finalize PR: ${prUrl}`)
const prNum = prUrl.match(/\/pull\/(\d+)/)?.[1]
if (!prNum) fail(`Could not parse PR number from gh output: ${prUrl}`)

info(`waiting for CI on PR #${prNum}`)
run(`gh pr checks ${prNum} --repo ${repo} --watch`)

info(`merging PR #${prNum}`)
run(`gh pr merge ${prNum} --repo ${repo} --squash --delete-branch`)

info(`updating local release/${tag}`)
run(`git checkout release/${tag}`)
run('git pull')

info(`finalize complete: ${prUrl}`)
