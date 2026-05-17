---
description: Run the full release cycle for the given version (finalize, tag, build, publish, open next)
argument-hint: vX.Y.Z
---

You are running the RaceLayer release pipeline. The user typed `/release $ARGUMENTS` — that argument is the version being shipped (e.g. `v0.1.6`).

The mechanical work is wrapped in four `npm run release:*` scripts (`scripts/release/*.mjs`). Your job is to walk through the pipeline, hit the manual gates that need judgment, and invoke the scripts between them. Use the TodoWrite tool to track progress so the user sees each step move pending → in_progress → completed. **Never skip the manual-confirmation gates** (steps 1, 2, 8, 13) — they exist because a release is irreversible.

The branch policy + tagging conventions are documented at the top of `CLAUDE.md` — read that section first if you need a refresher. The release-notes file lives at `release-notes/$ARGUMENTS.md` (e.g. `release-notes/v0.1.6.md`).

## How the scripts split up the work

| Script | Pipeline steps | What it does |
|---|---|---|
| `npm run release:finalize -- $ARGUMENTS` | 3-4 | Branches `chore/finalize-$ARGUMENTS`, flips `_Unreleased_` → `_Released <today>`, bumps version files if drifted, commits + pushes, opens the PR against `release/$ARGUMENTS`, waits for CI, squash-merges, pulls. |
| `npm run release:promote -- $ARGUMENTS` | 5-7 | Opens the release-branch → main PR with a stripped-Internal body, waits for CI, merges as a merge commit (so per-feature commits land on main and auto-close fires), pulls main, tags the merge SHA, pushes the tag. |
| `npm run release:publish -- $ARGUMENTS` | 9-11 | Runs `npm run dist`, verifies the four expected artifacts, strips Internal section for the GitHub Release body, creates the release (`--latest` or `--prerelease`), uploads artifacts (skips `latest.yml` for prereleases). |
| `npm run release:open-next -- $NEXT` | 13 | Branches `release/$NEXT` from main, bumps `package.json` + `CLAUDE.md`'s `Version:` line, scaffolds `release-notes/$NEXT.md`, commits + pushes, creates the milestone. |

All four support `--dry-run` to validate preconditions without mutating anything. Each script exits non-zero on CI failure or precondition violation — surface that to the user and stop.

## Preconditions

Before doing anything, verify:

1. The current directory is `C:\code\iracing-overlay` (use `pwd`).
2. The `release/$ARGUMENTS` branch exists locally and on origin.
3. All work the user wants in this release has already merged into `release/$ARGUMENTS` via PRs. (If there are open PRs against the release branch, **stop and ask** whether to wait, abandon them, or proceed without them.)
4. `release-notes/$ARGUMENTS.md` exists and reflects the actual changes that landed.

If any precondition fails, stop and report — don't try to recover.

## The pipeline

### 1. Run the local test suite first

```bash
npm test
```

A release is irreversible — catching a regression here is much cheaper than after the tag is pushed. If any test fails, **halt** and ask the user whether to fix forward or abort. If the suite passes, capture the count for the scope summary in step 2.

### 2. Confirm scope with the user

Print a summary:

- Commits on `release/$ARGUMENTS` not yet on `main` (`git log --oneline main..release/$ARGUMENTS`).
- Issues in the `$ARGUMENTS` milestone with `ready-to-release` label that will be auto-closed when step 6 lands.
- Current `package.json` version (sanity check — should already match `$ARGUMENTS`; if it doesn't, `release:finalize` will fold the bump into the finalize commit).
- Test-suite result from step 1 (e.g. "126/126 vitest pass").

Ask the user to confirm before proceeding. If they say no, stop.

### 3-4. Finalize: `npm run release:finalize -- $ARGUMENTS`

This single script handles steps 3 and 4 of the old checklist: it opens the finalize PR and lands it. If you want to inspect what it would do first, run it with `--dry-run`. On any failure (CI, push rejection, lint), it exits non-zero — surface the output and stop.

### 5-7. Promote: `npm run release:promote -- $ARGUMENTS`

Opens the release → main PR, waits for CI, merges with `--merge`, tags the merge SHA, pushes the tag. The script captures and prints the merge SHA at the end — note it for the closing report.

### 8. Manual confirmation gate — build readiness

Before kicking off the (long) `npm run dist` inside `release:publish`, verify:

- You're on `main` at the just-tagged commit (`git log --oneline -1` should show the merge commit).
- `npm ci` has been run recently. If `package-lock.json` is newer than `node_modules/.package-lock.json` or `.package-lock.json` is missing, run `npm ci` now.
- No leftover state in `dist/` that would conflict — list it, and if old artifacts are present ask the user before deleting.

Ask the user to confirm before kicking off the build (5–10 min hot loop).

### 9-11. Publish: `npm run release:publish -- $ARGUMENTS`

Runs `npm run dist` in the background (the Bash tool's `run_in_background: true`), verifies artifacts, creates the GH Release, uploads. Detects prereleases (`v0.1.6-beta.1`, `v0.1.6-rc.1`) from the version string — uses `--prerelease` and skips `latest.yml` automatically.

### 12. Verify `ready-to-release` issues auto-closed on the merge to main

**You shouldn't need to close anything here** — issues auto-close on the `release/$ARGUMENTS → main` merge from step 6 (feature PRs were squash-merged into the release branch with `Closes #N` preserved, and step 6 uses `--merge` not `--squash`, so the individual commits arrive on main intact).

Just verify:

```bash
gh issue list --milestone $ARGUMENTS --state all --json number,state,title \
  --jq '.[] | "[\(.state)] #\(.number) \(.title)"' --repo jaybrower/racelayer
```

Every entry should be `[CLOSED]`. If anything is still `[OPEN]`, close it by hand:

```bash
gh issue close <num> --reason completed --repo jaybrower/racelayer
```

### 13. Open the next release branch

Ask the user (via AskUserQuestion) what version to open next:

- Default suggestion: increment the patch (`v0.1.6` → `v0.1.7`). Recommend.
- Alternative: bump minor (`v0.1.6` → `v0.2.0`) if a meaningful feature line is closing.

Then run:

```bash
npm run release:open-next -- $NEXT
```

This branches, bumps, scaffolds, pushes, and creates the milestone. After it succeeds, ask the user (via AskUserQuestion) which open backlog issues to move into the new milestone. For each selected issue:

```bash
gh issue edit <num> --repo jaybrower/racelayer --milestone $NEXT
```

## Closing report

When done, post a single summary message listing:

- Release URL (`https://github.com/jaybrower/racelayer/releases/tag/$ARGUMENTS`)
- Tag SHA (captured from `release:promote` output)
- Number of issues closed
- New release branch + milestone
- Anything that needed manual intervention or was deferred

Keep it under 250 words. The full play-by-play is already in the TodoWrite progress + git history.

## Things that should make you stop and ask

- The release branch is missing or has unmerged PRs targeting it.
- `release-notes/$ARGUMENTS.md` doesn't exist, or still says `_Unreleased_` after `release:finalize` has supposedly run.
- CI fails on the finalize PR or the release-to-main PR.
- `release:publish` reports missing artifacts after `npm run dist`.
- The tag already exists on origin (`git ls-remote --tags origin $ARGUMENTS` returns a row).
- The GitHub Release for `$ARGUMENTS` already exists (`gh release view $ARGUMENTS --repo jaybrower/racelayer` succeeds).
- A script exits non-zero for any reason — read the output and ask before retrying.

When in doubt: stop, surface the situation, ask before continuing. A botched release is much worse than a slow one.
