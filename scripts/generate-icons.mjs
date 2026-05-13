/**
 * Generate icon PNGs and ICO from resources/icon.svg
 *
 * Usage: node scripts/generate-icons.mjs
 *
 * Outputs:
 *   resources/icon.png       — 256x256  (window icon / packager input)
 *   resources/icon-tray.png  — 32x32    (system tray)
 *   resources/icon.ico       — multi-resolution Windows icon (16–256 px)
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const svg = readFileSync(join(root, 'resources', 'icon.svg'), 'utf-8')

function renderPng(size) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  return resvg.render().asPng()
}

function writePng(size, outFile) {
  writeFileSync(join(root, 'resources', outFile), renderPng(size))
  console.log(`✓  resources/${outFile}  (${size}x${size})`)
}

// Standalone PNGs
writePng(256, 'icon.png')
writePng(32,  'icon-tray.png')

// Multi-resolution ICO for Windows installer / taskbar
const ICO_SIZES = [16, 32, 48, 64, 128, 256]
const icoBuffer = await pngToIco(ICO_SIZES.map(renderPng))
writeFileSync(join(root, 'resources', 'icon.ico'), icoBuffer)
console.log(`✓  resources/icon.ico  (${ICO_SIZES.join('/')})`)
