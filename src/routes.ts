/**
 * Host HTTP routes backing the graphical task board.
 *
 * The browser half never touches the filesystem: it `fetch`es these same-origin
 * routes and the Node half drives the vault through `board.ts`, so the board and
 * the model tools share one path guard, one minimal line edit, and one
 * backup-before-write. Every route asks the composition's `connection` service
 * for a rejection first (`requestRejection`), the same Host/Origin fence and
 * cookie authentication the rest of the API uses; nothing is registered before
 * that fence can judge the request. Request bodies are JSON, capped, and every
 * path is a vault *name* plus a vault-relative `file`, re-resolved through
 * `vaultPath` — the wire never carries an absolute path the server trusts.
 * @module dsh-obsidian-tasks/routes
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import {
  addTask,
  addInboxTask,
  appendNote,
  appendNoteToDate,
  assertDate,
  boardContext,
  boardForDate,
  deleteTask,
  editTask,
  inboxNote,
  inboxRelPath,
  isoDate,
  moveTask,
  moveTaskToInbox,
  readConfig,
  setDefaultVault,
  tasksInRange,
  tasksOfNote,
  timelineFor,
  toggleTask,
} from './board.ts'
import { noteForDate, shiftDate } from './board.ts'
import { dayNotes } from './board.ts'

/** Route prefix owned by the board. */
export const BOARD_PREFIX = '/dsh-obsidian-tasks'

/** Largest request body the routes read; the payloads are small JSON objects. */
const MAX_BODY = 256 * 1024

/** Request face the routes read (structural subset of `IncomingMessage`). */
interface BoardRequest {
  url?: string
  method?: string
  headers: Record<string, string | string[] | undefined>
  [Symbol.asyncIterator](): AsyncIterator<string | Uint8Array>
}

/** Response face the routes write (structural subset of `ServerResponse`). */
interface BoardResponse {
  statusCode: number
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

/** The named-route registration the Host's web server exposes. */
interface BoardWebServer {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** Host/Origin and authentication policy, read per request. */
interface BoardConnection {
  requestRejection(request: { headers: Record<string, string | string[] | undefined> }): 401 | 403 | undefined
}

/** Send a JSON body with a status. */
function sendJson(res: BoardResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

/** Read and parse a bounded JSON request body. */
async function readJson(req: BoardRequest): Promise<Record<string, unknown> | undefined> {
  const decoder = new TextDecoder()
  let text = ''
  for await (const chunk of req) {
    text += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
    if (text.length > MAX_BODY) return undefined
  }
  if (text.trim() === '') return {}
  try {
    const parsed = JSON.parse(text) as unknown
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

/** Require a non-empty string field. */
function str(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`"${key}" must be a non-empty string`)
  return value
}

/** Read an optional string field. */
function optStr(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`"${key}" must be a string`)
  return value
}

/** Require a finite integer field. */
function int(body: Record<string, unknown>, key: string): number {
  const value = body[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`"${key}" must be an integer`)
  return value
}

/** Require a boolean field. */
function bool(body: Record<string, unknown>, key: string): boolean {
  const value = body[key]
  if (typeof value !== 'boolean') throw new Error(`"${key}" must be a boolean`)
  return value
}

/**
 * Build the board snapshot the UI redraws from: the selector options plus the
 * tasks of the anchor date and its neighbouring days.
 * @param date - anchor `YYYY-MM-DD`.
 * @param vaultName - optional vault name; defaults to the configured default.
 * @param days - days on each side to include.
 * @returns a JSON-safe board payload.
 */
function snapshot(date: string, vaultName?: string, days = 0): Record<string, unknown> {
  const ctx = boardContext(vaultName)
  const groups = boardForDate(ctx.vault, date, days)
  const note = inboxNote(ctx.vault)
  const inbox = {
    file: inboxRelPath(ctx.vault),
    exists: note !== undefined,
    tasks: note?.tasks ?? [],
  }
  return {
    ok: true,
    vault: ctx.vault.name,
    vaults: ctx.vaults,
    date,
    groups,
    inbox,
  }
}

/**
 * Mount the board routes on the Host's web server.
 * @param ctx - host context carrying `webServer` and `connection`.
 */
export function apply(ctx: Context): void {
  const scope = ctx as unknown as {
    inject?: (deps: string[], callback: (ctx: Context) => void) => void
  }

  const install = (host: Context): void => {
    const webServer = (host as unknown as { webServer?: BoardWebServer }).webServer
    const connection = (host as unknown as { connection?: BoardConnection }).connection
    if (webServer === undefined || connection === undefined) return

    /** Answer one request behind the trust fence; a rejection ends it here. */
    const register = (): (() => void) => webServer.register({
      kind: 'prefix',
      path: BOARD_PREFIX,
      async handler(req, res): Promise<void> {
        const rejection = connection.requestRejection(req)
        if (rejection !== undefined) {
          res.writeHead(rejection)
          res.end()
          return
        }
        const url = new URL(String(req.url), 'http://localhost')
        const route = url.pathname.slice(BOARD_PREFIX.length) || '/'
        try {
          await dispatch(route, req, res, url)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          sendJson(res, 400, { ok: false, error: message })
        }
      },
    })

    const effect = (host as unknown as {
      effect?: (body: () => () => void, label: string) => void
    }).effect
    if (typeof effect === 'function') {
      effect(register, 'obsidian-tasks: board routes')
      return
    }
    register()
  }

  if (typeof scope.inject === 'function') {
    scope.inject(['webServer', 'connection'], install)
    return
  }
  install(ctx)
}

/** Route one method+path to its handler. */
async function dispatch(route: string, req: BoardRequest, res: BoardResponse, url: URL): Promise<void> {
  const method = req.method ?? 'GET'
  const q = url.searchParams

  // GET /board?date=&vault=&days=
  if (route === '/board' && method === 'GET') {
    const date = assertDate(q.get('date') ?? isoDate())
    const vault = q.get('vault') || undefined
    const days = Math.max(0, Math.min(7, Number(q.get('days') ?? '0') || 0))
    sendJson(res, 200, snapshot(date, vault, days))
    return
  }

  // GET /config
  if (route === '/config' && method === 'GET') {
    sendJson(res, 200, { ok: true, ...readConfig() })
    return
  }

  // GET /timeline?vault=&since=
  if (route === '/timeline' && method === 'GET') {
    const target = boardContext(q.get('vault') || undefined)
    const since = q.get('since')
    const timeline = timelineFor(target.vault, since === null ? undefined : assertDate(since))
    sendJson(res, 200, { ok: true, days: timeline.days, months: timeline.months, years: timeline.years, tags: timeline.tags })
    return
  }

  // GET /range?vault=&from=&to=
  if (route === '/range' && method === 'GET') {
    const from = q.get('from')
    const to = q.get('to')
    if (from === null || to === null) throw new Error('"from" and "to" are required')
    const target = boardContext(q.get('vault') || undefined)
    const groups = tasksInRange(target.vault, assertDate(from), assertDate(to))
    sendJson(res, 200, { ok: true, groups })
    return
  }

  if (method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method not allowed' })
    return
  }

  const body = await readJson(req)
  if (body === undefined) {
    sendJson(res, 400, { ok: false, error: 'invalid JSON body' })
    return
  }

  // POST /toggle {vault?, file, line, done, date?, days?}
  if (route === '/toggle') {
    const target = boardContext(optStr(body, 'vault'))
    toggleTask(target.vault, str(body, 'file'), int(body, 'line'), bool(body, 'done'), optStr(body, 'expectedVersion'))
    const anchor = assertDate(optStr(body, 'anchor') ?? optStr(body, 'date') ?? isoDate())
    sendJson(res, 200, snapshot(anchor, target.vault.name, Number(body.days ?? 0)))
    return
  }

  // POST /add {vault?, date (target day), text, heading?, indent?, anchor?, days?}
  if (route === '/add') {
    const target = boardContext(optStr(body, 'vault'))
    const toInbox = body.inbox === true || body.target === 'inbox'
    if (toInbox) {
      const added = addInboxTask(target.vault, str(body, 'text'), optStr(body, 'heading'), optStr(body, 'indent') ?? '')
      const anchor = assertDate(optStr(body, 'anchor') ?? isoDate())
      sendJson(res, 200, { ...snapshot(anchor, target.vault.name, Number(body.days ?? 0)), added })
      return
    }
    const date = assertDate(str(body, 'date'))
    const added = addTask(target.vault, date, str(body, 'text'), optStr(body, 'heading'), optStr(body, 'indent') ?? '')
    // The board keeps showing its own list, so the snapshot is anchored there.
    const anchor = assertDate(optStr(body, 'anchor') ?? date)
    sendJson(res, 200, { ...snapshot(anchor, target.vault.name, Number(body.days ?? 0)), added })
    return
  }

  // POST /move {vault?, file, line, toDate?, toInbox?, date?, days?, expectedVersion?}
  if (route === '/move') {
    const target = boardContext(optStr(body, 'vault'))
    const moved = body.toInbox === true
      ? moveTaskToInbox(target.vault, str(body, 'file'), int(body, 'line'), optStr(body, 'expectedVersion'))
      : moveTask(target.vault, str(body, 'file'), int(body, 'line'), str(body, 'toDate'), optStr(body, 'expectedVersion'))
    const anchor = assertDate(optStr(body, 'anchor') ?? optStr(body, 'date') ?? isoDate())
    sendJson(res, 200, { ...snapshot(anchor, target.vault.name, Number(body.days ?? 0)), moved })
    return
  }

  // POST /edit {vault?, file, line, text, anchor?, days?}
  if (route === '/edit') {
    const target = boardContext(optStr(body, 'vault'))
    const text = str(body, 'text')
    if (text.trim() === '') throw new Error('"text" must be a non-empty string')
    editTask(target.vault, str(body, 'file'), int(body, 'line'), text, optStr(body, 'expectedVersion'))
    const anchor = assertDate(optStr(body, 'anchor') ?? optStr(body, 'date') ?? isoDate())
    sendJson(res, 200, snapshot(anchor, target.vault.name, Number(body.days ?? 0)))
    return
  }

  // POST /delete {vault?, file, line, anchor?, days?}
  if (route === '/delete') {
    const target = boardContext(optStr(body, 'vault'))
    deleteTask(target.vault, str(body, 'file'), int(body, 'line'), optStr(body, 'expectedVersion'))
    const anchor = assertDate(optStr(body, 'anchor') ?? optStr(body, 'date') ?? isoDate())
    sendJson(res, 200, snapshot(anchor, target.vault.name, Number(body.days ?? 0)))
    return
  }

  // POST /append {vault?, date (day note) | file (explicit note), content, anchor?, days?}
  if (route === '/append') {
    const target = boardContext(optStr(body, 'vault'))
    const content = str(body, 'content')
    const date = optStr(body, 'date')
    const file = optStr(body, 'file')
    if (date !== undefined) {
      // Day-note append: the note is resolved (and created when missing) here,
      // so the browser never has to know where the daily file lives.
      appendNoteToDate(target.vault, assertDate(date), content)
    } else if (file !== undefined) {
      appendNote(target.vault, file, content)
    } else {
      throw new Error('"date" or "file" is required')
    }
    const anchor = assertDate(optStr(body, 'anchor') ?? date ?? isoDate())
    sendJson(res, 200, snapshot(anchor, target.vault.name, Number(body.days ?? 0)))
    return
  }

  // POST /config {defaultVault?}
  if (route === '/config') {
    const name = optStr(body, 'defaultVault')
    const next = name === undefined ? readConfig() : setDefaultVault(name)
    sendJson(res, 200, { ok: true, ...next })
    return
  }

  sendJson(res, 404, { ok: false, error: `no route for ${route}` })
}

// Re-export the date helpers so the client-side test harness and the routes
// agree on where a day note lands.
export { noteForDate, shiftDate, tasksOfNote, dayNotes, timelineFor, tasksInRange }
