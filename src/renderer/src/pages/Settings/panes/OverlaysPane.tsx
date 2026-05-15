import { useOverlayConfig } from '../../../contexts/OverlayConfigContext'
import type { OverlayConfig, SessionFlags, SType } from '../../../types/overlayConfig'
import { ELEMENT_DESCRIPTIONS, OVERLAY_DESCRIPTIONS } from '../lib'
import styles from '../Settings.module.css'

const SESSION_TYPES: SType[] = ['practice', 'qualifying', 'race']
const SESSION_LABELS: Record<SType, string> = {
  practice: 'Practice',
  qualifying: 'Qualifying',
  race: 'Race',
}

function OverlayRow({
  label,
  flags,
  indent,
  disabled,
  title,
  onChange,
}: {
  label: string
  flags: SessionFlags
  indent?: boolean
  disabled?: boolean
  title?: string
  onChange: (sType: SType, value: boolean) => void
}) {
  return (
    <tr
      className={`${styles.cfgRow} ${indent ? styles.cfgRowIndent : ''} ${disabled ? styles.cfgRowDisabled : ''}`}
      title={title}
    >
      <td className={styles.cfgLabel}>
        {indent ? <span className={styles.cfgArrow}>→</span> : null}
        {label}
      </td>
      {SESSION_TYPES.map((st) => (
        <td key={st} className={styles.cfgCell}>
          <input
            type="checkbox"
            className={styles.cfgCheck}
            checked={flags[st]}
            disabled={disabled}
            onChange={(e) => onChange(st, e.target.checked)}
          />
        </td>
      ))}
    </tr>
  )
}

/** Sticky table head with Practice / Qualifying / Race column labels.
 *  Lives at the top of every overlay group so the columns are always identifiable
 *  even when the user has scrolled deep into the matrix. */
function OverlayGroupHeader({ title, description }: { title: string; description: string }) {
  return (
    <>
      <tr>
        <td colSpan={4} className={styles.overlayGroupHeader}>
          <div className={styles.overlayGroupTitle}>{title}</div>
          <div className={styles.overlayGroupDesc}>{description}</div>
        </td>
      </tr>
    </>
  )
}

export default function OverlaysPane() {
  const { config, update } = useOverlayConfig()

  function patch(updater: (c: OverlayConfig) => OverlayConfig) {
    update(updater(JSON.parse(JSON.stringify(config)) as OverlayConfig))
  }

  const gDisabled = (st: SType) => !config.gauges.enabled[st]
  const rDisabled = SESSION_TYPES.every((st) => !config.relative.enabled[st])
  const pDisabled = SESSION_TYPES.every((st) => !config.pitStrategy.enabled[st])

  return (
    <>
      <div className={styles.paneIntro}>
        Choose which overlays and elements are shown for each session type.
        Hover any row for a description. Changes apply immediately. The
        global &ldquo;Auto-hide unsupported overlays&rdquo; toggle lives under
        General.
      </div>

      <div className={styles.cfgTableWrap}>
        <table className={styles.cfgTable}>
          <thead className={styles.cfgStickyHead}>
            <tr>
              <th className={styles.cfgHead} />
              {SESSION_TYPES.map((st) => (
                <th key={st} className={styles.cfgHeadCell}>
                  {SESSION_LABELS[st]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* ── Gauges ── */}
            <OverlayGroupHeader title="Gauges" description={OVERLAY_DESCRIPTIONS.gauges} />
            <OverlayRow
              label="Gauges"
              flags={config.gauges.enabled}
              title={OVERLAY_DESCRIPTIONS.gauges}
              onChange={(st, val) => patch((c) => { c.gauges.enabled[st] = val; return c })}
            />
            <OverlayRow
              label="RPM Bar"
              flags={config.gauges.elements.rpmBar}
              indent
              disabled={SESSION_TYPES.every(gDisabled)}
              title={ELEMENT_DESCRIPTIONS['gauges.rpmBar']}
              onChange={(st, val) => patch((c) => { c.gauges.elements.rpmBar[st] = val; return c })}
            />
            <OverlayRow
              label="Input Trace"
              flags={config.gauges.elements.inputTrace}
              indent
              disabled={SESSION_TYPES.every(gDisabled)}
              title={ELEMENT_DESCRIPTIONS['gauges.inputTrace']}
              onChange={(st, val) => patch((c) => { c.gauges.elements.inputTrace[st] = val; return c })}
            />
            <OverlayRow
              label="Gear"
              flags={config.gauges.elements.gear}
              indent
              disabled={SESSION_TYPES.every(gDisabled)}
              title={ELEMENT_DESCRIPTIONS['gauges.gear']}
              onChange={(st, val) => patch((c) => { c.gauges.elements.gear[st] = val; return c })}
            />
            <OverlayRow
              label="Speed"
              flags={config.gauges.elements.speed}
              indent
              disabled={SESSION_TYPES.every(gDisabled)}
              title={ELEMENT_DESCRIPTIONS['gauges.speed']}
              onChange={(st, val) => patch((c) => { c.gauges.elements.speed[st] = val; return c })}
            />
            <OverlayRow
              label="Delta"
              flags={config.gauges.elements.delta}
              indent
              disabled={SESSION_TYPES.every(gDisabled)}
              title={ELEMENT_DESCRIPTIONS['gauges.delta']}
              onChange={(st, val) => patch((c) => { c.gauges.elements.delta[st] = val; return c })}
            />
            <OverlayRow
              label="Fuel"
              flags={config.gauges.elements.fuel}
              indent
              disabled={SESSION_TYPES.every(gDisabled)}
              title={ELEMENT_DESCRIPTIONS['gauges.fuel']}
              onChange={(st, val) => patch((c) => { c.gauges.elements.fuel[st] = val; return c })}
            />
            <OverlayRow
              label="Traction Control"
              flags={config.gauges.elements.tc}
              indent
              disabled={SESSION_TYPES.every(gDisabled)}
              title={ELEMENT_DESCRIPTIONS['gauges.tc']}
              onChange={(st, val) => patch((c) => { c.gauges.elements.tc[st] = val; return c })}
            />
            <OverlayRow
              label="ABS"
              flags={config.gauges.elements.abs}
              indent
              disabled={SESSION_TYPES.every(gDisabled)}
              title={ELEMENT_DESCRIPTIONS['gauges.abs']}
              onChange={(st, val) => patch((c) => { c.gauges.elements.abs[st] = val; return c })}
            />

            {/* ── Tire Temps ── */}
            <OverlayGroupHeader title="Tire Temps" description={OVERLAY_DESCRIPTIONS.tireTemps} />
            <OverlayRow
              label="Tire Temps"
              flags={config.tireTemps.enabled}
              title={OVERLAY_DESCRIPTIONS.tireTemps}
              onChange={(st, val) => patch((c) => { c.tireTemps.enabled[st] = val; return c })}
            />

            {/* ── Relative ── */}
            <OverlayGroupHeader title="Relative" description={OVERLAY_DESCRIPTIONS.relative} />
            <OverlayRow
              label="Relative"
              flags={config.relative.enabled}
              title={OVERLAY_DESCRIPTIONS.relative}
              onChange={(st, val) => patch((c) => { c.relative.enabled[st] = val; return c })}
            />
            <OverlayRow
              label="iRating"
              flags={config.relative.columns.iRating}
              indent
              disabled={rDisabled}
              title={ELEMENT_DESCRIPTIONS['relative.iRating']}
              onChange={(st, val) => patch((c) => { c.relative.columns.iRating[st] = val; return c })}
            />
            <OverlayRow
              label="Safety Rating"
              flags={config.relative.columns.safetyRating}
              indent
              disabled={rDisabled}
              title={ELEMENT_DESCRIPTIONS['relative.safetyRating']}
              onChange={(st, val) => patch((c) => { c.relative.columns.safetyRating[st] = val; return c })}
            />
            <OverlayRow
              label="Position Change"
              flags={config.relative.columns.positionDelta}
              indent
              disabled={rDisabled}
              title={ELEMENT_DESCRIPTIONS['relative.positionDelta']}
              onChange={(st, val) => patch((c) => { c.relative.columns.positionDelta[st] = val; return c })}
            />
            <OverlayRow
              label="Est. iR Change"
              flags={config.relative.columns.irChange}
              indent
              disabled={rDisabled}
              title={ELEMENT_DESCRIPTIONS['relative.irChange']}
              onChange={(st, val) => patch((c) => { c.relative.columns.irChange[st] = val; return c })}
            />
            <OverlayRow
              label="Closing Rate"
              flags={config.relative.columns.closingRate}
              indent
              disabled={rDisabled}
              title={ELEMENT_DESCRIPTIONS['relative.closingRate']}
              onChange={(st, val) => patch((c) => { c.relative.columns.closingRate[st] = val; return c })}
            />
            <OverlayRow
              label="Side Indicator"
              flags={config.relative.columns.carLeftRight}
              indent
              disabled={rDisabled}
              title={ELEMENT_DESCRIPTIONS['relative.carLeftRight']}
              onChange={(st, val) => patch((c) => { c.relative.columns.carLeftRight[st] = val; return c })}
            />

            {/* ── Pit Strategy ── */}
            <OverlayGroupHeader title="Pit Strategy" description={OVERLAY_DESCRIPTIONS.pitStrategy} />
            <OverlayRow
              label="Pit Strategy"
              flags={config.pitStrategy.enabled}
              title={OVERLAY_DESCRIPTIONS.pitStrategy}
              onChange={(st, val) => patch((c) => { c.pitStrategy.enabled[st] = val; return c })}
            />
            <OverlayRow
              label="Fuel"
              flags={config.pitStrategy.sections.fuel}
              indent
              disabled={pDisabled}
              title={ELEMENT_DESCRIPTIONS['pitStrategy.fuel']}
              onChange={(st, val) => patch((c) => { c.pitStrategy.sections.fuel[st] = val; return c })}
            />
            <OverlayRow
              label="Tire Degradation"
              flags={config.pitStrategy.sections.tireDeg}
              indent
              disabled={pDisabled}
              title={ELEMENT_DESCRIPTIONS['pitStrategy.tireDeg']}
              onChange={(st, val) => patch((c) => { c.pitStrategy.sections.tireDeg[st] = val; return c })}
            />
            <OverlayRow
              label="Pit Window"
              flags={config.pitStrategy.sections.pitWindow}
              indent
              disabled={pDisabled}
              title={ELEMENT_DESCRIPTIONS['pitStrategy.pitWindow']}
              onChange={(st, val) => patch((c) => { c.pitStrategy.sections.pitWindow[st] = val; return c })}
            />

            {/* ── Radar ── */}
            <OverlayGroupHeader title="Radar" description={OVERLAY_DESCRIPTIONS.radar} />
            <OverlayRow
              label="Radar"
              flags={config.radar.enabled}
              title={OVERLAY_DESCRIPTIONS.radar}
              onChange={(st, val) => patch((c) => { c.radar.enabled[st] = val; return c })}
            />
          </tbody>
        </table>
      </div>
    </>
  )
}
