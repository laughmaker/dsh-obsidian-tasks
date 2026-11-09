/**
 * Typecheck both halves against the real DSH client packages.
 *
 * The client half imports types from packages that are not on the npm registry
 * (they resolve from the host's module table at runtime, and from a local DSH
 * checkout at development time). This script:
 *   1. links the checkout's client packages + react + @types into node_modules
 *      (remembering each link so it can remove it afterwards);
 *   2. runs `tsc --noEmit` for the Node half (against the published
 *      @deepseek-ai/cordis@4.0.5 its packages augment) and the client half
 *      (against the checkout's vendored cordis, mapped in tsconfig.client.json);
 *   3. removes the links it created, even on failure.
 *
 * Usage: node script/typecheck.mjs
 * Requires: a DSH source checkout at $DSH_SOURCE or ~/Developer/deepseek-harness.
 */
import { existsSync, mkdirSync, symlinkSync, unlinkSync, readlinkSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const source = [process.env.DSH_SOURCE, join(homedir(), 'Developer', 'deepseek-harness')]
  .filter(Boolean)
  .find((p) => existsSync(join(p, 'packages', 'client', 'ui-primitives')))
if (!source) {
  console.error('No DSH source checkout found. Set DSH_SOURCE to the repository root.')
  process.exit(1)
}

const PNPM = join(source, 'node_modules', '.pnpm')
/** The one directory under pnpm whose name starts with `prefix`. */
function pnpmPkg(prefix) {
  const hit = readdirSync(PNPM).find((d) => d.startsWith(prefix))
  if (!hit) throw new Error(`pnpm package not found: ${prefix}`)
  return join(PNPM, hit, 'node_modules')
}

const CLIENT = {
  'dsh-client-locale': 'locale',
  'dsh-client-store': 'store',
  'dsh-client-ui-layout': 'ui-layout',
  'dsh-client-ui-primitives': 'ui-primitives',
  'dsh-client-ui-renderer': 'ui-renderer',
  'dsh-client-ui-sidebar': 'ui-sidebar',
  'dsh-client-ui-slots': 'ui-slots',
}

const created = []
function link(target, linkPath) {
  if (existsSync(linkPath)) return
  mkdirSync(join(linkPath, '..'), { recursive: true })
  symlinkSync(target, linkPath)
  created.push(linkPath)
}

let failed = false
try {
  const scope = join(ROOT, 'node_modules', '@deepseek-ai')
  for (const [name, dir] of Object.entries(CLIENT)) {
    link(join(source, 'packages', 'client', dir), join(scope, name))
  }
  const nodeModules = join(ROOT, 'node_modules')
  link(join(pnpmPkg('react@18'), 'react'), join(nodeModules, 'react'))
  link(join(pnpmPkg('react-dom@18'), 'react-dom'), join(nodeModules, 'react-dom'))
  link(join(pnpmPkg('@types+react@'), '@types', 'react'), join(nodeModules, '@types', 'react'))
  link(join(pnpmPkg('@types+react-dom@'), '@types', 'react-dom'), join(nodeModules, '@types', 'react-dom'))
  link(join(source, 'node_modules', '@types', 'node'), join(nodeModules, '@types', 'node'))

  const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
  const cordisLink = join(nodeModules, '@deepseek-ai', 'cordis')
  const vendorCordis = join(source, 'vendor', 'cordis')

  // Node half: the published tool packages augment @deepseek-ai/cordis@4.0.5,
  // which its own node_modules already provides.
  try {
    execFileSync(process.execPath, [tsc, '--noEmit', '-p', 'tsconfig.json'], { stdio: 'inherit', cwd: ROOT })
    console.log('tsconfig.json: ok')
  } catch {
    failed = true
    console.error('tsconfig.json: FAILED')
  }

  // Client half: the browser packages are built against the checkout's vendored
  // cordis (4.0.2). Swap the node_modules link for the client pass, restore it
  // afterwards so the Node half keeps 4.0.5.
  const savedCordis = existsSync(cordisLink) ? readlinkSync(cordisLink) : undefined
  try { if (existsSync(cordisLink)) unlinkSync(cordisLink) } catch { /* none */ }
  symlinkSync(vendorCordis, cordisLink)
  try {
    execFileSync(process.execPath, [tsc, '--noEmit', '-p', 'tsconfig.client.json'], { stdio: 'inherit', cwd: ROOT })
    console.log('tsconfig.client.json: ok')
  } catch {
    failed = true
    console.error('tsconfig.client.json: FAILED')
  } finally {
    try { unlinkSync(cordisLink) } catch { /* none */ }
    if (savedCordis !== undefined) symlinkSync(savedCordis, cordisLink)
  }
} finally {
  for (const l of created.reverse()) {
    try { unlinkSync(l) } catch { /* already gone */ }
  }
}
process.exit(failed ? 1 : 0)
