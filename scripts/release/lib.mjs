/**
 * Shared helpers for the release:* scripts.
 *
 * Each release:* script orchestrates one mechanical cluster of the /release
 * pipeline (finalize PR, promote-to-main + tag, build + publish, open-next).
 * The skill still owns the judgment gates — these scripts just do the work
 * that doesn't need a human in the loop.
 */

import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const repoRoot = join(__dirname, '..', '..')

const VERSION_RE = /^v(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.\-]+))?$/

/**
 * Parse a `vX.Y.Z` or `vX.Y.Z-pre.N` tag. Returns { tag, version, isPrerelease }.
 * Exits non-zero with a useful message if the arg doesn't match.
 */
export function parseVersion(arg) {
  if (!arg) {
    fail('Missing version argument. Expected e.g. v0.1.7 or v0.1.7-beta.1')
  }
  const m = VERSION_RE.exec(arg)
  if (!m) {
    fail(`Invalid version "${arg}". Expected vX.Y.Z or vX.Y.Z-prerelease`)
  }
  return {
    tag: arg,
    version: arg.slice(1),
    isPrerelease: Boolean(m[4]),
  }
}

/**
 * Parse argv for `<version>` + `--dry-run`. Returns { version, dryRun, rest }.
 * `rest` holds any unrecognized positional args (callers can validate or pass on).
 */
export function parseArgs(argv) {
  const args = argv.slice(2)
  let dryRun = false
  const rest = []
  for (const a of args) {
    if (a === '--dry-run') dryRun = true
    else rest.push(a)
  }
  const [versionArg, ...extra] = rest
  return { ...parseVersion(versionArg), dryRun, rest: extra }
}

/**
 * Run a shell command. `dryRun: true` prints the command and skips execution.
 * `capture: true` returns trimmed stdout. Otherwise stdio is inherited and the
 * function returns the empty string.
 */
export function run(cmd, { dryRun = false, capture = false, cwd = repoRoot } = {}) {
  if (dryRun) {
    console.log(`  [dry-run] ${cmd}`)
    return ''
  }
  if (capture) {
    return execSync(cmd, { cwd, shell: true, encoding: 'utf8' }).trim()
  }
  execSync(cmd, { cwd, shell: true, stdio: 'inherit' })
  return ''
}

/** YYYY-MM-DD in local time. */
export function today() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function info(msg) {
  console.log(`[release] ${msg}`)
}

export function warn(msg) {
  console.warn(`[release] WARN: ${msg}`)
}

export function fail(msg) {
  console.error(`[release] ERROR: ${msg}`)
  process.exit(1)
}

export const repo = 'jaybrower/racelayer'
