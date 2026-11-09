/**
 * End-to-end sandbox for the board Host routes.
 *
 * Mounts the built plugin on a fake Cordis context with a scripted `webServer`
 * and `connection`, points the config at a throwaway vault under ~/tmp/obboard,
 * then drives real HTTP-shaped requests through the registered route handler:
 * GET /board, GET /timeline, GET /range, POST /add, /toggle, /move, /edit,
 * /delete, /append, /config — asserting the vault
 * on disk changes exactly as the board expects.
 *
 * Run: node script/e2e-board.mjs   (after `pnpm build`)
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Isolate config under a temp DSH home so the real config is untouched.
const home = mkdtempSync(join(tmpdir(), 'obbhome-'))
const cfgDir = join(home, '.dsh', 'obsidian-tasks')
mkdirSync(cfgDir, { recursive: true })

const vaultRoot = mkdtempSync(join(tmpdir(), 'obboard-'))
mkdirSync(join(vaultRoot, '20 Daily'), { recursive: true })
const DATE = '2026-02-10'
writeFileSync(
  join(vaultRoot, '20 Daily', `${DATE}.md`),
  ['---', 'tags: [daily]', '---', '', `# ${DATE}`, '', '## Today', '', '- [ ] first thing', '- [x] done thing', ''].join('\n'),
)
writeFileSync(join(cfgDir, 'config.json'), JSON.stringify({
  defaultVault: 'Sandbox',
  vaults: [{ name: 'Sandbox', path: vaultRoot, dailyDir: '20 Daily', tdlsDir: '00 TDLs', exclude: ['.obsidian'] }],
}, null, 2))

// Force HOME so config.ts reads our temp config.
process.env.HOME = home

const mod = await import('../lib/index.js')

// Fake host: a webServer that records the route, a connection that accepts.
let routes = []
const registered = []
const ctx = {
  tools: { register: (t) => { registered.push(t.name); return () => {} } },
  inject: (deps, cb) => { cb(ctx) },
  effect: (fn) => { fn(); return () => {} },
  webServer: { register: (route) => { routes.push(route); return () => {} } },
  connection: { requestRejection: () => undefined },
}
mod.apply(ctx)

console.log('TOOLS:', registered.join(', '))
console.log('ROUTES:', routes.map((r) => `${r.kind} ${r.path}`).join(', '))

const route = routes[0]

/** Make a request through the route and parse the JSON reply. */
async function call(method, pathAndQuery, body) {
  const req = {
    method,
    url: pathAndQuery,
    headers: { 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body))
    },
  }
  let status = 0
  let text = ''
  const res = {
    statusCode: 0,
    writeHead(s) { status = s },
    end(b) { text = b ?? '' },
  }
  await route.handler(req, res)
  let json
  try { json = text ? JSON.parse(text) : undefined } catch { json = undefined }
  return { status, json }
}

let failures = 0
function check(label, cond, extra) {
  if (cond) console.log(`  ok  ${label}`)
  else { failures++; console.log(`  FAIL ${label}`, extra ?? '') }
}

// 1. Read the board.
let r = await call('GET', `/dsh-obsidian-tasks/board?date=${DATE}`)
check('GET /board 200', r.status === 200 && r.json?.ok === true, r)
check('board has 2 tasks', r.json.groups[0]?.tasks.length === 2, r.json.groups[0])
check('vault selector present', r.json.vaults[0]?.name === 'Sandbox')
check('board task carries a note version', typeof r.json.groups[0]?.tasks?.[0]?.version === 'string' && r.json.groups[0].tasks[0].version.length === 64, r.json.groups[0]?.tasks?.[0])

// 1b. Read the timeline: the sandbox holds one day note with one open and one
// done task, so the day, month and year counts are all 1.
r = await call('GET', `/dsh-obsidian-tasks/timeline?vault=Sandbox&since=2026-01-01`)
check('GET /timeline 200', r.status === 200 && r.json?.ok === true, r)
check('timeline day count is the open tasks', r.json?.days?.length === 1 && r.json.days[0]?.count === 1, r.json?.days)
check('timeline day reports the total too', r.json?.days?.[0]?.total === 2, r.json?.days)
check('timeline day names the date', r.json?.days?.[0]?.date === DATE, r.json?.days)
check('timeline month count', r.json?.months?.length === 1 && r.json.months[0]?.month === '2026-02' && r.json.months[0]?.count === 1, r.json?.months)
check('timeline year count', r.json?.years?.length === 1 && r.json.years[0]?.year === '2026' && r.json.years[0]?.count === 1, r.json?.years)
check('timeline returns a tags array', Array.isArray(r.json?.tags), r.json?.tags)

// 1c. Read a date range: the same day note, with its tasks.
r = await call('GET', `/dsh-obsidian-tasks/range?vault=Sandbox&from=${DATE}&to=${DATE}`)
check('GET /range 200', r.status === 200 && r.json?.ok === true, r)
check('range has one group', r.json?.groups?.length === 1, r.json?.groups)
check('range group names the date and file', r.json?.groups?.[0]?.date === DATE && r.json.groups[0]?.file === `20 Daily/${DATE}.md`, r.json?.groups?.[0])
check('range group holds both tasks', r.json?.groups?.[0]?.tasks?.length === 2, r.json?.groups?.[0]?.tasks)
check('range task carries file, line, done and text', (() => {
  const t = r.json?.groups?.[0]?.tasks?.[0]
  return t?.file === `20 Daily/${DATE}.md` && Number.isInteger(t.line) && t.done === false && t.text === 'first thing'
})(), r.json?.groups?.[0]?.tasks?.[0])
check('range task keeps its group heading', r.json?.groups?.[0]?.tasks?.[0]?.group === 'Today', r.json?.groups?.[0]?.tasks?.[0])
check('range task reports the done one', r.json?.groups?.[0]?.tasks?.[1]?.done === true, r.json?.groups?.[0]?.tasks?.[1])

// 1d. A range without any note is empty, and a backwards range is rejected.
r = await call('GET', '/dsh-obsidian-tasks/range?vault=Sandbox&from=2026-03-01&to=2026-03-31')
check('range without notes -> 200 with no groups', r.status === 200 && r.json?.ok === true && (r.json?.groups ?? []).length === 0, r)
r = await call('GET', '/dsh-obsidian-tasks/range?vault=Sandbox&from=2026-03-01&to=2026-01-01')
check('backwards range -> 400 {ok:false}', r.status === 400 && r.json?.ok === false, r)
check('backwards range explains itself', /is after/.test(r.json?.error ?? ''), r.json?.error)
r = await call('GET', '/dsh-obsidian-tasks/range?vault=Sandbox&from=2026-03-01')
check('range without a "to" -> 400 {ok:false}', r.status === 400 && r.json?.ok === false, r)
r = await call('GET', '/dsh-obsidian-tasks/timeline?vault=Sandbox&since=not-a-date')
check('timeline with a bad since -> 400 {ok:false}', r.status === 400 && r.json?.ok === false, r)

// 2. Add a task.
r = await call('POST', '/dsh-obsidian-tasks/add', { date: DATE, text: 'new task from board', heading: 'Today' })
check('POST /add 200', r.status === 200 && r.json?.ok === true, r)
check('added.file is the vault-relative note path', r.json?.added?.file === `20 Daily/${DATE}.md`, r.json?.added)
check('added.created is false for an existing note', r.json?.added?.created === false, r.json?.added)
check('added.line is a positive integer', Number.isInteger(r.json?.added?.line) && r.json.added.line > 0, r.json?.added)
let body = readFileSync(join(vaultRoot, '20 Daily', `${DATE}.md`), 'utf8')
check('file has the new task', body.includes('- [ ] new task from board'))
check('new task filed under Today', body.indexOf('new task from board') > body.indexOf('## Today'))

// 3. Toggle the first task.
const firstLine = r.json.groups[0].tasks.find((t) => t.text === 'first thing').line
r = await call('POST', '/dsh-obsidian-tasks/toggle', { file: `20 Daily/${DATE}.md`, line: firstLine, done: true, date: DATE })
check('POST /toggle 200', r.status === 200 && r.json?.ok === true, r)
body = readFileSync(join(vaultRoot, '20 Daily', `${DATE}.md`), 'utf8')
check('first thing now checked', /- \[x\] first thing/.test(body))

// 3b. A stale note version must be rejected without touching the file.
const beforeConflict = readFileSync(join(vaultRoot, '20 Daily', `${DATE}.md`), 'utf8')
const conflict = await call('POST', '/dsh-obsidian-tasks/toggle', { file: `20 Daily/${DATE}.md`, line: firstLine, done: false, date: DATE, expectedVersion: 'deadbeef' })
check('stale version -> 400 {ok:false}', conflict.status === 400 && conflict.json?.ok === false, conflict)
check('stale version explains the conflict', /TASK_CONFLICT/.test(conflict.json?.error ?? ''), conflict.json?.error)
check('stale version leaves the note untouched', readFileSync(join(vaultRoot, '20 Daily', `${DATE}.md`), 'utf8') === beforeConflict)

// 4. Move a task to another day.
const moveLine = r.json.groups[0].tasks.find((t) => t.text === 'new task from board').line
r = await call('POST', '/dsh-obsidian-tasks/move', { file: `20 Daily/${DATE}.md`, line: moveLine, toDate: '2026-02-11', date: DATE })
check('POST /move 200', r.status === 200 && r.json?.ok === true, r)
body = readFileSync(join(vaultRoot, '20 Daily', `${DATE}.md`), 'utf8')
check('source no longer has moved task', !body.includes('new task from board'))
check('target note has moved task', readFileSync(join(vaultRoot, '20 Daily', '2026-02-11.md'), 'utf8').includes('- [ ] new task from board'))

// 5. Append a review.
r = await call('POST', '/dsh-obsidian-tasks/append', { file: `20 Daily/${DATE}.md`, content: '## Review\n\nShipped the board.', date: DATE })
check('POST /append 200', r.status === 200 && r.json?.ok === true, r)
body = readFileSync(join(vaultRoot, '20 Daily', `${DATE}.md`), 'utf8')
check('note has appended review', body.includes('Shipped the board.'))

// 6. Add a task on another day: the board must stay anchored where it was.
const ADDED_DATE = '2026-02-12'
r = await call('POST', '/dsh-obsidian-tasks/add', { date: ADDED_DATE, text: 'task on another day', anchor: DATE })
check('POST /add 200', r.status === 200 && r.json?.ok === true, r)
check('added.file names the new day note', r.json?.added?.file === `20 Daily/${ADDED_DATE}.md`, r.json?.added)
check('added.created is true for a new day note', r.json?.added?.created === true, r.json?.added)
check('added.line is a positive integer', Number.isInteger(r.json?.added?.line) && r.json.added.line > 0, r.json?.added)
check('snapshot stays anchored at the board day', r.json?.date === DATE, r.json?.date)
check('added day is not in the anchored snapshot', !(r.json?.groups ?? []).some((g) => g.date === ADDED_DATE), r.json?.groups?.map((g) => g.date))
const addedBody = readFileSync(join(vaultRoot, '20 Daily', `${ADDED_DATE}.md`), 'utf8')
check('new day note holds the task', addedBody.includes('- [ ] task on another day'))
check('new day note files the task under ## Today', addedBody.indexOf('task on another day') > addedBody.indexOf('## Today'))

// 7. Append to a day whose note does not exist yet: the server resolves it.
const APPEND_DATE = '2026-02-13'
r = await call('POST', '/dsh-obsidian-tasks/append', { date: APPEND_DATE, content: '## Review\n\nFresh day review.', anchor: DATE })
check('POST /append 200', r.status === 200 && r.json?.ok === true, r)
const createdNote = join(vaultRoot, '20 Daily', `${APPEND_DATE}.md`)
check('missing day note was created', existsSync(createdNote))
const createdBody = readFileSync(createdNote, 'utf8')
check('created note is a daily note', createdBody.includes(`# ${APPEND_DATE}`) && createdBody.includes('## Today'))
check('created note has the appended content', createdBody.includes('## Review') && createdBody.includes('Fresh day review.'))
check('append snapshot stays anchored at the board day', r.json?.date === DATE, r.json?.date)
check('no stray root-level note was created', !existsSync(join(vaultRoot, `${APPEND_DATE}.md`)))

// 8. Append to a day whose note already exists.
r = await call('POST', '/dsh-obsidian-tasks/append', { date: DATE, content: '## Notes\n\nExisting day append.', anchor: DATE })
check('POST /append 200', r.status === 200 && r.json?.ok === true, r)
body = readFileSync(join(vaultRoot, '20 Daily', `${DATE}.md`), 'utf8')
check('existing note got the appended content', body.includes('Existing day append.'))
check('existing note kept its earlier content', body.includes('Shipped the board.'))
check('append snapshot stays anchored at the board day', r.json?.date === DATE, r.json?.date)
check('no stray root-level note was created', !existsSync(join(vaultRoot, `${DATE}.md`)))

// 8b. Both `date` and `file`: the browser sends both so the board works
// against the 0.5 routes and the pre-0.5 ones; the date must win.
const COMPAT_DATE = '2026-02-14'
const strayFile = join(vaultRoot, 'stray-note.md')
writeFileSync(strayFile, '# stray\n', 'utf8')
r = await call('POST', '/dsh-obsidian-tasks/append', { date: COMPAT_DATE, file: 'stray-note.md', content: '## Review\n\nCompat append.', anchor: DATE })
check('POST /append 200 with both date and file', r.status === 200 && r.json?.ok === true, r)
const compatNote = join(vaultRoot, '20 Daily', `${COMPAT_DATE}.md`)
check('the day note received the content', existsSync(compatNote) && readFileSync(compatNote, 'utf8').includes('Compat append.'))
check('the file note was left alone', readFileSync(strayFile, 'utf8') === '# stray\n')

// 9. Edit one task's text in place: only that line changes.
const editLine = r.json.groups[0].tasks.find((t) => t.text === 'done thing').line
const beforeEdit = readFileSync(join(vaultRoot, '20 Daily', `${DATE}.md`), 'utf8')
r = await call('POST', '/dsh-obsidian-tasks/edit', { file: `20 Daily/${DATE}.md`, line: editLine, text: 'done thing edited', anchor: DATE })
check('POST /edit 200', r.status === 200 && r.json?.ok === true, r)
body = readFileSync(join(vaultRoot, '20 Daily', `${DATE}.md`), 'utf8')
const editedLines = body.split('\n')
check('the edited line holds the new text', editedLines[editLine - 1] === '- [x] done thing edited', editedLines[editLine - 1])
check('the edited line kept its checked state', editedLines[editLine - 1].includes('[x]'), editedLines[editLine - 1])
check('the frontmatter is unchanged', body.split('---')[1] === beforeEdit.split('---')[1])
check('every other line is unchanged', body === beforeEdit.replace('- [x] done thing\n', '- [x] done thing edited\n'))
check('the snapshot shows the new text', (r.json?.groups ?? []).some((g) => g.tasks.some((t) => t.text === 'done thing edited')), r.json?.groups)
check('the edit snapshot stays anchored at the board day', r.json?.date === DATE, r.json?.date)

// 9b. An empty text is rejected before the note is touched.
r = await call('POST', '/dsh-obsidian-tasks/edit', { file: `20 Daily/${DATE}.md`, line: editLine, text: '   ', anchor: DATE })
check('blank text -> 400 {ok:false}', r.status === 400 && r.json?.ok === false, r)
check('the note is untouched after the rejected edit', readFileSync(join(vaultRoot, '20 Daily', `${DATE}.md`), 'utf8') === body)

// 10. Delete one task: only that line disappears.
const beforeDelete = readFileSync(join(vaultRoot, '20 Daily', `${DATE}.md`), 'utf8')
const deleteLine = beforeDelete.split('\n').findIndex((l) => l.includes('first thing')) + 1
r = await call('POST', '/dsh-obsidian-tasks/delete', { file: `20 Daily/${DATE}.md`, line: deleteLine, anchor: DATE })
check('POST /delete 200', r.status === 200 && r.json?.ok === true, r)
body = readFileSync(join(vaultRoot, '20 Daily', `${DATE}.md`), 'utf8')
check('the deleted task is gone', !body.includes('first thing'), body)
check('the rest of the note is intact', body === beforeDelete.split('\n').filter((l, i) => i !== deleteLine - 1).join('\n'), body)
check('the frontmatter survived the delete', body.startsWith('---\ntags: [daily]\n---'))
check('the snapshot no longer lists the deleted task', !(r.json?.groups ?? []).some((g) => g.tasks.some((t) => t.text === 'first thing')), r.json?.groups)
check('the delete snapshot stays anchored at the board day', r.json?.date === DATE, r.json?.date)

// 11. Rejection path: a rejecting connection stops the request.
ctx.connection.requestRejection = () => 401
r = await call('GET', `/dsh-obsidian-tasks/board?date=${DATE}`)
check('rejected request ends 401 with no body', r.status === 401 && (r.json === undefined || r.json === ''), r)
ctx.connection.requestRejection = () => undefined

// 12. Invalid body is a clean 400, not a crash.
r = await call('POST', '/dsh-obsidian-tasks/add', { date: DATE })
check('missing text -> 400 {ok:false}', r.status === 400 && r.json?.ok === false, r)

// 13. Inbox: the snapshot carries it, and both directions of the move work.
r = await call('GET', `/dsh-obsidian-tasks/board?date=${DATE}`)
check('board snapshot carries the inbox', r.json?.inbox?.file === '20 Daily/Inbox.md' && Array.isArray(r.json?.inbox?.tasks), r.json?.inbox)
check('missing inbox note is reported as absent', r.json?.inbox?.exists === false, r.json?.inbox)

r = await call('POST', '/dsh-obsidian-tasks/add', { text: 'someday thing', inbox: true, anchor: DATE })
check('POST /add inbox:true 200', r.status === 200 && r.json?.ok === true, r)
check('added.file is the inbox note', r.json?.added?.file === '20 Daily/Inbox.md', r.json?.added)
check('inbox note was created', r.json?.added?.created === true && r.json?.inbox?.exists === true, r.json?.inbox)
check('inbox snapshot lists the new task', (r.json?.inbox?.tasks ?? []).some((t) => t.text === 'someday thing'), r.json?.inbox?.tasks)
check('inbox task carries a note version', typeof r.json?.inbox?.tasks?.[0]?.version === 'string', r.json?.inbox?.tasks?.[0])
check('the inbox add left the anchored day untouched', r.json?.date === DATE, r.json?.date)
const inboxFile = readFileSync(join(vaultRoot, '20 Daily', 'Inbox.md'), 'utf8')
check('inbox file holds the task', inboxFile.includes('- [ ] someday thing'), inboxFile)
check('inbox file keeps its Tasks heading', inboxFile.includes('## Tasks'), inboxFile)

const inboxLine = r.json.inbox.tasks.find((t) => t.text === 'someday thing').line
r = await call('POST', '/dsh-obsidian-tasks/move', { file: '20 Daily/Inbox.md', line: inboxLine, toDate: '2026-02-13', anchor: DATE })
check('POST /move inbox -> day 200', r.status === 200 && r.json?.ok === true, r)
check('scheduled task left the inbox', !(r.json?.inbox?.tasks ?? []).some((t) => t.text === 'someday thing'), r.json?.inbox?.tasks)
check('scheduled task reached the day note', readFileSync(join(vaultRoot, '20 Daily', '2026-02-13.md'), 'utf8').includes('- [ ] someday thing'))

r = await call('POST', '/dsh-obsidian-tasks/add', { text: 'unschedule me', date: '2026-02-13', anchor: DATE })
check('POST /add on another day 200', r.status === 200 && r.json?.ok === true, r)
// The anchored window does not include that day, so read the line from the file.
const dayLine = readFileSync(join(vaultRoot, '20 Daily', '2026-02-13.md'), 'utf8').split('\n').findIndex((l) => l.includes('unschedule me')) + 1
r = await call('POST', '/dsh-obsidian-tasks/move', { file: '20 Daily/2026-02-13.md', line: dayLine, toInbox: true, anchor: DATE })
check('POST /move toInbox:true 200', r.status === 200 && r.json?.ok === true, r)
check('task returned to the inbox', (r.json?.inbox?.tasks ?? []).some((t) => t.text === 'unschedule me'), r.json?.inbox?.tasks)
check('task left the day note', !readFileSync(join(vaultRoot, '20 Daily', '2026-02-13.md'), 'utf8').includes('unschedule me'))

r = await call('POST', '/dsh-obsidian-tasks/move', { file: '20 Daily/Inbox.md', line: 1, toInbox: true, anchor: DATE, expectedVersion: 'stale' })
check('stale inbox version is rejected', r.status === 400 && /TASK_CONFLICT/.test(r.json?.error ?? ''), r)

rmSync(home, { recursive: true, force: true })
rmSync(vaultRoot, { recursive: true, force: true })

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
