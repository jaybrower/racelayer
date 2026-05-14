import { autoUpdater } from 'electron-updater'

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available';     version: string }
  | { state: 'not-available' }
  | { state: 'downloading';   percent: number }
  | { state: 'ready';         version: string }
  | { state: 'error';         message: string }

let broadcast: ((channel: string, data: unknown) => void) | null = null
let currentStatus: UpdateStatus = { state: 'idle' }

function emit(status: UpdateStatus) {
  currentStatus = status
  broadcast?.('update:status', status)
}

export function initUpdater(
  broadcastFn: (channel: string, data: unknown) => void
) {
  broadcast = broadcastFn

  // Let the user decide when to download — don't auto-start
  autoUpdater.autoDownload = false
  // Silently install when the app quits normally (if update was downloaded)
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update',  ()    => emit({ state: 'checking' }))
  autoUpdater.on('update-not-available', ()    => emit({ state: 'not-available' }))
  autoUpdater.on('update-available',     (info) => emit({ state: 'available',   version: info.version }))
  autoUpdater.on('update-downloaded',    (info) => emit({ state: 'ready',       version: info.version }))
  autoUpdater.on('download-progress',    (p)    => emit({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('error',                (err)  => emit({ state: 'error',       message: err.message }))
}

export function getUpdateStatus(): UpdateStatus {
  return currentStatus
}

export function checkForUpdates() {
  autoUpdater.checkForUpdates().catch((err) => {
    emit({ state: 'error', message: err.message })
  })
}

export function downloadUpdate() {
  autoUpdater.downloadUpdate().catch((err) => {
    emit({ state: 'error', message: err.message })
  })
}

export function quitAndInstall() {
  autoUpdater.quitAndInstall()
}
