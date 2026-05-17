# Performance baselines

This document captures RaceLayer's measured performance overhead, so we can
spot regressions in future PRs and answer "does RaceLayer cause my iRacing
framerate to drop?" with data instead of vibes.

It's the deliverable for [issue #32](https://github.com/oiddad/racelayer/issues/32).
The acceptance bar is in the issue; the short version: total CPU < 5% on a
modern desktop with all overlays on, no measurable iRacing FPS drop in a
full-grid race, no heap growth slope over a 60-min session.

## How to measure

### In-app Perf HUD

RaceLayer ships an in-app Perf HUD that surfaces:

- Per-overlay React render time (rolling p50 / p95 / max over the last ~60 s).
- Per-process CPU% and working-set memory from `app.getAppMetrics()`.
- Whole-app totals at the top.

**Toggle:** press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>P</kbd>
to show or hide the HUD. Off by default — zero overhead when hidden (no
samples collected, no IPC traffic, no timers running). The HUD itself isn't
included in its own measurements.

The shortcut is intentionally undocumented in the Settings → Shortcuts pane.
It's a dev / support tool, not a normal user feature. Mention it when
remote-debugging perf reports from end users.

### Chrome DevTools (renderer-side details)

For deeper render-tree investigation:

1. In dev mode (`npm run dev`), open DevTools on any overlay window
   (right-click → Inspect, or `Ctrl+Shift+I`).
2. **Performance** tab → record a 60 s sample while live telemetry is
   flowing. Look for long tasks, frequent GCs, or layout thrash.
3. **Memory** tab → take a heap snapshot at the start of a session, drive
   for 30+ minutes, take another. Diff for retained objects.

In a production build, DevTools is closed by default; open it with
`Ctrl+Shift+I` against any overlay window for the same workflow.

### iRacing FPS comparison

The only way to confirm RaceLayer doesn't tank sim framerate is to measure
both states on the same lap:

1. Press <kbd>Ctrl</kbd>+<kbd>F</kbd> in iRacing to show the FPS readout.
2. Drive a lap with **all overlays enabled**, note the steady-state FPS.
3. From the system tray, **quit RaceLayer entirely**.
4. Drive the same lap again, note the FPS.

The delta is RaceLayer's impact. On a full-grid race the most useful
comparison is at race start (highest GPU load — full pack visible) and
mid-race once the field has spread out.

## Scenarios

These are the standard scenarios for the v1.0 baseline. Each scenario should
be run once per hardware tier we publish baselines for (currently just "modern
desktop"; "low-end laptop" once someone with the hardware can run it).

### 1. Practice, 20-car field, all overlays on

Quick warmup scenario. 5–10 minutes of lapping.

| Metric | Value | Notes |
|---|---|---|
| Total CPU% | _TBD_ | All five overlays + main process |
| Total memory (MB) | _TBD_ | Working set across all processes |
| iRacing FPS (RaceLayer ON) | _TBD_ | Steady-state on a clear lap |
| iRacing FPS (RaceLayer OFF) | _TBD_ | Same lap, same conditions |
| FPS delta | _TBD_ | ON minus OFF — closer to 0 is better |
| p95 render time (worst overlay) | _TBD_ | ms; from Perf HUD |

### 2. Race, 40+ car field, all overlays on

Full-grid stress test. Daytona / Le Mans 24h grid or any series that fields
a full pack.

| Metric | Value | Notes |
|---|---|---|
| Total CPU% | _TBD_ | |
| Total memory (MB) | _TBD_ | |
| iRacing FPS (RaceLayer ON) | _TBD_ | Race start, full pack visible |
| iRacing FPS (RaceLayer OFF) | _TBD_ | Same race, fresh attempt |
| FPS delta | _TBD_ | |
| p95 render time (worst overlay) | _TBD_ | |
| Relative-overlay render p95 | _TBD_ | Per-tick work over `t.cars` is suspect #1 |

### 3. Long-stint endurance (60+ min)

Watch for heap growth slope. Take a heap snapshot at t=0 and t=60min,
diff for retained objects.

| Metric | Value | Notes |
|---|---|---|
| Memory at t=0 (MB) | _TBD_ | |
| Memory at t=30min (MB) | _TBD_ | |
| Memory at t=60min (MB) | _TBD_ | |
| Growth slope (MB/hr) | _TBD_ | Should be flat after warmup |
| Any visible UI degradation? | _TBD_ | Pause cadence, late paints, etc. |

### 4. Low-end hardware (optional)

If we can find an iGPU laptop or 6-core desktop, repeat scenarios 1–2 and
note where the floor is. This lets us publish minimum-hardware guidance.

## Findings

Track significant findings here as the measurement passes complete. File
follow-up issues for specific hot spots; this document is just the summary.

- _Pending first measurement pass._

## Test environment

When recording numbers above, fill in this section so the data is
interpretable.

| Item | Value |
|---|---|
| CPU | _TBD_ |
| GPU | _TBD_ |
| RAM | _TBD_ |
| OS | Windows _TBD_ |
| Display config | _TBD_ (e.g. "3× 1440p, 144 Hz, 100% scaling") |
| iRacing graphics preset | _TBD_ |
| RaceLayer version | _TBD_ |
| Date | _TBD_ |
