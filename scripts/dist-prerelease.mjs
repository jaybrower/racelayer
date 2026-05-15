#!/usr/bin/env node
/**
 * dist-prerelease.mjs — build a pre-release package without modifying package.json.
 *
 * Usage:
 *   npm run dist:pre -- beta.1
 *   npm run dist:pre -- rc.1
 *
 * The suffix is appended to the current package.json version via electron-builder's
 * --config.extraMetadata.version override, so package.json is never modified.
 *
 * Produces artifacts in dist/ named e.g.:
 *   RaceLayer-0.1.3-beta.1-Setup.exe   (NSIS installer)
 *   RaceLayer-portable-0.1.3-beta.1.exe (portable)
 *
 * IMPORTANT: when uploading to GitHub, mark the release as --prerelease and do NOT
 * upload latest.yml — otherwise stable-channel users will be offered this build
 * via electron-updater's auto-update mechanism.
 */

import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const suffix = process.argv[2]

if (!suffix) {
  console.error('Error: suffix argument is required.')
  console.error('')
  console.error('Usage:   npm run dist:pre -- <suffix>')
  console.error('Example: npm run dist:pre -- beta.1')
  console.error('Example: npm run dist:pre -- rc.2')
  process.exit(1)
}

// Allow alphanumeric, dots, hyphens — reject anything that could break the
// version string or be passed as a shell injection.
if (!/^[a-zA-Z][a-zA-Z0-9.\-]*$/.test(suffix)) {
  console.error(`Error: invalid suffix "${suffix}".`)
  console.error('Suffix must start with a letter and contain only alphanumeric characters, dots, and hyphens.')
  console.error('Examples: beta.1  rc.2  alpha.3')
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'))
const baseVersion = pkg.version
const fullVersion = `${baseVersion}-${suffix}`

console.log()
console.log(`Building pre-release: v${fullVersion}`)
console.log(`  Base version (package.json): ${baseVersion}`)
console.log(`  Build version (this run):    ${fullVersion}`)
console.log()

try {
  execSync(
    `electron-vite build && electron-builder --config.extraMetadata.version=${fullVersion}`,
    { cwd: rootDir, stdio: 'inherit', shell: true }
  )
  console.log()
  console.log(`Pre-release build complete: v${fullVersion}`)
  console.log('Artifacts are in dist/')
  console.log()
  console.log('Next steps for publishing to GitHub:')
  console.log(`  1. Create a GitHub release tagged v${fullVersion}`)
  console.log('  2. Upload the installer and portable .exe from dist/')
  console.log('  3. Mark the release as Pre-release')
  console.log('  4. Do NOT upload latest.yml (would push this build to stable-channel users)')
} catch (err) {
  process.exit(err.status ?? 1)
}
