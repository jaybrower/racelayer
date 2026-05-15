# RaceLayer Manual Test Plan

> **Purpose.** Catch regressions that automated tests can't: real-vs-mock telemetry behaviour, window/IPC plumbing, drag/edit mode, settings persistence, the updater flow, and the half-second of UX polish that matters most when someone first installs the app.
>
> **When to run.** Walk the relevant sections before merging a release-branch PR into `main`. Quick smoke (everything tagged 🔥) before any tagged build; full pass before a stable release.

## How automated tests fit in

Pure logic — stint detection, closing-rate regression, tire-deg trend, formatters, `mergeWithDefaults` — is covered by Vitest (`npm test`). **If you're here to find tests for the math, don't.** Add them under `tests/` and let CI catch regressions automatically.

This file covers everything Vitest can't: rendering, IPC, real Windows behaviour, electron-updater, and the moments where two things have to be true at the same time (drag while connected, session change while in pit, etc.).

## Environment matrix

Run each release candidate through these combinations at least once:

| Mode | Telemetry | Notes |
|---|---|---|
| **Dev mode (race)**          | `mockTelemetry.ts` | Fast loop; use for UI checks |
| **Dev mode (qualifying)**    | `mockTelemetry.ts` | Verify session-type-conditional UI |
| **Dev mode (practice)**      | `mockTelemetry.ts` | Verify `lap=0` / `position=0` edge handling |
| **Live (offline test)**      | iRacing offline session | Real SDK plumbing without paying for an iRating dip |
| **Live (race)**              | iRacing official race  | Only for milestone releases — the real proving ground |

---

## 🔥 Quick smoke (≈5 min, before any tagged build)

Before tagging any build (including beta/RC) walk this short loop:

- [ ] `npm test` passes locally
- [ ] `npm run dev` launches with no errors in the dev console
- [ ] All four overlays appear with mock data (Relative, Gauges, Pit Strategy, Tire Temps)
- [ ] Tray icon appears; right-click shows menu
- [ ] Settings window opens via tray menu
- [ ] Settings → Developer Mode toggle works; overlays react immediately
- [ ] `Ctrl+Shift+L` enters/exits layout mode; overlays show edit banner
- [ ] `Ctrl+Shift+O` opens Settings (verify it still works after the shortcut was just toggled)
- [ ] Quit via tray menu — no zombie processes left in Task Manager

If any of those fail, stop and fix before tagging.

---

## App lifecycle

- [ ] **First launch** — fresh install (or after deleting `<userData>`): all overlays appear at sensible default positions, no error toasts, no console errors.
- [ ] **Subsequent launch** — positions, dev mode state, shortcuts, and overlay config persist from the previous run.
- [ ] **Launch on startup** — toggling Settings → General → "Launch on startup" updates `app.getLoginItemSettings()`. Reboot Windows; RaceLayer auto-launches.
- [ ] **Tray icon** — right-click shows menu, double-click opens settings (or whatever the default is), icon disappears cleanly on quit.
- [ ] **Quit from tray** — process exits, no orphaned `electron.exe` instances.

## Cockpit-only rendering (v0.1.3+)

This was the v0.1.3 fix for overlays appearing in menus. Re-verify on every release that the gating still works:

- [ ] In iRacing, before entering the car (garage/setup screen): all overlays are hidden.
- [ ] On the "get in car" screen: all overlays remain hidden.
- [ ] After entering the cockpit: all four overlays appear within ~1 sec.
- [ ] Hit ESC to return to the garage: all overlays disappear.
- [ ] Replay viewer / spectator mode: overlays hidden.
- [ ] **Edit mode is the exception** — `Ctrl+Shift+L` shows overlays everywhere, including the garage, so positioning works without being on track. Verify this.
- [ ] **Disconnect message still shows** — when iRacing isn't running at all, the "Waiting for iRacing…" message appears (we don't hide that — only the cockpit-only check is bypassed).

## Connection lifecycle

- [ ] **iRacing not running** — every overlay shows the muted "Waiting for iRacing…" message (verify on Relative, Gauges, Pit Strategy, Tire Temps).
- [ ] **iRacing starts** — overlays populate within ~1 sec of session start without a refresh / app restart.
- [ ] **iRacing quits mid-session** — overlays return to the disconnect state within a few seconds; no stuck data, no crash.
- [ ] **Reconnect** — start iRacing again, enter a session: overlays repopulate cleanly. No stale data from the previous session.

## Drag / layout mode

- [ ] `Ctrl+Shift+L` toggles edit mode. Every overlay shows the **"✥ DRAG TO REPOSITION"** banner.
- [ ] Click-and-drag moves the window smoothly. No lag, no jump-to-cursor.
- [ ] **Drag does not grow the window** — pick an overlay, note its width/height, drag it across the full width of the primary monitor, release. Final size matches the starting size to the pixel. Repeat at 100% / 125% / 150% / 200% Windows display scaling — regression for #29.
- [ ] Settings → Overlay Positions → "Reset to defaults" snaps every overlay back to its starting position.
- [ ] **Multi-monitor** — drag an overlay to a different monitor. After quit/relaunch it returns to that monitor.
- [ ] **Cross-monitor drag size** — on a multi-monitor setup with mixed scaling, drag an overlay from one display to another and back. Final size matches starting size.
- [ ] **Monitor unplug** — quit RaceLayer, change monitor config (unplug or rearrange), relaunch. Positions should be sensible (per-monitor-config save means they may revert to defaults for the new layout; that's intentional).
- [ ] **Click-through** — leave edit mode. Clicks now pass through the overlay to whatever's behind it. Hovering over a Twitch window, a browser, the desktop — none of them get "stolen" focus.

---

## Per-overlay scenarios

### Relative

#### Practice session
- [ ] Player position shows `--` (no race classification yet).
- [ ] Cars listed are sorted by closest gap, not by leaderboard position.
- [ ] Closing-rate column shows once history accumulates (~8s of data).
- [ ] iRating column shows; iR Δ column hidden by default.

#### Race session
- [ ] iR Δ column visible.
- [ ] Gap column shows `+1.3` style for sub-90s gaps.
- [ ] Lapped cars render as `+1 Lap` / `-1 Lap`.
- [ ] Safety-rating badge renders with class letter + tier icon, color-coded.
- [ ] Position-delta column shows `+`/`-` gained-or-lost vs start grid.
- [ ] Closing rate: positive (closing) shows green if it benefits the player, red if not. Negative (separating) follows the inverted convention. Convention: **green = good for player**.

#### Pit mode
- [ ] Drive into pit road. Header gets a **PIT** badge.
- [ ] List sort flips from gap-based to position-based.
- [ ] Player row stays visible even though `!onTrack`.
- [ ] Gap column renders `—` (dim).
- [ ] Closing-rate column is hidden entirely.
- [ ] Exit pit; back on track. Gap and closing rate return after a few seconds (history rebuilds — no lingering pit-lane samples).

#### Closing-rate edge cases
- [ ] **Lapping someone** — when you lap a car or are lapped, the closing-rate cell briefly blanks then re-establishes (≥20s gap jump clears history).
- [ ] **Empty history** — first ~8 seconds after a car appears on track, its closing-rate cell is blank.
- [ ] **Below noise floor** — cars holding station should show a blank cell, not flickering ±0.02 numbers.

#### CarLeftRight side indicator
- [ ] **Player row only** — chevrons (`◀ #N ▶`) appear flanking the player's car number; no chevrons render on any other row.
- [ ] **Clear / off** — no cars alongside → both chevrons hidden (cell width does not jitter).
- [ ] **One car on left** — left chevron lights amber, right hidden.
- [ ] **One car on right** — right chevron lights amber, left hidden.
- [ ] **Cars on both sides** — both chevrons lit.
- [ ] **Two-cars-side** — the value collapses to the matching side (no separate "double" visual; that's intentional).
- [ ] **Pit mode** — chevrons suppressed entirely once the player enters pit (column hidden along with closing-rate).
- [ ] **Settings toggle** — turn "Side Indicator" off in Settings → chevrons disappear immediately; on → they return on the next adjacent-car event.

#### AI and pace cars
- [ ] AI cars appear in the list with their real names and iRating (don't filter them out).
- [ ] Pace car does NOT appear in the list.

### Gauges

- [ ] RPM bar tracks engine RPM smoothly, no jumpy redraws.
- [ ] Input trace shows ~15s of throttle (green) + brake (red).
- [ ] Gear shows `R`, `N`, or a number; `R` for reverse, `N` for neutral.
- [ ] Speed shows MPH with one decimal.
- [ ] Lap delta shows `+`/`-` with 3 decimals; renders `--` when no best lap yet.
- [ ] **TC / ABS auto-hide** — load a car without TC: TC tile hidden. Same for ABS. Setting → General → "Hide unsupported elements" off: tiles re-appear regardless.
- [ ] **TC active** — when TC kicks in, the tile flashes amber (`#fbbf24`).
- [ ] **ABS active** — when ABS kicks in, the tile flashes purple (`#a78bfa`).
- [ ] Fuel: liters renders to 1 decimal; per-lap estimate shows `--` when fuelUsePerHour is zero (engine off/idle).

### Pit Strategy

- [ ] Fuel section — current level shows; per-lap shows "(est.)" early, switches to "(avg)" after the first sampled lap.
- [ ] Per-lap value is sensible (e.g. 2-4 L per lap for most road cars).
- [ ] Laps-remaining color codes: red <3, amber <6, green ≥6.
- [ ] **Tire Deg** appears after at least one clean (non-pit-affected) lap.
- [ ] **Stint of N** badge increments as you complete clean laps.
- [ ] **Stint best** row shows the fastest lap of the current stint.
- [ ] **Last lap** row only renders when it's not also the stint best (no duplicate row).
- [ ] **Trend (vs LAST N)** appears after lap 2 of the stint, muted styling through lap 3, full color from lap 4+.
- [ ] **vs STINT BEST** renders below the trend; always ≥ 0.
- [ ] **Pit Window → "Pit by Lap N"** shows once fuel-per-lap is known.

#### Pit-affected lap filtering
- [ ] Make a pit stop. The in-lap and the lap after rejoining (out-lap) should NOT appear in the stint — `Stint of N` resets to 0 then climbs back from 1 on the next clean lap.
- [ ] Lap 1 of any session is automatically excluded (out-lap by definition).

### Tire Temps

- [ ] All four corners render with a color scale: blue (cold) → green → yellow → red (hot).
- [ ] Inner/Mid/Outer sub-blocks visible for each corner.
- [ ] **Surface temps** for cars that expose `LFtempL`-style variables (live, fast-changing).
- [ ] **Carcass temps** for cars that don't expose surface — values change slowly, console logs `tireTempMode = 'carcass'` at connect time.
- [ ] Auto-hide: load a car the SDK reports no tire temps for, with `hideUnsupportedElements: true`. Tire Temps overlay disappears.

### Radar

- [ ] **In a live iRacing pack** — when a car comes alongside, the matching edge of the Radar lights amber. (Pre-v0.1.4 this was off by one: "clear" rendered as "car on left". Verify in a real session, not mock data.)
- [ ] **Mock data sanity** — in dev mode, the side-edge highlight alternates between left and right as the mock cycles `CarLeftRight` through 2 → 3 → 4 → 5 → 6.

---

## Settings window

- [ ] **General** — startup toggle round-trips with Windows login items.
- [ ] **Updates** — current version badge shows the package.json version. (See **Updater** section below for the rest.)
- [ ] **Developer Mode** — toggle on: overlays receive mock data immediately. Pick a session type (practice / qualifying / race); the Relative overlay updates its column visibility accordingly within a second or two.
- [ ] **Keyboard Shortcuts** — change a shortcut to a different modifier combo (e.g. `Ctrl+Alt+L`). Verify the new combo works and the old combo does NOT.
- [ ] **Shortcut conflict detection** — try to bind two actions to the same combo. The UI should refuse / warn.
- [ ] **Overlay Visibility** — flip a per-session-type checkbox. The corresponding overlay/column hides immediately.
- [ ] **Overlay Positions** — "Reset to defaults" snaps every overlay back. Edit mode instructions are clear.

## In-app updater

Don't skip this — broken auto-update is the worst class of bug.

- [ ] Settings → Updates → "Check for updates" with current version === latest GitHub release: status reads "You're on the latest version."
- [ ] Same check when a newer version exists: status changes to "Update available" with a download button.
- [ ] **Download** click triggers `electron-updater` download. Progress bar updates. (For a beta build of v0.1.4-beta.1, fake this by publishing a beta on GitHub and updating from `latest.yml` published with v0.1.3.)
- [ ] After download completes: status reads "Update ready"; "Restart and install" button appears.
- [ ] Click "Restart and install" → app quits, NSIS installer runs, RaceLayer relaunches at the new version.
- [ ] **`latest.yml` discipline** — Pre-release builds (`v0.1.4-beta.N`) must NOT publish `latest.yml` to GitHub, or stable users get offered the beta. Verify the release manager followed the rule (release notes section that mentions it: see CLAUDE.md → Tagging conventions).

## Settings persistence

- [ ] Change overlay-visibility checkboxes, restart the app. Settings persist.
- [ ] Change shortcuts, restart. Persist.
- [ ] Change dev-mode state, restart. Persists.
- [ ] Drag an overlay, restart. Position persists for the current monitor config.
- [ ] **Forward-compat (rare but important)** — copy your `<userData>/overlays.json` aside, install an older RaceLayer build (e.g. v0.1.2), let it overwrite the config, then install the new build again. New fields should pick up their default values without crashing; existing values preserve. This is the `mergeWithDefaults` guarantee — automated tests cover the function but verify the round-trip at least once per release manually.

---

## Performance

Approximate guardrails. If any of these get noticeably worse vs. the previous release, investigate before tagging.

- [ ] CPU at idle in a session: < 5% on a modern desktop CPU.
- [ ] Memory after 1 hour in a session: doesn't grow unboundedly.
- [ ] No GC stutters / frame drops visible while driving.
- [ ] Telemetry tick rate (`telemetry:update`) is steady at ~60ms — check dev tools console for any "ticks dropped" warnings if present.

---

## Known-good console output (dev mode)

When `npm run dev` runs cleanly:

```
[main] App ready
[main] Tray created
[main] Telemetry loop started (mock mode)
[main] Created 4 overlay windows
[main] Settings window created on demand
```

Console errors that DO appear and are safe to ignore:

- `Autofill.enable` failed — Chromium debug-only, not a real error
- React DevTools recommendation — informational only

Anything else is a real signal — investigate.

---

## After the release ships

- [ ] Tag stable on `main` only after the release-branch PR merges
- [ ] `latest.yml` uploaded to the stable release (NSIS-only — portable doesn't auto-update)
- [ ] At least one fresh install from the published `.exe` succeeds end-to-end
- [ ] In-app updater catches the new release from an older installed build
- [ ] `ready-to-release` issues from this milestone are closed (one-liner in `CLAUDE.md`)
