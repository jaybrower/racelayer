import { useRef } from 'react'
import { useTelemetry } from '../../contexts/TelemetryContext'
import { useEditMode } from '../../hooks/useEditMode'
import { useDrag } from '../../hooks/useDrag'
import { useOverlayConfig } from '../../contexts/OverlayConfigContext'
import styles from './Gauges.module.css'

const MPH = 2.23694
const FALLBACK_REDLINE = 8000 // used until SDK reports the real value

const GEAR_LABEL: Record<number, string> = {
  [-1]: 'R',
  [0]: 'N',
}

function gearLabel(gear: number): string {
  return GEAR_LABEL[gear] ?? String(gear)
}

function formatDelta(s: number): string {
  if (!isFinite(s)) return '--'
  const sign = s <= 0 ? '-' : '+'
  return `${sign}${Math.abs(s).toFixed(3)}`
}

function formatFuel(liters: number, perHour: number): { level: string; lapsEst: string } {
  const perLap = perHour / (3600 / 92) // rough lap-time guess — real SDK gives per-lap
  const laps = perLap > 0 ? liters / perLap : 0
  return {
    level: liters.toFixed(1),
    lapsEst: laps > 0 ? laps.toFixed(1) : '--',
  }
}

// ── Rolling trace chart ───────────────────────────────────────────────────────

const TRACE_SAMPLES = 150  // 15 s at 10 Hz
const TRACE_W = 500
const TRACE_H = 100

function TraceChart({ throttle, brake }: { throttle: number; brake: number }) {
  const bufRef = useRef<Array<{ throttle: number; brake: number }>>(
    Array.from({ length: TRACE_SAMPLES }, () => ({ throttle: 0, brake: 0 }))
  )

  // Append newest sample to the right; old data scrolls left and falls off index 0.
  // Mutating a ref during render is intentional — no state involved.
  bufRef.current = [...bufRef.current.slice(1), { throttle, brake }]
  const buf = bufRef.current

  const xOf = (i: number) => (i / (TRACE_SAMPLES - 1)) * TRACE_W
  const yOf = (v: number) => TRACE_H - v * TRACE_H

  const tPoints = buf.map((s, i) => `${xOf(i)},${yOf(s.throttle)}`).join(' ')
  const bPoints = buf.map((s, i) => `${xOf(i)},${yOf(s.brake)}`).join(' ')

  const gridY = [25, 50, 75]

  return (
    <svg
      viewBox={`0 0 ${TRACE_W} ${TRACE_H}`}
      preserveAspectRatio="none"
      className={styles.traceChart}
    >
      {/* Horizontal grid lines */}
      {gridY.map((y) => (
        <line
          key={y}
          x1={0} y1={y} x2={TRACE_W} y2={y}
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {/* Filled areas under each trace */}
      <polygon
        points={`0,${TRACE_H} ${tPoints} ${TRACE_W},${TRACE_H}`}
        fill="rgba(74,222,128,0.14)"
      />
      <polygon
        points={`0,${TRACE_H} ${bPoints} ${TRACE_W},${TRACE_H}`}
        fill="rgba(248,113,113,0.14)"
      />

      {/* Trace lines */}
      <polyline points={tPoints} fill="none" stroke="#4ade80" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <polyline points={bPoints} fill="none" stroke="#f87171" strokeWidth="2" vectorEffect="non-scaling-stroke" />

      {/* Labels */}
      <text x={6} y={TRACE_H - 5} fontSize="11" fill="rgba(74,222,128,0.6)" fontFamily="system-ui">T</text>
      <text x={18} y={TRACE_H - 5} fontSize="11" fill="rgba(248,113,113,0.6)" fontFamily="system-ui">B</text>
    </svg>
  )
}

// ── Driver aid indicator ──────────────────────────────────────────────────────

/**
 * Compact TC / ABS block.
 *   • Dim when the aid is configured but currently idle.
 *   • Faded / "OFF" label when the dial is set to 0.
 *   • Amber border + background when the system is actively intervening.
 */
function AidBlock({
  label, level, active, activeColor,
}: {
  label: string
  level: number
  active: boolean
  /** Solid hex color used for border, label, and dot when the aid is firing */
  activeColor: string
}) {
  const off = level < 0.5
  // Convert #rrggbb → rgba(r,g,b,α) for border and background tints
  const hex = activeColor.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return (
    <div
      className={styles.aidBlock}
      style={{
        borderColor: active ? `rgba(${r},${g},${b},0.75)` : 'rgba(100,116,139,0.25)',
        background:  active ? `rgba(${r},${g},${b},0.10)` : 'rgba(255,255,255,0.03)',
        opacity:     off ? 0.35 : 1,
      }}
    >
      <span
        className={styles.aidLabel}
        style={{ color: active ? activeColor : '#64748b' }}
      >
        {label}
      </span>
      <span className={styles.aidLevel}>{off ? 'OFF' : Math.round(level)}</span>
      <div
        className={styles.aidDot}
        style={{ background: active ? activeColor : 'rgba(100,116,139,0.25)' }}
      />
    </div>
  )
}

// ── Main overlay ─────────────────────────────────────────────────────────────

export default function Gauges() {
  const t = useTelemetry()
  const editMode = useEditMode()
  const { onMouseDown, dragging } = useDrag(editMode)
  const { config } = useOverlayConfig()

  const sType = t.sessionType === 'unknown' ? 'practice' : t.sessionType
  const el = config.gauges.elements

  // Return null when the overlay is disabled for this session (but keep it in edit mode)
  if (!config.gauges.enabled[sType] && !editMode) return null

  // Hide entirely when the driver is in an iRacing menu (garage / get-in-car /
  // replay / spectator). Edit mode bypasses this so overlays can be positioned.
  if (t.connected && !t.isOnTrack && !editMode) return null

  const hide = config.global.hideUnsupportedElements
  const show = {
    rpmBar:     el.rpmBar[sType]     ?? true,
    inputTrace: el.inputTrace[sType] ?? false,
    gear:       el.gear[sType]       ?? true,
    speed:      el.speed[sType]      ?? true,
    delta:      el.delta[sType]      ?? false,
    fuel:       el.fuel[sType]       ?? true,
    // TC/ABS: respect per-session config AND auto-hide if car doesn't support them
    tc:  (el.tc[sType]  ?? true) && (!hide || t.capabilities.hasTractionControl),
    abs: (el.abs[sType] ?? true) && (!hide || t.capabilities.hasABS),
  }

  const maxRpm   = t.playerCarRedLine > 0 ? t.playerCarRedLine : FALLBACK_REDLINE
  const speedMph = t.speed * MPH
  const rpmPct   = Math.min(1, t.rpm / maxRpm)
  const fuel     = formatFuel(t.fuelLevel, t.fuelUsePerHour)
  const deltaValid    = isFinite(t.lapDeltaToBestLap)
  const deltaPositive = t.lapDeltaToBestLap > 0

  // Gradient always spans the full bar width regardless of current fill amount.
  // background-size stretches the image so its right edge aligns with the bar's right edge.
  const rpmGradientStyle = {
    backgroundImage: 'linear-gradient(90deg, #1e3a8a 0%, #1d4ed8 18%, #0ea5e9 38%, #06b6d4 54%, #10b981 66%, #eab308 76%, #f97316 86%, #ef4444 93%, #b91c1c 100%)',
    backgroundSize:  rpmPct > 0.01 ? `${Math.round(100 / rpmPct)}% 100%` : '10000% 100%',
    backgroundRepeat: 'no-repeat' as const,
  }

  // Tick marks at every 1000 RPM up to (but not including) redline
  const rpmTicks: number[] = []
  for (let r = 1000; r < maxRpm; r += 1000) rpmTicks.push(r)

  if (!t.connected) {
    return (
      <div className={`${styles.container} ${editMode ? styles.editMode : ''}`}
        onMouseDown={onMouseDown}
        style={{ cursor: editMode ? (dragging ? 'grabbing' : 'grab') : 'default' }}>
        {editMode && <div className={styles.editBanner}>✥ DRAG TO REPOSITION</div>}
        <span className={styles.disconnected}>Waiting for iRacing…</span>
      </div>
    )
  }

  return (
    <div
      className={`${styles.container} ${editMode ? styles.editMode : ''}`}
      onMouseDown={onMouseDown}
      style={{ cursor: editMode ? (dragging ? 'grabbing' : 'grab') : 'default' }}
    >
      {editMode && <div className={styles.editBanner}>✥ DRAG TO REPOSITION</div>}
      {/* RPM bar — full width at top */}
      {show.rpmBar && (
        <div className={styles.rpmBar}>
          <div className={styles.rpmFill} style={{ width: `${rpmPct * 100}%`, ...rpmGradientStyle }} />
          {rpmTicks.map((r) => (
            <div key={r} className={styles.rpmTick} style={{ left: `${(r / maxRpm) * 100}%` }} />
          ))}
          <span className={styles.rpmLabel}>{Math.round(t.rpm).toLocaleString()}</span>
        </div>
      )}

      {/* Throttle / brake rolling trace */}
      {show.inputTrace && <TraceChart throttle={t.throttle} brake={t.brake} />}

      {/* Main info row */}
      <div className={styles.mainRow}>
        {/* Gear */}
        {show.gear && (
          <div className={styles.gearBlock}>
            <span className={styles.gearValue}>{gearLabel(t.gear)}</span>
          </div>
        )}

        {/* Driver aids — shown next to gear when car supports them */}
        {show.tc  && <AidBlock label="TC"  level={t.tc.level}  active={t.tc.active}  activeColor="#fbbf24" />}
        {show.abs && <AidBlock label="ABS" level={t.abs.level} active={t.abs.active} activeColor="#a78bfa" />}

        {/* Speed */}
        {show.speed && (
          <div className={styles.metricBlock}>
            <span className={styles.bigValue}>{Math.round(speedMph)}</span>
            <span className={styles.metricUnit}>MPH</span>
          </div>
        )}

        {/* Delta */}
        {show.delta && (
          <div className={styles.metricBlock}>
            <span
              className={styles.deltaValue}
              style={{ color: !deltaValid ? '#64748b' : deltaPositive ? '#f87171' : '#4ade80' }}
            >
              {formatDelta(t.lapDeltaToBestLap)}
            </span>
            <span className={styles.metricUnit}>DELTA</span>
          </div>
        )}

        {/* Fuel */}
        {show.fuel && (
          <div className={styles.metricBlock}>
            <span className={styles.fuelValue}>{fuel.level}L</span>
            <span className={styles.metricUnit}>{fuel.lapsEst} laps</span>
          </div>
        )}
      </div>
    </div>
  )
}
