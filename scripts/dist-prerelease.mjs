#!/usr/bin/env node
/**
 * dist-prerelease.mjs — build a pre-release package without modifying package.json.
 *
 * Usage:
 *   npm run dist:pre -- <suffix>           # appends to package.json version
 *   npm run dist:pre -- <full-version>     # overrides the whole version
 *
 * Examples:
 *   npm run dist:pre -- beta.1
 *     → uses package.json version (e.g. 0.1.6) as the base:
 *       RaceLayer-0.1.6-beta.1.exe
 *
 *   npm run dist:pre -- 0.1.0-autoUpdateTest.1
 *     → ignores package.json version entirely, uses the full string:
 *       RaceLayer-0.1.0-autoUpdateTest.1.exe
 *
 * Detection rule (no flags, no surprises):
 *   - Starts with a digit  → treated as a full semver-ish version string.
 *   - Starts with a letter → treated as a suffix to append to package.json.
 *
 * The full-version form is useful when testing the auto-update flow: you need
 * a build with a version *lower* than the latest published release so the
 * update check actually finds something newer.  Bumping package.json
 * temporarily works but is easy to forget to revert; passing the full version
 * here leaves package.json alone.
 *
 * Produces artifacts in dist/ named e.g.:
 *   RaceLayer-0.1.3-beta.1.exe              (NSIS installer)
 *   RaceLayer-portable-0.1.3-beta.1.exe     (portable)
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

const arg = process.argv[2]

if (!arg) {
  console.error('Error: version argument is required.')
  console.error('')
  console.error('Usage:   npm run dist:pre -- <suffix>')
  console.error('         npm run dist:pre -- <full-version>')
  console.error('')
  console.error('Examples:')
  console.error('  npm run dist:pre -- beta.1                       # → <pkg>-beta.1')
  console.error('  npm run dist:pre -- rc.2                         # → <pkg>-rc.2')
  console.error('  npm run dist:pre -- 0.1.0-autoUpdateTest.1       # → 0.1.0-autoUpdateTest.1')
  process.exit(1)
}

// ── Resolve full version ─────────────────────────────────────────────────────
// Two accepted forms, distinguished by first character:
//   • starts with digit → full semver-ish: \d+\.\d+\.\d+(-[\w.-]+)? plus
//     reasonable safety bounds.  Used verbatim.
//   • starts with letter → suffix: appended to package.json version.

const FULL_VERSION_RE = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.\-]+)?$/
const SUFFIX_RE       = /^[a-zA-Z][a-zA-Z0-9.\-]*$/

let baseVersion
let fullVersion
let mode

const firstChar = arg[0]
if (firstChar >= '0' && firstChar <= '9') {
  // Full-version form.
  if (!FULL_VERSION_RE.test(arg)) {
    console.error(`Error: invalid full version "${arg}".`)
    console.error('Expected format: MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-prerelease')
    console.error('Examples: 0.1.0  0.1.0-autoUpdateTest.1  1.0.0-beta.3')
    process.exit(1)
  }
  fullVersion = arg
  // Extract base for the build summary.
  baseVersion = arg.split('-')[0]
  mode = 'full'
} else {
  // Suffix form.
  if (!SUFFIX_RE.test(arg)) {
    console.error(`Error: invalid suffix "${arg}".`)
    console.error('Suffix must start with a letter and contain only alphanumeric characters, dots, and hyphens.')
    console.error('Examples: beta.1  rc.2  alpha.3')
    process.exit(1)
  }
  const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'))
  baseVersion = pkg.version
  fullVersion = `${baseVersion}-${arg}`
  mode = 'suffix'
}

console.log()
console.log(`Building pre-release: v${fullVersion}`)
console.log(`  Base version: ${baseVersion}${mode === 'suffix' ? ' (from package.json)' : ' (from CLI arg)'}`)
console.log(`  Build version: ${fullVersion}`)
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
