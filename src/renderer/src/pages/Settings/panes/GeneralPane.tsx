import { useOverlayConfig } from '../../../contexts/OverlayConfigContext'
import type { OverlayConfig } from '../../../types/overlayConfig'
import { formatAccelerator } from '../lib'
import styles from '../Settings.module.css'

export default function GeneralPane({
  launchOnStartup,
  onToggleStartup,
  shortcuts,
}: {
  launchOnStartup: boolean
  onToggleStartup: (enabled: boolean) => void
  shortcuts: ShortcutMap
}) {
  const { config, update } = useOverlayConfig()

  function patch(updater: (c: OverlayConfig) => OverlayConfig) {
    update(updater(JSON.parse(JSON.stringify(config)) as OverlayConfig))
  }

  return (
    <>
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
            onChange={(e) => onToggleStartup(e.target.checked)}
          />
          <span className={styles.toggleTrack} />
          <span className={styles.toggleThumb} />
        </label>
      </div>

      <div className={styles.toggleRow}>
        <div className={styles.toggleInfo}>
          <div className={styles.toggleLabel}>Auto-hide unsupported overlays</div>
          <div className={styles.toggleDesc}>
            Hides overlays and elements that require features the current car
            doesn't expose (e.g. Tire Temps for cars without live surface temp
            data). When off, those overlays show empty placeholders instead.
          </div>
        </div>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={config.global.hideUnsupportedElements}
            onChange={(e) =>
              patch((c) => {
                c.global.hideUnsupportedElements = e.target.checked
                return c
              })
            }
          />
          <span className={styles.toggleTrack} />
          <span className={styles.toggleThumb} />
        </label>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Overlay Positions</span>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.toggleDesc}>
            Press <span className={styles.kbd}>{formatAccelerator(shortcuts.editMode)}</span>
            {' '}to enter Layout Mode — every overlay becomes draggable.
            Positions are saved per monitor configuration, so single-monitor
            and multi-monitor layouts are stored independently.
          </div>
          <div className={styles.positionsResetRow}>
            <button
              className={styles.resetBtn}
              onClick={() => window.iracingOverlay.resetPositions()}
            >
              Reset to defaults
            </button>
            <span className={styles.toggleDesc} style={{ marginTop: 0 }}>
              Move all overlays back to their default screen positions.
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
