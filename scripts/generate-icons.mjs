/**
 * Generate icon PNGs from resources/icon.svg
 *
 * Usage: node scripts/generate-icons.mjs
 *
 * Outputs:
 *   resources/icon.png       — 256x256 (window icon / packager input)
 *   resources/icon-tray.png  — 32x32   (system tray)
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Resvg } from '@resvg/resvg-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const svg = readFileSync(join(root, 'resources', 'icon.svg'), 'utf-8')

function render(size, outFile) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
  })
  const pngData = resvg.render()
  const pngBuffer = pngData.asPng()
  writeFileSync(join(root, 'resources', outFile), pngBuffer)
  console.log(`✓  resources/${outFile}  (${size}x${size})`)
}

render(256, 'icon.png')
render(32,  'icon-tray.png')
