import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { IRacingTelemetry } from '../types/telemetry'
import { EMPTY_TELEMETRY } from '../types/telemetry'

const TelemetryContext = createContext<IRacingTelemetry>(EMPTY_TELEMETRY)

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const [telemetry, setTelemetry] = useState<IRacingTelemetry>(EMPTY_TELEMETRY)

  useEffect(() => {
    window.iracingOverlay.onTelemetryUpdate((data) => {
      setTelemetry(data as IRacingTelemetry)
    })
    return () => {
      window.iracingOverlay.removeAllListeners('telemetry:update')
    }
  }, [])

  return (
    <TelemetryContext.Provider value={telemetry}>
      {children}
    </TelemetryContext.Provider>
  )
}

export const useTelemetry = () => useContext(TelemetryContext)
