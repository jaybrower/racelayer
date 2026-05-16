import { useRef, useState } from 'react'
import { formatAccelerator, keyEventToAccelerator } from '../lib'
import styles from '../Settings.module.css'

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

  const cancel = () => {
    setRecording(false)
    setPreview(null)
    setError(null)
  }

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

export default function ShortcutsPane({
  shortcuts,
  onSave,
}: {
  shortcuts: ShortcutMap
  onSave: (key: string, accel: string) => Promise<string | null>
}) {
  return (
    <>
      <div className={styles.paneIntro}>
        Global shortcuts work whether RaceLayer is focused or not — they're
        registered with the OS, so they fire from inside iRacing too. Click
        Edit, press the new combination, and confirm.
      </div>
      <ShortcutRow
        label="Layout Mode"
        sub="Toggle draggable repositioning of overlays"
        value={shortcuts.editMode}
        onSave={(accel) => onSave('editMode', accel)}
      />
      <div className={styles.shortcutDivider} />
      <ShortcutRow
        label="Open Settings"
        sub="Show this settings window"
        value={shortcuts.openSettings}
        onSave={(accel) => onSave('openSettings', accel)}
      />
    </>
  )
}
