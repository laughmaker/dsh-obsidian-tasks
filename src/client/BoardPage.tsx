/**
 * The task board page: a calm, daily-focus workspace over an Obsidian vault.
 *
 * Right: five smart views (Today / Overdue / Scheduled / All / Completed) and a
 * secondary, collapsible timeline for browsing by year → month → day. Left:
 * one content column with a neutral title, the add-task composer, the task
 * list and a daily-review drawer. The column order is a CSS Grid choice in
 * styles.ts; the component tree stays the same.
 *
 * Every write goes through the Host routes in `api.ts`; the page only shows the
 * snapshot the Host returns, so what is on screen is what is in the vault.
 * @module dsh-obsidian-tasks/client/BoardPage
 */
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  addTask, addInboxTask, deleteTask, editTask, fetchBoard, fetchConfig, fetchRange, fetchTimeline,
  moveTask as moveTaskApi, moveTaskToInbox as moveTaskToInboxApi, setDefaultVault, toggle,
  type BoardGroup, type BoardSnapshot, type BoardTask, type ConfigSnapshot, type TimelineDay, type TimelineSnapshot, type VaultOption,
} from './api.ts'
import { LOCALE_NS } from './locales.ts'
import { parseScheduleToken } from './schedule.ts'
import { inboxRelPath, noteRelPath } from './paths.ts'
import { Calendar } from './Calendar.tsx'

/** The panel id shared by the sidebar entry and this main-slot occupant. */
export const PANEL_ID = 'obsidianTasks' as MainPanelId

/** What the page receives: the main slot runtime share plus its own locale. */
export type BoardPageProps = PropsRuntime<'main'> & PropsLocale<typeof LOCALE_NS>

/** The shape of an icon component from the primitives package. */
type IconComponent = (props: { size?: number; className?: string }) => ReactNode

/**
 * The host's own "panel on the left" glyph — the same icon the DSH sidebar uses
 * for its collapse toggle. The primitives package renames size-suffixed icons
 * between builds, so every plausible export name is tried before giving up.
 */
const iconTable = primitives as unknown as Record<string, IconComponent | undefined>
const PanelLeftIcon: IconComponent =
  iconTable.IconPanelLeftOutlineRegular
  ?? iconTable.IconPanelLeftOutlineMedium
  ?? iconTable.IconPanelLeftOutline16
  ?? (() => null)

/** Fill `{name}` placeholders in one copy string. */
function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`))
}

/** Today in local time as `YYYY-MM-DD`. */
function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Shift a `YYYY-MM-DD` by a signed day count. */
function shift(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A full heading label for the selected day. */
function fullDay(date: string, locale: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale.startsWith('zh') ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', weekday: 'long' })
}

/** A short day label. */
function monthDay(date: string, locale: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale.startsWith('zh') ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })
}

/** A month label such as `November 2026`. */
function monthLabel(month: string, locale: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(locale.startsWith('zh') ? 'zh-CN' : 'en-US', { month: 'long', year: 'numeric' })
}

/** A short month label such as `Nov` or `11月`. */
function monthShort(month: string, locale: string): string {
  if (locale.startsWith('zh')) return `${Number(month.slice(5, 7))}月`
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(locale, { month: 'short' })
}

/** A short weekday label. */
function shortWeekday(date: string, locale: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale.startsWith('zh') ? 'zh-CN' : 'en-US', { weekday: 'short' })
}

/** Group a note's tasks by heading, preserving note order. */
function groupTasks<T extends BoardTask>(tasks: T[], noHeading: string): Array<{ heading: string; tasks: T[] }> {
  const order: string[] = []
  const map = new Map<string, T[]>()
  for (const task of tasks) {
    const key = task.group ?? noHeading
    if (!map.has(key)) {
      map.set(key, [])
      order.push(key)
    }
    map.get(key)!.push(task)
  }
  return order.map((heading) => ({ heading, tasks: map.get(heading)! }))
}

/** The earliest day the timeline covers: the whole vault, not a window. */
const VAULT_START = '1970-01-01'

/** A short, stable notice shown above the list. */
interface Notice {
  kind: 'ok' | 'error'
  text: string
}

/** The active view: a smart filter over the loaded window, or one period. */
type View =
  | { kind: 'today' }
  | { kind: 'overdue' }
  | { kind: 'all' }
  | { kind: 'scheduled' }
  | { kind: 'inbox' }
  | { kind: 'completed' }
  | { kind: 'day'; date: string }
  | { kind: 'month'; month: string }
  | { kind: 'year'; year: string }

/**
 * The date range a wide view covers: the whole vault for "All" and
 * "Completed", the future for "Scheduled", the past for "Overdue".
 * @param view - the active view.
 * @param span - the span of days the vault has tasks in.
 * @param today - today's `YYYY-MM-DD`.
 * @returns the range, or undefined when the view uses the day window.
 */
function vaultRange(
  view: View,
  span: { from: string; to: string } | undefined,
  today: string,
): { from: string; to: string } | undefined {
  if (span === undefined) return undefined
  if (view.kind === 'all' || view.kind === 'completed') return span
  if (view.kind === 'scheduled') {
    const from = shift(today, 1)
    return from <= span.to ? { from, to: span.to } : { from: today, to: today }
  }
  if (view.kind === 'overdue') {
    const to = shift(today, -1)
    return span.from <= to ? { from: span.from, to } : { from: today, to: today }
  }
  return undefined
}

/**
 * The first and last day of the period a view covers.
 * @param view - the active view.
 * @returns the range as `YYYY-MM-DD` strings.
 */
function periodRange(view: View): { from: string; to: string } | undefined {
  if (view.kind === 'month') {
    const [year, month] = view.month.split('-')
    const last = new Date(Number(year), Number(month), 0).getDate()
    return { from: `${view.month}-01`, to: `${view.month}-${String(last).padStart(2, '0')}` }
  }
  if (view.kind === 'year') {
    return { from: `${view.year}-01-01`, to: `${view.year}-12-31` }
  }
  return undefined
}

/** Which calendar or target popover is open. */
type CalTarget = 'header' | 'task' | 'target' | 'move' | undefined

/**
 * Read a value from local storage, tolerating a blocked storage.
 * @param key - storage key.
 * @param fallback - value to use when nothing is stored.
 * @returns the stored value or the fallback.
 */
function stored(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

/**
 * Persist a value in local storage, ignoring a blocked storage.
 * @param key - storage key.
 * @param value - value to store.
 */
function persist(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // storage is unavailable; the choice simply does not survive a reload
  }
}

/** A task paired with the day whose note it came from. */
type DatedTask = BoardTask & { date: string }

/** Old hosts cannot guarantee that an observed line still names the same task. */
function requireVersion(task: { version?: string }): string {
  if (task.version === undefined || task.version === '') throw new Error('TASK_VERSION_UNAVAILABLE')
  return task.version
}

/** A stable key for one task line. */
function taskKey(task: { file: string; line: number }): string {
  return `${task.file}:${task.line}`
}

/** Expose the per-view accent to CSS so active/hover styling stays in one place. */
function navColorStyle(color: string): CSSProperties {
  return { '--ob-nav-color': color } as CSSProperties
}

/** The task text without the tag shown separately as a chip. */
function textWithoutTag(task: BoardTask): string {
  if (task.tag === undefined) return task.text
  return task.text.replace(`#${task.tag}`, '').replace(/\s{2,}/g, ' ').trim()
}

/** Sidebar drag limits: never too narrow to read, never wide enough to kill the pane. */
const SIDE_MIN = 200
const SIDE_MAX = 420
const SIDE_DEFAULT = 248
const SIDE_STEP = 16

/** Clamp a dragged width into the allowed range. */
function clampSide(value: number): number {
  return Number.isFinite(value) ? Math.min(SIDE_MAX, Math.max(SIDE_MIN, Math.round(value))) : SIDE_DEFAULT
}

/**
 * Render the task board.
 * @param props - the main-slot runtime share and locale.
 * @returns the board page.
 */
export function BoardPage(props: BoardPageProps): ReactNode {
  const { t } = props
  // Follow the host document language for date formatting; the calendar widget
  // only knows Chinese and English, so it is handed the closest of the two.
  const locale = typeof document !== 'undefined' && document.documentElement.lang !== ''
    ? document.documentElement.lang
    : typeof navigator === 'undefined' ? 'en-US' : navigator.language
  const calendarLocale = locale.startsWith('zh') ? 'zh' : 'en'

  const [today, setToday] = useState<string>(todayIso)
  const [anchor, setAnchor] = useState<string>(todayIso)
  const [view, setView] = useState<View>({ kind: 'today' })
  const [vault, setVault] = useState<string>('')
  const [config, setConfig] = useState<ConfigSnapshot | undefined>(undefined)
  const [collapsed, setCollapsed] = useState<boolean>(() => stored('ob.collapsed', '0') === '1')
  const [pageWidth, setPageWidth] = useState<number>(0)
  // The browser column is user-draggable; the width survives reloads.
  const [sideWidth, setSideWidth] = useState<number>(() => clampSide(Number(stored('ob.sideWidth', String(SIDE_DEFAULT)))))
  const [resizing, setResizing] = useState<boolean>(false)

  const [snapshot, setSnapshot] = useState<BoardSnapshot | undefined>(undefined)
  const [loading, setLoading] = useState<boolean>(true)
  const [boardLoadFailed, setBoardLoadFailed] = useState<boolean>(false)
  const [rangeLoading, setRangeLoading] = useState<boolean>(false)
  const [rangeLoadFailed, setRangeLoadFailed] = useState<boolean>(false)
  // No global busy lock: each write tracks its own task key in `pending`.
  // `adding` only guards the composer's submit button against a double submit.
  const [adding, setAdding] = useState<boolean>(false)
  const [pending, setPending] = useState<string[]>([])
  const [notice, setNotice] = useState<Notice | undefined>(undefined)
  // Bumped by the retry buttons so config/board/timeline/range all refetch.
  const [refreshSeq, setRefreshSeq] = useState<number>(0)
  // Bumped after a successful write so the active wide view refreshes once.
  const [rangeSeq, setRangeSeq] = useState<number>(0)

  const [addText, setAddText] = useState('')
  const [addDate, setAddDate] = useState<string>(todayIso)
  const [calTarget, setCalTarget] = useState<CalTarget>(undefined)
  const [moveKey, setMoveKey] = useState<string | undefined>(undefined)
  const [showCompleted, setShowCompleted] = useState<boolean>(true)
  const [tagFilter, setTagFilter] = useState<string | undefined>(undefined)
  const [timeline, setTimeline] = useState<TimelineSnapshot | undefined>(undefined)
  const [timelineError, setTimelineError] = useState<string | undefined>(undefined)
  // A failed refresh keeps the previous counts but flags them as possibly stale.
  const [timelineStale, setTimelineStale] = useState<boolean>(false)
  const [statusDismissed, setStatusDismissed] = useState<boolean>(false)
  const [openYears, setOpenYears] = useState<string[]>([])
  const [openMonths, setOpenMonths] = useState<string[]>([])
  const [rangeGroups, setRangeGroups] = useState<BoardGroup[]>([])

  const [editing, setEditing] = useState<{ file: string; line: number; text: string; original: string; version?: string } | undefined>(undefined)

  // Failure states derived once so the composer, nav badges and status bar agree.
  // A timeline failure is not a whole-board failure: the list still renders.
  // An older Host returns no inbox at all; the composer must not promise a write
  // it cannot perform.
  const inboxSupported = snapshot?.inbox !== undefined
  const countsUnavailable = timeline === undefined && timelineError !== undefined
  const dataFailed = boardLoadFailed || rangeLoadFailed
  const composerDisabled = dataFailed || countsUnavailable || (addDate === 'inbox' && !inboxSupported)
  const countLabel = (n: number): string => countsUnavailable ? '—' : String(n)

  // A board left open overnight must not keep writing to yesterday.
  useEffect(() => {
    const refresh = (): void => {
      const next = todayIso()
      if (next === today) return
      setToday(next)
      setAnchor((value) => value === today ? next : value)
      setView((value) => value.kind === 'today' ? { kind: 'today' } : value)
    }
    const timer = setInterval(refresh, 60_000)
    const onVisible = (): void => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [today])

  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; width: number } | undefined>(undefined)
  const addInputRef = useRef<HTMLInputElement>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const headerCalRef = useRef<HTMLDivElement>(null)
  const taskCalRef = useRef<HTMLDivElement>(null)
  const moveCalRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  // Latest anchor/vault, so a late write reply cannot overwrite a newer read.
  const anchorRef = useRef<string>(anchor)
  const vaultRef = useRef<string>(vault)
  anchorRef.current = anchor
  vaultRef.current = vault
  // Holds the timeline we already have, so a failed refresh can mark it stale.
  const timelineDataRef = useRef<TimelineSnapshot | undefined>(undefined)
  timelineDataRef.current = timeline
  // Only a real vault switch (not the initial mount) resets the view state.
  const previousVaultRef = useRef<string>('')
  // The trigger button whose calendar should regain focus on close.
  const lastCalTriggerRef = useRef<HTMLElement | null>(null)
  // Identifies the current range query, so a refresh keeps the old list visible.
  const lastRangeKey = useRef<string | undefined>(undefined)
  // Set while deleting, so the editor's blur does not also write the text.
  const deleteGuard = useRef<boolean>(false)
  // One write at a time: concurrent snapshots would otherwise overwrite each other.
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve())
  // The timeline opens its newest year and month once, then follows the user.
  const timelineInit = useRef<boolean>(false)

  const showNotice = useCallback((kind: Notice['kind'], text: string) => {
    if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current)
    setNotice({ kind, text })
    if (kind === 'ok') {
      noticeTimer.current = setTimeout(() => { setNotice(undefined) }, 3200)
    }
  }, [])

  /** Refetch every read after a retry. */
  const retry = useCallback(() => {
    setStatusDismissed(false)
    setRefreshSeq((value) => value + 1)
  }, [])

  /** Close any calendar and return focus to the button that opened it. */
  const closeCalendar = useCallback(() => {
    setCalTarget(undefined)
    setMoveKey(undefined)
    lastCalTriggerRef.current?.focus()
  }, [])

  // A fresh timeline failure must re-show a previously dismissed status hint.
  useEffect(() => { setStatusDismissed(false) }, [timelineError, refreshSeq])

  // Measure the page itself: the board sits inside a resizable main column, so
  // a viewport media query would guess wrong. Below 900px it folds to the rail.
  useEffect(() => {
    const element = rootRef.current
    if (element === null) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry !== undefined) setPageWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const autoCollapsed = pageWidth > 0 && pageWidth < 900
  const effectiveCollapsed = collapsed || autoCollapsed

  // Keep the pane readable: a very wide sidebar is re-clamped to the panel size.
  const sideMax = pageWidth > 0 ? Math.min(SIDE_MAX, Math.max(SIDE_MIN, pageWidth - 480)) : SIDE_MAX
  const appliedSide = Math.min(Math.max(sideWidth, SIDE_MIN), sideMax)

  const onResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, width: appliedSide }
    setResizing(true)
  }, [appliedSide])

  const onResizeMove = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag === undefined) return
    // The browser column is on the right: dragging the seam left widens it.
    setSideWidth(Math.min(sideMax, clampSide(drag.width - (event.clientX - drag.x))))
  }, [sideMax])

  const onResizeEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragRef.current === undefined) return
    dragRef.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setResizing(false)
    persist('ob.sideWidth', String(appliedSide))
  }, [appliedSide])

  /** Keyboard resizing: arrows nudge, Home resets; the choice is persisted.
   *  With the sidebar on the right, ArrowLeft widens and ArrowRight narrows. */
  const onResizeKey = useCallback((event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? SIDE_STEP * 3 : SIDE_STEP
    const next = event.key === 'ArrowLeft' ? appliedSide + step
      : event.key === 'ArrowRight' ? appliedSide - step
        : event.key === 'Home' ? SIDE_DEFAULT : undefined
    if (next === undefined) return
    event.preventDefault()
    const value = Math.min(sideMax, clampSide(next))
    setSideWidth(value)
    persist('ob.sideWidth', String(value))
  }, [appliedSide, sideMax])

  // Load the selector configuration once.
  useEffect(() => {
    let alive = true
    fetchConfig()
      .then((cfg) => {
        if (!alive) return
        setConfig(cfg)
        setVault((current) => current || cfg.defaultVault)
      })
      .catch((error: unknown) => {
        if (!alive) return
        setLoading(false)
        setBoardLoadFailed(true)
        showNotice('error', fill(t('error.load'), { message: error instanceof Error ? error.message : String(error) }))
      })
    return () => { alive = false }
  }, [refreshSeq, showNotice, t])

  // The board always loads a window around the anchor day, so the smart filters
  // and the day list share one snapshot.
  useEffect(() => {
    if (vault === '') return
    const controller = new AbortController()
    setLoading(true)
    setBoardLoadFailed(false)
    fetchBoard(vault, anchor, 2, controller.signal)
      .then((snap) => { setSnapshot(snap); setLoading(false) })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoading(false)
        setBoardLoadFailed(true)
        showNotice('error', fill(t('error.load'), { message: error instanceof Error ? error.message : String(error) }))
      })
    return () => controller.abort()
  }, [vault, anchor, refreshSeq, showNotice, t])

  // The timeline counts follow the vault and refresh after every write. It is
  // requested without a lower bound, so the card counts cover the whole vault.
  // A failed refresh keeps the previous data instead of blanking the counts.
  useEffect(() => {
    if (vault === '') return
    let alive = true
    fetchTimeline(vault, VAULT_START)
      .then((data) => {
        if (!alive) return
        setTimeline(data)
        setTimelineError(undefined)
        setTimelineStale(false)
      })
      .catch((error: unknown) => {
        if (!alive) return
        setTimelineError(error instanceof Error ? error.message : String(error))
        setTimelineStale(timelineDataRef.current !== undefined)
      })
    return () => { alive = false }
  }, [vault, snapshot, refreshSeq])

  // Open the newest year and month the first time the timeline arrives.
  useEffect(() => {
    if (timeline === undefined || timelineInit.current) return
    timelineInit.current = true
    const year = timeline.years[timeline.years.length - 1]?.year
    const month = timeline.months[timeline.months.length - 1]?.month
    if (year !== undefined) setOpenYears([year])
    if (month !== undefined) setOpenMonths([month])
  }, [timeline])

  // A real vault switch (not the initial mount) resets every scoped view state.
  useEffect(() => {
    const previous = previousVaultRef.current
    if (previous !== '' && previous !== vault) {
      setTagFilter(undefined)
      setView({ kind: 'today' })
      setAnchor(today)
      setAddDate(today)
      setShowCompleted(true)
      setEditing(undefined)
      setCalTarget(undefined)
      setMoveKey(undefined)
      setOpenYears([])
      setOpenMonths([])
      setTimeline(undefined)
      setTimelineError(undefined)
      setTimelineStale(false)
      setRangeGroups([])
      setSnapshot(undefined)
      setStatusDismissed(false)
      timelineInit.current = false
      lastRangeKey.current = undefined
    }
    previousVaultRef.current = vault
  }, [vault, today])

  // Keep the active timeline row visible when the view changes.
  useEffect(() => {
    const active = timelineRef.current?.querySelector('.ob-rem-tlrow-active')
    if (active instanceof HTMLElement) active.scrollIntoView({ block: 'nearest' })
  }, [view, timeline, openMonths, openYears])

  // The span of days the vault has tasks in — the range of the wide views.
  // When the timeline request fails we still bound wide views to a real range,
  // so they never silently fall back to the ±2-day window; the status bar
  // explains the missing counts and offers a retry.
  const vaultSpan = useMemo(() => {
    const days = timeline?.days ?? []
    if (days.length > 0) {
      const last = days[days.length - 1].date
      return { from: days[0].date, to: last > today ? last : today }
    }
    if (timelineError !== undefined) {
      return { from: shift(today, -366 * 5), to: shift(today, 366) }
    }
    return undefined
  }, [timeline, timelineError, today])

  // A month, year or wide smart view lists that whole period instead of the day window.
  const activeRange = periodRange(view) ?? vaultRange(view, vaultSpan, today)
  const rangeFrom = activeRange?.from
  const rangeTo = activeRange?.to

  // Only a change of query (vault / period) clears the list and shows loading.
  // A write or a retry keeps the current list visible and refreshes in place,
  // so the whole board no longer flashes "Loading…" on every single write.
  useEffect(() => {
    if (vault === '' || rangeFrom === undefined || rangeTo === undefined) {
      lastRangeKey.current = undefined
      setRangeGroups([])
      setRangeLoading(false)
      setRangeLoadFailed(false)
      return
    }
    const key = `${vault}:${rangeFrom}:${rangeTo}`
    const switching = lastRangeKey.current !== key
    lastRangeKey.current = key
    if (switching) {
      setRangeGroups([])
      setRangeLoading(true)
    }
    setRangeLoadFailed(false)
    let alive = true
    fetchRange(vault, rangeFrom, rangeTo)
      .then((groups) => { if (alive) { setRangeGroups(groups); setRangeLoading(false) } })
      .catch((error: unknown) => {
        if (!alive) return
        setRangeLoading(false)
        setRangeLoadFailed(true)
        showNotice('error', fill(t('error.load'), { message: error instanceof Error ? error.message : String(error) }))
      })
    return () => { alive = false }
  }, [vault, rangeFrom, rangeTo, rangeSeq, refreshSeq, showNotice, t])

  const groups = useMemo<BoardGroup[]>(() => snapshot?.groups ?? [], [snapshot])
  const inboxTasks = useMemo<BoardTask[]>(() => snapshot?.inbox?.tasks ?? [], [snapshot])

  // The groups the pane lists: the day window, or the whole period on view.
  const listedGroups = useMemo<BoardGroup[]>(
    () => (rangeFrom === undefined || rangeTo === undefined ? groups : rangeGroups),
    [groups, rangeGroups, rangeFrom, rangeTo],
  )

  /** Turn a failure into copy a person can act on. */
  const describeError = useCallback((error: unknown): string => {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('TASK_CONFLICT')) return t('error.taskConflict')
    if (message.includes('TASK_VERSION_UNAVAILABLE') || message.includes('no route for') || message.includes('must be a non-empty string')) return t('error.oldServer')
    if (message.includes('ENOENT')) return fill(t('error.missingFile'), { message })
    return fill(t('error.action'), { message })
  }, [t])

  /** Queue a Host write behind every earlier write, preserving reply order. */
  const serial = useCallback(<T,>(action: () => Promise<T>): Promise<T> => {
    const next = writeQueue.current.then(action, action)
    writeQueue.current = next.then(() => undefined, () => undefined)
    return next
  }, [])

  /**
   * Run one mutating call, refresh the snapshot, and surface failures.
   * @param action - the Host call to make.
   * @param okText - the success copy, or a function of the fresh snapshot.
   * @param options - `quiet` suppresses the success toast.
   * @returns the fresh snapshot, or undefined when the call failed.
   */
  const run = useCallback(async (
    action: () => Promise<BoardSnapshot>,
    okText: string | ((snap: BoardSnapshot) => string),
    options: { quiet?: boolean } = {},
  ): Promise<BoardSnapshot | undefined> => {
    try {
      const snap = await serial(action)
      // A late write reply must not overwrite a newer read for another anchor/vault.
      if (snap.vault === vaultRef.current && snap.date === anchorRef.current) setSnapshot(snap)
      // Wide views read /range, not the day window: refresh them once per write.
      setRangeSeq((value) => value + 1)
      const text = typeof okText === 'function' ? okText(snap) : okText
      if (text !== '' && options.quiet !== true) showNotice('ok', text)
      return snap
    } catch (error) {
      showNotice('error', describeError(error))
      return undefined
    }
  }, [describeError, serial, showNotice])

  /** Run one write while only its own task row shows a pending state. */
  const runPending = useCallback((
    key: string,
    action: () => Promise<BoardSnapshot>,
    okText: string | ((snap: BoardSnapshot) => string),
    options: { quiet?: boolean } = {},
  ): Promise<BoardSnapshot | undefined> => {
    setPending((current) => current.includes(key) ? current : [...current, key])
    return run(action, okText, options).finally(() => {
      setPending((current) => current.filter((item) => item !== key))
    })
  }, [run])

  // The day the composer starts from: the viewed period's first day, or today.
  const listDate = view.kind === 'day' ? view.date
    : view.kind === 'month' ? `${view.month}-01`
      : view.kind === 'year' ? `${view.year}-01-01`
        : view.kind === 'inbox' ? 'inbox'
          : today

  // Following the list: the target day chip always starts from the listed day.
  useEffect(() => { setAddDate(listDate) }, [listDate])

  /** Open the timeline around a day the user jumped to. */
  const revealDate = useCallback((date: string) => {
    const year = date.slice(0, 4)
    const month = date.slice(0, 7)
    setOpenYears((current) => current.includes(year) ? current : [...current, year])
    setOpenMonths((current) => current.includes(month) ? current : [...current, month])
  }, [])

  // Close the calendar on Escape, and on a click outside its trigger.
  useEffect(() => {
    if (calTarget === undefined) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeCalendar()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [calTarget, closeCalendar])

  useDismissOnOutsidePointer(headerCalRef, calTarget === 'header', (open) => {
    if (!open) closeCalendar()
  })
  useDismissOnOutsidePointer(taskCalRef, calTarget === 'task' || calTarget === 'target', (open) => {
    if (!open) closeCalendar()
  })
  useDismissOnOutsidePointer(moveCalRef, calTarget === 'move', (open) => {
    if (!open) closeCalendar()
  })

  /** Toggle one task without blocking the rest of the board. */
  const onToggle = useCallback((task: BoardTask, done: boolean) => {
    void runPending(
      taskKey(task),
      () => toggle(vault, task.file, task.line, done, anchor, 2, requireVersion(task)),
      '',
      { quiet: true },
    )
  }, [anchor, runPending, vault])

  /** Start editing a task's text in place; clear any stale delete guard. */
  const onStartEdit = useCallback((task: BoardTask) => {
    deleteGuard.current = false
    setEditing({ file: task.file, line: task.line, text: task.text, original: task.text, version: task.version })
  }, [])

  /** Save the edited text of one task line. */
  const onSaveEdit = useCallback(() => {
    if (editing === undefined) return
    const text = editing.text.trim()
    const target = editing
    deleteGuard.current = false
    setEditing(undefined)
    if (text === '' || text === target.original) return
    void runPending(
      taskKey(target),
      () => editTask(vault, target.file, target.line, text, anchor, 2, requireVersion(target)),
      t('notice.edited'),
    )
  }, [anchor, editing, runPending, t, vault])

  /** Leave the editor without writing (Escape). */
  const onCancelEdit = useCallback(() => {
    deleteGuard.current = false
    setEditing(undefined)
  }, [])

  /** Delete one task line from its note. */
  const onDeleteTask = useCallback((task: BoardTask) => {
    deleteGuard.current = true
    setEditing(undefined)
    void runPending(
      taskKey(task),
      () => deleteTask(vault, task.file, task.line, anchor, 2, requireVersion(task)),
      t('notice.deleted'),
    )
  }, [anchor, runPending, t, vault])

  /** Carry a task to another day, chosen in the calendar. */
  const onMove = useCallback((task: DatedTask, toDate: string) => {
    closeCalendar()
    if (toDate === task.date) return
    void runPending(
      taskKey(task),
      () => moveTaskApi(vault, task.file, task.line, toDate, anchor, 2, requireVersion(task)),
      fill(t('notice.moved'), { date: toDate }),
    )
  }, [anchor, closeCalendar, runPending, t, vault])

  /** Send a dated task back to the undated Inbox file. */
  const onMoveToInbox = useCallback((task: DatedTask) => {
    closeCalendar()
    void runPending(
      taskKey(task),
      () => moveTaskToInboxApi(vault, task.file, task.line, anchor, 2, requireVersion(task)),
      t('notice.movedToInbox'),
    )
  }, [anchor, closeCalendar, runPending, t, vault])

  /** Focus the add-task input (rail button and the empty-state action). */
  const focusAdd = useCallback(() => {
    addInputRef.current?.focus()
  }, [])

  const toggleCollapse = useCallback(() => {
    if (autoCollapsed) {
      showNotice('error', t('side.autoCollapsedHint'))
      return
    }
    setCollapsed((current) => {
      persist('ob.collapsed', current ? '0' : '1')
      return !current
    })
  }, [autoCollapsed, showNotice, t])

  /** Switch the default vault; the controlled select rolls back on failure. */
  const onVaultChange = useCallback((name: string) => {
    if (name === '' || name === vault) return
    void setDefaultVault(name)
      .then((cfg) => {
        setConfig(cfg)
        setVault(name)
        showNotice('ok', fill(t('notice.config'), { name }))
      })
      .catch((error: unknown) => {
        setVault(vault)
        showNotice('error', fill(t('vault.switchFailed'), { message: error instanceof Error ? error.message : String(error) }))
      })
  }, [showNotice, t, vault])

  /** Fold one year of the timeline open or shut. */
  const toggleYear = useCallback((year: string) => {
    setOpenYears((current) => (current.includes(year) ? current.filter((y) => y !== year) : [...current, year]))
  }, [])

  /** Fold one month of the timeline open or shut. */
  const toggleMonth = useCallback((month: string) => {
    setOpenMonths((current) => (current.includes(month) ? current.filter((m) => m !== month) : [...current, month]))
  }, [])

  const toggleTag = useCallback((tag: string) => {
    setTagFilter((current) => (current === tag ? undefined : tag))
  }, [])

  // ── Derived counts for the smart views and the tag stats ─────────────────
  const timelineDays = useMemo(() => timeline?.days ?? [], [timeline])
  const todayRemaining = useMemo(
    () => timelineDays.find((day) => day.date === today)?.count ?? 0,
    [timelineDays, today],
  )
  const overdueCount = useMemo(
    () => timelineDays.filter((day) => day.date < today).reduce((sum, day) => sum + day.count, 0),
    [timelineDays, today],
  )
  const inboxOpen = useMemo(() => inboxTasks.filter((task) => !task.done).length, [inboxTasks])
  const inboxDone = useMemo(() => inboxTasks.filter((task) => task.done).length, [inboxTasks])
  const allRemaining = useMemo(
    () => timelineDays.reduce((sum, day) => sum + day.count, 0) + inboxOpen,
    [timelineDays, inboxOpen],
  )
  const scheduledDays = useMemo(
    () => timelineDays.filter((day) => day.date > today).reduce((sum, day) => sum + day.count, 0),
    [timelineDays, today],
  )
  const completedCount = useMemo(
    () => timelineDays.reduce((sum, day) => sum + (day.total - day.count), 0) + inboxDone,
    [timelineDays, inboxDone],
  )

  // How many open tasks carry each tag, whole-vault, most used first. The
  // server counts them on the same walk as the timeline; an older Host without
  // the field falls back to the loaded window.
  const tagCounts = useMemo<Array<[string, number]>>(() => {
    if (timeline?.tags !== undefined) return timeline.tags.map(({ tag, count }) => [tag, count])
    const counts = new Map<string, number>()
    const tally = (tasks: BoardTask[]): void => {
      for (const task of tasks) {
        if (task.done || task.tag === undefined) continue
        counts.set(task.tag, (counts.get(task.tag) ?? 0) + 1)
      }
    }
    for (const group of groups) tally(group.tasks)
    tally(inboxTasks)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [timeline, groups, inboxTasks])

  // The tasks the right pane shows for the active view.
  const visible = useMemo<Array<{ date: string; tasks: BoardTask[] }>>(() => {
    const pick = (tasks: BoardTask[]): BoardTask[] => (
      tagFilter === undefined ? tasks : tasks.filter((task) => task.tag === tagFilter)
    )
    const dayHeading = (date: string): string => {
      const base = `${monthDay(date, locale)} ${shortWeekday(date, locale)}`
      if (view.kind === 'all' || view.kind === 'overdue' || view.kind === 'completed') {
        return date.slice(0, 4) === today.slice(0, 4) ? base : `${date.slice(0, 4)} · ${base}`
      }
      return base
    }
    // A wide view lists many days: label the groups by the day they come from.
    const byDay = (
      list: BoardGroup[],
      filter: (task: BoardTask) => boolean = () => true,
    ): Array<{ date: string; tasks: BoardTask[] }> => (
      list
        .map((group) => ({
          date: group.date,
          tasks: pick(group.tasks)
            .filter(filter)
            .map((task) => ({ ...task, group: dayHeading(group.date) })),
        }))
        .filter((group) => group.tasks.length > 0)
    )
    // The Inbox is one synthetic group: its "date" is the word, never a day.
    const inboxGroup = (filter: (task: BoardTask) => boolean): Array<{ date: string; tasks: BoardTask[] }> => {
      const tasks = pick(inboxTasks)
        .filter(filter)
        .map((task) => ({ ...task, group: t('group.inbox') }))
      return tasks.length === 0 ? [] : [{ date: 'inbox', tasks }]
    }
    switch (view.kind) {
      case 'today': {
        const g = listedGroups.find((x) => x.date === today)
        return g ? [{ date: g.date, tasks: pick(g.tasks) }] : [{ date: today, tasks: [] }]
      }
      case 'day': {
        const g = listedGroups.find((x) => x.date === view.date)
        return [{ date: view.date, tasks: g ? pick(g.tasks) : [] }]
      }
      case 'inbox':
        return inboxGroup(() => true)
      case 'overdue':
        return byDay(listedGroups.filter((group) => group.date < today), (task) => !task.done)
          .sort((a, b) => b.date.localeCompare(a.date))
      case 'all': {
        const rank = (date: string): number => date === 'inbox' ? 0 : date === today ? 1 : date < today ? 2 : 3
        return [...inboxGroup((task) => !task.done), ...byDay(listedGroups, (task) => !task.done).sort((a, b) => {
          const order = rank(a.date) - rank(b.date)
          if (order !== 0) return order
          return rank(a.date) === 3 ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
        })]
      }
      case 'scheduled':
        return byDay(listedGroups.filter((group) => group.date > today), (task) => !task.done)
      case 'completed':
        return [...byDay(listedGroups, (task) => task.done)
          .sort((a, b) => b.date.localeCompare(a.date)), ...inboxGroup((task) => task.done)]
      case 'month':
      case 'year':
        return byDay(listedGroups)
    }
  }, [view, listedGroups, locale, today, tagFilter, inboxTasks, t])

  const flatVisible = useMemo(() => visible.flatMap((g) => g.tasks.map((task) => ({ ...task, date: g.date }))), [visible])
  const visibleDone = useMemo(() => flatVisible.filter((task) => task.done).length, [flatVisible])
  const visibleOpen = useMemo(() => flatVisible.filter((task) => !task.done).length, [flatVisible])
  // Completed view always shows what it promises; other views honour the toggle.
  const displayTasks = useMemo(
    () => flatVisible.filter((task) => (view.kind === 'completed' ? task.done : showCompleted || !task.done)),
    [flatVisible, showCompleted, view.kind],
  )
  const displayGroups = useMemo(() => groupTasks(displayTasks, t('group.noHeading')), [displayTasks, t])

  /** The vault option the current selection points at. */
  const vaultOption = useMemo<VaultOption | undefined>(
    () => config?.vaults.find((option) => option.name === vault),
    [config, vault],
  )

  /** Where a task for a day would land, and whether that note exists yet. */
  const notePath = useCallback((date: string): string => {
    const known = groups.find((g) => g.date === date)
    return known !== undefined ? known.file : noteRelPath(date, vaultOption)
  }, [groups, vaultOption])

  // A typed schedule token takes precedence over the date chip at submission.
  // Preview the same effective date, including its note path, as the write uses.
  const tokenDate = useMemo(() => parseScheduleToken(addText, today)?.date, [addText, today])
  const effectiveAddDate = tokenDate ?? addDate
  const addToInbox = effectiveAddDate === 'inbox'

  /** Choose where a new task goes; an explicit pick overrides a typed @date token. */
  const chooseAddTarget = useCallback((date: string): void => {
    if (tokenDate !== undefined) setAddText((text) => text.replace(/@(今天|明天|后天|today|tomorrow)/gi, ' ').replace(/\s{2,}/g, ' ').trim())
    setAddDate(date)
  }, [tokenDate])

  // A timeline contains only notes with tasks and does not include their paths.
  // Ask the existing board route for dates outside the loaded window so the
  // displayed destination also handles empty notes and alternative TDL paths.
  const [targetLookup, setTargetLookup] = useState<{
    vault: string; date: string; file?: string; exists: boolean; failed?: boolean
  } | undefined>(undefined)
  const currentSnapshot = snapshot?.vault === vault && snapshot.date === anchor ? snapshot : undefined
  const targetInWindow = currentSnapshot !== undefined
    && effectiveAddDate >= shift(anchor, -2) && effectiveAddDate <= shift(anchor, 2)
  useEffect(() => {
    if (addToInbox || targetInWindow || vault === '') return
    const controller = new AbortController()
    fetchBoard(vault, effectiveAddDate, 0, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        const note = result.groups.find((group) => group.date === effectiveAddDate)
        setTargetLookup({ vault, date: effectiveAddDate, file: note?.file, exists: note !== undefined })
      })
      .catch(() => {
        if (!controller.signal.aborted) setTargetLookup({ vault, date: effectiveAddDate, exists: false, failed: true })
      })
    return () => controller.abort()
  }, [vault, effectiveAddDate, targetInWindow, snapshot, addToInbox])
  const target = useMemo<{ file?: string; exists: boolean; failed: boolean }>(() => {
    if (addToInbox) {
      return {
        file: snapshot?.inbox?.file ?? inboxRelPath(vaultOption),
        exists: snapshot?.inbox?.exists === true,
        failed: false,
      }
    }
    if (targetInWindow) {
      const note = currentSnapshot?.groups.find((group) => group.date === effectiveAddDate)
      return { file: note?.file ?? noteRelPath(effectiveAddDate, vaultOption), exists: note !== undefined, failed: false }
    }
    if (targetLookup?.vault === vault && targetLookup.date === effectiveAddDate) {
      return { file: targetLookup.failed ? undefined : targetLookup.file ?? noteRelPath(effectiveAddDate, vaultOption), exists: targetLookup.exists, failed: targetLookup.failed === true }
    }
    return { exists: false, failed: false }
  }, [targetInWindow, currentSnapshot, effectiveAddDate, vaultOption, targetLookup, vault, addToInbox, snapshot])

  /** Add a task to the target day or the Inbox, honouring an @date token. */
  const onAdd = useCallback(() => {
    if (adding || composerDisabled) return
    const parsed = parseScheduleToken(addText, today)
    if (parsed === undefined) {
      showNotice('error', t('error.emptyTask'))
      return
    }
    const target = parsed.date ?? addDate
    const toInbox = target === 'inbox'
    setAdding(true)
    const action = toInbox
      ? () => addInboxTask(vault, parsed.text, '', '', anchor, 2)
      : () => addTask(vault, target, parsed.text, '', '', anchor, 2)
    void run(
      action,
      (snap) => fill(t('notice.addedTo'), { file: snap.added?.file ?? (toInbox ? (snap.inbox?.file ?? '') : notePath(target)) }),
    ).then((snap) => {
      if (snap === undefined) return
      setAddText('')
      if (!toInbox) revealDate(target)
      addInputRef.current?.focus()
    }).finally(() => { setAdding(false) })
  }, [addDate, addText, anchor, adding, composerDisabled, notePath, run, showNotice, today, t, vault, revealDate])

  // The timeline as a year → month → day tree, newest first at every level.
  const timelineTree = useMemo(() => {
    if (timeline === undefined) return []
    const daysByMonth = new Map<string, TimelineDay[]>()
    for (const day of timeline.days) {
      const key = day.date.slice(0, 7)
      const list = daysByMonth.get(key)
      if (list === undefined) daysByMonth.set(key, [day])
      else list.push(day)
    }
    // The tree shows total tasks (done included) so a fully completed period
    // still reads as activity; `count` stays available for hover copy. Older
    // Hosts only send `count`, so fall back to it when `total` is missing.
    return [...timeline.years].reverse().map((year) => ({
      year: year.year,
      count: year.count,
      total: year.total ?? year.count,
      months: [...timeline.months].reverse()
        .filter((month) => month.month.startsWith(year.year))
        .map((month) => ({
          month: month.month,
          count: month.count,
          total: month.total ?? month.count,
          days: [...(daysByMonth.get(month.month) ?? [])].reverse().map((day) => ({
            ...day,
            total: day.total ?? day.count,
          })),
        })),
    }))
  }, [timeline])

  // Header title / meta per view.
  const title = view.kind === 'today' ? t('side.today')
    : view.kind === 'overdue' ? t('side.overdue')
    : view.kind === 'scheduled' ? t('smart.scheduled')
    : view.kind === 'inbox' ? t('smart.inbox')
    : view.kind === 'all' ? t('smart.all')
    : view.kind === 'completed' ? t('smart.completed')
    : view.kind === 'month' ? monthLabel(view.month, locale)
    : view.kind === 'year' ? view.year
    : fullDay(view.date, locale)
  const subtitle = view.kind === 'today' ? fullDay(today, locale)
    : view.kind === 'day' ? `${monthLabel(view.date.slice(0, 7), locale)} ${shortWeekday(view.date, locale)}`
      : view.kind === 'inbox' ? t('view.inbox')
        : view.kind === 'month' ? t('view.month')
          : view.kind === 'year' ? t('view.year')
            : view.kind === 'overdue' ? t('view.overdue')
              : view.kind === 'scheduled' ? t('view.scheduled')
                : view.kind === 'all' ? t('view.all')
                  : t('view.completed')
  const headerCount = view.kind === 'completed' ? visibleDone : visibleOpen
  const headerCountLabel = view.kind === 'completed' ? t('pane.done') : t('pane.open')

  const noHeading = t('group.noHeading')

  // The target-day chip label: Inbox first, then relative wording, then date.
  const dueLabel = addToInbox
    ? t('smart.inbox')
    : effectiveAddDate === today
      ? t('add.today')
      : effectiveAddDate === shift(today, 1)
        ? t('add.tomorrow')
        : `${monthDay(effectiveAddDate, locale)} ${shortWeekday(effectiveAddDate, locale)}`
  const addPlaceholder = fill(t('add.placeholder'), { date: dueLabel })

  // The day the header calendar shows and switches to. Wide views point the
  // calendar at their own period (or today), never at an unrelated old anchor.
  const shownDate = view.kind === 'day'
    ? view.date
    : view.kind === 'month'
      ? `${view.month}-01`
      : view.kind === 'year'
        ? `${view.year}-01-01`
        : today
  const datePillLabel = t('toolbar.pickDate')

  const navItems = [
    { key: 'today' as const, label: t('side.today'), count: countLabel(todayRemaining), icon: 'today' as const, color: '#0a84ff', active: view.kind === 'today', onClick: () => { setView({ kind: 'today' }); setAnchor(today); revealDate(today) } },
    { key: 'overdue' as const, label: t('side.overdue'), count: countLabel(overdueCount), icon: 'overdue' as const, color: '#ff3b30', active: view.kind === 'overdue', onClick: () => setView({ kind: 'overdue' }) },
    { key: 'scheduled' as const, label: t('smart.scheduled'), count: countLabel(scheduledDays), icon: 'scheduled' as const, color: '#ff9500', active: view.kind === 'scheduled', onClick: () => setView({ kind: 'scheduled' }) },
    { key: 'inbox' as const, label: t('smart.inbox'), count: snapshot === undefined ? '—' : String(inboxOpen), icon: 'inbox' as const, color: '#8e8e93', active: view.kind === 'inbox', onClick: () => setView({ kind: 'inbox' }) },
    { key: 'all' as const, label: t('smart.all'), count: countLabel(allRemaining), icon: 'all' as const, color: '#5a5a5f', active: view.kind === 'all', onClick: () => setView({ kind: 'all' }) },
    { key: 'completed' as const, label: t('smart.completed'), count: countLabel(completedCount), icon: 'completed' as const, color: '#34c759', active: view.kind === 'completed', onClick: () => setView({ kind: 'completed' }) },
  ]

  const timelineEmpty = timeline === undefined ? t('toolbar.loading') : t('timeline.empty')
  const isDayView = view.kind === 'today' || view.kind === 'day'
  const needsTimeline = view.kind === 'overdue' || view.kind === 'scheduled' || view.kind === 'all' || view.kind === 'completed'
  const showDoneBanner = isDayView && tagFilter === undefined && !loading && !rangeLoading
    && !dataFailed && timelineError === undefined && snapshot?.vault === vault && snapshot.date === anchor && anchor === listDate
    && visibleOpen === 0 && visibleDone > 0 && overdueCount === 0
  // Hidden completed tasks are not an empty day, even in a filtered view.
  const showEmpty = !loading && !rangeLoading && !dataFailed && displayTasks.length === 0 && flatVisible.length === 0
  const showHidden = !loading && !rangeLoading && !dataFailed && displayTasks.length === 0 && flatVisible.length > 0 && !showDoneBanner
  const emptyText = tagFilter !== undefined
    ? fill(t('empty.tagged'), { tag: tagFilter })
    : view.kind === 'inbox' ? t('empty.inbox')
    : view.kind === 'completed' ? t('empty.completed') : t('empty.title')

  // One status bar replaces the old done banner and overdue card, so Today
  // never claims "all done" while earlier unfinished tasks still exist.
  const statusBar: {
    variant: 'alert' | 'ok'
    icon: 'overdue' | 'completed'
    title: string
    hint: string
    actionLabel?: string
    onAction?: () => void
    retry?: boolean
    dismissible?: boolean
  } | undefined = timelineError !== undefined && !statusDismissed
    ? {
      variant: 'alert', icon: 'overdue',
      title: t('timeline.loadFailed'),
      hint: timelineStale ? t('timeline.countsStale') : t('timeline.countsUnavailable'),
      actionLabel: t('timeline.retry'), onAction: retry, retry: true, dismissible: true,
    }
    : view.kind === 'today' && overdueCount > 0 && !countsUnavailable
      ? {
        variant: 'alert', icon: 'overdue',
        title: visibleOpen === 0
          ? fill(t('status.todayWithEarlier'), { n: overdueCount })
          : fill(t('overdue.title'), { n: overdueCount }),
        hint: t('overdue.hint'),
        actionLabel: t('status.reviewEarlier'), onAction: () => { setView({ kind: 'overdue' }) },
      }
      : showDoneBanner
        ? {
          variant: 'ok', icon: 'completed',
          title: t(view.kind === 'today' ? 'status.todayDone' : 'status.dayDone'),
          hint: fill(t('status.completedCount'), { n: visibleDone }),
          actionLabel: showCompleted ? t('pane.hideCompleted') : t('pane.showCompleted'),
          onAction: () => { setShowCompleted((value) => !value) },
        }
        : undefined

  return (
    <div
      ref={rootRef}
      className={`ob-rem-page${effectiveCollapsed ? ' ob-rem-page-collapsed' : ''}`}
      style={{ '--ob-side-w': `${appliedSide}px` } as CSSProperties}
      data-resizing={resizing ? 'true' : undefined}
    >
      {/* ── Right-hand browser (grid column 2) ───────────────────── */}
      <div className={'ob-rem-side'}>
        <div className={'ob-rem-vaultrow'}>
          {effectiveCollapsed ? (
            <button
              type={'button'}
              className={'ob-rem-collapse ob-rem-collapse-flip'}
              title={autoCollapsed ? t('side.autoCollapsed') : t('side.expand')}
              aria-label={autoCollapsed ? t('side.autoCollapsed') : t('side.expand')}
              aria-disabled={autoCollapsed}
              onClick={toggleCollapse}
            >
              <PanelLeftIcon size={15} />
            </button>
          ) : (
            <>
              <select
                className={'ob-rem-vaultselect'}
                value={vault}
                title={t('toolbar.vault')}
                aria-label={t('toolbar.vault')}
                disabled={config === undefined}
                onChange={(event) => { onVaultChange(event.target.value) }}
              >
                {config === undefined
                  ? <option value={vault}>{vault || '…'}</option>
                  : config.vaults.map((option) => (
                    <option key={option.name} value={option.name}>{option.name}</option>
                  ))}
              </select>
              <button
                type={'button'}
                className={'ob-rem-collapse'}
                title={t('side.collapse')}
                aria-label={t('side.collapse')}
                onClick={toggleCollapse}
              >
                <PanelLeftIcon size={15} />
              </button>
            </>
          )}
        </div>

        {effectiveCollapsed ? (
          <div className={'ob-rem-rail'}>
            {autoCollapsed && (
              <div className={'ob-rem-railhint'} title={t('side.autoCollapsedHint')} aria-label={t('side.autoCollapsedHint')}>
                <span aria-hidden={'true'}>↔</span>
              </div>
            )}
            {navItems.map((item) => (
              <button
                key={item.key}
                type={'button'}
                className={`ob-rem-railbtn ${item.active ? 'ob-rem-railbtn-active' : ''}`}
                style={navColorStyle(item.color)}
                title={`${item.label} · ${item.count}`}
                aria-label={`${item.label} · ${item.count}`}
                aria-pressed={item.active}
                onClick={item.onClick}
              >
                <NavGlyph icon={item.icon} />
              </button>
            ))}
            <button
              type={'button'}
              className={'ob-rem-railbtn ob-rem-railbtn-add'}
              title={t('add.newTask')}
              aria-label={t('add.newTask')}
              onClick={focusAdd}
            >
              <svg viewBox={'0 0 16 16'} width={'14'} height={'14'} aria-hidden={'true'}>
                <path d={'M8 3.5v9M3.5 8h9'} fill={'none'} stroke={'#fff'} strokeWidth={'1.8'} strokeLinecap={'round'} />
              </svg>
            </button>
          </div>
        ) : (
          <>
            <div className={'ob-rem-nav'}>
              {navItems.map((item) => (
                <button
                  key={item.key}
                  type={'button'}
                  className={`ob-rem-navrow ${item.active ? 'ob-rem-navrow-active' : ''}`}
                  style={navColorStyle(item.color)}
                  aria-pressed={item.active}
                  onClick={item.onClick}
                >
                  <span className={'ob-rem-navicon'}>
                    <NavGlyph icon={item.icon} />
                  </span>
                  <span className={'ob-rem-navlabel'}>{item.label}</span>
                  <span className={'ob-rem-navcount'}>{item.count}</span>
                </button>
              ))}
            </div>

            <div className={'ob-rem-sidehead'}>
              <span className={'ob-rem-tl-icon'}><TimelineGlyph /></span>
              <span className={'ob-rem-tl-label'}>{t('side.timeline')}</span>
            </div>

            <div className={'ob-rem-tl'} ref={timelineRef}>
              <div className={'ob-rem-tltree'}>
                {timelineError !== undefined
                  ? (
                    <div className={'ob-rem-tlerror'} role={'alert'}>
                      <span>{t('timeline.loadFailed')}</span>
                      <span>{timelineStale ? t('timeline.countsStale') : t('timeline.countsUnavailable')}</span>
                      <button type={'button'} className={'ob-rem-retry'} onClick={retry}>{t('timeline.retry')}</button>
                    </div>
                  )
                  : timelineTree.length === 0
                    ? <div className={'ob-rem-tlempty'}>{timelineEmpty}</div>
                    : timelineTree.map((year) => (
                      <div key={year.year} className={'ob-rem-tlgroup'}>
                        <div className={`ob-rem-tlrow ob-rem-tlrow-year ${view.kind === 'year' && view.year === year.year ? 'ob-rem-tlrow-active' : ''}`}>
                          <button
                            type={'button'}
                            className={'ob-rem-tltoggle'}
                            aria-expanded={openYears.includes(year.year)}
                            aria-label={fill(t(openYears.includes(year.year) ? 'timeline.collapsePeriod' : 'timeline.expandPeriod'), { period: year.year })}
                            title={fill(t(openYears.includes(year.year) ? 'timeline.collapsePeriod' : 'timeline.expandPeriod'), { period: year.year })}
                            onClick={() => { toggleYear(year.year) }}
                          >
                            <span className={'ob-rem-tldot'} aria-hidden={'true'} />
                          </button>
                          <button
                            type={'button'}
                            className={'ob-rem-tlname ob-rem-tlname-year'}
                            title={fill(t('timeline.totalCount'), { n: year.total, m: year.count })}
                            aria-current={view.kind === 'year' && view.year === year.year ? 'true' : undefined}
                            onClick={() => { setAnchor(`${year.year}-01-01`); setView({ kind: 'year', year: year.year }) }}
                          >
                            {year.year}
                          </button>
                          <span className={'ob-rem-tlcount'}>{year.total}</span>
                        </div>
                        {openYears.includes(year.year) && (
                          <div className={'ob-rem-tlchildren'}>
                            {year.months.map((month) => (
                              <div key={month.month} className={'ob-rem-tlgroup'}>
                                <div className={`ob-rem-tlrow ob-rem-tlrow-month ${view.kind === 'month' && view.month === month.month ? 'ob-rem-tlrow-active' : ''}`}>
                                  <button
                                    type={'button'}
                                    className={'ob-rem-tltoggle'}
                                    aria-expanded={openMonths.includes(month.month)}
                                    aria-label={fill(t(openMonths.includes(month.month) ? 'timeline.collapsePeriod' : 'timeline.expandPeriod'), { period: monthLabel(month.month, locale) })}
                                    title={fill(t(openMonths.includes(month.month) ? 'timeline.collapsePeriod' : 'timeline.expandPeriod'), { period: monthLabel(month.month, locale) })}
                                    onClick={() => { toggleMonth(month.month) }}
                                  >
                                    <span className={'ob-rem-tldot'} aria-hidden={'true'} />
                                  </button>
                                  <button
                                    type={'button'}
                                    className={'ob-rem-tlname ob-rem-tlname-month'}
                                    title={fill(t('timeline.totalCount'), { n: month.total, m: month.count })}
                                    aria-current={view.kind === 'month' && view.month === month.month ? 'true' : undefined}
                                    onClick={() => { setAnchor(`${month.month}-01`); setView({ kind: 'month', month: month.month }) }}
                                  >
                                    {monthShort(month.month, locale)}
                                  </button>
                                  <span className={'ob-rem-tlcount'}>{month.total}</span>
                                </div>
                                {openMonths.includes(month.month) && (
                                  <div className={'ob-rem-tlchildren'}>
                                    {month.days.map((day) => {
                                      const dayActive = (view.kind === 'day' && view.date === day.date)
                                        || (view.kind === 'today' && day.date === today)
                                      return (
                                        <div key={day.date} className={`ob-rem-tlrow ob-rem-tlrow-day ${dayActive ? 'ob-rem-tlrow-active' : ''}`}>
                                          <span className={'ob-rem-tldaymarker'} aria-hidden={'true'}><span className={'ob-rem-tldot ob-rem-tldot-day'} /></span>
                                          <button
                                            type={'button'}
                                            className={'ob-rem-tlname ob-rem-tlname-day'}
                                            title={fill(t('timeline.totalCount'), { n: day.total, m: day.count })}
                                            aria-current={dayActive ? 'date' : undefined}
                                            onClick={() => { setAnchor(day.date); setView({ kind: 'day', date: day.date }); setShowCompleted(true) }}
                                          >
                                            {monthDay(day.date, locale)}
                                          </button>
                                          <span className={'ob-rem-tlcount'}>{day.total}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
              </div>

              {tagCounts.length > 0 && (
                <div className={'ob-rem-tags'}>
                  <div className={'ob-rem-tagshead'}>{t('side.tags')}</div>
                  {tagCounts.map(([tag, count]) => (
                    <button
                      key={tag}
                      type={'button'}
                      className={`ob-rem-tagrow ${tagFilter === tag ? 'ob-rem-tagrow-active' : ''}`}
                      title={fill(t('timeline.tagCount'), { n: count })}
                      aria-pressed={tagFilter === tag}
                      onClick={() => { toggleTag(tag) }}
                    >
                      <span className={'ob-rem-taghash'}>#</span>
                      <span className={'ob-rem-tagname'}>{tag}</span>
                      <span className={'ob-rem-tlcount'}>{count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Drag handle: resize the browser column ───────────────── */}
      {!effectiveCollapsed && (
        <div
          className={'ob-rem-resizer'}
          role={'separator'}
          aria-orientation={'vertical'}
          aria-label={t('side.resize')}
          aria-valuenow={appliedSide}
          aria-valuemin={SIDE_MIN}
          aria-valuemax={sideMax}
          tabIndex={0}
          title={t('side.resizeHint')}
          data-dragging={resizing ? 'true' : undefined}
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          onDoubleClick={() => { setSideWidth(SIDE_DEFAULT); persist('ob.sideWidth', String(SIDE_DEFAULT)) }}
          onKeyDown={onResizeKey}
        />
      )}

      {/* ── Left pane (grid column 1) ─────────────────────────────── */}
      <div className={'ob-rem-pane'}>
        <div className={'ob-rem-content'}>
          <header className={'ob-rem-header'}>
            <div className={'ob-rem-titlewrap'}>
              <div className={'ob-rem-eyebrow'}>{subtitle}</div>
              <h1 className={'ob-rem-bigtitle'}>{title}</h1>
            </div>
            <div className={'ob-rem-headright'}>
              <span className={'ob-rem-bigcount'}>{headerCount}</span>
              <span className={'ob-rem-bigcountlabel'}>{headerCountLabel}</span>
            </div>
          </header>

          <div className={'ob-rem-subbar'}>
            {view.kind !== 'completed' && visibleDone > 0 && (
              <>
                <span className={'ob-rem-completed'}>{fill(t('pane.completedCount'), { n: visibleDone })}</span>
                <button
                  type={'button'}
                  className={'ob-rem-linkbtn'}
                  aria-pressed={showCompleted}
                  onClick={() => { setShowCompleted((value) => !value) }}
                >
                  {showCompleted ? t('pane.hideCompleted') : t('pane.showCompleted')}
                </button>
              </>
            )}
            {tagFilter !== undefined && (
              <button type={'button'} className={'ob-rem-tagfilter'} aria-label={t('side.tagClear')} onClick={() => { setTagFilter(undefined) }}>
                #{tagFilter}
                <svg viewBox={'0 0 16 16'} width={'9'} height={'9'} aria-hidden={'true'}>
                  <path d={'M4 4l8 8M12 4l-8 8'} fill={'none'} stroke={'currentColor'} strokeWidth={'2'} strokeLinecap={'round'} />
                </svg>
              </button>
            )}
            <span className={'ob-rem-grow'} />
            <div className={'ob-rem-datectl'} ref={headerCalRef}>
              <button
                type={'button'}
                className={'ob-rem-datepill'}
                onClick={(event) => {
                  lastCalTriggerRef.current = event.currentTarget
                  setCalTarget(calTarget === 'header' ? undefined : 'header')
                }}
                title={t('toolbar.pickDate')}
                aria-label={t('toolbar.pickDate')}
                aria-haspopup={'dialog'}
                aria-expanded={calTarget === 'header'}
              >
                <CalendarIcon />
                {datePillLabel}
              </button>
              {calTarget === 'header' && (
                <div className={'ob-rem-calpop ob-rem-calpop-right'} role={'dialog'} aria-modal={'true'} aria-label={t('calendar.jump')}>
                  <Calendar
                    value={shownDate}
                    today={today}
                    locale={calendarLocale}
                    onChange={(date) => {
                      revealDate(date)
                      setAnchor(date)
                      setView({ kind: 'day', date })
                      setShowCompleted(true)
                      closeCalendar()
                    }}
                    onClose={closeCalendar}
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── Add-task composer: the one place a task is created ──── */}
          <div className={'ob-rem-addbar'}>
            <div className={'ob-rem-addcard'}>
              <div className={'ob-rem-addbar-row'}>
                <button
                  type={'button'}
                  className={'ob-rem-addbtn'}
                  onClick={focusAdd}
                  disabled={composerDisabled}
                  title={t('add.label')}
                  aria-label={t('add.label')}
                >
                  <svg viewBox={'0 0 16 16'} width={'13'} height={'13'} aria-hidden={'true'}>
                    <path d={'M8 3.5v9M3.5 8h9'} fill={'none'} stroke={'currentColor'} strokeWidth={'1.9'} strokeLinecap={'round'} />
                  </svg>
                </button>
                <input
                  ref={addInputRef}
                  className={'ob-rem-add-input'}
                  placeholder={addPlaceholder}
                  aria-label={t('add.label')}
                  value={addText}
                  disabled={composerDisabled}
                  onChange={(event) => { setAddText(event.target.value) }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onAdd()
                    }
                  }}
                />
                <div className={'ob-rem-addtarget'} ref={taskCalRef}>
                  <span className={'ob-rem-addtarget-label'}>{t('add.to')}</span>
                  <button
                    type={'button'}
                    className={`ob-rem-datechip ${effectiveAddDate !== listDate ? 'ob-rem-datechip-other' : ''}`}
                    onClick={(event) => {
                      const isOpen = calTarget === 'target' || calTarget === 'task'
                      lastCalTriggerRef.current = event.currentTarget
                      setCalTarget(isOpen ? undefined : 'target')
                    }}
                    title={tokenDate === undefined ? t('add.target') : t('add.tokenDate')}
                    aria-label={`${t('add.target')}: ${dueLabel}`}
                    aria-haspopup={'menu'}
                    aria-expanded={calTarget === 'target' || calTarget === 'task'}
                  >
                    {dueLabel}
                    <svg viewBox={'0 0 16 16'} width={'10'} height={'10'} aria-hidden={'true'}>
                      <path d={'M4 6.5l4 4 4-4'} fill={'none'} stroke={'currentColor'} strokeWidth={'1.6'} strokeLinecap={'round'} strokeLinejoin={'round'} />
                    </svg>
                  </button>
                  {calTarget === 'target' && (
                    <div className={'ob-rem-targetmenu'} role={'menu'} aria-label={t('add.target')}>
                      {([
                        { value: 'inbox', label: t('smart.inbox'), disabled: !inboxSupported },
                        { value: today, label: t('add.today') },
                        { value: shift(today, 1), label: t('add.tomorrow') },
                        { value: shift(today, 2), label: t('add.dayAfter') },
                      ] as Array<{ value: string; label: string; disabled?: boolean }>).map((item) => (
                        <button
                          key={item.value}
                          type={'button'}
                          role={'menuitemradio'}
                          aria-checked={effectiveAddDate === item.value}
                          className={'ob-rem-targetmenu-item'}
                          disabled={item.disabled === true}
                          title={item.disabled === true ? t('add.inboxUnavailable') : undefined}
                          onClick={() => { chooseAddTarget(item.value); closeCalendar() }}
                        >
                          {item.label}
                        </button>
                      ))}
                      <button
                        type={'button'}
                        role={'menuitem'}
                        className={'ob-rem-targetmenu-item ob-rem-targetmenu-date'}
                        onClick={() => { setCalTarget('task') }}
                      >
                        <CalendarIcon small />
                        {t('toolbar.pickDate')}
                      </button>
                    </div>
                  )}
                  {calTarget === 'task' && (
                    <div className={'ob-rem-calpop ob-rem-calpop-right'} role={'dialog'} aria-modal={'true'} aria-label={t('calendar.add')}>
                      <Calendar
                        value={addToInbox ? today : effectiveAddDate}
                        today={today}
                        locale={calendarLocale}
                        onChange={(date) => {
                          // A deliberate picker selection replaces a typed date token;
                          // otherwise the displayed choice would never take effect.
                          chooseAddTarget(date)
                          closeCalendar()
                        }}
                        onClose={closeCalendar}
                      />
                    </div>
                  )}
                </div>
                <button
                  type={'button'}
                  className={'ob-rem-add-submit'}
                  onClick={onAdd}
                  disabled={adding || composerDisabled || addText.trim() === ''}
                >
                  {adding ? t('add.submitting') : t('add.submit')}
                </button>
              </div>
              <div className={'ob-rem-addhint'}>
                <span className={'ob-rem-addhint-main'}>{target.failed ? t('add.targetUnknown') : target.file === undefined ? t('add.targetLoading') : fill(t('add.hintFile'), { file: target.file })}</span>
                {target.file !== undefined && !target.exists && <span className={'ob-rem-addhint-new'}>{t('add.hintNew')}</span>}
                {tokenDate === undefined && <span className={'ob-rem-addhint-tip'}>{t('add.tipShort')}</span>}
              </div>
              {tokenDate !== undefined && (
                <div className={'ob-rem-addhint-token'}>{t('add.tokenDate')}</div>
              )}
            </div>
          </div>

          {statusBar !== undefined && (
            <div className={`ob-rem-statusbar ob-rem-statusbar-${statusBar.variant}`} role={statusBar.variant === 'alert' ? 'alert' : 'status'}>
              <span className={'ob-rem-statusbar-icon'}><NavGlyph icon={statusBar.icon} /></span>
              <span className={'ob-rem-statusbar-copy'}>
                <span className={'ob-rem-statusbar-title'}>{statusBar.title}</span>
                <span className={'ob-rem-statusbar-hint'}>{statusBar.hint}</span>
              </span>
              {statusBar.actionLabel !== undefined && (
                <button
                  type={'button'}
                  className={`ob-rem-statusbar-action${statusBar.retry === true ? ' ob-rem-retry' : ''}`}
                  onClick={statusBar.onAction}
                >
                  {statusBar.actionLabel}
                </button>
              )}
              {statusBar.dismissible === true && (
                <button
                  type={'button'}
                  className={'ob-rem-statusbar-action'}
                  aria-label={t('notice.dismiss')}
                  onClick={() => { setStatusDismissed(true) }}
                >
                  ×
                </button>
              )}
            </div>
          )}

          <div className={'ob-rem-rows'}>
            {dataFailed
              ? <div className={'ob-rem-empty'} role={'alert'}>
                  <span className={'ob-rem-empty-title'}>{t('empty.loadFailed')}</span>
                  <span className={'ob-rem-empty-hint'}>{t('empty.loadFailedHint')}</span>
                  <button type={'button'} className={'ob-rem-retry'} onClick={retry}>{t('error.retry')}</button>
                </div>
              : loading || rangeLoading || (needsTimeline && timeline === undefined && timelineError === undefined)
                ? <div className={'ob-rem-empty'}>{t('toolbar.loading')}</div>
                : showEmpty
                  ? (
                    <div className={'ob-rem-empty'}>
                      <span className={'ob-rem-empty-icon'}><NavGlyph icon={'completed'} /></span>
                      <span className={'ob-rem-empty-title'}>{emptyText}</span>
                      <span className={'ob-rem-empty-hint'}>{tagFilter !== undefined ? t('empty.taggedHint') : view.kind === 'inbox' ? (inboxSupported ? t('empty.inboxHint') : t('add.inboxUnavailable')) : view.kind === 'completed' ? t('empty.completedHint') : t('empty.hint')}</span>
                      {tagFilter !== undefined
                        ? <button type={'button'} className={'ob-rem-empty-action'} onClick={() => { setTagFilter(undefined) }}>{t('side.tagClear')}</button>
                        : view.kind !== 'completed' && <button type={'button'} className={'ob-rem-empty-action'} onClick={focusAdd}>{t('empty.action')}</button>}
                    </div>
                  )
                  : showHidden
                    ? <div className={'ob-rem-empty'}><span className={'ob-rem-empty-title'}>{t('empty.hidden')}</span><button type={'button'} className={'ob-rem-empty-action'} onClick={() => { setShowCompleted(true) }}>{t('pane.showCompleted')}</button></div>
                    : displayGroups.map(({ heading, tasks }) => (
                  <div key={heading} className={'ob-rem-group'}>
                    {/* The Inbox view is already titled, so its group label is noise. */}
                    {((!isDayView && view.kind !== 'inbox') || displayGroups.length > 1) && <div className={'ob-rem-grouplabel'}>{heading}</div>}
                    {tasks.map((task) => {
                      const isEditing = editing !== undefined && editing.file === task.file && editing.line === task.line
                      const key = taskKey(task)
                      const isPending = pending.includes(key)
                      return (
                        <div key={key} className={`ob-rem-trow ${task.done ? 'ob-rem-trow-done' : ''}${isEditing ? ' ob-rem-trow-editing' : ''}${!task.done && task.date !== 'inbox' ? ' ob-rem-trow-two-meta' : ''}`}>
                          <button
                            type={'button'}
                            className={`ob-rem-check ${task.done ? 'ob-rem-check-done' : ''}`}
                            aria-label={task.done ? t('task.undone') : t('task.done')}
                            aria-busy={isPending}
                            disabled={isPending}
                            onClick={() => { onToggle(task, !task.done) }}
                          >
                            <svg viewBox={'0 0 16 16'} width={'11'} height={'11'} aria-hidden={'true'}>
                              <path d={'M3.5 8.5l3 3 6-7'} fill={'none'} stroke={'#fff'} strokeWidth={'2'} strokeLinecap={'round'} strokeLinejoin={'round'} />
                            </svg>
                          </button>
                          <div className={'ob-rem-tbody'}>
                            {isEditing ? (
                              <div className={'ob-rem-editrow'}>
                                <input
                                  className={'ob-rem-edit-input'}
                                  autoFocus
                                  value={editing.text}
                                  aria-label={t('task.edit')}
                                  onChange={(event) => { setEditing({ ...editing, text: event.target.value }) }}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      onSaveEdit()
                                    }
                                    if (event.key === 'Escape') {
                                      event.preventDefault()
                                      onCancelEdit()
                                    }
                                  }}
                                  onBlur={(event) => {
                                    // Focus moved to this row's delete button: the
                                    // click will delete, so do not save first.
                                    const next = event.relatedTarget
                                    if (next instanceof HTMLElement && next.closest('.ob-rem-editrow') === event.currentTarget.parentElement) return
                                    if (deleteGuard.current) {
                                      deleteGuard.current = false
                                      return
                                    }
                                    onSaveEdit()
                                  }}
                                />
                                <button
                                  type={'button'}
                                  className={'ob-rem-editbtn ob-rem-editbtn-danger'}
                                  title={t('task.delete')}
                                  aria-label={t('task.delete')}
                                  onMouseDown={(event) => { event.preventDefault() }}
                                  onClick={() => { onDeleteTask(task) }}
                                >
                                  <svg viewBox={'0 0 16 16'} width={'11'} height={'11'} aria-hidden={'true'}>
                                    <path d={'M4 4l8 8M12 4l-8 8'} fill={'none'} stroke={'currentColor'} strokeWidth={'1.8'} strokeLinecap={'round'} />
                                  </svg>
                                </button>
                              </div>
                            ) : (
                              <div className={'ob-rem-ttextline'}>
                                <button
                                  type={'button'}
                                  className={'ob-rem-tedit'}
                                  title={t('task.editTitle')}
                                  onClick={() => { onStartEdit(task) }}
                                >
                                  {textWithoutTag(task)}
                                </button>
                                {task.tag !== undefined && (
                                  <button type={'button'} className={'ob-rem-tag'} onClick={() => { toggleTag(task.tag as string) }}>#{task.tag}</button>
                                )}
                              </div>
                            )}
                            {!task.done && (
                              <div className={'ob-rem-tmeta'}>
                                <div className={'ob-rem-chipwrap'} ref={moveKey === key && calTarget === 'move' ? moveCalRef : undefined}>
                                  <button
                                    type={'button'}
                                    className={'ob-rem-chip'}
                                    title={task.date === 'inbox' ? t('task.scheduleTitle') : t('task.moveTitle')}
                                    aria-label={task.date === 'inbox' ? t('task.scheduleTitle') : t('task.moveTitle')}
                                    aria-haspopup={'dialog'}
                                    aria-expanded={calTarget === 'move' && moveKey === key}
                                    onClick={(event) => {
                                      const isOpen = calTarget === 'move' && moveKey === key
                                      lastCalTriggerRef.current = isOpen ? null : event.currentTarget
                                      setMoveKey(isOpen ? undefined : key)
                                      setCalTarget(isOpen ? undefined : 'move')
                                    }}
                                  >
                                    <CalendarIcon small />
                                  </button>
                                  {calTarget === 'move' && moveKey === key && (
                                    <div className={'ob-rem-calpop ob-rem-calpop-right'} role={'dialog'} aria-modal={'true'} aria-label={t('calendar.move')}>
                                      <Calendar
                                        value={task.date === 'inbox' ? today : task.date}
                                        today={today}
                                        locale={calendarLocale}
                                        onChange={(date) => { onMove(task, date) }}
                                        onClose={closeCalendar}
                                      />
                                    </div>
                                  )}
                                </div>
                                {task.date !== 'inbox' && (
                                  <button
                                    type={'button'}
                                    className={'ob-rem-chip'}
                                    title={t('task.inboxTitle')}
                                    aria-label={t('task.inboxTitle')}
                                    onClick={() => { onMoveToInbox(task) }}
                                  >
                                    <InboxIcon small />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
          </div>

        </div>
      </div>
      {notice && (
        <div className={`ob-rem-toast ${notice.kind === 'error' ? 'ob-rem-toast-error' : 'ob-rem-toast-ok'}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          <span className={'ob-rem-toast-text'}>{notice.text}</span>
          <button type={'button'} className={'ob-rem-toast-x'} aria-label={t('notice.dismiss')} onClick={() => { setNotice(undefined) }}>
            <svg viewBox={'0 0 16 16'} width={'10'} height={'10'} aria-hidden={'true'}>
              <path d={'M4 4l8 8M12 4l-8 8'} fill={'none'} stroke={'currentColor'} strokeWidth={'1.8'} strokeLinecap={'round'} />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

/** A refined timeline glyph: three descending nodes on a quiet spine. */
function TimelineGlyph(): ReactNode {
  return (
    <svg viewBox={'0 0 16 16'} width={'15'} height={'15'} aria-hidden={'true'}>
      <path d={'M4 2.7v10.6'} fill={'none'} stroke={'currentColor'} strokeWidth={'1.5'} strokeLinecap={'round'} opacity={'0.45'} />
      <circle cx={'4'} cy={'4.4'} r={'1.8'} fill={'currentColor'} />
      <circle cx={'4'} cy={'8'} r={'1.4'} fill={'currentColor'} opacity={'0.78'} />
      <circle cx={'4'} cy={'11.6'} r={'1.05'} fill={'currentColor'} opacity={'0.6'} />
      <path d={'M7.4 4.4h5M7.4 8h3.6M7.4 11.6h2.3'} fill={'none'} stroke={'currentColor'} strokeWidth={'1.3'} strokeLinecap={'round'} opacity={'0.55'} />
    </svg>
  )
}

/** A small calendar glyph. */
function CalendarIcon(props: { small?: boolean }): ReactNode {
  const size = props.small === true ? 14 : 13
  return (
    <svg viewBox={'0 0 16 16'} width={size} height={size} aria-hidden={'true'}>
      <rect x={'2'} y={'3'} width={'12'} height={'11'} rx={'2'} fill={'none'} stroke={'currentColor'} strokeWidth={'1.2'} />
      <path d={'M2 6.5h12M5 1.5v3M11 1.5v3'} stroke={'currentColor'} strokeWidth={'1.2'} strokeLinecap={'round'} />
    </svg>
  )
}

/**
 * The Inbox tray glyph used in a task row.
 *
 * Drawn to fill the same optical box as {@link CalendarIcon} (12 wide inside a
 * 16-unit viewBox, same 1.2 stroke), so the two row actions read as a pair.
 * @param props - `small` matches the row chip size of the calendar glyph.
 * @returns the tray icon.
 */
function InboxIcon(props: { small?: boolean }): ReactNode {
  const size = props.small === true ? 14 : 13
  return (
    <svg viewBox={'0 0 16 16'} width={size} height={size} aria-hidden={'true'}>
      <path
        d={'M2 8.6 3.8 3.6h8.4L14 8.6v4.8H2z'}
        fill={'none'}
        stroke={'currentColor'}
        strokeWidth={'1.2'}
        strokeLinecap={'round'}
        strokeLinejoin={'round'}
      />
      <path
        d={'M2 8.6h4l1 1.9h2l1-1.9h4'}
        fill={'none'}
        stroke={'currentColor'}
        strokeWidth={'1.2'}
        strokeLinecap={'round'}
        strokeLinejoin={'round'}
      />
    </svg>
  )
}

/** The glyph of one smart view. */
function NavGlyph(props: { icon: 'today' | 'overdue' | 'scheduled' | 'inbox' | 'all' | 'completed' }): ReactNode {
  const { icon } = props
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const glyph = {
    today: <><rect x={'2.8'} y={'3.4'} width={'10.4'} height={'9.6'} rx={'2.2'} {...stroke} /><path d={'M2.8 6.6h10.4M5.5 1.8v3M10.5 1.8v3'} {...stroke} /><path d={'M5.6 9.2h4.8'} {...stroke} /></>,
    overdue: <><circle cx={'8'} cy={'8'} r={'5.8'} {...stroke} /><path d={'M8 4.8v3.8l2.2 1.3'} {...stroke} /></>,
    scheduled: <><rect x={'2.4'} y={'3.2'} width={'11.2'} height={'10'} rx={'2.2'} {...stroke} /><path d={'M2.4 6.4h11.2M5.5 1.6v3.2M10.5 1.6v3.2'} {...stroke} /><path d={'M8 8.8v2.4M6.8 10h2.4'} {...stroke} /></>,
    inbox: <><path d={'M2.6 8.4h3l1 1.8h1.8l1-1.8h3'} {...stroke} /><path d={'M2.6 8.4 4.2 3.6h7.6l1.6 4.8v3.2H2.6z'} {...stroke} /></>,
    all: <><path d={'M3 4.2h10M3 8h10M3 11.8h7'} {...stroke} /></>,
    completed: <><circle cx={'8'} cy={'8'} r={'5.8'} {...stroke} /><path d={'M5.2 8.3l1.9 1.9 3.7-4.3'} {...stroke} /></>,
  }[icon]
  return <svg viewBox={'0 0 16 16'} width={'15'} height={'15'} aria-hidden={'true'}>{glyph}</svg>
}
