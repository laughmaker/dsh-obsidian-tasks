/**
 * Typed client for the board's Host routes.
 *
 * Same-origin `fetch` against {@link BOARD_PREFIX}; the Host answers JSON and
 * the cookie the app already holds authenticates the call. A non-2xx or a
 * `{ ok: false }` body becomes a thrown Error so the page's handlers all share
 * one failure path.
 *
 * Mutations always name the day they write to (`date`) separately from the day
 * the board is showing (`anchor`), so a task can be scheduled for another day
 * without the list jumping away from where the user is looking.
 * @module dsh-obsidian-tasks/client/api
 */

/** Route prefix owned by the board (mirrors `routes.ts`). */
export const BOARD_PREFIX = '/dsh-obsidian-tasks'

/** One task as the Host reports it. */
export interface BoardTask {
  file: string
  line: number
  done: boolean
  /** Missing only when the host is too old to protect line-number writes. */
  version?: string
  text: string
  tag?: string
  group?: string
}

/** One note's tasks within the board feed. */
export interface BoardGroup {
  date: string
  file: string
  tasks: BoardTask[]
}

/** One vault selector option, with the layout the board writes through. */
export interface VaultOption {
  name: string
  /** Daily-note directory relative to the vault root. */
  dailyDir?: string
  /** TDLs directory relative to the vault root. */
  tdlsDir?: string
  /** Vault-relative Inbox file for undated tasks. */
  inboxFile?: string
}

/** Where a new task landed. */
export interface AddedTask {
  /** Vault-relative path of the note the task was written to. */
  file: string
  /** 1-based line number of the new task. */
  line: number
  /** Whether the note had to be created for this task. */
  created: boolean
}

/** The snapshot the page redraws from. */
export interface BoardSnapshot {
  ok: true
  vault: string
  vaults: VaultOption[]
  date: string
  groups: BoardGroup[]
  /** Undated tasks kept in the vault Inbox file. */
  inbox?: { file: string; exists: boolean; tasks: BoardTask[] }
  /** Present after an add: where the task landed. */
  added?: AddedTask
}

/** The selector configuration. */
export interface ConfigSnapshot {
  ok: true
  defaultVault: string
  vaults: VaultOption[]
}

/** Build an absolute URL for one board route. */
function url(path: string, query?: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== '') search.set(k, String(v))
  }
  const qs = search.toString()
  return `${BOARD_PREFIX}${path}${qs ? `?${qs}` : ''}`
}

/** Parse a JSON response and surface the Host's `{ ok:false, error }` as a throw. */
async function read<T>(res: Response): Promise<T> {
  const text = await res.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Unexpected response (${res.status})`)
  }
  const body = parsed as { ok?: boolean; error?: string }
  if (!res.ok || body.ok === false) throw new Error(body.error ?? `Request failed (${res.status})`)
  return parsed as T
}

/** One day of the timeline: the open and the total task count. */
export interface TimelineDay {
  date: string
  count: number
  total: number
}

/** One month of the timeline: open and total task counts. */
export interface TimelineMonth {
  month: string
  count: number
  total: number
}

/** One year of the timeline: open and total task counts. */
export interface TimelineYear {
  year: string
  count: number
  total: number
}

/**
 * One tag and how many open tasks in the whole vault carry it.
 *
 * Completed tasks are excluded, so a tag used only by finished tasks never
 * appears here and the totals match the timeline's day/month/year open counts.
 */
export interface TimelineTag {
  tag: string
  count: number
}

/** The task counts of a vault, per day, month and year, plus open-task tag totals. */
export interface TimelineSnapshot {
  ok: true
  days: TimelineDay[]
  months: TimelineMonth[]
  years: TimelineYear[]
  /** Whole-vault open-task totals by tag; absent on pre-0.12 Hosts. */
  tags?: TimelineTag[]
}

/** GET the board snapshot for a date (and optional neighbour window). */
export async function fetchBoard(vault: string | undefined, date: string, days: number, signal?: AbortSignal): Promise<BoardSnapshot> {
  const res = await fetch(url('/board', { vault, date, days }), { credentials: 'same-origin', signal })
  return read<BoardSnapshot>(res)
}

/** POST a JSON body to one route and read its snapshot reply. */
async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url(path), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return read<T>(res)
}

/** GET the persisted selector configuration. */
export async function fetchConfig(): Promise<ConfigSnapshot> {
  const res = await fetch(url('/config'), { credentials: 'same-origin' })
  return read<ConfigSnapshot>(res)
}

/**
 * GET the task counts of a vault, per day, month, year and tag.
 * Tag totals count open tasks only, matching the timeline's other counts.
 * @param vault - vault name.
 * @param since - optional earliest day to include (`YYYY-MM-DD`).
 */
export async function fetchTimeline(vault: string, since?: string): Promise<TimelineSnapshot> {
  const res = await fetch(url('/timeline', { vault, since }), { credentials: 'same-origin' })
  return read<TimelineSnapshot>(res)
}

/**
 * GET the tasks of a date range, grouped by day.
 * @param vault - vault name.
 * @param from - first day of the range (`YYYY-MM-DD`).
 * @param to - last day of the range (`YYYY-MM-DD`).
 */
export async function fetchRange(vault: string, from: string, to: string): Promise<BoardGroup[]> {
  const res = await fetch(url('/range', { vault, from, to }), { credentials: 'same-origin' })
  const body = await read<{ ok: true; groups: BoardGroup[] }>(res)
  return body.groups
}

/** Toggle one task and return the refreshed snapshot. */
export function toggle(vault: string, file: string, line: number, done: boolean, anchor: string, days: number, expectedVersion: string): Promise<BoardSnapshot> {
  return post<BoardSnapshot>('/toggle', { vault, file, line, done, date: anchor, anchor, days, expectedVersion })
}

/**
 * Add a task to a day and return the refreshed snapshot.
 * @param vault - vault name.
 * @param date - the day the task is written to.
 * @param text - task text (no checkbox marker).
 * @param heading - optional `##` heading to file the task under.
 * @param indent - optional leading whitespace for nesting.
 * @param anchor - the day the board is showing, so the list stays put.
 * @param days - neighbour window of the snapshot.
 */
export function addTask(vault: string, date: string, text: string, heading: string, indent: string, anchor: string, days: number): Promise<BoardSnapshot> {
  return post<BoardSnapshot>('/add', { vault, date, text, heading, indent, anchor, days })
}

/** Add an undated task to the vault Inbox file. */
export function addInboxTask(vault: string, text: string, heading: string, indent: string, anchor: string, days: number): Promise<BoardSnapshot> {
  return post<BoardSnapshot>('/add', { vault, text, heading, indent, inbox: true, anchor, days })
}

/** Carry a task to another day and return the refreshed snapshot. */
export function moveTask(vault: string, file: string, line: number, toDate: string, anchor: string, days: number, expectedVersion: string): Promise<BoardSnapshot> {
  return post<BoardSnapshot>('/move', { vault, file, line, toDate, date: anchor, anchor, days, expectedVersion })
}

/** Move a dated task back into the vault Inbox. */
export function moveTaskToInbox(vault: string, file: string, line: number, anchor: string, days: number, expectedVersion: string): Promise<BoardSnapshot> {
  return post<BoardSnapshot>('/move', { vault, file, line, toInbox: true, anchor, days, expectedVersion })
}

/**
 * Rewrite the text of one task line and return the refreshed snapshot.
 * @param vault - vault name.
 * @param file - vault-relative path of the note.
 * @param line - 1-based line number of the task.
 * @param text - the new task text.
 * @param anchor - the day the board is showing.
 * @param days - neighbour window of the snapshot.
 */
export function editTask(vault: string, file: string, line: number, text: string, anchor: string, days: number, expectedVersion: string): Promise<BoardSnapshot> {
  return post<BoardSnapshot>('/edit', { vault, file, line, text, anchor, days, expectedVersion })
}

/**
 * Delete one task line and return the refreshed snapshot.
 * @param vault - vault name.
 * @param file - vault-relative path of the note.
 * @param line - 1-based line number of the task.
 * @param anchor - the day the board is showing.
 * @param days - neighbour window of the snapshot.
 */
export function deleteTask(vault: string, file: string, line: number, anchor: string, days: number, expectedVersion: string): Promise<BoardSnapshot> {
  return post<BoardSnapshot>('/delete', { vault, file, line, anchor, days, expectedVersion })
}

/**
 * Append Markdown to a day's note and return the refreshed snapshot.
 * @param vault - vault name.
 * @param date - the day whose note receives the text.
 * @param content - Markdown to append.
 * @param anchor - the day the board is showing.
 * @param days - neighbour window of the snapshot.
 * @param file - vault-relative path of the day note; the pre-0.5 routes need it,
 *   the 0.5 routes resolve the note from `date` and ignore it.
 */
export function appendNote(vault: string, date: string, content: string, anchor: string, days: number, file: string): Promise<BoardSnapshot> {
  return post<BoardSnapshot>('/append', { vault, date, content, anchor, days, file })
}

/** Switch the default vault. */
export function setDefaultVault(name: string): Promise<ConfigSnapshot> {
  return post<ConfigSnapshot>('/config', { defaultVault: name })
}
