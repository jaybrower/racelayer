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

      {/* Per-overlay configuration sections.  Currently only the RPM bar has
          knobs beyond the per-session matrix; this is the precedent slot for
          other overlays that grow their own settings later. */}
      <RpmBarSection
        source={config.gauges.shiftPoint.source}
        flashThresholdPct={config.gauges.shiftPoint.flashThresholdPct}
        onSetSource={(source) =>
          patch((c) => { c.gauges.shiftPoint.source = source; return c })
        }
        onSetThreshold={(pct) =>
          patch((c) => { c.gauges.shiftPoint.flashThresholdPct = pct; return c })
        }
      />
    </>
  )
}

// ── RPM Bar configuration section ────────────────────────────────────────────
//
// Slots below the per-session-type matrix on the Overlays pane.  Two controls:
//
//   - Shift-indicator source (radio): SDK with percentage fallback (default)
//     vs percentage-only.
//   - Flash threshold (number input, 50–100% of redline): used directly in
//     percentage mode, used as the fallback in SDK mode.

function RpmBarSection({
  source,
  flashThresholdPct,
  onSetSource,
  onSetThreshold,
}: {
  source: 'sdk' | 'percent'
  flashThresholdPct: number
  onSetSource: (value: 'sdk' | 'percent') => void
  onSetThreshold: (value: number) => void
}) {
  // Store the percentage as a whole-number integer in the UI (97), but
  // persist as a 0-1 fraction (0.97) — matches the config schema and lets
  // the threshold be checked against rpmPct directly.
  const thresholdInt = Math.round(flashThresholdPct * 100)

  const onThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.valueAsNumber
    if (Number.isNaN(raw)) return
    // Clamp to the same [50, 100] the config validator accepts.  Clamp here
    // too so the UI never produces a value the merge layer would reject.
    const clamped = Math.max(50, Math.min(100, Math.round(raw)))
    onSetThreshold(clamped / 100)
  }

  return (
    <div className={styles.subSection}>
      <div className={styles.subSectionHeader}>
        <div className={styles.subSectionTitle}>RPM Bar</div>
        <div className={styles.subSectionDesc}>
          Where the bar starts flashing red &harr; fuchsia to signal an
          urgent shift point.
        </div>
      </div>

      <div className={styles.subSectionBody}>
        <div className={styles.fieldLabel}>Shift point source</div>
        <div className={styles.radioStack}>
          <label className={styles.radioStackBtn}>
            <input
              type="radio"
              name="shiftSource"
              value="sdk"
              checked={source === 'sdk'}
              onChange={() => onSetSource('sdk')}
            />
            <span className={styles.radioStackInner}>
              <span className={styles.radioStackTitle}>
                iRacing SDK (with percentage fallback)
              </span>
              <span className={styles.radioStackSub}>
                Uses iRacing's per-car shift indicator when the car exposes
                it (most paid cars do). Falls back to the percentage below
                when the SDK is silent.
              </span>
            </span>
          </label>
          <label className={styles.radioStackBtn}>
            <input
              type="radio"
              name="shiftSource"
              value="percent"
              checked={source === 'percent'}
              onChange={() => onSetSource('percent')}
            />
            <span className={styles.radioStackInner}>
              <span className={styles.radioStackTitle}>Percentage only</span>
              <span className={styles.radioStackSub}>
                Always trigger the flash from the percentage of redline,
                regardless of what the SDK reports.
              </span>
            </span>
          </label>
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.fieldLabelInline}>
            <div className={styles.fieldLabel}>Flash threshold</div>
            <div className={styles.fieldSub}>
              {source === 'sdk'
                ? 'Used when the SDK shift indicator is unavailable.'
                : 'Percent of redline that triggers the flash.'}
            </div>
          </div>
          <div className={styles.fieldInputGroup}>
            <input
              type="number"
              className={styles.numberInput}
              min={50}
              max={100}
              step={1}
              value={thresholdInt}
              onChange={onThresholdChange}
            />
            <span className={styles.fieldUnit}>% of redline</span>
          </div>
        </div>
      </div>
    </div>
  )
}
