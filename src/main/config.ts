import { ipcMain, app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'

const userConfigDir = join(app.getPath('userData'), 'config', 'overlays')
const bundledConfigDir = join(app.getAppPath(), 'config', 'overlays')

function ensureUserConfigDir() {
  if (!existsSync(userConfigDir)) {
    mkdirSync(userConfigDir, { recursive: true })
  }
}

function getConfig(overlay: string): unknown {
  ensureUserConfigDir()
  const userPath = join(userConfigDir, `${overlay}.json`)
  if (existsSync(userPath)) {
    return JSON.parse(readFileSync(userPath, 'utf-8'))
  }
  // Fall back to bundled defaults
  const bundledPath = join(bundledConfigDir, `${overlay}.json`)
  if (existsSync(bundledPath)) {
    return JSON.parse(readFileSync(bundledPath, 'utf-8'))
  }
  return {}
}

function setConfig(overlay: string, config: unknown): void {
  ensureUserConfigDir()
  const userPath = join(userConfigDir, `${overlay}.json`)
  writeFileSync(userPath, JSON.stringify(config, null, 2), 'utf-8')
}

export function registerConfigHandlers(broadcast: (channel: string, data: unknown) => void) {
  ipcMain.handle('config:get', (_event, overlay: string) => getConfig(overlay))
  ipcMain.handle('config:set', (_event, overlay: string, config: unknown) => {
    setConfig(overlay, config)
    broadcast('config:changed', { overlay, config })
  })
}
