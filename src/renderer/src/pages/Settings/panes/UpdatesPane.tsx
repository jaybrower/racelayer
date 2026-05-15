import styles from '../Settings.module.css'

export default function UpdatesPane({
  appVersion,
  updateStatus,
}: {
  appVersion: string
  updateStatus: UpdateStatus
}) {
  return (
    <>
      <div className={styles.paneIntro}>
        RaceLayer checks GitHub Releases for new versions. Downloads happen
        in the background only after you click Download — nothing installs
        without an explicit Restart &amp; Install.
      </div>

      <div className={styles.updateRow}>
        <div className={styles.updateVersion}>
          <span className={styles.toggleLabel}>RaceLayer</span>
          {appVersion && <span className={styles.versionBadge}>v{appVersion}</span>}
        </div>

        {updateStatus.state === 'idle' && (
          <button
            className={styles.updateBtn}
            onClick={() => window.iracingOverlay.checkForUpdates()}
          >
            Check for updates
          </button>
        )}

        {updateStatus.state === 'checking' && (
          <span className={styles.updateMuted}>Checking…</span>
        )}

        {updateStatus.state === 'not-available' && (
          <div className={styles.updateGood}>
            <span className={styles.updateGoodIcon}>✓</span>
            Up to date
          </div>
        )}

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
    </>
  )
}
