import styles from '../Settings.module.css'

const LINKS = [
  { label: 'GitHub repository', url: 'https://github.com/jaybrower/racelayer' },
  { label: 'Changelog (release notes)', url: 'https://github.com/jaybrower/racelayer/releases' },
  { label: 'Report a bug / request a feature', url: 'https://github.com/jaybrower/racelayer/issues/new' },
  { label: 'License (MIT)', url: 'https://github.com/jaybrower/racelayer/blob/main/LICENSE' },
] as const

function ExternalLink({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <a
      className={styles.externalLink}
      href={url}
      onClick={(e) => {
        e.preventDefault()
        window.iracingOverlay.openExternal(url)
      }}
    >
      {children}
      <span className={styles.externalIcon} aria-hidden>↗</span>
    </a>
  )
}

export default function AboutPane({ appVersion }: { appVersion: string }) {
  return (
    <>
      <div className={styles.aboutHeader}>
        <div className={styles.aboutTitle}>RaceLayer</div>
        {appVersion && <div className={styles.aboutVersion}>v{appVersion}</div>}
      </div>

      <div className={styles.toggleDesc} style={{ marginBottom: 16 }}>
        A free, open-source iRacing overlay app. Real-time HUD without
        injecting into the game — telemetry is read from iRacing's shared
        memory.
      </div>

      <div className={styles.aboutLinks}>
        {LINKS.map((l) => (
          <ExternalLink key={l.url} url={l.url}>{l.label}</ExternalLink>
        ))}
      </div>

      <div className={styles.aboutFooter}>
        <div className={styles.toggleDesc}>
          Built by Jay Brower. iRacing® and the iRacing logo are trademarks
          of iRacing.com Motorsport Simulations, LLC. RaceLayer is not
          affiliated with or endorsed by iRacing.
        </div>
      </div>
    </>
  )
}
