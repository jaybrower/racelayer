import { HashRouter, Routes, Route } from 'react-router-dom'
import { TelemetryProvider } from './contexts/TelemetryContext'
import { OverlayConfigProvider } from './contexts/OverlayConfigContext'
import Relative from './overlays/Relative'
import Gauges from './overlays/Gauges'
import PitStrategy from './overlays/PitStrategy'
import TireTemps from './overlays/TireTemps'
import Radar from './overlays/Radar'
import Settings from './pages/Settings'

export default function App() {
  return (
    <TelemetryProvider>
      <OverlayConfigProvider>
        <HashRouter>
          <Routes>
            <Route path="/relative"     element={<Relative />} />
            <Route path="/gauges"       element={<Gauges />} />
            <Route path="/pit-strategy" element={<PitStrategy />} />
            <Route path="/tire-temps"   element={<TireTemps />} />
            <Route path="/radar"        element={<Radar />} />
            <Route path="/settings"     element={<Settings />} />
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
