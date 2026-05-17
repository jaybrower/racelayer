import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import electronLog from 'electron-log/main'
import { request as httpsRequest } from 'https'

// ── Logging ──────────────────────────────────────────────────────────────────
// The logging system itself lives in `src/main/logging.ts` — it owns
// `electronLog.initialize()`, the file/console transport level, and the
// build-tier-aware default-level policy (see #50).  This module just borrows
// a scoped logger and wires electron-updater's internal logs through to the
// same file so the full lifecycle lands in one place for support / debug.
//
// Make sure `initLogging(...)` runs in `src/main/index.ts` BEFORE
// `initUpdater(...)` — otherwise this scoped logger and electron-updater's
// internal logs both write to an uninitialised transport.
const log = electronLog.scope('updater')
autoUpdater.logger = electronLog

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available';     version: string }
  | { state: 'not-available' }
  | { state: 'downloading';   percent: number }
  | { state: 'ready';         version: string }
  | { state: 'error';         message: string }
  // Distinct state for unpackaged runs (npm run dev) so dev-mode testers see
  // a clear explanation instead of a stuck spinner or a misleading network
  // error.  Triggered immediately when `app.isPackaged === false`.
  | { state: 'dev' }

let broadcast: ((channel: string, data: unknown) => void) | null = null
let currentStatus: UpdateStatus = { state: 'idle' }

/** Bookkeeping for the timeout: if `autoUpdater.checkForUpdates()` resolves
 *  without firing any of the lifecycle events (which is what happened in
 *  #46), the UI would otherwise stay stuck on `state: 'checking'` forever. */
let checkTimeoutHandle: ReturnType<typeof setTimeout> | null = null
/** Same idea, longer fuse, for the download phase. */
let downloadTimeoutHandle: ReturnType<typeof setTimeout> | null = null

const CHECK_TIMEOUT_MS    = 30_000      // 30 s — feed fetch is usually < 1 s
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000 // 10 min — 88 MB on a slow link

function emit(status: UpdateStatus) {
  log.info('emit', status)
  currentStatus = status
  broadcast?.('update:status', status)
}

function clearCheckTimeout() {
  if (checkTimeoutHandle) {
    clearTimeout(checkTimeoutHandle)
    checkTimeoutHandle = null
  }
}

function clearDownloadTimeout() {
  if (downloadTimeoutHandle) {
    clearTimeout(downloadTimeoutHandle)
    downloadTimeoutHandle = null
  }
}

export function initUpdater(
  broadcastFn: (channel: string, data: unknown) => void
) {
  broadcast = broadcastFn
  log.info('initUpdater — packaged:', app.isPackaged, 'version:', app.getVersion())

  // Let the user decide when to download — don't auto-start.
  autoUpdater.autoDownload = false
  // Silently install when the app quits normally (if update was downloaded).
  autoUpdater.autoInstallOnAppQuit = true

  // Pin the update channel to `latest` AND force allow-prerelease off.
  //
  // Two electron-updater defaults bite us when the *currently-installed*
  // build has a prerelease tag (which happens for `dist:pre` test builds
  // like `0.1.0-autoUpdateTest.3`):
  //
  //   1. `allowPrerelease` auto-flips to `true`.  This routes
  //      `GitHubProvider.getLatestVersion()` into a code path that filters
  //      releases by channel.
  //   2. `channel` is derived from the current version's prerelease tag —
  //      so a one-off `-autoUpdateTest.3` build looks for releases on the
  //      `autoUpdateTest` channel, which doesn't exist on GitHub.
  //
  // The filtering loop in that channel-aware branch only matches releases
  // whose entry channel equals `currentChannel`, OR when `currentChannel`
  // is one of `null` / `'alpha'` / `'beta'`.  Stable releases (like v0.1.5)
  // have no channel tag at all, so they never match a custom channel —
  // producing the confusing "No published versions on GitHub" error.
  //
  // Confirmed against the actual electron-updater source path
  // (`GitHubProvider.js` line ~70-90 in 6.8.3) and against live debug logs.
  // See #46 for the full investigation thread.
  //
  // The fix is BOTH lines below.  The channel pin alone isn't enough —
  // even with `channel = 'latest'`, the filtering branch can't match a
  // stable release because `'latest'` isn't `null`/`'alpha'`/`'beta'` and
  // stable v0.1.5 doesn't carry a channel.  Disabling `allowPrerelease`
  // routes us into the *non-*prerelease branch instead, which fetches
  // `/releases/latest` directly and works the way every other
  // electron-updater app does.
  //
  // RaceLayer ships a single stable channel — there's no real beta program
  // — so this is correct for every install (stable, dist:pre, ad-hoc test
  // builds).  If we ever add a real beta program, both lines become
  // version-dependent again.
  autoUpdater.channel = 'latest'
  autoUpdater.allowPrerelease = false

  // Lifecycle events.  Successful transitions clear any pending safety-net
  // timeout so the timeout-fires-after-success race doesn't clobber state.
  autoUpdater.on('checking-for-update', () => {
    // Don't re-emit 'checking' — we already did that synchronously below.
    log.info('event: checking-for-update')
  })
  autoUpdater.on('update-not-available', () => {
    clearCheckTimeout()
    emit({ state: 'not-available' })
  })
  autoUpdater.on('update-available', (info) => {
    clearCheckTimeout()
    emit({ state: 'available', version: info.version })
  })
  autoUpdater.on('update-downloaded', (info) => {
    clearDownloadTimeout()
    emit({ state: 'ready', version: info.version })
  })
  autoUpdater.on('download-progress', (p) => {
    emit({ state: 'downloading', percent: Math.round(p.percent) })
  })
  autoUpdater.on('error', (err) => {
    clearCheckTimeout()
    clearDownloadTimeout()
    emit({ state: 'error', message: errorMessage(err) })
  })
}

/** Defensive: electron-updater can emit errors with empty `message` or with
 *  non-Error objects.  We want SOME human-readable text on every error state
 *  so the UI never shows a blank failure. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message || err.name || 'Unknown updater error'
  }
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err) || 'Unknown updater error'
  } catch {
    return 'Unknown updater error'
  }
}

export function getUpdateStatus(): UpdateStatus {
  return currentStatus
}

export function checkForUpdates() {
  log.info('checkForUpdates invoked')

  // Pre-flight diagnostic snapshot.  When the updater rejects with one of its
  // generic error strings (e.g. "No published versions on GitHub"), this is
  // the only way to know what URL it was actually hitting + which channel it
  // resolved to + what its allow-prerelease state was.  All cheap to compute.
  try {
    log.info('pre-flight state', {
      packaged:           app.isPackaged,
      currentVersion:     app.getVersion(),
      autoUpdaterChannel: autoUpdater.channel,
      allowPrerelease:    autoUpdater.allowPrerelease,
      allowDowngrade:     autoUpdater.allowDowngrade,
      autoDownload:       autoUpdater.autoDownload,
      autoInstallOnAppQuit: autoUpdater.autoInstallOnAppQuit,
    })
    // `feedURL` getter on AppUpdater returns the resolved feed location.
    // Cast through `unknown` because the public type doesn't include it but
    // it's been a stable runtime property since electron-updater 5.x.
    const feedURL = (autoUpdater as unknown as { getFeedURL?: () => string | null }).getFeedURL?.()
    if (feedURL) log.info('pre-flight feedURL', feedURL)
  } catch (e) {
    log.warn('pre-flight introspection threw', e)
  }

  // Short-circuit for dev runs.  electron-updater silently resolves with
  // `null` and fires no events when running unpackaged without a
  // `dev-app-update.yml`, which was the cause of the stuck-UI symptom in #46
  // for anyone testing in `npm run dev`.  Surface this state explicitly so
  // dev-mode testers don't waste time waiting for a check that's never going
  // to land.  Installed builds skip this branch entirely.
  if (!app.isPackaged) {
    log.info('checkForUpdates skipped — running unpackaged (npm run dev)')
    emit({ state: 'dev' })
    return
  }

  // Force the UI into `checking` immediately, BEFORE asking autoUpdater to
  // do anything.  Originally we relied on autoUpdater firing
  // `checking-for-update` to trigger this transition — but if that event
  // never fires (timeout, malformed feed, etc.) the UI stays stuck on
  // `idle` even though something IS happening (or failing) underneath.
  emit({ state: 'checking' })

  // Safety-net timeout — if we don't reach a definitive state within 30 s,
  // give up and surface an error so the user has a way out.
  clearCheckTimeout()
  checkTimeoutHandle = setTimeout(() => {
    log.warn('checkForUpdates timed out after', CHECK_TIMEOUT_MS, 'ms — no event fired')
    if (currentStatus.state === 'checking') {
      emit({
        state: 'error',
        message: `Update check timed out (no response after ${Math.round(CHECK_TIMEOUT_MS / 1000)}s). Check your connection or try again later.`,
      })
    }
    checkTimeoutHandle = null
  }, CHECK_TIMEOUT_MS)

  autoUpdater.checkForUpdates()
    .then((result) => {
      log.info(
        'checkForUpdates resolved',
        result?.updateInfo ? { version: result.updateInfo.version } : 'no result',
      )
      // If electron-updater returned nothing AND no event has fired between
      // resolution and now, we're in the silent-no-op path.  Most commonly
      // happens when the feed URL is unreachable or the response body is
      // malformed in a way the library swallows.
      if (!result || !result.updateInfo) {
        if (currentStatus.state === 'checking') {
          clearCheckTimeout()
          emit({
            state: 'error',
            message: 'Update server returned no version info. Check your connection and try again.',
          })
        }
      }
    })
    .catch((err) => {
      log.error('checkForUpdates rejected:', err)
      clearCheckTimeout()
      emit({ state: 'error', message: errorMessage(err) })
      // Belt-and-suspenders diagnostic.  When electron-updater rejects, hit
      // the same two URLs it would have using raw Node https — that tells us
      // whether the failure is in OUR network path (proxy, DNS, captive
      // portal, AV interception) or specifically in electron-updater's HTTP
      // layer.  Results go to the same log file the user is sharing.
      probeGitHubFeeds().catch((probeErr) => {
        log.warn('probe failed (this is its own failure, not the updater\'s):', probeErr)
      })
    })
}

/**
 * Hit the same two GitHub URLs electron-updater would hit, using raw Node
 * https.  Logs the status code, redirect Location header, and first few
 * hundred bytes of the body.  Lets us tell from the log file whether GitHub
 * is responding correctly to the host machine — separating "electron-updater
 * bug" from "host can't reach GitHub" / "GitHub returning unexpected data".
 *
 * Defensive: catches and logs its own errors so a probe failure doesn't
 * cascade into the main error path.  Runs only when the real updater has
 * already rejected; never on success.
 */
async function probeGitHubFeeds(): Promise<void> {
  const urls = [
    'https://github.com/oiddad/racelayer/releases.atom',
    'https://github.com/oiddad/racelayer/releases/latest',
  ]
  for (const url of urls) {
    await new Promise<void>((resolve) => {
      const req = httpsRequest(
        url,
        {
          method: 'GET',
          headers: {
            // Mirror the headers electron-updater uses so GitHub serves the
            // same content shape it would in the real path.
            Accept: 'application/json, application/xml, application/atom+xml, text/xml, */*',
            'User-Agent': 'RaceLayer-Updater-Probe',
          },
        },
        (res) => {
          const chunks: Buffer[] = []
          let total = 0
          res.on('data', (c: Buffer) => {
            // Cap the captured body to avoid bloating the log on big responses.
            if (total < 512) {
              chunks.push(c)
              total += c.length
            }
          })
          res.on('end', () => {
            const head = Buffer.concat(chunks).toString('utf-8').slice(0, 512)
            log.info('probe response', {
              url,
              status: res.statusCode,
              location: res.headers.location,
              contentType: res.headers['content-type'],
              bodyHead: head.replace(/\s+/g, ' ').trim(),
            })
            resolve()
          })
          res.on('error', (e) => {
            log.warn('probe response error', { url, error: e?.message })
            resolve()
          })
        },
      )
      req.on('error', (e) => {
        log.warn('probe request error', { url, error: e?.message })
        resolve()
      })
      req.setTimeout(8000, () => {
        log.warn('probe timed out', { url })
        req.destroy()
        resolve()
      })
      req.end()
    })
  }
}

export function downloadUpdate() {
  log.info('downloadUpdate invoked')
  if (!app.isPackaged) {
    emit({ state: 'dev' })
    return
  }

  emit({ state: 'downloading', percent: 0 })
  clearDownloadTimeout()
  downloadTimeoutHandle = setTimeout(() => {
    if (currentStatus.state === 'downloading') {
      emit({
        state: 'error',
        message: `Download timed out after ${Math.round(DOWNLOAD_TIMEOUT_MS / 60_000)} minutes. Check your connection and try again.`,
      })
    }
    downloadTimeoutHandle = null
  }, DOWNLOAD_TIMEOUT_MS)

  autoUpdater.downloadUpdate().catch((err) => {
    log.error('downloadUpdate rejected:', err)
    clearDownloadTimeout()
    emit({ state: 'error', message: errorMessage(err) })
  })
}

export function quitAndInstall() {
  log.info('quitAndInstall invoked')
  autoUpdater.quitAndInstall()
}
