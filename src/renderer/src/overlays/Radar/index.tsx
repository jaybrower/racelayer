import { useMemo } from 'react'
import { useTelemetry } from '../../contexts/TelemetryContext'
import { useEditMode } from '../../hooks/useEditMode'
import { useDrag } from '../../hooks/useDrag'
import { useOverlayConfig } from '../../contexts/OverlayConfigContext'
import {
  CLR_LEFT,
  CLR_RIGHT,
  CLR_BOTH,
  CLR_2_LEFT,
  CLR_2_RIGHT,
} from '../Relative/lib'
import styles from './Radar.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

/** How many seconds of the track to show on each side of the player.
 *  Tight ±1s window keeps the focus on door-to-door battles; cars further
 *  out are best seen via the Relative overlay. */
const WINDOW_S = 1
/** Pixels per second on the display */
const PX_PER_S = 100
const TOTAL_H  = WINDOW_S * 2 * PX_PER_S  // full SVG height
const SVG_W    = 160                        // SVG viewBox width
/** Grid-line cadence in seconds.  At a ±1s window we want a half-second
 *  reference instead of the previous 1s gridlines + 3s labels. */
const GRID_STEP_S = 0.5

// Lane x-centres in the SVG (left | centre | right)
const LANE = { left: 28, centre: 80, right: 132 }
const CAR_W = 36
const CAR_H = 16

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert f2Time (positive = player is ahead of them = they are BEHIND player)
 *  to a y-coordinate.  Ahead of player → smaller y (top of SVG). */
function f2TimeToY(f2Time: number): number {
  // f2Time < 0  → car is ahead of player  → show above centre
  // f2Time > 0  → car is behind player    → show below centre
  const centreY = TOTAL_H / 2
  return centreY + f2Time * PX_PER_S
}

function carLabelColor(f2Time: number, clr: number): string {
  const absT = Math.abs(f2Time)
  if (absT < 1) return '#fbbf24'   // very close — amber warning
  if (f2Time < 0) return '#60a5fa' // ahead of player — blue
  return '#f97316'                  // behind player — orange
}

// ── Overlay ───────────────────────────────────────────────────────────────────

export default function Radar() {
  const t = useTelemetry()
  const editMode = useEditMode()
  const { onMouseDown, dragging } = useDrag(editMode)
  const { config } = useOverlayConfig()

  const sType = t.sessionType === 'unknown' ? 'race' : t.sessionType

  // useMemo must come before any conditional return (Rules of Hooks)
  const nearby = useMemo(() => {
    return t.cars
      .filter(c =>
        c.carIdx !== t.playerCarIdx &&
        (c.onTrack || c.inPit) &&
        Math.abs(c.f2Time) <= WINDOW_S + 0.5
      )
      .sort((a, b) => a.f2Time - b.f2Time) // ahead first
  }, [t.cars, t.playerCarIdx])

  if (!config.radar.enabled[sType] && !editMode) return null

  // Hide entirely when the driver is in an iRacing menu (garage / get-in-car /
  // replay / spectator). Edit mode bypasses this so overlays can be positioned.
  if (t.connected && !t.isOnTrack && !editMode) return null

  const containerClass = [styles.container, editMode ? styles.editMode : ''].join(' ')

  if (!t.connected) {
    return (
      <div className={containerClass} onMouseDown={onMouseDown}
        style={{ cursor: editMode ? (dragging ? 'grabbing' : 'grab') : 'default' }}>
        {editMode && <div className={styles.editBanner}>✥ DRAG TO REPOSITION</div>}
        <span className={styles.disconnected}>Waiting for iRacing…</span>
      </div>
    )
  }

  const clr = t.carLeftRight
  const hasLeft  = clr === CLR_LEFT  || clr === CLR_BOTH || clr === CLR_2_LEFT
  const hasRight = clr === CLR_RIGHT || clr === CLR_BOTH || clr === CLR_2_RIGHT

  // Assign lane positions: cars that are very close get left/right based on CarLeftRight signal
  const closeAhead  = nearby.filter(c => c.f2Time < 0  && Math.abs(c.f2Time) < 2)
  const closeBehind = nearby.filter(c => c.f2Time >= 0 && c.f2Time < 2)

  function laneFor(car: typeof nearby[0]): number {
    const isClose = Math.abs(car.f2Time) < 2
    if (!isClose) return LANE.centre
    // Try to assign left/right based on proximity flag for the closest cars
    const idx = closeAhead.concat(closeBehind).indexOf(car)
    if (hasLeft && idx === 0) return LANE.left
    if (hasRight && (idx === 1 || (idx === 0 && !hasLeft))) return LANE.right
    return LANE.centre
  }

  const centreY = TOTAL_H / 2

  return (
    <div className={containerClass} onMouseDown={onMouseDown}
      style={{ cursor: editMode ? (dragging ? 'grabbing' : 'grab') : 'default' }}>
      {editMode && <div className={styles.editBanner}>✥ DRAG TO REPOSITION</div>}
      <div className={styles.header}>RADAR</div>

      {nearby.length === 0 && (
        <div className={styles.noCars}>No cars within ±{WINDOW_S}s</div>
      )}

      <div className={styles.svgWrap}>
        <svg
          viewBox={`0 0 ${SVG_W} ${TOTAL_H}`}
          width="100%"
          height={TOTAL_H}
          className={styles.svg}
        >
          {/* ── Centre guideline ── */}
          <line x1={SVG_W / 2} y1={0} x2={SVG_W / 2} y2={TOTAL_H}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" />

          {/* ── Time grid lines every GRID_STEP_S, integer-second lines emphasised
                 and labelled.  At a ±1s window this draws half-second tick marks
                 with bold lines + labels at -1s, 0, +1s. ── */}
          {Array.from({ length: Math.round((WINDOW_S * 2) / GRID_STEP_S) + 1 }, (_, i) => {
            const t = -WINDOW_S + i * GRID_STEP_S
            const y = (t + WINDOW_S) * PX_PER_S
            const isInteger = Math.abs(t - Math.round(t)) < 1e-6
            const showLabel = isInteger && t !== 0
            return (
              <g key={i}>
                <line x1={0} y1={y} x2={SVG_W} y2={y}
                  stroke={isInteger ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'}
                  strokeWidth="1" />
                {showLabel && (
                  <text x={4} y={y + 9} fontSize="8"
                    fill="rgba(255,255,255,0.2)" fontFamily="system-ui">
                    {t > 0 ? `+${t}` : t}s
                  </text>
                )}
              </g>
            )
          })}

          {/* ── Left / right danger indicators ── */}
          {hasLeft && (
            <rect x={0} y={centreY - 24} width={8} height={48} rx={2}
              fill="rgba(251,191,36,0.35)" />
          )}
          {hasRight && (
            <rect x={SVG_W - 8} y={centreY - 24} width={8} height={48} rx={2}
              fill="rgba(251,191,36,0.35)" />
          )}

          {/* ── Opponent cars ── */}
          {nearby.map((car) => {
            const y    = f2TimeToY(car.f2Time)
            const cx   = laneFor(car)
            const col  = carLabelColor(car.f2Time, clr)
            const driver = t.drivers.find(d => d.carIdx === car.carIdx)
            const num  = driver?.carNumber ?? String(car.carIdx)
            const absT = Math.abs(car.f2Time)
            const opacity = absT < 0.5 ? 1 : absT < 2 ? 0.85 : 0.6

            return (
              <g key={car.carIdx} opacity={opacity}>
                <rect
                  x={cx - CAR_W / 2} y={y - CAR_H / 2}
                  width={CAR_W} height={CAR_H} rx={3}
                  fill={col} fillOpacity={0.2}
                  stroke={col} strokeWidth={absT < 1 ? 1.5 : 1}
                />
                <text x={cx} y={y + 4} textAnchor="middle"
                  fontSize="9" fontWeight="700" fontFamily="system-ui"
                  fill={col}>
                  #{num}
                </text>
              </g>
            )
          })}

          {/* ── Player car ── */}
          <rect
            x={LANE.centre - CAR_W / 2} y={centreY - CAR_H / 2}
            width={CAR_W} height={CAR_H} rx={3}
            fill="rgba(255,255,255,0.12)"
            stroke="rgba(255,255,255,0.9)" strokeWidth={1.5}
          />
          <text x={LANE.centre} y={centreY + 4} textAnchor="middle"
            fontSize="9" fontWeight="700" fontFamily="system-ui"
            fill="white">
            YOU
          </text>
        </svg>
      </div>
    </div>
  )
}
