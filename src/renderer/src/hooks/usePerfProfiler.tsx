// React.Profiler wrapper that batches per-commit render durations and flushes
// them to the main process for aggregation by the Perf HUD (issue #32).
//
// Lifecycle:
//   • On mount, asks main whether collection is enabled (`perf:getEnabled`)
//     and subscribes to changes (`perf:enabled`).
//   • While enabled, every Profiler `onRender` callback pushes a duration
//     into a local buffer.
//   • A 500 ms timer flushes the buffer via `perf:recordRender`.  Batching
//     keeps the IPC rate tractable (2 Hz × 5 overlays = 10 msgs/sec, vs.
//     10 Hz × 5 = 50 if we sent each commit individually).
//   • When disabled, the timer is torn down and the Profiler still mounts
//     but its `onRender` becomes a no-op (cost ≈ a single boolean check
//     and the React-internal phase work React already does in dev).
//
// The component is identity-transparent to its children — it adds a single
// React.Profiler node, no DOM, no styling, no extra divs.

import { Profiler, useEffect, useRef, useState, type ReactNode, type ProfilerOnRenderCallback } from 'react'

/** How often (ms) we flush the buffered samples to main.  500 ms is a
 *  compromise between IPC rate and HUD freshness — the HUD updates at 1 Hz
 *  anyway, so a sub-second flush already keeps it accurate. */
const FLUSH_INTERVAL_MS = 500

interface Props {
  /** Stable identifier — appears as the row label in the Perf HUD.
   *  Match the overlay route name (`'gauges'`, `'relative'`, …) for clarity. */
  id: string
  children: ReactNode
}

export function PerfProfiler({ id, children }: Props) {
  const [enabled, setEnabled] = useState(false)
  const bufferRef = useRef<number[]>([])

  // Subscribe to enable/disable + ask for current state.
  useEffect(() => {
    let cancelled = false
    window.iracingOverlay.getPerfEnabled().then((on) => {
      if (!cancelled) setEnabled(on)
    })
    window.iracingOverlay.onPerfEnabled(setEnabled)
    return () => {
      cancelled = true
      window.iracingOverlay.removeAllListeners('perf:enabled')
    }
  }, [])

  // Flush loop: only running while collection is on.
  useEffect(() => {
    if (!enabled) return
    const tick = () => {
      const buf = bufferRef.current
      if (buf.length === 0) return
      // Snapshot + clear in one step so a concurrent onRender during the IPC
      // call doesn't drop samples (React commits are synchronous so this is
      // really just defensive — but it costs nothing).
      const out = buf.slice()
      buf.length = 0
      window.iracingOverlay.reportRenderSamples(id, out)
    }
    const handle = setInterval(tick, FLUSH_INTERVAL_MS)
    return () => {
      clearInterval(handle)
      // Drop any unsent samples — they'd skew the next session's window.
      bufferRef.current.length = 0
    }
  }, [enabled, id])

  // Profiler always mounts; the callback gates on `enabled`.  Keeping it
  // mounted means we don't pay a re-render whenever collection toggles.
  const onRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
    if (!enabled) return
    bufferRef.current.push(actualDuration)
  }

  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  )
}
