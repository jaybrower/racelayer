<!--
Branch targeting:
 - Feature/bug PRs:   feat/* | fix/* | chore/*   →   release/vX.Y.Z   (the active release branch)
 - Release PRs:       release/vX.Y.Z              →   main             (release manager only)
 - Hotfix PRs:        hotfix/vX.Y.Z.N             →   main             (then forward-merge to release)

Branch policy and full conventions live in CLAUDE.md.
-->

## Summary

<!-- 1–3 sentences on what changed and why.  Reviewer reads this first. -->

Closes #<!-- ISSUE NUMBER --> <!-- or `Fixes #N` / `Resolves #N` — required for every non-trivial PR -->

## Why

<!-- The motivating problem or use case, if not obvious from the issue. -->

## Implementation notes

<!-- Anything a reviewer would want to know before reading the diff:
     architecture decisions, alternative approaches considered, what's
     intentionally out of scope, etc.  Delete if not applicable. -->

## Test plan

<!-- Replace the boxes below with the actual checks you ran.  Reference the
     manual test-plan sections (docs/test-plan.md) that this change touches —
     if a section needs updating to keep the manual checklist accurate, do
     it in this PR. -->

- [ ] `npm test` passes locally
- [ ] Manually verified the change in preview mode (`npm run dev`)
- [ ] Manually verified in a live iRacing session, if the change is telemetry-related
- [ ] Updated `docs/test-plan.md` if user-visible behaviour changed

## Checklist

- [ ] Linked issue referenced above (see CLAUDE.md → branch policy → "Every PR must reference a GitHub issue")
- [ ] `release-notes/vX.Y.Z.md` updated (or `no-release-notes` label applied for behaviour-preserving PRs)
- [ ] `CLAUDE.md` updated if architecture, conventions, or notable gotchas changed
- [ ] New pure logic has a unit test in `tests/` (per the testing strategy in `CLAUDE.md`)
