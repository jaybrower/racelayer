import { useEffect, useState, useCallback, useRef } from 'react'
import { useOverlayConfig } from '../../contexts/OverlayConfigContext'
import type { OverlayConfig, SessionFlags, SType } from '../../types/overlayConfig'
import styles from './Settings.module.css'

// ── Overlay config helpers ────────────────────────────────────────────────────

const SESSION_TYPES: SType[] = ['practice', 'qualifying', 'race']
const SESSION_LABELS: Record<SType, string> = { practice: 'Practice', qualifying: 'Qualifying', race: 'Race' }

function OverlayRow({
  label,
  flags,
  indent,
  disabled,
  onChange,
}: {
  label: string
  flags: SessionFlags
  indent?: boolean
  disabled?: boolean
  onChange: (sType: SType, value: boolean) => void
}) {
  return (
    <tr className={`${styles.cfgRow} ${indent ? styles.cfgRowIndent : ''} ${disabled ? styles.cfgRowDisabled : ''}`}>
      <td className={styles.cfgLabel}>{indent ? <span className={styles.cfgArrow}>→</span> : null}{label}</td>
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

function OverlayConfigSection() {
  const { config, update } = useOverlayConfig()

  function patch(updater: (c: OverlayConfig) => OverlayConfig) {
    update(updater(JSON.parse(JSON.stringify(config)) as OverlayConfig))
  }

  const gDisabled = (st: SType) => !config.gauges.enabled[st]

  return (
    <>
    <div className={styles.toggleRow} style={{ marginBottom: 14 }}>
      <div className={styles.toggleInfo}>
        <div className={styles.toggleLabel}>Auto-hide unsupported overlays</div>
        <div className={styles.toggleDesc}>
          Hides overlays that require features the current car doesn't support
          (e.g. Tire Temps is hidden for cars without live surface temp data).
        </div>
      </div>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={config.global.hideUnsupportedElements}
          onChange={(e) => patch(c => { c.global.hideUnsupportedElements = e.target.checked; return c })}
        />
        <span className={styles.toggleTrack} />
        <span className={styles.toggleThumb} />
      </label>
    </div>
    <table className={styles.cfgTable}>
      <thead>
        <tr>
          <th className={styles.cfgHead} />
          {SESSION_TYPES.map((st) => (
            <th key={st} className={styles.cfgHeadCell}>{SESSION_LABELS[st]}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {/* ── Gauges ── */}
        <OverlayRow
          label="Gauges"
          flags={config.gauges.enabled}
          onChange={(st, val) => patch(c => { c.gauges.enabled[st] = val; return c })}
        />
        <OverlayRow
          label="RPM Bar"
          flags={config.gauges.elements.rpmBar}
          indent
          disabled={SESSION_TYPES.every(gDisabled)}
          onChange={(st, val) => patch(c => { c.gauges.elements.rpmBar[st] = val; return c })}
        />
        <OverlayRow
          label="Input Trace"
          flags={config.gauges.elements.inputTrace}
          indent
          disabled={SESSION_TYPES.every(gDisabled)}
          onChange={(st, val) => patch(c => { c.gauges.elements.inputTrace[st] = val; return c })}
        />
        <OverlayRow
          label="Gear"
          flags={config.gauges.elements.gear}
          indent
          disabled={SESSION_TYPES.every(gDisabled)}
          onChange={(st, val) => patch(c => { c.gauges.elements.gear[st] = val; return c })}
        />
        <OverlayRow
          label="Speed"
          flags={config.gauges.elements.speed}
          indent
          disabled={SESSION_TYPES.every(gDisabled)}
          onChange={(st, val) => patch(c => { c.gauges.elements.speed[st] = val; return c })}
        />
        <OverlayRow
          label="Delta"
          flags={config.gauges.elements.delta}
          indent
          disabled={SESSION_TYPES.every(gDisabled)}
          onChange={(st, val) => patch(c => { c.gauges.elements.delta[st] = val; return c })}
        />
        <OverlayRow
          label="Fuel"
          flags={config.gauges.elements.fuel}
          indent
          disabled={SESSION_TYPES.every(gDisabled)}
          onChange={(st, val) => patch(c => { c.gauges.elements.fuel[st] = val; return c })}
        />
        <OverlayRow
          label="Traction Control"
          flags={config.gauges.elements.tc}
          indent
          disabled={SESSION_TYPES.every(gDisabled)}
          onChange={(st, val) => patch(c => { c.gauges.elements.tc[st] = val; return c })}
        />
        <OverlayRow
          label="ABS"
          flags={config.gauges.elements.abs}
          indent
          disabled={SESSION_TYPES.every(gDisabled)}
          onChange={(st, val) => patch(c => { c.gauges.elements.abs[st] = val; return c })}
        />

        {/* ── Tire Temps ── */}
        <tr><td colSpan={4} className={styles.cfgSpacer} /></tr>
        <OverlayRow
          label="Tire Temps"
          flags={config.tireTemps.enabled}
          onChange={(st, val) => patch(c => { c.tireTemps.enabled[st] = val; return c })}
        />

        {/* ── Relative ── */}
        <tr><td colSpan={4} className={styles.cfgSpacer} /></tr>
        <OverlayRow
          label="Relative"
          flags={config.relative.enabled}
          onChange={(st, val) => patch(c => { c.relative.enabled[st] = val; return c })}
        />
        <OverlayRow
          label="iRating"
          flags={config.relative.columns.iRating}
          indent
          disabled={SESSION_TYPES.every(st => !config.relative.enabled[st])}
          onChange={(st, val) => patch(c => { c.relative.columns.iRating[st] = val; return c })}
        />
        <OverlayRow
          label="Safety Rating"
          flags={config.relative.columns.safetyRating}
          indent
          disabled={SESSION_TYPES.every(st => !config.relative.enabled[st])}
          onChange={(st, val) => patch(c => { c.relative.columns.safetyRating[st] = val; return c })}
        />
        <OverlayRow
          label="Position Change"
          flags={config.relative.columns.positionDelta}
          indent
          disabled={SESSION_TYPES.every(st => !config.relative.enabled[st])}
          onChange={(st, val) => patch(c => { c.relative.columns.positionDelta[st] = val; return c })}
        />
        <OverlayRow
          label="Est. iR Change"
          flags={config.relative.columns.irChange}
          indent
          disabled={SESSION_TYPES.every(st => !config.relative.enabled[st])}
          onChange={(st, val) => patch(c => { c.relative.columns.irChange[st] = val; return c })}
        />
        <OverlayRow
          label="Closing Rate"
          flags={config.relative.columns.closingRate}
          indent
          disabled={SESSION_TYPES.every(st => !config.relative.enabled[st])}
          onChange={(st, val) => patch(c => { c.relative.columns.closingRate[st] = val; return c })}
        />

        {/* ── Pit Strategy ── */}
        <tr><td colSpan={4} className={styles.cfgSpacer} /></tr>
        <OverlayRow
          label="Pit Strategy"
          flags={config.pitStrategy.enabled}
          onChange={(st, val) => patch(c => { c.pitStrategy.enabled[st] = val; return c })}
        />
        <OverlayRow
          label="Fuel"
          flags={config.pitStrategy.sections.fuel}
          indent
          disabled={SESSION_TYPES.every(st => !config.pitStrategy.enabled[st])}
          onChange={(st, val) => patch(c => { c.pitStrategy.sections.fuel[st] = val; return c })}
        />
        <OverlayRow
          label="Tire Degradation"
          flags={config.pitStrategy.sections.tireDeg}
          indent
          disabled={SESSION_TYPES.every(st => !config.pitStrategy.enabled[st])}
          onChange={(st, val) => patch(c => { c.pitStrategy.sections.tireDeg[st] = val; return c })}
        />
        <OverlayRow
          label="Pit Window"
          flags={config.pitStrategy.sections.pitWindow}
          indent
          disabled={SESSION_TYPES.every(st => !config.pitStrategy.enabled[st])}
          onChange={(st, val) => patch(c => { c.pitStrategy.sections.pitWindow[st] = val; return c })}
        />

        {/* Radar intentionally omitted — re-enable once better positional data is available */}
      </tbody>
    </table>
    </>
  )
}

const DEFAULT_DEV: DevModeState = { enabled: false, sessionType: 'race' }
const DEFAULT_SHORTCUTS: ShortcutMap = {
  editMode: 'CommandOrControl+Shift+L',
  openSettings: 'CommandOrControl+Shift+O',
}

// Convert DOM KeyboardEvent to Electron accelerator string.
// Returns null if the combo isn't usable (modifier-only, no modifier, unmapped key).
function keyEventToAccelerator(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (parts.length === 0) return null // bare key — require at least one modifier

  let key = e.key
  if (key.length === 1) {
    key = key.toUpperCase()
  } else {
    const MAP: Record<string, string> = {
      ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
      Escape: 'Escape', Enter: 'Return', Tab: 'Tab', Backspace: 'Backspace',
      Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
      Insert: 'Insert', ' ': 'Space',
      F1:'F1',F2:'F2',F3:'F3',F4:'F4',F5:'F5',F6:'F6',
      F7:'F7',F8:'F8',F9:'F9',F10:'F10',F11:'F11',F12:'F12',
    }
    const mapped = MAP[key]
    if (!mapped) return null
    key = mapped
  }

  parts.push(key)
  return parts.join('+')
}

function formatAccelerator(accel: string): string {
  return accel.replace('CommandOrControl', 'Ctrl').split('+').join(' + ')
}

// ── ShortcutRow ──────────────────────────────────────────────────────────────

interface ShortcutRowProps {
  label: string
  sub: string
  value: string
  onSave: (accel: string) => Promise<string | null>
}

function ShortcutRow({ label, sub, value, onSave }: ShortcutRowProps) {
  const [recording, setRecording] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const captureRef = useRef<HTMLDivElement>(null)

  const startRecording = () => {
    setRecording(true)
    setPreview(null)
    setError(null)
    setTimeout(() => captureRef.current?.focus(), 0)
  }

  const cancel = () => { setRecording(false); setPreview(null); setError(null) }

  const confirm = async () => {
    if (!preview) return
    const err = await onSave(preview)
    if (err) {
      setError(err)
    } else {
      setRecording(false)
      setPreview(null)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') { cancel(); return }
    if (e.key === 'Enter' && preview) { confirm(); return }
    const accel = keyEventToAccelerator(e.nativeEvent)
    if (accel) setPreview(accel)
  }

  return (
    <div className={styles.shortcutRow}>
      <div className={styles.shortcutRowMain}>
        <div>
          <div className={styles.shortcutLabel}>{label}</div>
          <div className={styles.shortcutSub}>{sub}</div>
        </div>

        {recording ? (
          <div className={styles.shortcutRecorder}>
            <div
              ref={captureRef}
              className={`${styles.shortcutCapture} ${!preview ? styles.shortcutCaptureEmpty : ''}`}
              tabIndex={0}
              onKeyDown={onKeyDown}
            >
              {preview ? formatAccelerator(preview) : 'Press shortcut…'}
            </div>
            <button
              className={`${styles.shortcutIconBtn} ${styles.confirm}`}
              onClick={confirm}
              disabled={!preview}
              title="Confirm"
            >✓</button>
            <button
              className={`${styles.shortcutIconBtn} ${styles.cancel}`}
              onClick={cancel}
              title="Cancel"
            >✕</button>
          </div>
        ) : (
          <div className={styles.shortcutDisplay}>
            <span className={styles.kbd}>{formatAccelerator(value)}</span>
            <button className={styles.shortcutEdit} onClick={startRecording}>Edit</button>
          </div>
        )}
      </div>
      {error && <div className={styles.shortcutError}>{error}</div>}
    </div>
  )
}

// ── Settings page ────────────────────────────────────────────────────────────

export default function Settings() {
  const [devMode, setDevModeLocal] = useState<DevModeState>(DEFAULT_DEV)
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(DEFAULT_SHORTCUTS)
  const [saving, setSaving] = useState(false)
  const [launchOnStartup, setLaunchOnStartup] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    window.iracingOverlay.getDevMode().then(setDevModeLocal)
    window.iracingOverlay.getShortcuts().then(setShortcuts)
    window.iracingOverlay.getStartupEnabled().then(setLaunchOnStartup)
    window.iracingOverlay.getVersion().then(setAppVersion)
    window.iracingOverlay.getUpdateStatus().then(setUpdateStatus)

    window.iracingOverlay.onDevModeChanged(setDevModeLocal)
    window.iracingOverlay.onUpdateStatus(setUpdateStatus)
    return () => {
      window.iracingOverlay.removeAllListeners('devMode:changed')
      window.iracingOverlay.removeAllListeners('update:status')
    }
  }, [])

  const toggleStartup = useCallback(async (enabled: boolean) => {
    setLaunchOnStartup(enabled)
    await window.iracingOverlay.setStartupEnabled(enabled)
  }, [])

  const applyDevPatch = useCallback(async (patch: Partial<DevModeState>) => {
    setSaving(true)
    setDevModeLocal(prev => ({ ...prev, ...patch }))
    await window.iracingOverlay.setDevMode(patch)
    setSaving(false)
  }, [])

  const saveShortcut = useCallback(async (key: string, accel: string): Promise<string | null> => {
    const result = await window.iracingOverlay.setShortcut(key, accel)
    if (result.ok) {
      setShortcuts(prev => ({ ...prev, [key]: accel }))
      return null
    }
    return result.error ?? 'Failed to register shortcut'
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <span className={styles.headerIcon}>⚙</span>
        <div>
          <div className={styles.headerTitle}>RaceLayer Settings</div>
          <div className={styles.headerSub}>Configure overlays and developer tools</div>
        </div>
      </div>

      <div className={styles.body}>

        {/* General */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>General</span>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.toggleRow}>
              <div className={styles.toggleInfo}>
                <div className={styles.toggleLabel}>Launch on startup</div>
                <div className={styles.toggleDesc}>
                  Automatically start RaceLayer when you log into Windows.
                  The app runs silently in the system tray until iRacing launches.
                </div>
              </div>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={launchOnStartup}
                  onChange={(e) => toggleStartup(e.target.checked)}
                />
                <span className={styles.toggleTrack} />
                <span className={styles.toggleThumb} />
              </label>
            </div>
          </div>
        </div>

        {/* Updates */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Updates</span>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.updateRow}>
              <div className={styles.updateVersion}>
                <span className={styles.toggleLabel}>RaceLayer</span>
                {appVersion && (
                  <span className={styles.versionBadge}>v{appVersion}</span>
                )}
              </div>

              {/* Idle — ready to check */}
              {updateStatus.state === 'idle' && (
                <button
                  className={styles.updateBtn}
                  onClick={() => window.iracingOverlay.checkForUpdates()}
                >
                  Check for updates
                </button>
              )}

              {/* Checking */}
              {updateStatus.state === 'checking' && (
                <span className={styles.updateMuted}>Checking…</span>
              )}

              {/* Up to date */}
              {updateStatus.state === 'not-available' && (
                <div className={styles.updateGood}>
                  <span className={styles.updateGoodIcon}>✓</span>
                  Up to date
                </div>
              )}

              {/* Update available — prompt to download */}
              {updateStatus.state === 'available' && (
                <div className={styles.updateAvailable}>
                  <span className={styles.updateAvailableText}>
                    v{updateStatus.version} available
                  </span>
                  <button
                    className={`${styles.updateBtn} ${styles.updateBtnPrimary}`}
                    onClick={() => window.iracingOverlay.downloadUpdate()}
                  >
                    Download
                  </button>
                </div>
              )}

              {/* Downloading */}
              {updateStatus.state === 'downloading' && (
                <div className={styles.updateProgress}>
                  <div className={styles.updateProgressBar}>
                    <div
                      className={styles.updateProgressFill}
                      style={{ width: `${updateStatus.percent}%` }}
                    />
                  </div>
                  <span className={styles.updateMuted}>{updateStatus.percent}%</span>
                </div>
              )}

              {/* Ready to install */}
              {updateStatus.state === 'ready' && (
                <div className={styles.updateAvailable}>
                  <span className={styles.updateAvailableText}>
                    v{updateStatus.version} ready
                  </span>
                  <button
                    className={`${styles.updateBtn} ${styles.updateBtnPrimary}`}
                    onClick={() => window.iracingOverlay.installUpdate()}
                  >
                    Restart &amp; Install
                  </button>
                </div>
              )}

              {/* Error */}
              {updateStatus.state === 'error' && (
                <div className={styles.updateError}>
                  <span>Update failed</span>
                  <button
                    className={styles.updateBtn}
                    onClick={() => window.iracingOverlay.checkForUpdates()}
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Developer Mode */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Developer Mode</span>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.statusRow}>
              <span className={`${styles.devBadge} ${devMode.enabled ? styles.devBadgeOn : styles.devBadgeOff}`}>
                <span className={`${styles.dot} ${devMode.enabled ? styles.dotOn : styles.dotOff}`} />
                {devMode.enabled ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>

            <div className={styles.toggleRow}>
              <div className={styles.toggleInfo}>
                <div className={styles.toggleLabel}>Enable Dev Mode</div>
                <div className={styles.toggleDesc}>
                  Show overlays with simulated data without iRacing running.
                  Useful for testing layout and positioning.
                </div>
              </div>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={devMode.enabled}
                  disabled={saving}
                  onChange={(e) => applyDevPatch({ enabled: e.target.checked })}
                />
                <span className={styles.toggleTrack} />
                <span className={styles.toggleThumb} />
              </label>
            </div>

            <div className={styles.sessionTypeRow}>
              <div className={styles.sessionTypeLabel}>Test Session Type</div>
              <div className={styles.radioGroup}>
                {(['practice', 'qualifying', 'race'] as const).map((type) => (
                  <label key={type} className={styles.radioBtn}>
                    <input
                      type="radio"
                      name="sessionType"
                      value={type}
                      checked={devMode.sessionType === type}
                      disabled={!devMode.enabled || saving}
                      onChange={() => applyDevPatch({ sessionType: type })}
                    />
                    <span className={styles.radioBtnLabel}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Shortcuts */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Keyboard Shortcuts</span>
          </div>
          <div className={styles.sectionBody}>
            <ShortcutRow
              label="Layout Mode"
              sub="Toggle draggable repositioning of overlays"
              value={shortcuts.editMode}
              onSave={(accel) => saveShortcut('editMode', accel)}
            />
            <div className={styles.shortcutDivider} />
            <ShortcutRow
              label="Open Settings"
              sub="Show this settings window"
              value={shortcuts.openSettings}
              onSave={(accel) => saveShortcut('openSettings', accel)}
            />
          </div>
        </div>

        {/* Overlay Visibility */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Overlay Visibility</span>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.toggleDesc} style={{ marginBottom: 10 }}>
              Choose which overlays and elements are shown for each session type.
              Changes apply immediately.
            </div>
            <OverlayConfigSection />
          </div>
        </div>

        {/* Overlay Positions */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Overlay Positions</span>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.toggleDesc}>
              Press <span className={styles.kbd}>{formatAccelerator(shortcuts.editMode)}</span> to
              enter Layout Mode. Overlays become draggable — position them anywhere on screen,
              then press the shortcut again to lock them. Positions are saved per monitor
              configuration, so single-monitor and multi-monitor layouts are stored separately.
            </div>
            <div className={styles.positionsResetRow}>
              <button
                className={styles.resetBtn}
                onClick={() => window.iracingOverlay.resetPositions()}
              >
                Reset to defaults
              </button>
              <span className={styles.toggleDesc} style={{ marginTop: 0 }}>
                Moves all overlays back to their default screen positions.
              </span>
            </div>
          </div>
        </div>

      </div>

      <div className={styles.footer}>
        <span className={styles.hint}>
          Open settings: <span className={styles.kbd}>{formatAccelerator(shortcuts.openSettings)}</span>
          &nbsp;&nbsp;·&nbsp;&nbsp;
          Layout mode: <span className={styles.kbd}>{formatAccelerator(shortcuts.editMode)}</span>
        </span>
      </div>
    </div>
  )
}
