# RaceLayer

A lightweight, customizable iRacing HUD overlay for Windows. Transparent overlays sit on top of iRacing and display real-time telemetry — no performance impact, no fuss.

## Overlays

> `†` = not available on all cars; RaceLayer auto-hides these when the current car doesn't support them.

### Relative
Proximity list centered on your car — shows drivers ahead and behind with configurable columns.

- Gap to player (seconds / laps)
- Current position
- Position gained/lost vs. starting grid
- iRating and Safety Rating
- Estimated iRating change based on current race positions (Elo-style formula)

### Gauges
A full-width instrument bar across the bottom of your screen.

- RPM bar with redline indicator
- Throttle and brake input trace
- Current gear
- Speed (MPH)
- Lap delta to personal best
- Fuel level
- Traction Control indicator `†` — shows dial level and flashes when actively intervening
- ABS indicator `†` — shows dial level and flashes when actively intervening

### Pit Strategy
Fuel and tire data to help plan your pit stop.

- Current fuel and consumption rate (measured lap-by-lap, not instantaneous)
- Laps remaining on current fuel
- Lap-time history for the current stint with per-lap degradation
- Estimated "pit by lap" based on fuel window

### Tire Temps `†`
Four-corner tire temperature display with color-coded heat mapping — cold to hot across each tire's inner, middle, and outer zones. Shows live surface temps when available, falls back to carcass temps otherwise.

## Features

- **Launch on startup** — optional Windows login item so RaceLayer is waiting in the tray whenever you sit down to race; toggle in Settings
- **Per-session-type visibility** — configure each overlay and element independently for practice, qualifying, and race sessions
- **Auto-hide unsupported elements** — items marked `†` are automatically hidden when the current car doesn't support them; no manual configuration needed
- **Safety rating badges** — Safety Rating column shows a color-coded letter+icon badge (red/yellow/green/blue) based on sub-rating value for instant at-a-glance reads
- **Draggable layout mode** — press a shortcut to unlock all overlays for repositioning; positions are saved per monitor configuration
- **Dev mode** — preview overlays with simulated data without iRacing running
- **Configurable shortcuts** — remap the layout-mode and settings shortcuts to whatever key combo you want
- **No performance overhead** — overlays are hidden when iRacing is not running; telemetry is read from shared memory, not injected

## Installation

Download the latest release from the [Releases](https://github.com/jaybrower/racelayer/releases) page.

Two options:
- **RaceLayer-Setup-x.x.x.exe** — standard installer, adds a system tray icon on startup
- **RaceLayer-x.x.x-portable.exe** — single file, no installation required

> **Windows only.** Requires a 64-bit version of Windows 10 or later.

## Usage

1. Launch RaceLayer — a tray icon appears in the system tray
2. Start iRacing and load into a session — overlays appear automatically
3. Right-click the tray icon or press `Ctrl+Shift+O` to open Settings

### Layout Mode

Press `Ctrl+Shift+L` to enter Layout Mode. All overlays become draggable — position them anywhere on screen, then press the shortcut again to lock them in place. Positions are saved separately for each monitor configuration.

### Settings

- **General** — toggle launch on Windows startup
- **Developer Mode** — show overlays with simulated data without iRacing running; choose which session type to simulate
- **Keyboard Shortcuts** — click Edit next to any shortcut and press your preferred key combo
- **Overlay Visibility** — checkboxes to show or hide each overlay and individual elements per session type
- **Overlay Positions** — reset all overlays to their default screen positions

## Building from Source

**Prerequisites:** Node.js 18+, Windows (required for iRacing shared memory access in dev)

```bash
git clone https://github.com/jaybrower/racelayer.git
cd racelayer
npm install

# Run in development mode (hot reload)
npm run dev

# Build a distributable installer
npm run dist
```

The installer and portable executable are written to the `dist/` folder.

## Tech

- [Electron](https://www.electronjs.org/) — desktop shell
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) — overlay UIs
- [koffi](https://koffi.dev/) — FFI bindings to read iRacing's shared memory via Win32 API (no native compilation required)
- [electron-vite](https://electron-vite.org/) — build tooling

## License

MIT
