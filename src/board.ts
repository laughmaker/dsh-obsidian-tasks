/**
 * Shared task-board operations over a configured Obsidian vault.
 *
 * The model-facing tools (`tools.ts`) and the browser board's Host routes
 * (`routes.ts`) both drive the same vault through these functions, so the two
 * surfaces can never drift: the same path guard, the same minimal line edit,
 * the same backup-before-write. Nothing here touches a tool registry or an HTTP
 * request; it is pure vault I/O plus the daily-note conventions.
 * @module dsh-obsidian-tasks/board
 */
import { basename } from 'node:path'
import { createHash } from 'node:crypto'
import { loadConfig, persistConfig, resolveVault, type VaultConfig, type TasksConfig } from './config.ts'
import {
  extractTaskLine,
  listMarkdownFiles,
  parseTasks,
  readVaultFile,
  relPath,
  removeTask,
  renderTask,
  setTaskState,
  setTaskText,
  vaultPath,
  writeVaultFile,
  type LocatedTask,
} from './vault.ts'

/** A parsed task plus the grouping heading it sits under, for the board UI. */
export interface BoardTask {
  /** Vault-relative path of the note the task lives in. */
  file: string
  /** 1-based line number in the file. */
  line: number
  /** Whether the box is checked. */
  done: boolean
  /** Hash of the source note, used to reject writes against stale line numbers. */
  version: string
  /** Task text with the list marker and checkbox removed. */
  text: string
  /** Optional tag carried in the text (`#tag`). */
  tag?: string
  /** The nearest Markdown heading above the task, without the leading `#`s. */
  group?: string
}

/** One selector entry the board offers. */
export interface VaultOption {
  /** Stable short name. */
  name: string
  /** Daily-note directory relative to the vault root, when configured. */
  dailyDir?: string
  /** TDLs directory relative to the vault root, when configured. */
  tdlsDir?: string
  /** Vault-relative Inbox file holding undated tasks. */
  inboxFile?: string
}

/** `YYYY-MM-DD` for a Date in local time. */
export function isoDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Reject a string that is not a calendar date in `YYYY-MM-DD` form. */
export function assertDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid date "${value}"; expected YYYY-MM-DD`)
  }
  return value
}

/**
 * Find the note file for a date within a vault's daily or TDLs layout.
 * @param vault - vault to search.
 * @param date - `YYYY-MM-DD`.
 * @returns the absolute path of the best-matching note, or undefined.
 */
export function noteForDate(vault: VaultConfig, date: string): string | undefined {
  const candidates: string[] = []
  if (vault.dailyDir) candidates.push(vaultPath(vault, vault.dailyDir, `${date}.md`))
  if (vault.tdlsDir) {
    const year = date.slice(0, 4)
    const month = date.slice(0, 7)
    candidates.push(
      vaultPath(vault, vault.tdlsDir, year, month, date, `${date}.md`),
      vaultPath(vault, vault.tdlsDir, year, month, `${date}.md`),
    )
  }
  for (const c of candidates) {
    try {
      readVaultFile(vault, c)
      return c
    } catch {
      // not present or unreadable; try the next layout
    }
  }
  return undefined
}

/**
 * Choose where a new task note should be created when none exists yet.
 * @param vault - vault with a layout.
 * @param date - `YYYY-MM-DD`.
 * @returns the absolute path to create.
 */
export function defaultNoteForDate(vault: VaultConfig, date: string): string {
  if (vault.dailyDir) return vaultPath(vault, vault.dailyDir, `${date}.md`)
  if (vault.tdlsDir) {
    const year = date.slice(0, 4)
    const month = date.slice(0, 7)
    return vaultPath(vault, vault.tdlsDir, year, month, date, `${date}.md`)
  }
  throw new Error('Vault has neither dailyDir nor tdlsDir configured')
}

/** The vault-relative Inbox file: configured, or beside the daily notes. */
export function inboxRelPath(vault: VaultConfig): string {
  if (vault.inboxFile !== undefined && vault.inboxFile.trim() !== '') return vault.inboxFile
  if (vault.dailyDir !== undefined) return `${vault.dailyDir}/Inbox.md`
  if (vault.tdlsDir !== undefined) return `${vault.tdlsDir}/Inbox.md`
  return 'Inbox.md'
}

/** Render a fresh Inbox note body. */
export function newInboxNote(): string {
  return ['---', 'tags: [tasks]', 'categories: [Tasks]', '---', '', '# Inbox', '', '## Tasks', '', ''].join('\n')
}

/** The Inbox note for a vault: its path and tasks, or undefined when absent. */
export function inboxNote(vault: VaultConfig): { file: string; abs: string; tasks: BoardTask[] } | undefined {
  const file = inboxRelPath(vault)
  let abs: string
  try {
    abs = vaultPath(vault, file)
  } catch {
    return undefined
  }
  try {
    readVaultFile(vault, abs)
  } catch {
    return undefined
  }
  return { file, abs, tasks: tasksOfNote(vault, abs) }
}

/** Read the Inbox tasks, returning an empty list when the file does not exist. */
export function inboxTasks(vault: VaultConfig): BoardTask[] {
  return inboxNote(vault)?.tasks ?? []
}

/** Add an open task to the Inbox file, creating it from the template when absent. */
export function addInboxTask(vault: VaultConfig, text: string, heading?: string, indent = ''): AddResult {
  const file = inboxRelPath(vault)
  const abs = vaultPath(vault, file)
  let existing: string | undefined
  try {
    existing = readVaultFile(vault, abs)
  } catch {
    existing = undefined
  }
  const body = existing ?? newInboxNote()
  const line = renderTask(text, indent)
  const target = heading !== undefined && heading.trim() !== '' ? heading : firstSectionHeading(body)
  const next = appendTask(body, line, target)
  const backup = writeVaultFile(vault, abs, next)
  const added = parseTasks(next).find((t) => t.text === text.trim())
  return { file: relPath(vault, abs), line: added?.line ?? 0, created: existing === undefined, ...(backup ? { backup } : {}) }
}

/** Move one task from a dated note into the Inbox file. */
export function moveTaskToInbox(vault: VaultConfig, file: string, line: number, expectedVersion?: string): { from: string; to: string; text: string; backup?: string } {
  const srcAbs = vaultPath(vault, file)
  const srcBody = readVaultFile(vault, srcAbs)
  assertNoteVersion(srcBody, expectedVersion)
  const { body: srcNext, task } = extractTaskLine(srcBody, Math.trunc(line))
  const inbox = inboxRelPath(vault)
  const dstAbs = vaultPath(vault, inbox)
  let dstBody: string
  try {
    dstBody = readVaultFile(vault, dstAbs)
  } catch {
    dstBody = newInboxNote()
  }
  const dstNext = appendTask(dstBody, renderTask(task.text, ''))
  const backup = writeVaultFile(vault, srcAbs, srcNext)
  writeVaultFile(vault, dstAbs, dstNext)
  return { from: relPath(vault, srcAbs), to: relPath(vault, dstAbs), text: task.text, ...(backup ? { backup } : {}) }
}

/** Render a fresh daily note body for a date. */
export function newDailyNote(date: string): string {
  return [
    '---',
    'tags: [daily]',
    'categories: [Daily]',
    `created: ${date} 00:00:00`,
    `modified: ${date} 00:00:00`,
    '---',
    '',
    `# ${date}`,
    '',
    '## Today',
    '',
    '',
  ].join('\n')
}

/**
 * The first `##` section heading of a note, used as the default landing spot
 * for new tasks (a daily note's `## Today`).
 * @param body - Markdown note text.
 * @returns the heading text, or undefined when the note has no `##` section.
 */
export function firstSectionHeading(body: string): string | undefined {
  const m = /^#{2,6}\s+(.*)$/m.exec(body)
  return m === null ? undefined : m[1].trim()
}

/**
 * Append a task line under a heading, or at end of file when the heading is absent.
 * @param body - existing note text.
 * @param line - rendered task line.
 * @param heading - optional `## Heading` to append beneath.
 * @returns updated body.
 */
export function appendTask(body: string, line: string, heading?: string): string {
  const lines = body.split('\n')
  if (heading) {
    const target = heading.replace(/^#+\s*/, '').trim()
    const idx = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.replace(/^#+\s*/, '').trim() === target)
    if (idx >= 0) {
      // Insert after the heading block, before the next heading of same/higher level.
      let insertAt = lines.length
      for (let i = idx + 1; i < lines.length; i++) {
        const m = /^(#{1,6})\s/.exec(lines[i])
        if (m) {
          insertAt = i
          break
        }
      }
      // Trim blank lines just before the next heading so the task sits with its section.
      let at = insertAt
      while (at > idx + 1 && lines[at - 1].trim() === '') at--
      lines.splice(at, 0, line)
      return lines.join('\n')
    }
  }
  const trimmed = body.replace(/\s*$/, '')
  return trimmed + '\n' + line + '\n'
}

/** Map a parsed task to a located task for output. */
function locate(vault: VaultConfig, absPath: string, t: ReturnType<typeof parseTasks>[number]): LocatedTask {
  const tag = /#([\p{L}\p{N}_/-]+)/u.exec(t.text)?.[1]
  return { ...t, file: relPath(vault, absPath), absPath, tag }
}

/** Collect tasks across a vault, optionally within a directory subtree. */
export function collectTasks(vault: VaultConfig, sub?: string): LocatedTask[] {
  const root = sub ? vaultPath(vault, sub) : vault.path
  const files = listMarkdownFiles(vault, root)
  const out: LocatedTask[] = []
  for (const f of files) {
    const body = readVaultFile(vault, f)
    for (const t of parseTasks(body)) out.push(locate(vault, f, t))
  }
  return out
}

/**
 * The heading each line sits under, keyed by 1-based line number. Used to group
 * tasks in the board the way the note itself is organised.
 * @param body - Markdown note text.
 * @returns a map from line number to the nearest heading above it.
 */
export function headingsByLine(body: string): Map<number, string> {
  const lines = body.split('\n')
  const out = new Map<number, string>()
  let current = ''
  for (let i = 0; i < lines.length; i++) {
    const m = /^#{1,6}\s+(.*)$/.exec(lines[i])
    if (m) current = m[1].trim()
    out.set(i + 1, current)
  }
  return out
}

/** The effective configuration, resolved vault, and the vault options the board offers. */
export interface BoardContext {
  config: TasksConfig
  vault: VaultConfig
  vaults: VaultOption[]
}

/**
 * Resolve a vault by name (or the default) and report the selector options.
 * @param vaultName - optional explicit vault name from a request.
 * @returns the resolved context.
 */
export function boardContext(vaultName?: string): BoardContext {
  const config = loadConfig()
  const vault = resolveVault(config, vaultName)
  const vaults: VaultOption[] = config.vaults.map((v) => ({
    name: v.name,
    ...(v.dailyDir ? { dailyDir: v.dailyDir } : {}),
    ...(v.tdlsDir ? { tdlsDir: v.tdlsDir } : {}),
    ...(v.inboxFile ? { inboxFile: v.inboxFile } : {}),
  }))
  return { config, vault, vaults }
}

/**
 * The tasks of one note with their grouping headings, in line order.
 * @param vault - vault the note belongs to.
 * @param absPath - absolute path of the note.
 * @returns board tasks (empty when the note does not exist).
 */
/** A stable revision for the exact Markdown body read from disk. */
export function noteVersion(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex')
}

/** Reject an outdated note before applying a line-number-based change. */
function assertNoteVersion(body: string, expectedVersion: string | undefined): void {
  if (expectedVersion !== undefined && expectedVersion !== noteVersion(body)) {
    throw new Error('TASK_CONFLICT: note changed since it was loaded')
  }
}

export function tasksOfNote(vault: VaultConfig, absPath: string): BoardTask[] {
  let body: string
  try {
    body = readVaultFile(vault, absPath)
  } catch {
    return []
  }
  const headings = headingsByLine(body)
  const version = noteVersion(body)
  return parseTasks(body).map((t) => {
    const group = headings.get(t.line)
    return {
      file: relPath(vault, absPath),
      line: t.line,
      done: t.done,
      version,
      text: t.text,
      ...(t.text.includes('#') ? { tag: /#([\p{L}\p{N}_/-]+)/u.exec(t.text)?.[1] } : {}),
      ...(group ? { group } : {}),
    }
  })
}

/**
 * Combine the notes for a date plus a window of neighbouring days into one
 * ordered board feed, so the UI can show a multi-day column without many calls.
 * @param vault - vault to read.
 * @param date - anchor day (`YYYY-MM-DD`).
 * @param days - how many days on each side to include (0 = anchor only).
 * @returns tasks grouped by their note, newest anchor first, each with its date.
 */
export function boardForDate(vault: VaultConfig, date: string, days = 0): Array<{ date: string; file: string; tasks: BoardTask[] }> {
  const anchors: string[] = [date]
  for (let d = 1; d <= Math.max(0, days); d++) {
    anchors.push(shiftDate(date, -d))
    anchors.push(shiftDate(date, d))
  }
  const seen = new Set<string>()
  const out: Array<{ date: string; file: string; tasks: BoardTask[] }> = []
  for (const day of anchors) {
    if (seen.has(day)) continue
    seen.add(day)
    const abs = noteForDate(vault, day)
    if (!abs) continue
    const file = relPath(vault, abs)
    out.push({ date: day, file, tasks: tasksOfNote(vault, abs) })
  }
  return out
}

/**
 * Shift a `YYYY-MM-DD` date by a signed number of days in local time.
 * @param date - the anchor date.
 * @param delta - days to add (negative moves back).
 * @returns the shifted date.
 */
export function shiftDate(date: string, delta: number): string {
  const d = new Date(`${assertDate(date)}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return isoDate(d)
}

/** A day note found in the vault: its date and where the file lives. */
export interface DayNote {
  /** The note's date, `YYYY-MM-DD`. */
  date: string
  /** Absolute path of the note file. */
  absPath: string
}

/** A day note's open (not done) and total task counts. */
export interface TimelineDay {
  /** The note's date, `YYYY-MM-DD`. */
  date: string
  /** Number of tasks that are not done. */
  count: number
  /** Number of tasks in the note, done ones included. */
  total: number
}

/** Open and total task counts of one calendar month. */
export interface TimelineMonth {
  /** The month, `YYYY-MM`. */
  month: string
  /** Number of open tasks in the month. */
  count: number
  /** Number of tasks in the month, done ones included. */
  total: number
}

/** Open and total task counts of one calendar year. */
export interface TimelineYear {
  /** The year, `YYYY`. */
  year: string
  /** Number of open tasks in the year. */
  count: number
  /** Number of tasks in the year, done ones included. */
  total: number
}

/** One tag and how many open tasks carry it. */
export interface TimelineTag {
  /** Tag name without the leading `#`. */
  tag: string
  /** Number of open tasks carrying the tag. */
  count: number
}

/** Task counts per day, per month and per year, plus tag totals. */
export interface Timeline {
  /** One entry per day note holding at least one task, ascending by date. */
  days: TimelineDay[]
  /** Open and total task counts per month, ascending. */
  months: TimelineMonth[]
  /** Open and total task counts per year, ascending. */
  years: TimelineYear[]
  /** Open task counts per tag across the whole vault, most used first. */
  tags: TimelineTag[]
}

/** A day note's basename: `YYYY-MM-DD.md`. */
const DAY_NOTE_NAME = /^(\d{4}-\d{2}-\d{2})\.md$/

/** Most day notes {@link dayNotes} returns; the oldest ones are dropped. */
const MAX_DAY_NOTES = 4000

/**
 * Walk the vault's daily and TDLs trees and collect every day note.
 * @param vault - vault to walk.
 * @returns the day notes, ascending by date, one per date.
 */
function collectDayNotes(vault: VaultConfig): DayNote[] {
  const byDate = new Map<string, DayNote>()
  const add = (absPath: string): void => {
    const m = DAY_NOTE_NAME.exec(basename(absPath))
    if (m === null) return
    const date = m[1]
    // The daily tree is walked first, so a date present in both layouts keeps
    // the dailyDir copy.
    if (byDate.has(date)) return
    byDate.set(date, { date, absPath })
  }
  if (vault.dailyDir) {
    for (const f of listMarkdownFiles(vault, vaultPath(vault, vault.dailyDir))) add(f)
  }
  if (vault.tdlsDir) {
    for (const f of listMarkdownFiles(vault, vaultPath(vault, vault.tdlsDir))) add(f)
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * List the vault's day notes (`YYYY-MM-DD.md`), in either the daily or the
 * TDLs layout.
 * @param vault - vault to walk.
 * @param since - optional `YYYY-MM-DD`; only notes on or after it are kept.
 * @returns the day notes, ascending by date, one per date.
 */
export function dayNotes(vault: VaultConfig, since?: string): DayNote[] {
  let out = collectDayNotes(vault)
  if (since !== undefined) out = out.filter((n) => n.date >= since)
  // The walk covers the whole vault, so the result is capped: with more than
  // 4000 day notes only the 4000 most recent ones are kept.
  if (out.length > MAX_DAY_NOTES) out = out.slice(out.length - MAX_DAY_NOTES)
  return out
}

/**
 * The default timeline window: the last five calendar years.
 * @returns January 1st of the current year minus four.
 */
function defaultSince(): string {
  return `${new Date().getFullYear() - 4}-01-01`
}

/**
 * Count the tasks of a vault per day, month and year.
 * @param vault - vault to read.
 * @param since - optional `YYYY-MM-DD`; defaults to the last five years.
 * @returns the timeline counts.
 */
export function timelineFor(vault: VaultConfig, since?: string): Timeline {
  const from = since === undefined ? defaultSince() : assertDate(since)
  const days: TimelineDay[] = []
  // Each period keeps both numbers: `count` (open) drives the smart views and
  // the status bar; `total` (all tasks) is what the timeline tree displays, so
  // a fully completed month still shows how much work it held.
  const months = new Map<string, { open: number; total: number }>()
  const years = new Map<string, { open: number; total: number }>()
  const tags = new Map<string, number>()
  for (const note of dayNotes(vault, from)) {
    let body: string
    try {
      body = readVaultFile(vault, note.absPath)
    } catch {
      continue
    }
    const tasks = parseTasks(body)
    if (tasks.length === 0) continue
    const open = tasks.filter((t) => !t.done)
    const count = open.length
    const total = tasks.length
    days.push({ date: note.date, count, total })
    const month = note.date.slice(0, 7)
    const monthAgg = months.get(month) ?? { open: 0, total: 0 }
    months.set(month, { open: monthAgg.open + count, total: monthAgg.total + total })
    const year = note.date.slice(0, 4)
    const yearAgg = years.get(year) ?? { open: 0, total: 0 }
    years.set(year, { open: yearAgg.open + count, total: yearAgg.total + total })
    // Tag totals stay open-only: a tag on a finished task never appears.
    for (const task of open) {
      const tag = /#([\p{L}\p{N}_/-]+)/u.exec(task.text)?.[1]
      if (tag !== undefined) tags.set(tag, (tags.get(tag) ?? 0) + 1)
    }
  }
  // Inbox tasks do not belong to a day bucket, but their open tags still count
  // in the whole-vault tag index.
  for (const task of inboxTasks(vault)) {
    if (task.done) continue
    if (task.tag !== undefined) tags.set(task.tag, (tags.get(task.tag) ?? 0) + 1)
  }
  return {
    days,
    months: [...months.entries()].map(([month, agg]) => ({ month, count: agg.open, total: agg.total })),
    years: [...years.entries()].map(([year, agg]) => ({ year, count: agg.open, total: agg.total })),
    tags: [...tags.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
  }
}

/**
 * The tasks of every day note inside a date range, in the board feed's shape.
 * @param vault - vault to read.
 * @param from - first day of the range, `YYYY-MM-DD`.
 * @param to - last day of the range, `YYYY-MM-DD`.
 * @returns one group per day note in the range, ascending by date.
 * @throws when a date is malformed or the range runs backwards.
 */
export function tasksInRange(vault: VaultConfig, from: string, to: string): Array<{ date: string; file: string; tasks: BoardTask[] }> {
  const start = assertDate(from)
  const end = assertDate(to)
  if (start > end) throw new Error(`Invalid date range: "from" (${start}) is after "to" (${end})`)
  const out: Array<{ date: string; file: string; tasks: BoardTask[] }> = []
  // The uncapped walk is used here on purpose: the cap in `dayNotes` keeps the
  // newest notes, which would drop the days of an older range.
  for (const note of collectDayNotes(vault)) {
    if (note.date < start) continue
    if (note.date > end) break
    out.push({ date: note.date, file: relPath(vault, note.absPath), tasks: tasksOfNote(vault, note.absPath) })
  }
  return out
}

/** Result of adding a task: where it landed and whether the note was created. */
export interface AddResult {
  file: string
  line: number
  created: boolean
  backup?: string
}

/**
 * Add a task to a date's note, creating the note from the daily template when absent.
 * @param vault - vault to write.
 * @param date - `YYYY-MM-DD`.
 * @param text - task text (no checkbox).
 * @param heading - optional heading to file it under.
 * @param indent - optional leading whitespace for nesting.
 * @returns where the task landed.
 */
export function addTask(vault: VaultConfig, date: string, text: string, heading?: string, indent = ''): AddResult {
  const stamped = assertDate(date)
  const existing = noteForDate(vault, stamped)
  const abs = existing ?? defaultNoteForDate(vault, stamped)
  const body = existing ? readVaultFile(vault, abs) : newDailyNote(stamped)
  const line = renderTask(text, indent)
  // No explicit heading: file the task under the note's first `##` section
  // (a daily note's `## Today`) instead of trailing past the later sections.
  const target = heading !== undefined && heading.trim() !== '' ? heading : firstSectionHeading(body)
  const next = appendTask(body, line, target)
  const backup = writeVaultFile(vault, abs, next)
  const added = parseTasks(next).find((t) => t.text === text.trim())
  return { file: relPath(vault, abs), line: added?.line ?? 0, created: !existing, ...(backup ? { backup } : {}) }
}

/**
 * Check or uncheck one task line touching nothing else.
 * @param vault - vault holding the note.
 * @param file - vault-relative path.
 * @param line - 1-based line number.
 * @param done - desired state.
 * @returns the file, line, and state written, plus any backup path.
 */
export function toggleTask(vault: VaultConfig, file: string, line: number, done: boolean, expectedVersion?: string): { file: string; line: number; done: boolean; backup?: string } {
  const abs = vaultPath(vault, file)
  const body = readVaultFile(vault, abs)
  assertNoteVersion(body, expectedVersion)
  const next = setTaskState(body, Math.trunc(line), done)
  const backup = writeVaultFile(vault, abs, next)
  return { file: relPath(vault, abs), line: Math.trunc(line), done, ...(backup ? { backup } : {}) }
}

/**
 * Rewrite the text of one task line, keeping the line's indent, marker and
 * checkbox state and touching nothing else in the note.
 * @param vault - vault holding the note.
 * @param file - vault-relative path.
 * @param line - 1-based line number.
 * @param text - new task text.
 * @returns the file, line, and state of the rewritten task, plus any backup path.
 */
export function editTask(vault: VaultConfig, file: string, line: number, text: string, expectedVersion?: string): { file: string; line: number; done: boolean; backup?: string } {
  const abs = vaultPath(vault, file)
  const body = readVaultFile(vault, abs)
  assertNoteVersion(body, expectedVersion)
  const target = Math.trunc(line)
  const next = setTaskText(body, target, text)
  const backup = writeVaultFile(vault, abs, next)
  const done = parseTasks(next).find((t) => t.line === target)?.done ?? false
  return { file: relPath(vault, abs), line: target, done, ...(backup ? { backup } : {}) }
}

/**
 * Delete one task line from a note, leaving every other line intact.
 * @param vault - vault holding the note.
 * @param file - vault-relative path.
 * @param line - 1-based line number.
 * @returns the file and any backup path.
 */
export function deleteTask(vault: VaultConfig, file: string, line: number, expectedVersion?: string): { file: string; backup?: string } {
  const abs = vaultPath(vault, file)
  const body = readVaultFile(vault, abs)
  assertNoteVersion(body, expectedVersion)
  const next = removeTask(body, Math.trunc(line))
  const backup = writeVaultFile(vault, abs, next)
  return { file: relPath(vault, abs), ...(backup ? { backup } : {}) }
}

/**
 * Carry a task from one note to a later day: remove the source line and append
 * the same text to the target date's note.
 * @param vault - vault holding both notes.
 * @param file - source vault-relative path.
 * @param line - source 1-based line number.
 * @param toDate - target `YYYY-MM-DD`.
 * @returns the source and destination files and the moved text.
 */
export function moveTask(vault: VaultConfig, file: string, line: number, toDate: string, expectedVersion?: string): { from: string; to: string; text: string; backup?: string } {
  const srcAbs = vaultPath(vault, file)
  const srcBody = readVaultFile(vault, srcAbs)
  assertNoteVersion(srcBody, expectedVersion)
  const { body: srcNext, task } = extractTaskLine(srcBody, Math.trunc(line))
  const date = assertDate(toDate)
  const srcDate = /(\d{4}-\d{2}-\d{2})\.md$/.exec(srcAbs)?.[1]
  if (srcDate === date) {
    return { from: relPath(vault, srcAbs), to: relPath(vault, srcAbs), text: task.text }
  }
  const existing = noteForDate(vault, date)
  const dstAbs = existing ?? defaultNoteForDate(vault, date)
  const dstBody = existing ? readVaultFile(vault, dstAbs) : newDailyNote(date)
  const dstNext = appendTask(dstBody, renderTask(task.text, ''))
  const backup = writeVaultFile(vault, srcAbs, srcNext)
  writeVaultFile(vault, dstAbs, dstNext)
  return { from: relPath(vault, srcAbs), to: relPath(vault, dstAbs), text: task.text, ...(backup ? { backup } : {}) }
}

/**
 * Append Markdown to the end of a note (creating it from the template when the
 * date note does not exist yet, so 复盘 on a fresh day still lands).
 * @param vault - vault to write.
 * @param file - vault-relative path of the note.
 * @param content - Markdown to append.
 * @returns the file and any backup path.
 */
export function appendNote(vault: VaultConfig, file: string, content: string): { file: string; backup?: string } {
  const abs = vaultPath(vault, file)
  const body = readVaultFile(vault, abs)
  const next = body.replace(/\s*$/, '') + '\n' + content.replace(/\s*$/, '') + '\n'
  const backup = writeVaultFile(vault, abs, next)
  return { file: relPath(vault, abs), ...(backup ? { backup } : {}) }
}

/**
 * Append Markdown to the day note of a date, creating the note from the
 * daily template when it does not exist yet.
 * @param vault - vault to write into.
 * @param date - `YYYY-MM-DD` of the day note.
 * @param content - Markdown to append.
 * @returns the vault-relative file, whether the note was created, and any backup path.
 */
export function appendNoteToDate(vault: VaultConfig, date: string, content: string): { file: string; created: boolean; backup?: string } {
  const stamped = assertDate(date)
  const existing = noteForDate(vault, stamped)
  const abs = existing ?? defaultNoteForDate(vault, stamped)
  const body = existing ? readVaultFile(vault, abs) : newDailyNote(stamped)
  const next = body.replace(/\s*$/, '') + '\n' + content.replace(/\s*$/, '') + '\n'
  const backup = writeVaultFile(vault, abs, next)
  return { file: relPath(vault, abs), created: !existing, ...(backup ? { backup } : {}) }
}

/** The persisted configuration as the board's selector needs it. */
export function readConfig(): { defaultVault: string; vaults: VaultOption[] } {
  const config = loadConfig()
  return {
    defaultVault: config.defaultVault,
    vaults: config.vaults.map((v) => ({
      name: v.name,
      ...(v.dailyDir ? { dailyDir: v.dailyDir } : {}),
      ...(v.tdlsDir ? { tdlsDir: v.tdlsDir } : {}),
      ...(v.inboxFile ? { inboxFile: v.inboxFile } : {}),
    })),
  }
}

/**
 * Switch the default vault, persisting the choice.
 * @param name - vault name; throws when unknown.
 * @returns the updated selector configuration.
 */
export function setDefaultVault(name: string): { defaultVault: string; vaults: VaultOption[] } {
  const config = loadConfig()
  resolveVault(config, name) // throws if unknown
  config.defaultVault = name
  persistConfig(config)
  return readConfig()
}
