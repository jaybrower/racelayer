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

// ── Checkbox ─────────────────────────────────────────────────────────────────
//
// Custom-styled replacement for the OS-default <input type="checkbox">.
// The native input still does the heavy lifting (accessibility, keyboard
// focus, form semantics, screen-reader announcements) but is visually
// hidden behind an adjacent <span> that paints the state.

function Checkbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className={`${styles.checkbox} ${disabled ? styles.checkboxDisabled : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.checkboxBox}>
        <svg viewBox="0 0 16 16" className={styles.checkboxMark} aria-hidden="true">
          <path
            d="M3.5 8.5l3 3 6-6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </label>
  )
}

// ── Row ──────────────────────────────────────────────────────────────────────

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
  const className = [
    styles.matrixRow,
    indent ? styles.matrixRowIndent : null,
    disabled ? styles.matrixRowDisabled : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className} title={title}>
      <div className={styles.matrixLabel}>
        {indent ? <span className={styles.matrixArrow}>→</span> : null}
        {label}
      </div>
      {SESSION_TYPES.map((st) => (
        <div key={st} className={styles.matrixCell}>
          <Checkbox
            checked={flags[st]}
            disabled={disabled}
            onChange={(val) => onChange(st, val)}
          />
        </div>
      ))}
    </div>
  )
}

// ── Group header ─────────────────────────────────────────────────────────────
//
// Spans the entire matrix width (no per-column structure).  CSS handles the
// "no top margin on the first group header" case via the `.matrixHead +
// .matrixGroupHeader` adjacent-sibling selector — so JSX stays uniform.

function OverlayGroupHeader({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className={styles.matrixGroupHeader}>
      <div className={styles.matrixGroupTitle}>{title}</div>
      <div className={styles.matrixGroupDesc}>{description}</div>
    </div>
  )
}

// ── Pane ─────────────────────────────────────────────────────────────────────

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
        global &ldquo;Auto-hide unsupported overlays&rdquo; toggle lives
        under General.
      </div>

      <div className={styles.matrix}>
        {/* Sticky column header — same grid template as the rows below so
            the labels line up with their checkbox columns. */}
        <div className={styles.matrixHead}>
          <div className={styles.matrixHeadLabel} />
          {SESSION_TYPES.map((st) => (
            <div key={st} className={styles.matrixHeadCol}>
              {SESSION_LABELS[st]}
            </div>
          ))}
        </div>

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
      </div>
    </>
  )
}
