/**
 * End-to-end sandbox harness: mount the plugin on a fake ctx, drive the real
 * tool definitions against ~/tmp/obtest, and print what the model would see.
 * Run: NODE lib-importing this file after seeding ~/.dsh/obsidian-tasks/config.json
 */
import { cpSync, readFileSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const cfgDir = join(homedir(), '.dsh', 'obsidian-tasks')
mkdirSync(cfgDir, { recursive: true })
cpSync('/tmp/seeded.json', join(cfgDir, 'config.json'))

const mod = await import('../lib/index.js')
const registered = new Map()
const ctx = { tools: { register: (t) => { registered.set(t.name, t); return () => {} } } }
mod.apply(ctx)
console.log('TOOLS:', [...registered.keys()].join(', '))

const call = async (name, args) => {
  const t = registered.get(name)
  const val = await t.execute(args, { signal: new AbortController().signal })
  const rendered = t.output.render(args, val).map((c) => c.text ?? '').join('\n')
  console.log(`\n### ${name}(${JSON.stringify(args)})\n${rendered}`)
  return val
}

const vaultFile = join(homedir(), 'tmp', 'obtest', '20 Daily', '2026-10-12.md')
console.log('\n--- BEFORE (head) ---')
console.log(readFileSync(vaultFile, 'utf8').split('\n').slice(10, 22).join('\n'))

await call('ob_task_list', { date: '2026-10-12' })
await call('ob_task_add', { text: '来自 DSH 的新任务 #demo', date: '2026-10-12', heading: 'Today' })
const list = await call('ob_task_list', { date: '2026-10-12', status: 'open', tag: 'demo' })
const target = list.tasks[0]
await call('ob_task_done', { file: target.file, line: target.line, done: true })
await call('ob_task_move', { file: target.file, line: target.line, toDate: '2026-10-13' })
await call('ob_task_list', { date: '2026-10-13' })
await call('ob_note_append', { file: target.file, content: '\n## DSH 追加\n- 测试追加成功' })
await call('ob_vault_config', {})

console.log('\n--- AFTER 2026-10-12 ---')
console.log(readFileSync(vaultFile, 'utf8').split('\n').slice(10, 24).join('\n'))
const moved = join(homedir(), 'tmp', 'obtest', '20 Daily', '2026-10-13.md')
console.log('\n--- NEW 2026-10-13 ---')
console.log(existsSync(moved) ? readFileSync(moved, 'utf8') : '(missing)')
console.log('\n--- BACKUPS ---')
const { readdirSync } = await import('node:fs')
const bk = join(cfgDir, 'backups')
console.log(existsSync(bk) ? readdirSync(bk).join('\n') : '(none)')
