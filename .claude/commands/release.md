---
description: Run the full release cycle for the given version (finalize, tag, build, publish, open next)
argument-hint: vX.Y.Z
---

You are running the RaceLayer release pipeline. The user typed `/release $ARGUMENTS` — that argument is the version being shipped (e.g. `v0.1.6`).

The full process is documented below as a 12-step checklist. Walk through it sequentially. Use the TodoWrite tool to track progress — the user wants to see each step move from pending → in_progress → completed. If a step needs a judgment call (e.g. which issues to move into the next milestone), pause and ask via AskUserQuestion. **Never skip the manual-confirmation gates** (steps 1, 7, 12) — they exist because a release is irreversible.

The branch policy + tagging conventions are documented at the top of `CLAUDE.md` — read that section first if you need a refresher. The release-notes file lives at `release-notes/$ARGUMENTS.md` (e.g. `release-notes/v0.1.6.md`).

## Preconditions

Before doing anything, verify:

1. The current directory is `C:\code\iracing-overlay` (use `pwd`).
2. The `release/$ARGUMENTS` branch exists locally and on origin.
3. All work the user wants in this release has already merged into `release/$ARGUMENTS` via PRs. (If there are open PRs against the release branch, **stop and ask** whether to wait, abandon them, or proceed without them.)
4. `release-notes/$ARGUMENTS.md` exists and reflects the actual changes that landed.

If any precondition fails, stop and report — don't try to recover.

## The 12 steps

### 1. Confirm scope with the user

Print a summary of what's about to happen:

- The list of commits on `release/$ARGUMENTS` that aren't on `main` yet (`git log --oneline main..release/$ARGUMENTS`).
- The list of issues in the `$ARGUMENTS` milestone with `ready-to-release` label that will be auto-closed.
- The current `package.json` version (sanity check — should already match `$ARGUMENTS` since CLAUDE.md says to bump at branch-open; if it doesn't, fold the bump into step 2).

Ask the user to confirm before proceeding. If they say no, stop.

### 2. Finalize PR (release-notes + version sanity)

```bash
git checkout -b chore/finalize-$ARGUMENTS release/$ARGUMENTS
```

Edits to make:

- **Flip `_Unreleased_` → `_Released YYYY-MM-DD_`** in `release-notes/$ARGUMENTS.md`. Use today's date.
- **Bump version if needed.** `package.json` and the `Version: \`X.Y.Z\`` line in `CLAUDE.md` should already match. If they don't (because the bump was missed at branch-open), include those edits in this commit.

Commit:

```bash
git add package.json CLAUDE.md release-notes/$ARGUMENTS.md
git commit -m "chore: finalize $ARGUMENTS release"
git push -u origin chore/finalize-$ARGUMENTS
```

Open the PR targeting the release branch:

```bash
gh pr create --base release/$ARGUMENTS --repo jaybrower/racelayer \
  --title "chore: finalize $ARGUMENTS release" \
  --body "..."
```

Wait for CI to pass (`gh pr checks <num> --watch`).

### 3. Merge the finalize PR

```bash
gh pr merge <num> --repo jaybrower/racelayer --squash --delete-branch
```

Verify it merged. Update local `release/$ARGUMENTS` (`git checkout release/$ARGUMENTS && git pull`).

### 4. Open release → main PR

```bash
gh pr create --base main --head release/$ARGUMENTS --repo jaybrower/racelayer \
  --title "Release $ARGUMENTS" \
  --body "..."
```

The body should be a digest of the changes — pull the `## Added` / `## Changed` / `## Fixed` sections from `release-notes/$ARGUMENTS.md`. **Omit the `## Internal` section** — the user prefers that stays in the in-repo release docs but doesn't appear in user-facing release surfaces.

Wait for CI to pass.

### 5. Merge release → main as a merge commit (not squash)

Past releases preserve per-feature history on `main`:

```bash
gh pr merge <num> --repo jaybrower/racelayer --merge
```

Pull main locally:

```bash
git checkout main && git pull
```

Capture the merge commit SHA — you'll tag it next.

### 6. Tag the release on the merge commit

```bash
git tag -a $ARGUMENTS -m "$ARGUMENTS" <merge-sha>
git push origin $ARGUMENTS
```

### 7. Manual confirmation gate — build readiness

Before running the (long) `npm run dist`, verify:

- You're on `main` at the just-tagged commit (`git log --oneline -1` should show the merge commit).
- `npm ci` has been run recently — if there's any doubt, run it now to make sure the lockfile + node_modules are in sync. (If `package-lock.json` is newer than `node_modules/.package-lock.json` or if there's no `.package-lock.json` at all, run `npm ci`.)
- No leftover state in `dist/` that would conflict — list it, and if it has old artifacts ask the user before deleting.

Ask the user to confirm before kicking off the build (it's a 5–10 min hot loop on this machine and they may want to step away first).

### 8. Build the artifacts

```bash
npm run dist
```

Run this with `run_in_background: true` since it takes minutes. Stream it with the Monitor tool or check back when it finishes (the Bash tool will notify you).

When it completes, list `dist/` and verify these four files exist with the right version in the name:

- `RaceLayer-X.Y.Z.exe` (NSIS installer)
- `RaceLayer-X.Y.Z.exe.blockmap`
- `RaceLayer-portable-X.Y.Z.exe`
- `latest.yml`

If any are missing, stop and surface the build error to the user.

### 9. Create the GitHub Release with stripped notes

Strip the `## Internal` section (and everything until the next `## ` heading or EOF) from the release notes for the GitHub Release body. The in-repo `release-notes/$ARGUMENTS.md` keeps the Internal section — only the GitHub-facing copy is trimmed.

```bash
awk '/^## Internal/{flag=1; next} /^## /{flag=0} !flag' release-notes/$ARGUMENTS.md > /tmp/release-notes-public.md
gh release create $ARGUMENTS --repo jaybrower/racelayer \
  --title "$ARGUMENTS" \
  --notes-file /tmp/release-notes-public.md \
  --latest
```

For prereleases (`v0.1.6-beta.1` / `v0.1.6-rc.1`), use `--prerelease` instead of `--latest` and **do not upload `latest.yml`** in step 10 (per CLAUDE.md: stable users would otherwise be offered the beta via electron-updater).

### 10. Upload the artifacts to the release

For a stable release, upload all four files:

```bash
gh release upload $ARGUMENTS \
  dist/RaceLayer-${VERSION}.exe \
  dist/RaceLayer-${VERSION}.exe.blockmap \
  dist/RaceLayer-portable-${VERSION}.exe \
  dist/latest.yml \
  --repo jaybrower/racelayer
```

(Where `${VERSION}` is `$ARGUMENTS` without the leading `v`.)

For a prerelease, omit `latest.yml`.

### 11. Close `ready-to-release` issues in the milestone

```bash
gh issue list --label ready-to-release --milestone $ARGUMENTS \
  --state open --json number --jq '.[].number' --repo jaybrower/racelayer \
  | xargs -I{} gh issue close {} --reason completed --repo jaybrower/racelayer
```

Verify by listing the milestone — all entries should be `[CLOSED]` now.

### 12. Open the next release branch

Ask the user (via AskUserQuestion) what version to open next:

- Default suggestion: increment the patch (`v0.1.6` → `v0.1.7`). Recommend.
- Alternative: bump minor (`v0.1.6` → `v0.2.0`) if a meaningful feature line is closing.

Once they answer, call the next version `$NEXT`:

```bash
git checkout main && git pull
git checkout -b release/$NEXT main
```

Edits:

- Bump `package.json` to the version without the `v` prefix.
- Bump `CLAUDE.md`'s `Version: \`X.Y.Z\`` line.
- Create `release-notes/$NEXT.md` from the skeleton template (see `release-notes/v0.1.6.md` for the format — `# $NEXT`, `_Unreleased_`, four empty `## Added/Changed/Fixed/Internal` sections).

Commit + push:

```bash
git add package.json CLAUDE.md release-notes/$NEXT.md
git commit -m "chore: open $NEXT release branch"
git push -u origin release/$NEXT
```

Finally, create the GitHub milestone and offer to move open backlog issues into it:

```bash
gh api -X POST repos/jaybrower/racelayer/milestones \
  -f title="$NEXT" \
  -f description="Next release. Tracking issues moved over from the post-$ARGUMENTS backlog."
```

List open issues with no milestone and ask the user (via AskUserQuestion) which to move in. Then for each selected issue:

```bash
gh issue edit <num> --repo jaybrower/racelayer --milestone $NEXT
```

## Closing report

When done, post a single summary message to the user listing:

- Release URL (`https://github.com/jaybrower/racelayer/releases/tag/$ARGUMENTS`)
- Tag SHA
- Number of issues closed
- New release branch + milestone
- Anything that needed manual intervention or was deferred

Keep it under 250 words. The full play-by-play is already in the TodoWrite progress + git history.

## Things that should make you stop and ask

- The release branch is missing or has unmerged PRs targeting it.
- `release-notes/$ARGUMENTS.md` doesn't exist, or still says `_Unreleased_` after you've supposedly finalized it.
- CI fails on the finalize PR or the release-to-main PR.
- `npm run dist` produces fewer than the expected four artifacts, or produces them with a mismatched version string.
- The tag already exists on origin (`git ls-remote --tags origin $ARGUMENTS` returns a row).
- The GitHub Release for `$ARGUMENTS` already exists (`gh release view $ARGUMENTS --repo jaybrower/racelayer` succeeds).

When in doubt: stop, surface the situation, ask before continuing. A botched release is much worse than a slow one.
