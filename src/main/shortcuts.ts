import { app, globalShortcut, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

export interface ShortcutMap {
  editMode: string
  openSettings: string
}

const DEFAULTS: ShortcutMap = {
  editMode: 'CommandOrControl+Shift+L',
  openSettings: 'CommandOrControl+Shift+O',
}

let configPath = ''
let current: ShortcutMap = { ...DEFAULTS }
let handlers: Record<keyof ShortcutMap, () => void> | null = null

function path() {
  if (!configPath) configPath = join(app.getPath('userData'), 'shortcuts.json')
  return configPath
}

function load(): ShortcutMap {
  try {
    if (existsSync(path())) return { ...DEFAULTS, ...JSON.parse(readFileSync(path(), 'utf-8')) }
  } catch {}
  return { ...DEFAULTS }
}

function save() {
  writeFileSync(path(), JSON.stringify(current, null, 2), 'utf-8')
}

export function initShortcuts(h: Record<keyof ShortcutMap, () => void>) {
  handlers = h
  current = load()
  for (const [key, accel] of Object.entries(current) as [keyof ShortcutMap, string][]) {
    const ok = globalShortcut.register(accel, h[key])
    console.log(`[shortcuts] ${accel} (${key}): ${ok ? 'ok' : 'FAILED — already claimed'}`)
  }
}

export function getShortcuts(): ShortcutMap {
  return { ...current }
}

export function updateShortcut(
  key: keyof ShortcutMap,
  newAccel: string,
): { ok: boolean; error?: string } {
  if (!handlers) return { ok: false, error: 'not initialized' }
  const old = current[key]
  if (old) globalShortcut.unregister(old)
  const ok = globalShortcut.register(newAccel, handlers[key])
  if (!ok) {
    // Restore the old binding so the key doesn't go dead
    if (old) globalShortcut.register(old, handlers[key])
    return { ok: false, error: `"${newAccel}" is already registered by another app` }
  }
  current[key] = newAccel
  save()
  return { ok: true }
}

export function registerShortcutIpc() {
  ipcMain.handle('shortcuts:get', () => getShortcuts())
  ipcMain.handle('shortcuts:set', (_event, key: string, accel: string) =>
    updateShortcut(key as keyof ShortcutMap, accel),
  )
}
