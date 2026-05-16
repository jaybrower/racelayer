import { HashRouter, Routes, Route } from 'react-router-dom'
import { TelemetryProvider } from './contexts/TelemetryContext'
import { OverlayConfigProvider } from './contexts/OverlayConfigContext'
import Relative from './overlays/Relative'
import Gauges from './overlays/Gauges'
import PitStrategy from './overlays/PitStrategy'
import TireTemps from './overlays/TireTemps'
import Radar from './overlays/Radar'
import Settings from './pages/Settings'
import PerfHud from './pages/PerfHud'
import { PerfProfiler } from './hooks/usePerfProfiler'

export default function App() {
  return (
    <TelemetryProvider>
      <OverlayConfigProvider>
        <HashRouter>
          <Routes>
            {/* Each overlay route is wrapped in a PerfProfiler so the Perf HUD
                (issue #32) can show per-overlay render-time stats.  The wrapper
                is a no-op when collection is disabled, which is the default. */}
            <Route path="/relative"     element={<PerfProfiler id="relative"><Relative /></PerfProfiler>} />
            <Route path="/gauges"       element={<PerfProfiler id="gauges"><Gauges /></PerfProfiler>} />
            <Route path="/pit-strategy" element={<PerfProfiler id="pit-strategy"><PitStrategy /></PerfProfiler>} />
            <Route path="/tire-temps"   element={<PerfProfiler id="tire-temps"><TireTemps /></PerfProfiler>} />
            <Route path="/radar"        element={<PerfProfiler id="radar"><Radar /></PerfProfiler>} />
            <Route path="/settings"     element={<Settings />} />
            {/* Perf HUD itself isn't profiled — measuring the measurement tool
                would just be confusing, and its render cost is irrelevant
                outside of dev / support-debug sessions. */}
            <Route path="/perf-hud"     element={<PerfHud />} />
            <Route path="*" element={
              <div style={{ color: '#aaa', padding: 16, fontSize: 12, fontFamily: 'monospace' }}>
                RaceLayer — no route matched
              </div>
            } />
          </Routes>
        </HashRouter>
      </OverlayConfigProvider>
    </TelemetryProvider>
  )
}
