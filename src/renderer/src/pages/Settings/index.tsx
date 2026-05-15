import { useEffect, useState, useCallback } from 'react'
import { formatAccelerator } from './lib'
import GeneralPane from './panes/GeneralPane'
import OverlaysPane from './panes/OverlaysPane'
import ShortcutsPane from './panes/ShortcutsPane'
import PreviewModePane from './panes/PreviewModePane'
import UpdatesPane from './panes/UpdatesPane'
import AboutPane from './panes/AboutPane'
import styles from './Settings.module.css'

// ── Pane registry ─────────────────────────────────────────────────────────────
//
// Single source of truth for the sidebar nav: id, label, and the icon glyph
// (single character so we don't depend on an icon set).  Order here drives
// the visual order of the sidebar.

type PaneId = 'general' | 'overlays' | 'shortcuts' | 'preview' | 'updates' | 'about'

const PANES: { id: PaneId; label: string; icon: string }[] = [
  { id: 'general',   label: 'General',      icon: '⚙' },
  { id: 'overlays',  label: 'Overlays',     icon: '◫' },
  { id: 'shortcuts', label: 'Shortcuts',    icon: '⌨' },
  { id: 'preview',   label: 'Preview Mode', icon: '◐' },
  { id: 'updates',   label: 'Updates',      icon: '↻' },
  { id: 'about',     label: 'About',        icon: 'i' },
]

const DEFAULT_PREVIEW: PreviewModeState = { enabled: false, sessionType: 'race' }
const DEFAULT_SHORTCUTS: ShortcutMap = {
  editMode: 'CommandOrControl+Shift+L',
  openSettings: 'CommandOrControl+Shift+O',
}

export default function Settings() {
  const [activePane, setActivePane] = useState<PaneId>('general')

  const [previewMode, setPreviewModeLocal] = useState<PreviewModeState>(DEFAULT_PREVIEW)
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(DEFAULT_SHORTCUTS)
  const [saving, setSaving] = useState(false)
  const [launchOnStartup, setLaunchOnStartup] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    window.iracingOverlay.getPreviewMode().then(setPreviewModeLocal)
    window.iracingOverlay.getShortcuts().then(setShortcuts)
    window.iracingOverlay.getStartupEnabled().then(setLaunchOnStartup)
    window.iracingOverlay.getVersion().then(setAppVersion)
    window.iracingOverlay.getUpdateStatus().then(setUpdateStatus)

    window.iracingOverlay.onPreviewModeChanged(setPreviewModeLocal)
    window.iracingOverlay.onUpdateStatus(setUpdateStatus)
    return () => {
      window.iracingOverlay.removeAllListeners('previewMode:changed')
      window.iracingOverlay.removeAllListeners('update:status')
    }
  }, [])

  const toggleStartup = useCallback(async (enabled: boolean) => {
    setLaunchOnStartup(enabled)
    await window.iracingOverlay.setStartupEnabled(enabled)
  }, [])

  const applyPreviewPatch = useCallback(async (patch: Partial<PreviewModeState>) => {
    setSaving(true)
    setPreviewModeLocal((prev) => ({ ...prev, ...patch }))
    await window.iracingOverlay.setPreviewMode(patch)
    setSaving(false)
  }, [])

  const saveShortcut = useCallback(async (key: string, accel: string): Promise<string | null> => {
    const result = await window.iracingOverlay.setShortcut(key, accel)
    if (result.ok) {
      setShortcuts((prev) => ({ ...prev, [key]: accel }))
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
          <div className={styles.headerSub}>Configure overlays, shortcuts, and preview mode</div>
        </div>
      </div>

      <div className={styles.layout}>
        <nav className={styles.sidebar} aria-label="Settings sections">
          {PANES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`${styles.navBtn} ${activePane === p.id ? styles.navBtnActive : ''}`}
              onClick={() => setActivePane(p.id)}
            >
              <span className={styles.navIcon} aria-hidden>{p.icon}</span>
              <span className={styles.navLabel}>{p.label}</span>
            </button>
          ))}
        </nav>

        <main className={styles.pane} role="tabpanel" aria-labelledby={`pane-${activePane}`}>
          {activePane === 'general' && (
            <GeneralPane
              launchOnStartup={launchOnStartup}
              onToggleStartup={toggleStartup}
              shortcuts={shortcuts}
            />
          )}
          {activePane === 'overlays' && <OverlaysPane />}
          {activePane === 'shortcuts' && (
            <ShortcutsPane shortcuts={shortcuts} onSave={saveShortcut} />
          )}
          {activePane === 'preview' && (
            <PreviewModePane state={previewMode} saving={saving} onPatch={applyPreviewPatch} />
          )}
          {activePane === 'updates' && (
            <UpdatesPane appVersion={appVersion} updateStatus={updateStatus} />
          )}
          {activePane === 'about' && <AboutPane appVersion={appVersion} />}
        </main>
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
