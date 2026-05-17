#!/usr/bin/env node
/**
 * release:open-next <next-version> [--dry-run]
 *
 * Step 13 of the /release pipeline: open the next release branch.
 *
 *  1. Validate clean tree, on main, fully up to date.
 *  2. Branch release/<next-tag> from main.
 *  3. Bump package.json version to the next version.
 *  4. Bump CLAUDE.md's `Version: \`X.Y.Z\`` line.
 *  5. Scaffold release-notes/<next-tag>.md from the standard skeleton.
 *  6. Commit + push.
 *  7. Create the GitHub milestone via gh api.
 *
 * The skill is expected to ask the user for the next version (patch vs. minor
 * bump) before invoking this — that pick is a judgment call. Selecting which
 * open issues to move into the new milestone is also a skill-side ask; this
 * script only creates the milestone shell.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  parseArgs,
  run,
  repoRoot,
  info,
  fail,
  repo,
} from './lib.mjs'

const { tag, version, dryRun } = parseArgs(process.argv)

info(`open-next ${tag}${dryRun ? ' (dry-run)' : ''}`)

const status = run('git status --porcelain', { capture: true })
if (status) fail(`Working tree is dirty:\n${status}`)

const currentBranch = run('git branch --show-current', { capture: true })
if (currentBranch !== 'main') fail(`Expected to be on main, currently on ${currentBranch || '(detached)'}`)

run('git fetch origin', { dryRun })
run('git pull --ff-only', { dryRun })

const remoteBranches = run('git ls-remote --heads origin', { capture: true })
if (remoteBranches.includes(`refs/heads/release/${tag}`)) {
  fail(`release/${tag} already exists on origin`)
}

const notesPath = join(repoRoot, 'release-notes', `${tag}.md`)
if (existsSync(notesPath)) fail(`release-notes/${tag}.md already exists — open-next has already run for ${tag}?`)

run(`git checkout -b release/${tag}`, { dryRun })

const pkgPath = join(repoRoot, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
info(`bumping package.json: ${pkg.version} -> ${version}`)
pkg.version = version
if (!dryRun) writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

const claudeMdPath = join(repoRoot, 'CLAUDE.md')
const claudeMd = readFileSync(claudeMdPath, 'utf8')
const claudeMdVersionRe = /Version: `([0-9][^`]*)`/
const claudeMdMatch = claudeMdVersionRe.exec(claudeMd)
if (!claudeMdMatch) fail('Could not find `Version: \\`X.Y.Z\\`` line in CLAUDE.md')
info(`bumping CLAUDE.md Version: ${claudeMdMatch[1]} -> ${version}`)
const newClaudeMd = claudeMd.replace(claudeMdVersionRe, `Version: \`${version}\``)
if (!dryRun) writeFileSync(claudeMdPath, newClaudeMd, 'utf8')

const skeleton = `# ${tag}\n\n_Unreleased_\n\n## Added\n\n## Changed\n\n## Fixed\n\n## Internal\n`
info(`scaffolding release-notes/${tag}.md`)
if (!dryRun) writeFileSync(notesPath, skeleton, 'utf8')

run(`git add package.json CLAUDE.md release-notes/${tag}.md`, { dryRun })
run(`git commit -m "chore: open ${tag} release branch"`, { dryRun })
run(`git push -u origin release/${tag}`, { dryRun })

if (dryRun) {
  console.log(`  [dry-run] gh api -X POST repos/${repo}/milestones -f title="${tag}" ...`)
  info('dry-run complete')
  process.exit(0)
}

info(`creating milestone ${tag}`)
const description = `Next release after the previous tag. Tracking issues moved over from the post-previous-release backlog.`
run(
  `gh api -X POST repos/${repo}/milestones -f title="${tag}" -f description="${description}"`,
)

info(`open-next complete: release/${tag} pushed, milestone ${tag} created`)
