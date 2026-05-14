# RaceLayer — CLAUDE.md

> **Documentation rule:** Whenever code changes are made in this repo — new features, bug fixes, config additions, SDK variable discoveries — update this file and `README.md` in the same commit. The goal is for `CLAUDE.md` to always reflect the actual state of the codebase so future sessions can onboard instantly without re-deriving context from reading source files.

> **Branch policy:** `main` tracks the **latest released code** — every merge into `main` is a release moment. `main` requires a pull request; direct pushes are blocked. The workflow uses three branch kinds plus an occasional fourth:
>
> | Branch | Purpose | Cut from | Merges to |
> |---|---|---|---|
> | `main` | Latest released code (one commit per release) | n/a | n/a |
> | `release/vX.Y.Z` | Staging area for the next release; one active at a time | `main` (when the release is opened) | `main` (at release time) |
> | `feat/short-name` | One feature or fix at a time | `main` | active `release/vX.Y.Z` |
> | `hotfix/vX.Y.Z` | Urgent patch against a shipped release | `main` | `main`, then forward-merge into active `release/*` |
>
> **Why this shape:** features get smaller, more focused PRs into the release branch; pre-release builds can be cut from `release/*` without disturbing `main`; `main`'s history reads as a release log. One release branch is open at a time so feature targeting stays simple.
>
> **Start-of-session recipe** — always branch features from `main`, not from the active release branch:
> ```bash
> git checkout main && git pull
> git checkout -b feat/your-feature-name
> # ... build and commit ...
>
> # When ready to open the PR, rebase onto the active release branch
> git fetch origin
> git rebase origin/release/v0.1.3   # whichever release is open
> git push -u origin feat/your-feature-name
> # Open PR: feat/your-feature-name → release/v0.1.3 (NOT main)
> ```
> Branching from `main` keeps features release-agnostic — a feature that doesn't ship with the active release can simply be retargeted to the next one without re-baselining.
>
> **Escape hatch:** if a feature depends on changes already accepted into the active release branch (e.g. extending a config type another in-flight feature added), branch from `release/vX.Y.Z` directly instead. This should be rare; the strong default is `main`.
>
> **Opening a new release branch** — done by the release manager when the next release is ready to start accumulating features:
> ```bash
> git checkout main && git pull
> git checkout -b release/v0.1.3
> # Bump version in package.json + CLAUDE.md to 0.1.3 in the same commit that creates the branch
> git push -u origin release/v0.1.3
> ```
> Bumping the version at branch creation means every feature merging into the release sees the right version number; pre-release builds can be tagged as `v0.1.3-beta.N` directly off the release branch.
>
> **Tagging conventions:**
> - **Stable releases** (`v0.1.3`) are tagged on the merge commit on `main` after the release-branch PR lands.
> - **Pre-release builds** (`v0.1.3-beta.1`, `v0.1.3-rc.1`) are tagged on the `release/v0.1.3` branch itself. Mark these as `--prerelease` on GitHub and **do not upload `latest.yml`** for them, or stable users would be offered the beta via `electron-updater`.
>
> **Hotfix flow:**
> ```bash
> git checkout main && git pull
> git checkout -b hotfix/v0.1.2.1
> # Fix, bump patch version, commit
> git push -u origin hotfix/v0.1.2.1
> # Open PR: hotfix/* → main
> # After merge + tag + release: forward-merge main into the active release branch
> git checkout release/v0.1.3 && git pull
> git merge main && git push
> ```
>
> **Branch naming:** keep names short and conventional-commits-aligned — `feat/closing-rate`, `fix/pit-mode-gap`, `chore/branch-policy-update`. Release branches always carry the `v` prefix to match git tags: `release/v0.1.3`, never `release/0.1.3`.

## What This Is

An Electron + React overlay application that renders real-time telemetry from iRacing onto a transparent, always-on-top window. Built for Windows. Each overlay is its own `BrowserWindow` (transparent, frameless, `alwaysOnTop: screen-saver`). A tray icon and Settings window are the only non-overlay UI.

App name: **RaceLayer** | Package name: `racelayer` | Version: `0.1.2`
GitHub: `https://github.com/jaybrower/racelayer`

## Project Structure

```
iracing-overlay/
├── src/
│   ├── main/                  # Electron main process (Node.js)
│   │   ├── index.ts           # App entry: creates windows, tray, IPC, polling loop
│   │   ├── iracingSdk.ts      # iRacing shared-memory reader via koffi FFI
│   │   ├── telemetry.ts       # Polling loop + IRacingTelemetry type (main-side)
│   │   ├── mockTelemetry.ts   # Simulated data for dev mode
│   │   ├── config.ts          # Overlay config persistence (per-user JSON files)
│   │   ├── devMode.ts         # Dev mode state (enable/disable + session type)
│   │   └── shortcuts.ts       # Global keyboard shortcuts (register/update/save)
│   ├── preload/
│   │   └── index.ts           # contextBridge — exposes window.iracingOverlay API
│   └── renderer/src/          # React frontend (Vite, TypeScript)
│       ├── App.tsx            # HashRouter routes: one route per overlay + /settings
│       ├── main.tsx           # React entry point
│       ├── contexts/
│       │   ├── TelemetryContext.tsx      # Subscribes to telemetry:update IPC events
│       │   └── OverlayConfigContext.tsx  # Loads/saves overlay config via IPC
│       ├── hooks/
│       │   ├── useDrag.ts     # Custom drag via window:getPosition / window:setPosition IPC
│       │   └── useEditMode.ts # Listens for overlay:editMode broadcast
│       ├── overlays/
│       │   ├── Gauges/        # RPM bar, input trace, gear, speed, delta, fuel
│       │   ├── Relative/      # Proximity list (position, gap, iR, SR, pos Δ, est. iR Δ)
│       │   ├── PitStrategy/   # Fuel calc, tire deg history, pit window
│       │   ├── TireTemps/     # 4-corner temp display with color coding
│       │   └── Radar/         # Disabled (code kept for future revisit)
│       ├── pages/
│       │   └── Settings/      # Settings window: dev mode, shortcuts, overlay config
│       └── types/
│           ├── telemetry.ts   # IRacingTelemetry, CarTelemetry, DriverInfo, SessionType
│           ├── overlayConfig.ts  # OverlayConfig type, defaults, mergeWithDefaults
│           ├── config.ts      # (legacy config type, may overlap overlayConfig)
│           └── global.d.ts    # window.iracingOverlay type declaration
├── resources/                 # App icons (icon.png, icon.ico, icon-tray.png)
├── scripts/
│   └── generate-icons.mjs    # Generates icon.png at multiple sizes + icon.ico
├── electron.vite.config.ts   # Electron-Vite build config
├── electron-builder.json5    # Packaging config (NSIS + portable, GitHub Releases)
└── package.json
```

## Running Locally

```bash
# Dev (hot-reload, opens all overlay windows + settings)
npm run dev

# Type check only
npx tsc --noEmit

# Build + package (produces NSIS installer + portable .exe)
npm run dist

# Build without packaging (for testing the built output)
npm run dist:dir

# Regenerate app icons from scratch
npm run icons
```

iRacing must be running for real telemetry. Use **Dev Mode** (Settings → Developer Mode) to show overlays with simulated data without iRacing.

## Tech Stack

- **Electron** (main process) — window management, IPC, tray, global shortcuts
- **Vite + React 19 + TypeScript** (renderer) — overlay UIs, Settings page
- **CSS Modules** — each overlay has its own `*.module.css`
- **koffi** — FFI library to call Win32 APIs from Node.js (no native compilation needed)
- **electron-vite** — unified build tool for Electron + Vite
- **electron-builder** — packaging to NSIS installer + portable `.exe`

## Architecture Patterns

### How Overlays Work

Each overlay is a separate `BrowserWindow` — transparent, frameless, `alwaysOnTop: 'screen-saver'`, `setIgnoreMouseEvents(true, { forward: true })`. All windows load the same renderer (`index.html`) at different hash routes (`#/relative`, `#/gauges`, etc.).

Overlays are **hidden by default** and only shown (`showInactive()`) when iRacing reports connected. They're hidden again when iRacing disconnects.

### IPC Channels

| Channel | Direction | Description |
|---|---|---|
| `telemetry:update` | main → renderer | Fired every poll tick (60ms) with full `IRacingTelemetry` |
| `overlay:editMode` | main → renderer | Broadcast when layout mode toggles |
| `devMode:changed` | main → renderer | Broadcast on dev mode state change |
| `config:changed` | main → renderer | Broadcast when any overlay config saved |
| `config:get` | renderer → main | Load overlay config JSON |
| `config:set` | renderer → main | Save overlay config JSON + broadcast |
| `devMode:get/set` | renderer → main | Read/write dev mode state |
| `shortcuts:get/set` | renderer → main | Read/update global shortcuts |
| `window:getPosition` | renderer → main | Get window's current screen position |
| `window:setPosition` | renderer → main | Move window during custom drag |
| `positions:reset` | renderer → main | Reset all overlay positions to defaults |
| `startup:get` | renderer → main | Returns `boolean` — whether app is registered as a login item |
| `startup:set` | renderer → main | Accepts `boolean` — registers or removes the Windows login item |
| `app:version` | renderer → main | Returns current app version string from `app.getVersion()` |
| `update:getStatus` | renderer → main | Returns current `UpdateStatus` object |
| `update:check` | renderer → main | Triggers `autoUpdater.checkForUpdates()` |
| `update:download` | renderer → main | Triggers `autoUpdater.downloadUpdate()` |
| `update:install` | renderer → main | Calls `autoUpdater.quitAndInstall()` |
| `update:status` | main → renderer | Broadcast on every update state transition |

### Telemetry Pipeline

1. `telemetry.ts` polls every ~60ms via `iracingSdk.ts`
2. `iracingSdk.ts` reads iRacing's Windows named memory-mapped file (`Local\IRSDKMemMapFileName`) using koffi FFI calls to `OpenFileMapping` / `MapViewOfFile`
3. Parses variable headers, builds `varMap`, reads typed values at byte offsets
4. Constructs `IRacingTelemetry` and passes to the callback in `index.ts`
5. `index.ts` calls `broadcastToAll('telemetry:update', telemetry)` to all overlay windows
6. `TelemetryContext.tsx` in the renderer listens and stores in React state

Dev mode bypasses iRacing entirely — `mockTelemetry.ts` generates simulated data.

### Overlay Config System

All overlays share a single unified config stored as `overlays.json` in the user's Electron `userData` directory. The config is typed in `src/renderer/src/types/overlayConfig.ts`.

**Key types:**
```typescript
type SType = 'practice' | 'qualifying' | 'race'
type SessionFlags = Record<SType, boolean>  // per-session-type toggle
```

Every configurable element uses `SessionFlags` so each can be independently toggled per session type. New overlays added to the config must also add a branch in `mergeWithDefaults()` so saved configs from older versions get the new field's default value.

**`GlobalConfig`** contains settings that apply across all overlays:
```typescript
interface GlobalConfig {
  hideUnsupportedElements: boolean  // default: true
}
```
When `hideUnsupportedElements` is true, overlays and elements that require car-specific capabilities (surface tire temps, TC, ABS) are automatically hidden when the current car doesn't expose those SDK variables. Each overlay is responsible for reading `config.global.hideUnsupportedElements` and gating itself.

`OverlayConfigContext.tsx` loads config on mount, exposes `{ config, update }`. Each overlay reads from `useOverlayConfig()`.

**Important hook ordering:** All hooks (`useTelemetry`, `useOverlayConfig`, `useEditMode`, `useDrag`, `useMemo`, `useRef`, `useEffect`) must be called **before** any conditional `return null` — enforce Rules of Hooks. Use `visibility: hidden` instead of conditional rendering for optional grid columns to keep CSS grid layout stable.

### Window Position Persistence

Saved in `<userData>/config/overlays/positions_<monitorKey>.json` where `monitorKey` encodes the current display configuration (bounds + positions of all monitors joined by `_`). Positions include `x`, `y`, `width`, `height`. Separate layouts per monitor config — plugging in/out a monitor doesn't break saved positions.

Custom drag is implemented without `frame: true` drag — overlays use `setIgnoreMouseEvents` and pass `forward: true`, so mousedown events still reach the renderer. `useDrag` reads the window's current position via IPC, then sends new positions on `mousemove`.

## iRacing SDK Notes

**Shared memory:** `Local\IRSDKMemMapFileName` (named memory-mapped file, Windows only). The header describes variable offsets; `varMap` is built by parsing variable headers at startup.

**Tire temp variables:**
- `LFtempCL/CM/CR` — carcass (internal, slow-changing, always present)
- `LFtempL/M/R` — surface (live, only present in some cars/configs)
- At connect time, `tireTempMode` is set to `'surface'` or `'carcass'` based on whether `LFtempL` exists in `varMap`
- `hasSurfaceTireTemps` capability flag is also set at this point and drives auto-hide in the TireTemps overlay

**Car capabilities** are detected once per connection in `buildVarMap()` and stored in a module-level `carCapabilities` variable:
```typescript
hasSurfaceTireTemps: 'LFtempL' in varMap,
hasTractionControl:  'dcTractionControl' in varMap,
hasABS:              'dcABS' in varMap,
```
Capabilities are reset to `false` in `closeMemory()`. The renderer receives them as part of every `IRacingTelemetry` payload.

**CarIdxTrackSurface enum** (irsdk_TrkLoc):
- `-1` = NotInWorld (skip these cars)
- `0` = OffTrack
- `1` = InPitStall
- `2` = AproachingPits
- `3` = OnTrack ← use this for `onTrack: true`

**Position in practice:** `CarIdxPosition` returns `0` in practice sessions (no race classification). Show `--` instead of `P0`.

**f2Time:** `CarIdxF2Time` — seconds relative to player. Negative = car is ahead of player. **Unreliable in practice sessions** (returns 0 for cars without a set lap time). The Relative overlay replaces it with a `lapDistPct`-based calculation:
```typescript
function computeRelativeGap(car, playerLapDistPct, playerLap, referenceLapTime) {
  const diff = (car.lap + car.lapDistPct) - (playerLap + playerLapDistPct)
  const wrapped = diff - Math.round(diff)  // wraps to [-0.5, 0.5] shortest path
  return -wrapped * referenceLapTime
}
```
`referenceLapTime` is derived from the best lap of any car that has completed at least one lap, falling back to the SDK's `sessionTimeRemain / (totalLaps - currentLap)` estimate.

**AI drivers:** `CarIsAI: 1` in session YAML for all AI-controlled cars. Do **not** filter them out of the driver list — they have valid names, car numbers, and all their telemetry is meaningful. Only filter pace cars (`CarIsPaceCar: 1`).

**TC / ABS SDK variables:**
- `dcTractionControl` — float, current dial level (0 = off)
- `TractionControlActive` — bool, system currently intervening
- `dcABS` — float, current ABS dial level (0 = off)
- `BrakeABSactive` — bool, ABS currently intervening

**Fuel calc:** Don't use `fuelUsePerHour` for laps-remaining at rest (shows ~2 L/hr at idle = 1,300+ laps). Instead, measure actual fuel delta at lap boundaries (rolling 5-lap average). Fall back to `fuelUsePerHour` only when `> 5 L/hr` (engine actually under load).

## Overlay Details

### Gauges (`/gauges`, 860×180)
RPM bar, throttle/brake input trace, gear indicator, speed, lap delta to best, fuel level, TC and ABS indicators. Each element independently configurable per session type.

TC/ABS are rendered via the `AidBlock` component which accepts a single `activeColor` hex string and derives rgba tints at render time (border at 0.75 opacity, background at 0.10 opacity). TC uses amber (`#fbbf24`), ABS uses purple (`#a78bfa`). Both auto-hide when `config.global.hideUnsupportedElements` is true and the car lacks the corresponding capability.

### Relative (`/relative`, 460×520)
Shows cars within ±5 positions of player sorted by computed gap (not `f2Time` — see SDK Notes). 9-column grid:
`34px 28px 30px 1fr 48px 44px 54px 62px 48px`
Columns: Position | Pos-Δ | Car# | Name | iRating | Safety Rating | Est. iR Δ | Gap | Closing Rate

Gap is shown to tenths of a second (e.g. `+1.3`). Lapped cars show `+N Lap` / `-N Lap`.

**Closing Rate column** shows how fast each car is closing on / pulling away from the player in seconds-per-lap. Positive value (green/red depending on direction) = closing, negative = separating. Computed via least-squares linear regression over an 8-second rolling window of gap history per car (`gapHistoryRef`, updated in a `useEffect` once per telemetry tick). Cells stay blank when fewer than 3 samples are recorded, the time span is <1s, or the magnitude is below the 0.05 s/lap noise floor. History is cleared per car on a sudden gap jump >20s (lapping, off-track→on-track transition, session reset) and dropped entirely when a car leaves the on-track set.

Color convention: green = good-for-player (catching a car ahead OR pulling away from a car behind), red = bad-for-player. The sign convention is unified across rows — positive always means closing — and the color disambiguates whether closing is good or bad for the player.

**Pit mode** kicks in when the player car is `inPit` (surface `1`=InPitStall or `2`=AproachingPits). The player's `LapDistPct` reflects pit-lane position rather than racing-line position, so the gap math becomes meaningless. While in pit:
- The list is sorted by `car.position` (classified leaderboard rank) instead of by computed gap; unclassified cars (`position === 0`) sort to the end so they can't displace the player from the visible window.
- The player remains in the visible set even though `!onTrack`, so they stay the slicing anchor.
- The Gap column renders `—` (dim gray) and the Closing Rate column is forcibly hidden — both are mathematically nonsense against the pit-lane reference.
- Gap history is cleared on entry to pit (in the `useEffect`) so the regression doesn't poison itself with parked-player samples after rejoining.
- A `PIT` badge appears in the overlay header next to the session badge.

Safety Rating is rendered by the `SafetyBadge` component as a letter + symbol badge, color-coded by sub-rating value:
- `≤ 2.0` → red (`#f87171`) + `!`
- `≤ 3.0` → amber (`#fbbf24`) + `▲`
- `≤ 4.0` → green (`#4ade80`) + `★`
- `> 4.0` → blue (`#38bdf8`) + `✦`

Est. iR Δ uses an Elo-style formula:
```
expectedPos = 1 + Σ P(opponent beats car)  where P = 1/(1 + 10^((myIR - opponentIR)/1000))
iRΔ ≈ round((expectedPos - actualPos) × (200 / N))
```
Only meaningful in official race sessions; always computed but shown/hidden via config.

### Pit Strategy (`/pit-strategy`, 360×420)
Three sections (each independently toggled via config):
- **Fuel** — current level, per-lap consumption (measured at lap boundaries), laps remaining
- **Tire Deg** — session-best lap as rolling baseline (updates while improving, locks at peak); up to 3 most recent non-best laps with delta to best; prominent avg-delta headline number
- **Pit Window** — estimated last lap to pit based on current fuel

**Tire Deg logic:** `fastestLap = flyingLaps.reduce(min by time)` — recalculated every render from the **flying-laps subset** of history (`lapHistory.filter(r => !r.pitAffected)`) so it always reflects the true session best on clean tires. Recent laps exclude the fastest lap so the display shows actual wear laps, not the peak repeated. `avgDelta` is the mean of those ≤3 laps' delta to best. Color thresholds: green ≤ 0.1s, amber ≤ 0.5s, red > 0.5s. All laps kept in `lapHistoryRef` (max 30); diffs computed at render time, never stored.

**Pit-affected lap filtering:** Each `LapRecord` carries a `pitAffected: boolean` flag indicating whether the player was on pit road at any point during that lap (out-lap, in-lap, or a full pit stop mid-lap). A sticky `wasInPitThisLapRef` is OR'd with the player's per-tick `inPit` state and committed into the record at lap completion, then reset for the new lap. It's initialized to `true` at session start (every session begins with the player in the pit stall, so lap 1 is always an out-lap). Pit-affected laps are filtered out of *both* the best-lap baseline and the recent-laps display — otherwise an out-lap's time would either become a fake "best" or get fed into the avg-deg headline number as catastrophic wear.

### Tire Temps (`/tire-temps`, 220×145)
4-corner colored blocks (inner/mid/outer). Color scale: `#1e293b` (cold/no data) → blue → green → yellow → red (hot). Uses surface temps if available, falls back to carcass temps (logged to console at connect time).

### Radar (`/radar`, disabled)
Code exists in `src/renderer/src/overlays/Radar/`. Disabled because `CarIdxF2Time` data isn't granular enough for a useful proximity display in practice. Window is commented out in `OVERLAYS` array in `index.ts`. Re-enable when better positional data is available.

## Settings Window (680×560)

Six sections:
1. **General** — launch-on-startup toggle (calls `app.setLoginItemSettings`; reads back on mount via `app.getLoginItemSettings`)
2. **Updates** — current version badge + update lifecycle (check → download → restart & install); powered by `electron-updater`
3. **Developer Mode** — enable/disable, pick simulated session type (practice/qualifying/race)
4. **Keyboard Shortcuts** — live-record new shortcuts (modifier-key combos only), with conflict detection
5. **Overlay Visibility** — table of all overlays and elements with per-session-type checkboxes
6. **Overlay Positions** — instructions for layout mode + "Reset to defaults" button

IPC channels for startup: `startup:get` (returns `boolean`) and `startup:set` (accepts `boolean`). Both call Electron's `app.getLoginItemSettings()` / `app.setLoginItemSettings()` which writes the Windows login item registry key — no additional libraries needed.

### In-App Updater (`src/main/updater.ts`)
Uses `electron-updater` (reads `publish` config from `package.json` — GitHub provider). `autoDownload: false` so the user explicitly triggers the download. `autoInstallOnAppQuit: true` so a downloaded update installs cleanly on normal exit even if the user doesn't click "Restart & Install".

**Update state machine:** `idle → checking → available | not-available | error`, then `available → downloading → ready → (restart & install)`.

IPC channels: `update:getStatus`, `update:check`, `update:download`, `update:install`, `app:version`.
The main process broadcasts `update:status` events to all windows so the Settings UI stays in sync.

**Important for releases:** GitHub releases must include the `latest.yml` file that electron-builder generates in `dist/`. This is the manifest `electron-updater` uses to find and verify the download. Upload it alongside the `.exe` files.

Default shortcuts:
- Layout Mode (toggle drag): `Ctrl+Shift+L`
- Open Settings: `Ctrl+Shift+O`

## Packaging

`electron-builder.json5` targets NSIS installer + portable `.exe`. Both in `dist/`.

**Important `asarUnpack` entries:**
- `resources/**` — PNG icons accessed at runtime via `app.getAppPath()`
- `**/node_modules/koffi/**` — native FFI bindings can't be inside `.asar`

Icon files live in `resources/` (generated by `scripts/generate-icons.mjs` using a canvas-based renderer). `buildResources/` (electron-builder default) is not used — icon path is explicitly configured.

## Known Gotchas

- **Bash tool can't `cd` into Windows paths** — use PowerShell (`Set-Location`) or pass absolute paths to git commands directly
- **`enableLargerThanScreen: true`** is set on all overlay windows to bypass Windows shell constraint that clamps windows to the work area
- **`koffi` must be in `asarUnpack`** or the FFI calls will fail in production builds
- **`tireTempMode`** is module-level state in `iracingSdk.ts` — reset to `'carcass'` in `closeMemory()`
- **Radar overlay** is intentionally excluded from the `OVERLAYS` array in `main/index.ts` and from the Settings config table — its window definition is commented out with an explanatory note
- **`computeIRChanges`** returns an empty Map (not zeros) when fewer than 2 rated cars exist — callers should use `?? null` when reading from it
- **`CarIdxF2Time` is unreliable in practice** — returns 0 for any car that hasn't set a lap time yet. Use the `lapDistPct`-based `computeRelativeGap()` function instead (see SDK Notes)
- **AI driver filter** — do not filter on `CarIsAI` when building the driver list. AI cars have valid names and telemetry. Only filter `CarIsPaceCar`
- **`carCapabilities` is module-level state** in `iracingSdk.ts` — reset to all-false in `closeMemory()`, same as `tireTempMode`
- **`mergeWithDefaults` must be kept in sync** — every new field added to `OverlayConfig` or any nested interface needs a corresponding merge branch, otherwise stored configs from older builds will silently drop the new field's default
