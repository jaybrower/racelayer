import styles from '../Settings.module.css'

export default function PreviewModePane({
  state,
  saving,
  onPatch,
}: {
  state: PreviewModeState
  saving: boolean
  onPatch: (patch: Partial<PreviewModeState>) => void
}) {
  return (
    <>
      <div className={styles.paneIntro}>
        Preview Mode replaces live telemetry with a deterministic simulated
        feed so you can position and configure overlays without iRacing
        running. Settings here have no effect when an iRacing session is
        active and Preview Mode is off.
      </div>

      <div className={styles.statusRow}>
        <span className={`${styles.devBadge} ${state.enabled ? styles.devBadgeOn : styles.devBadgeOff}`}>
          <span className={`${styles.dot} ${state.enabled ? styles.dotOn : styles.dotOff}`} />
          {state.enabled ? 'ACTIVE' : 'INACTIVE'}
        </span>
      </div>

      <div className={styles.toggleRow}>
        <div className={styles.toggleInfo}>
          <div className={styles.toggleLabel}>Enable Preview Mode</div>
          <div className={styles.toggleDesc}>
            Show overlays with simulated data without iRacing running.
            Useful for testing layout and positioning.
          </div>
        </div>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={state.enabled}
            disabled={saving}
            onChange={(e) => onPatch({ enabled: e.target.checked })}
          />
          <span className={styles.toggleTrack} />
          <span className={styles.toggleThumb} />
        </label>
      </div>

      <div className={styles.sessionTypeRow}>
        <div className={styles.sessionTypeLabel}>Preview Session Type</div>
        <div className={styles.radioGroup}>
          {(['practice', 'qualifying', 'race'] as const).map((type) => (
            <label key={type} className={styles.radioBtn}>
              <input
                type="radio"
                name="sessionType"
                value={type}
                checked={state.sessionType === type}
                disabled={!state.enabled || saving}
                onChange={() => onPatch({ sessionType: type })}
              />
              <span className={styles.radioBtnLabel}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </span>
            </label>
          ))}
        </div>
      </div>
    </>
  )
}
