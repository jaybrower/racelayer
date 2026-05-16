import { useEffect, useState } from 'react'
import styles from '../Settings.module.css'

export default function UpdatesPane({
  appVersion,
  updateStatus,
}: {
  appVersion: string
  updateStatus: UpdateStatus
}) {
  // Log-file path — surfaced in the support footer so users hitting a
  // mysterious updater failure have something actionable to share.  Lazily
  // fetched on first mount; the path doesn't change at runtime.
  const [logPath, setLogPath] = useState<string>('')
  useEffect(() => {
    window.iracingOverlay.getUpdaterLogPath().then(setLogPath).catch(() => {})
  }, [])

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

        {/* Distinct affordance for unpackaged runs: explain why the check is
            skipped so dev-mode testers don't waste time debugging.  See #46. */}
        {updateStatus.state === 'dev' && (
          <div className={styles.updateMuted}>
            Running from source — updates only check in packaged installs.
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

      {/* Show the underlying error message below the row.  Previously errors
          were silent ("Update failed" with no detail), which gave us nothing
          to act on in support requests — see #46. */}
      {updateStatus.state === 'error' && (
        <div className={styles.updateErrorDetail}>{updateStatus.message}</div>
      )}

      {/* Support footer — surfaces the log file path so users can copy + share
          when an update fails for non-obvious reasons.  Doesn't show in the
          'dev' state (devs already know where their own logs are). */}
      {logPath && updateStatus.state !== 'dev' && (
        <div className={styles.updateLogPath}>
          Updater logs: <code>{logPath}</code>
        </div>
      )}
    </>
  )
}
