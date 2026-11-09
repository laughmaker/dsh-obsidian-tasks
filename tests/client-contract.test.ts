/**
 * Offline source-text regression for the 2026-11-06 P0 fixes (contract C2).
 *
 * 只读源码文本、不渲染、不连库：除 C 的标签口径外，把 A（BoardPage.tsx /
 * locales.ts）与 B（Calendar.tsx / styles.ts）最终实现里的 7 个 P0 修复点钉住，
 * 防止后续改动悄悄回退。断言按 task-2 / task-3 定稿后的实际源码文本书写。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Read a source file relative to the repo root. */
const source = (file: string): string => readFileSync(join(process.cwd(), file), 'utf8')

/** Slice one exported function's body out of a source file, for scoped assertions. */
function body(file: string, from: string, to: string): string {
  const text = source(file)
  const start = text.indexOf(from)
  const end = text.indexOf(to, start + 1)
  if (start < 0 || end < 0) throw new Error(`could not locate "${from}" … "${to}" in ${file}`)
  return text.slice(start, end)
}

describe('C1 · 标签口径（本轮已修复，不依赖 A/B）', () => {
  it('timelineFor.tags 只累计未完成任务', () => {
    const timelineFor = body('src/board.ts', 'export function timelineFor', 'export function tasksInRange')
    expect(timelineFor).toMatch(/const open = tasks\.filter\(\(t\) => !t\.done\)/)
    expect(timelineFor).toMatch(/for \(const task of open\)/)
    expect(timelineFor).not.toMatch(/for \(const task of tasks\)/)
  })

  it('api.ts 与 README 同步声明「已完成任务不计入标签」', () => {
    expect(source('src/client/api.ts')).toMatch(/Completed tasks are excluded/)
    expect(source('README.md')).toMatch(/未完成.*标签/)
  })
})

const board = source('src/client/BoardPage.tsx')
const calendar = source('src/client/Calendar.tsx')
const styles = source('src/client/styles.ts')
const locales = source('src/client/locales.ts')

describe('P0-1 · 删除守卫', () => {
  it('onStartEdit 重置 deleteGuard，删除按钮阻止 mousedown 抢焦点，onBlur 跳过同编辑行删除按钮', () => {
    expect(board).toContain('const deleteGuard = useRef<boolean>(false)')
    expect(board).toMatch(/const onStartEdit = useCallback\(\(task: BoardTask\) => \{\s*deleteGuard\.current = false/)
    expect(board).toMatch(/const onDeleteTask = useCallback\([\s\S]*?deleteGuard\.current = true/)
    expect(board).toContain('onMouseDown={(event) => { event.preventDefault() }}')
    expect(board).toContain("next.closest('.ob-rem-editrow')")
  })
})

describe('P0-2 · busy 拆分', () => {
  it('全局 busy 锁移除，adding 只管提交按钮，写操作逐条 pending', () => {
    expect(board).toContain('No global busy lock: each write tracks its own task key in `pending`')
    expect(board).not.toMatch(/trackBusy/)
    expect(board).not.toMatch(/disabled=\{busy\b/)
    expect(board).toContain('const [adding, setAdding] = useState<boolean>(false)')
    expect(board).toContain('const [pending, setPending] = useState<string[]>([])')
    expect(board).toContain('const runPending = useCallback(')
    expect(board).toContain("disabled={adding || composerDisabled || addText.trim() === ''}")
    expect(board).toContain('const isPending = pending.includes(key)')
    expect(board).toContain('disabled={isPending}')
    expect(board).toContain('disabled={composerDisabled}')
  })
})

describe('P0-3 · status 不矛盾', () => {
  it('Today 只渲染一条 statusbar，overdue 时不显示绿色完成卡', () => {
    expect(board).toContain('One status bar replaces the old done banner and overdue card')
    expect(board).toMatch(/visibleOpen === 0 && visibleDone > 0 && overdueCount === 0/)
    expect(board).toMatch(/view\.kind === 'today' && overdueCount > 0 && !countsUnavailable/)
    expect(board).toContain('timelineError === undefined')
    expect(board).toContain('className={`ob-rem-statusbar ob-rem-statusbar-${statusBar.variant}`}')
    expect(board).not.toMatch(/ob-rem-done-banner|ob-rem-overdue/)
    expect(styles).not.toMatch(/ob-rem-done-banner|ob-rem-overdue/)
    expect(styles).toContain('.ob-rem-statusbar {')
    expect(styles).toContain('color-mix(')
  })
})

describe('P0-4 · month addDate', () => {
  it('month / year 的 listDate 指向当月 1 日 / 当年 1 月 1 日，并同步 addDate', () => {
    expect(board).toContain("view.kind === 'month' ? `${view.month}-01`")
    expect(board).toContain("view.kind === 'year' ? `${view.year}-01-01`")
    expect(board).toContain('useEffect(() => { setAddDate(listDate) }, [listDate])')
    expect(board).toContain('fetchBoard(vault, effectiveAddDate, 0, controller.signal)')
  })
})

describe('P0-5 · vault selector', () => {
  it('下拉接入 setDefaultVault，失败回滚并提示，切库重置状态', () => {
    expect(board).toContain("className={'ob-rem-vaultselect'}")
    expect(board).toContain('onChange={(event) => { onVaultChange(event.target.value) }}')
    expect(board).toContain('void setDefaultVault(name)')
    expect(board).toContain('setVault(vault)')
    expect(board).toContain("fill(t('vault.switchFailed'), { message:")
    expect(board).toContain("const previousVaultRef = useRef<string>('')")
    expect(locales).toContain('vault.switchFailed')
    expect(styles).toContain('.ob-rem-vaultselect {')
  })
})

describe('P0-6 · aria-modal', () => {
  it('三处日历 dialog 带 aria-modal，onClose 统一 closeCalendar 并把焦点还给触发按钮', () => {
    expect((board.match(/aria-modal=\{'true'\}/g) ?? []).length).toBe(3)
    expect((board.match(/onClose=\{closeCalendar\}/g) ?? []).length).toBe(3)
    expect(board).toContain("aria-label={t('calendar.jump')}")
    expect(board).toContain("aria-label={t('calendar.add')}")
    expect(board).toContain("aria-label={t('calendar.move')}")
    expect(board).toContain('lastCalTriggerRef.current?.focus()')
    expect(locales).toContain('calendar.jump')
  })
})

describe('P0-9 · 视觉收敛（无多余边框/背景）', () => {
  it('任务行无 hover 填充、编辑行去背景但保留底边、添加卡片与状态条无边框', () => {
    expect(styles).toContain('.ob-rem-trow:hover { background: transparent; }')
    expect(styles).toContain('.ob-rem-trow-editing')
    expect(styles).toMatch(/\.ob-rem-trow-editing[\s\S]*?background: transparent;/)
    expect(styles).not.toMatch(/\.ob-rem-trow-editing[\s\S]{0,120}border-bottom-color: transparent/)
    expect(styles).toMatch(/\.ob-rem-addcard \{[\s\S]*?border: 0;/)
    expect(styles).toMatch(/\.ob-rem-statusbar \{[\s\S]*?border: 0;/)
  })
})

describe('P0-8 · 行号写入版本前置校验', () => {
  it('读回的每个任务带 note 版本，页面写入必须携带 expectedVersion', () => {
    const boardSrc = source('src/board.ts')
    expect(boardSrc).toContain('version: string')
    expect(boardSrc).toContain('createHash("sha256")'.replace(/"/g, "'"))
    expect(boardSrc).toContain("throw new Error('TASK_CONFLICT: note changed since it was loaded')")
    expect(board).toContain('function requireVersion(')
    expect(board).toContain('TASK_VERSION_UNAVAILABLE')
    expect(board).toContain('requireVersion(task)')
    const api = source('src/client/api.ts')
    expect(api).toContain('expectedVersion')
  })
})

describe('P0-7 · role=row/gridcell', () => {
  it('日历 6×7 网格、data-iso、roving tabIndex 与方向键/Home/End/Escape 语义', () => {
    expect(calendar).toContain('const GRID_COLUMNS = 7')
    expect(calendar).toContain('const GRID_ROWS = 6')
    expect(calendar).toContain("role={'grid'}")
    expect(calendar).toContain("className={'ob-rem-cal-row'} role={'row'}")
    expect(calendar).toContain("role={'gridcell'}")
    expect(calendar).toContain('data-iso={cell.iso}')
    expect(calendar).toContain('tabIndex={cell.iso === activeIso ? 0 : -1}')
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
      expect(calendar).toContain(`case '${key}'`)
    }
    expect(calendar).toContain("if (event.key === 'Escape') onClose?.()")
    expect(calendar).toContain('.ob-rem-cal-row {')
    expect(calendar).toContain('.ob-rem-cal-cellwrap {')
  })
})

describe('Inbox · 待安排任务', () => {
  it('配置与选择器暴露 inboxFile，默认落在日记同级目录', () => {
    const config = source('src/config.ts')
    expect(config).toContain('inboxFile?: string')
    expect(config).toContain("inboxFile: '20 Daily/Inbox.md'")
    const boardSrc = source('src/board.ts')
    expect(boardSrc).toContain("return `${vault.dailyDir}/Inbox.md`")
    expect(boardSrc).toContain('export function addInboxTask')
    expect(boardSrc).toContain('export function moveTaskToInbox')
    expect(boardSrc).toContain('export function newInboxNote')
    expect(source('src/client/api.ts')).toContain('inboxFile?: string')
  })

  it('快照始终带 inbox，路由支持 inbox 添加与双向移动', () => {
    const routes = source('src/routes.ts')
    expect(routes).toContain('inbox,')
    expect(routes).toContain('exists: note !== undefined')
    expect(routes).toContain("body.inbox === true || body.target === 'inbox'")
    expect(routes).toContain('addInboxTask(target.vault')
    expect(routes).toContain('body.toInbox === true')
    expect(routes).toContain('moveTaskToInbox(target.vault')
  })

  it('模型工具暴露 inbox / toInbox 参数', () => {
    const tools = source('src/tools.ts')
    expect(tools).toContain("inbox: { type: 'boolean', description: 'Only undated tasks in the vault Inbox file' }")
    expect(tools).toContain("inbox: { type: 'boolean', description: 'Add to the undated Inbox file instead of a dated note' }")
    expect(tools).toContain("toInbox: { type: 'boolean', description: 'Move the task into the undated Inbox file' }")
    expect(tools).toContain('addInboxTask(vault, args.text')
    expect(tools).toContain('moveTaskToInbox(vault, args.file')
  })

  it('页面有「待安排」视图、目标菜单与移回按钮', () => {
    expect(board).toContain("| { kind: 'inbox' }")
    expect(board).toContain("key: 'inbox' as const")
    expect(board).toContain("case 'inbox':")
    expect(board).toContain("const addToInbox = effectiveAddDate === 'inbox'")
    expect(board).toContain("chooseAddTarget(item.value)")
    expect(board).toContain("value: 'inbox', label: t('smart.inbox')")
    expect(board).toContain("role={'menu'}")
    expect(board).toContain('onMoveToInbox(task)')
    expect(board).toContain("task.date !== 'inbox'")
    expect(styles).toContain('.ob-rem-targetmenu {')
    expect(locales).toContain("'smart.inbox'")
    expect(locales).toContain("'task.inboxTitle'")
  })

  it('全部与已完成视图包含 Inbox，Inbox 不进时间线', () => {
    expect(board).toContain('[...inboxGroup((task) => !task.done), ...byDay(listedGroups, (task) => !task.done)')
    expect(board).toContain('...inboxGroup((task) => task.done)]')
    expect(board).toContain('+ inboxOpen')
  })
})

describe('v0.15 · 吸顶留白、可拖侧栏与旧服务端降级', () => {
  it('吸顶添加条留出顶部留白', () => {
    expect(styles).toMatch(/\.ob-rem-addbar \{ position: sticky; top: 0;[^}]*padding: 16px 0 16px/)
  })

  it('侧栏宽度由 CSS 变量驱动并可拖动', () => {
    expect(styles).toContain('--ob-side-w: 248px;')
    expect(styles).toContain('display: grid; grid-template-columns: minmax(0, 1fr) var(--ob-side-w);')
    expect(styles).toContain('.ob-rem-page > .ob-rem-side { grid-column: 2; grid-row: 1; }')
    expect(styles).toContain('.ob-rem-page > .ob-rem-pane { grid-column: 1; grid-row: 1; }')
    expect(styles).toContain('.ob-rem-resizer {')
    expect(board).toContain("const [sideWidth, setSideWidth] = useState<number>(")
    expect(board).toContain("persist('ob.sideWidth', String(appliedSide))")
    expect(board).toContain('onPointerDown={onResizeStart}')
    expect(board).toContain('onPointerMove={onResizeMove}')
    expect(board).toContain('onPointerUp={onResizeEnd}')
    expect(board).toContain("role={'separator'}")
    expect(board).toContain("aria-orientation={'vertical'}")
    expect(board).toContain('onKeyDown={onResizeKey}')
    expect(locales).toContain("'side.resize'")
    expect(locales).toContain("'side.resizeHint'")
  })

  it('时间线显示任务总数，未完成数仍供智能视图使用', () => {
    const server = source('src/board.ts')
    const client = source('src/client/BoardPage.tsx')
    const api = source('src/client/api.ts')
    const locales = source('src/client/locales.ts')
    const readme = source('README.md')
    // Server keeps count=open for the smart views and adds total per period.
    expect(server).toContain('const monthAgg = months.get(month) ?? { open: 0, total: 0 }')
    expect(server).toContain('map(([month, agg]) => ({ month, count: agg.open, total: agg.total }))')
    expect(server).toContain('map(([year, agg]) => ({ year, count: agg.open, total: agg.total }))')
    // API types carry both numbers; old Hosts fall back to count in the tree.
    expect(api).toContain('export interface TimelineMonth')
    expect(api).toContain('total: number')
    expect(client).toContain('total: year.total ?? year.count')
    expect(client).toContain('total: month.total ?? month.count')
    expect(client).toContain('total: day.total ?? day.count')
    // The tree renders totals and hover copy shows both numbers.
    expect(client).toContain('<span className={\'ob-rem-tlcount\'}>{year.total}</span>')
    expect(client).toContain("fill(t('timeline.totalCount'), { n: year.total, m: year.count })")
    expect((locales.match(/'timeline\.totalCount'/g) ?? []).length).toBe(2)
    expect(readme).toContain('任务总数')
  })

  it('蓝色 + 与完成勾选使用与 Today 图标相同的饱和蓝', () => {
    expect(styles).toContain('--ob-today-accent: #0a84ff;')
    expect(styles).toContain('background: var(--ob-today-accent); color: var(--ob-on-accent); cursor: pointer;')
    expect(styles).toContain('.ob-rem-addbtn:hover { background: color-mix(in srgb, var(--ob-today-accent) 86%, #000); }')
    expect(styles).toContain('.ob-rem-check-done { background: var(--ob-today-accent); border-color: var(--ob-today-accent); }')
    expect(styles).toContain('.ob-rem-railbtn-add { background: var(--ob-today-accent);')
    expect(board).toContain("color: '#0a84ff'")
  })

  it('四处分隔线统一使用同一淡色变量', () => {
    expect(styles).toContain('--ob-border: color-mix(in srgb, var(--dsw-alias-border-l2, #e6e6e6) 65%, transparent);')
    expect(styles).toContain('border-left: 1px solid var(--ob-border);')
    expect(styles).toContain('border-bottom: 1px solid var(--ob-border);')
    expect(styles).toContain('border-top: 1px solid var(--ob-border);')
    // Only interactive popovers/chips may still use the raw token.
    expect(styles).not.toContain('border-bottom: 1px solid var(--dsw-alias-border-l2, #eee);')
  })

  it('任务行不画底部分隔线', () => {
    const trow = styles.match(/\.ob-rem-trow \{([\s\S]*?)\}/)?.[1] ?? ''
    expect(trow).toContain('padding: 10px 42px 10px 6px;')
    expect(trow).not.toContain('border-bottom')
    expect(trow).not.toContain('border-radius')
  })

  it('编辑下划线用已完成图标蓝且零布局位移', () => {
    expect(styles).toContain('.ob-rem-edit-input:focus { box-shadow: inset 0 -1px 0 var(--ob-today-accent); }')
    expect(styles).toContain('  padding: 0; border-radius: 0; background: transparent; border: 0;')
    expect(styles).toContain('.ob-rem-editrow { display: flex; align-items: flex-start; gap: 8px; }')
    expect(styles).not.toContain('padding: 1px 2px 3px')
    expect(styles).not.toContain('.ob-rem-edit-input:focus { border-bottom-color:')
  })

  it('侧栏与容器同底色、有左边框、图标统一 15px', () => {
    expect(styles).toContain('background: var(--dsw-alias-bg-base, #fff);')
    expect(styles).toContain('border-left: 1px solid var(--ob-border);')
    expect(styles).toContain('box-sizing: border-box;')
    expect(styles).not.toContain('.ob-rem-side::before')
    expect(styles).not.toContain('.ob-rem-side::after')
    expect(styles).toContain('background: transparent;')
    expect(styles).toContain('width: 15px; height: 15px; max-width: 15px; max-height: 15px;')
    expect(board).toContain('<PanelLeftIcon size={15} />')
  })

  it('旧服务端不支持 Inbox 时不再谎报路径并禁用目标', () => {
    expect(board).toContain('const inboxSupported = snapshot?.inbox !== undefined')
    expect(board).toContain("file: snapshot?.inbox?.file ?? inboxRelPath(vaultOption)")
    expect(board).toContain("(addDate === 'inbox' && !inboxSupported)")
    expect(board).toContain('disabled: !inboxSupported')
    expect(board).not.toContain("?? 'Inbox.md'")
    expect(source('src/client/paths.ts')).toContain('export function inboxRelPath')
    expect(locales).toContain("'add.inboxUnavailable'")
  })
})
