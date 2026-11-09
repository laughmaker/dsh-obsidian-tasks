/**
 * Vault filesystem access with path guards, backups, and Markdown task parsing.
 *
 * All reads and writes go through here so the invariant holds everywhere: a
 * path must resolve inside the vault root and outside every excluded directory.
 * Writes are atomic-ish (write temp then rename) and the previous content is
 * copied into the backup dir first, so any edit is recoverable.
 */
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { backupDir, type VaultConfig } from './config.ts'

/** A parsed Markdown checkbox task. */
export interface Task {
  /** 1-based line number in the file. */
  line: number
  /** Checked when the box holds `x` or `X`. */
  done: boolean
  /** Task text with the list marker and checkbox removed. */
  text: string
  /** The raw line, unchanged. */
  raw: string
}

/** A task together with where it was found. */
export interface LocatedTask extends Task {
  /** Vault-relative path with forward slashes. */
  file: string
  /** Absolute path on disk. */
  absPath: string
  /** Optional tag carried in the task text (`#tag`). */
  tag?: string
}

const CHECKBOX = /^(\s*)([-*+]|\d+\.)\s+\[([ xX])\]\s+(.*)$/

/**
 * Verify that an absolute path stays inside the vault and outside exclusions.
 * @param vault - vault whose root and excludes bound the path.
 * @param absPath - candidate absolute path.
 * @returns the same path when valid.
 * @throws when the path escapes the vault or lands in an excluded directory.
 */
export function assertInsideVault(vault: VaultConfig, absPath: string): string {
  const root = resolve(vault.path)
  const target = resolve(absPath)
  const rel = relative(root, target)
  // The vault root itself is a valid target (e.g. walking the whole tree).
  if (target === root) return target
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path escapes vault root: ${absPath}`)
  }
  const segments = rel.split(sep)
  for (const excluded of vault.exclude ?? []) {
    const ex = excluded.trim()
    if (!ex) continue
    // An absolute exclusion applies to absolute paths; a bare name applies to
    // any path segment or leading subtree of the same name.
    if (isAbsolute(ex)) {
      const exResolved = resolve(ex)
      const r = relative(exResolved, target)
      if (r === '' || (!r.startsWith('..') && !isAbsolute(r))) {
        throw new Error(`Path is inside excluded area "${excluded}": ${absPath}`)
      }
    } else if (segments.includes(ex) || rel === ex || rel.startsWith(ex + sep)) {
      throw new Error(`Path is inside excluded area "${excluded}": ${absPath}`)
    }
  }
  return target
}

/**
 * Join vault-relative segments into an absolute path and validate it.
 * @param vault - vault to resolve within.
 * @param parts - vault-relative path segments.
 * @returns a validated absolute path.
 */
export function vaultPath(vault: VaultConfig, ...parts: string[]): string {
  return assertInsideVault(vault, join(vault.path, ...parts))
}

/**
 * Convert an absolute path to a vault-relative, forward-slash path.
 * @param vault - vault the path belongs to.
 * @param absPath - absolute path inside the vault.
 * @returns vault-relative path with `/` separators.
 */
export function relPath(vault: VaultConfig, absPath: string): string {
  return relative(resolve(vault.path), resolve(absPath)).split(sep).join('/')
}

/**
 * Read a UTF-8 file from the vault after validating its path.
 * @param vault - vault to read from.
 * @param absPath - validated candidate path.
 * @returns the file text.
 */
export function readVaultFile(vault: VaultConfig, absPath: string): string {
  return readFileSync(assertInsideVault(vault, absPath), 'utf8')
}

/**
 * Write a UTF-8 file into the vault after validating its path, backing up any
 * existing content first.
 * @param vault - vault to write into.
 * @param absPath - validated destination path.
 * @param content - new file content.
 * @returns the backup path when a backup was made.
 */
export function writeVaultFile(vault: VaultConfig, absPath: string, content: string): string | undefined {
  const target = assertInsideVault(vault, absPath)
  let backup: string | undefined
  if (existsSync(target)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const dest = join(backupDir(), `${relPath(vault, target).replace(/\//g, '__')}.${stamp}.bak`)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(target, dest)
    backup = dest
  }
  mkdirSync(dirname(target), { recursive: true })
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, target)
  return backup
}

/**
 * Parse every Markdown checkbox task out of a file body, preserving line order.
 * @param body - Markdown text.
 * @returns parsed tasks with 1-based line numbers.
 */
export function parseTasks(body: string): Task[] {
  const lines = body.split('\n')
  const out: Task[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = CHECKBOX.exec(lines[i])
    if (!m) continue
    out.push({
      line: i + 1,
      done: m[3] === 'x' || m[3] === 'X',
      text: m[4].trim(),
      raw: lines[i],
    })
  }
  return out
}

/**
 * Flip one checkbox line to the requested state, leaving everything else intact.
 * @param body - Markdown text.
 * @param line - 1-based line number to edit.
 * @param done - desired checked state.
 * @returns the updated Markdown text.
 * @throws when the line is not a checkbox task.
 */
export function setTaskState(body: string, line: number, done: boolean): string {
  const lines = body.split('\n')
  const idx = line - 1
  if (idx < 0 || idx >= lines.length) throw new Error(`Line ${line} is out of range`)
  const m = CHECKBOX.exec(lines[idx])
  if (!m) throw new Error(`Line ${line} is not a task checkbox`)
  const mark = done ? 'x' : ' '
  lines[idx] = `${m[1]}${m[2]} [${mark}] ${m[4]}`
  return lines.join('\n')
}

/**
 * Replace the text of one checkbox task line, keeping the line's indent, list
 * marker and checkbox state exactly as they were.
 * @param body - Markdown text.
 * @param line - 1-based line number to edit.
 * @param text - new task text; it is trimmed before it is written.
 * @returns the updated Markdown text.
 * @throws when the line is out of range or is not a checkbox task.
 */
export function setTaskText(body: string, line: number, text: string): string {
  const lines = body.split('\n')
  const idx = line - 1
  if (idx < 0 || idx >= lines.length) throw new Error(`Line ${line} is out of range`)
  const m = CHECKBOX.exec(lines[idx])
  if (!m) throw new Error(`Line ${line} is not a task checkbox`)
  lines[idx] = `${m[1]}${m[2]} [${m[3]}] ${text.trim()}`
  return lines.join('\n')
}

/**
 * Delete one checkbox task line and return the remaining body.
 * @param body - Markdown text.
 * @param line - 1-based line number to remove.
 * @returns the Markdown text without that line.
 * @throws when the line is out of range or is not a checkbox task.
 */
export function removeTask(body: string, line: number): string {
  const lines = body.split('\n')
  const idx = line - 1
  if (idx < 0 || idx >= lines.length) throw new Error(`Line ${line} is out of range`)
  if (!CHECKBOX.exec(lines[idx])) throw new Error(`Line ${line} is not a task checkbox`)
  lines.splice(idx, 1)
  return lines.join('\n')
}

/**
 * Remove a task line and return both the remaining body and the parsed task.
 * @param body - Markdown text.
 * @param line - 1-based line number to remove.
 * @returns the body without that line and the removed task.
 */
export function extractTaskLine(body: string, line: number): { body: string; task: Task } {
  const lines = body.split('\n')
  const idx = line - 1
  const m = idx >= 0 && idx < lines.length ? CHECKBOX.exec(lines[idx]) : null
  if (!m) throw new Error(`Line ${line} is not a task checkbox`)
  const task: Task = {
    line,
    done: m[3] === 'x' || m[3] === 'X',
    text: m[4].trim(),
    raw: lines[idx],
  }
  lines.splice(idx, 1)
  return { body: lines.join('\n'), task }
}

/**
 * Render a new unchecked task line with optional leading indent.
 * @param text - task body.
 * @param indent - leading whitespace (default two spaces for nested daily items).
 * @returns the Markdown task line.
 */
export function renderTask(text: string, indent = ''): string {
  return `${indent}- [ ] ${text.trim()}`
}

/**
 * Recursively list Markdown files under a directory, skipping excluded areas.
 * @param vault - vault whose excludes bound the walk.
 * @param absDir - directory to walk.
 * @returns absolute paths of `.md` files.
 */
export function listMarkdownFiles(vault: VaultConfig, absDir: string): string[] {
  const start = assertInsideVault(vault, absDir)
  if (!existsSync(start) || !statSync(start).isDirectory()) return []
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      const abs = join(dir, name)
      let info
      try {
        info = statSync(abs)
      } catch {
        continue
      }
      if (info.isDirectory()) {
        if ((vault.exclude ?? []).includes(name)) continue
        walk(abs)
      } else if (name.endsWith('.md')) {
        out.push(abs)
      }
    }
  }
  walk(start)
  return out.sort()
}
