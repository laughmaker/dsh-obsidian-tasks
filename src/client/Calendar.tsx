/**
 * A self-contained Reminders/macOS-style date picker for the task board.
 *
 * The board used a native `<input type="date">`, which renders as an ugly
 * platform widget; this module replaces it with a small popover panel built
 * from plain `Date` arithmetic (no date library) and the same design tokens
 * the rest of the board uses, so it looks native in both light and dark
 * themes.
 *
 * The component renders the panel only — no outer positioning — so the caller
 * can drop it into any relatively positioned wrapper (a popover anchored to a
 * chip, a modal body) without fighting the CSS here. The caller owns the
 * `role="dialog" aria-modal="true"` wrapper; this panel implements the
 * grid semantics, roving tabindex, arrow-key navigation and its own Tab trap.
 * @module dsh-obsidian-tasks/client/Calendar
 */
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type ReactNode,
} from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * Props of the calendar panel.
 */
export interface CalendarProps {
  /** Selected day as `YYYY-MM-DD`. */
  value: string
  /** Today's `YYYY-MM-DD`, used to mark today. */
  today: string
  /** Called with the picked `YYYY-MM-DD` when the user picks a day. */
  onChange: (date: string) => void
  /** Optional: called when the user dismisses the calendar (Esc / outside click). */
  onClose?: () => void
  /** Which language the labels use: 'zh' or 'en'. */
  locale: 'zh' | 'en'
}

/** The shape of an icon component from the primitives package. */
type IconComponent = (props: { size?: number; className?: string }) => ReactNode

/**
 * The host's chevron glyphs, so the calendar's navigation matches the rest of
 * the DSH chrome. The primitives package renames size-suffixed icons between
 * builds, so every plausible export name is tried before the text fallback.
 */
const iconTable = primitives as unknown as Record<string, IconComponent | undefined>
const ChevronLeftIcon: IconComponent | undefined =
  iconTable.IconChevronLeftOutlineRegular
  ?? iconTable.IconChevronLeftOutlineMedium
  ?? iconTable.IconChevronLeftOutline14
const ChevronRightIcon: IconComponent | undefined =
  iconTable.IconChevronRightOutlineRegular
  ?? iconTable.IconChevronRightOutlineMedium
  ?? iconTable.IconChevronRightOutline14

/** Month names for the English header. */
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Weekday headers, Monday first. */
const WEEKDAYS_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** Weekday headers, Monday first. */
const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Quick-pick labels for the row under the header. */
const QUICK_ZH = ['今天', '明天', '后天']

/** Quick-pick labels for the row under the header. */
const QUICK_EN = ['Today', 'Tomorrow', 'In 2 days']

/** Number of columns / rows in the day grid. */
const GRID_COLUMNS = 7
const GRID_ROWS = 6

/** One cell of the day grid. */
interface DayCell {
  /** The day as `YYYY-MM-DD`. */
  iso: string
  /** The day of the month, 1–31. */
  day: number
  /** Whether the day belongs to the month the grid is showing. */
  inMonth: boolean
}

/**
 * Parse a `YYYY-MM-DD` string into a local-time Date.
 *
 * The plain `new Date('2026-11-05')` form parses as UTC midnight, which is the
 * classic off-by-one-day bug in the western hemisphere; building the Date from
 * its parts keeps everything in local time.
 * @param iso - a `YYYY-MM-DD` day.
 * @returns the local Date for that day, or an invalid Date when unparsable.
 */
function parseIso(iso: string): Date {
  const parts = iso.split('-').map((part) => Number(part))
  const year = parts[0] ?? 0
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  return new Date(year, month - 1, day)
}

/**
 * Format a local-time Date as `YYYY-MM-DD`.
 * @param date - the date to format.
 * @returns the day as `YYYY-MM-DD`.
 */
function toIso(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Shift a `YYYY-MM-DD` day by a signed number of days.
 * @param iso - the starting day.
 * @param delta - how many days to move (negative moves back).
 * @returns the shifted day as `YYYY-MM-DD`.
 */
function shiftIso(iso: string, delta: number): string {
  const date = parseIso(iso)
  date.setDate(date.getDate() + delta)
  return toIso(date)
}

/**
 * Build the 6×7 day grid of a month, Monday first.
 *
 * The grid always starts on the Monday on or before the first of the month and
 * always holds 42 cells, so the panel never changes height between months.
 * @param year - the year of the month to show.
 * @param month - the zero-based month to show.
 * @returns the 42 cells of the grid, in reading order.
 */
function monthGrid(year: number, month: number): DayCell[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const cells: DayCell[] = []
  for (let index = 0; index < GRID_COLUMNS * GRID_ROWS; index++) {
    const date = new Date(year, month, 1 - offset + index)
    cells.push({ iso: toIso(date), day: date.getDate(), inMonth: date.getMonth() === month })
  }
  return cells
}

/**
 * The month + year header label.
 * @param year - the year to show.
 * @param month - the zero-based month to show.
 * @param locale - the label language.
 * @returns the header text, e.g. `2026年11月` / `November 2026`.
 */
function monthLabel(year: number, month: number, locale: 'zh' | 'en'): string {
  return locale === 'zh' ? `${year}年${month + 1}月` : `${MONTHS_EN[month]} ${year}`
}

/**
 * The accessible label of one day cell.
 * @param cell - the cell to describe.
 * @param locale - the label language.
 * @returns a human-readable date label.
 */
function cellLabel(cell: DayCell, locale: 'zh' | 'en'): string {
  const date = parseIso(cell.iso)
  if (locale === 'zh') return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

/**
 * Render a Reminders-style calendar popover.
 *
 * The panel shows a month header with previous/next buttons, a quick-pick row
 * (today / tomorrow / the day after), a Monday-first weekday header and a 6×7
 * grid. Days outside the shown month stay selectable but dimmed; today gets a
 * ring and the selected day is filled with the accent blue. Picking a day
 * reports it through `onChange` and then dismisses the panel through
 * `onClose`; Escape dismisses it without picking.
 *
 * Accessibility: the grid exposes 6 `role="row"` and 42 `role="gridcell"`
 * elements; exactly one day button owns the tab stop (roving tabindex), the
 * arrow keys / Home / End move that stop (crossing a month boundary rebuilds
 * the grid), the selected day receives focus when the panel opens, and Tab is
 * trapped inside the panel until it closes.
 * @param props - the calendar's props.
 * @returns the calendar panel.
 */
export function Calendar(props: CalendarProps): ReactNode {
  const { value, today, onChange, onClose, locale } = props

  // The month the panel shows; starts at the selected day.
  const [view, setView] = useState<{ year: number; month: number }>(() => {
    const date = parseIso(value)
    const anchor = Number.isNaN(date.getTime()) ? parseIso(today) : date
    return { year: anchor.getFullYear(), month: anchor.getMonth() }
  })

  // Follow the selection: when the parent moves `value`, the grid follows it
  // (picking a dimmed day of the neighbouring month jumps there).
  useEffect(() => {
    const date = parseIso(value)
    const anchor = Number.isNaN(date.getTime()) ? parseIso(today) : date
    setView({ year: anchor.getFullYear(), month: anchor.getMonth() })
  }, [today, value])

  // Escape dismisses the panel. The caller restores focus to the trigger.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [onClose])

  /** Report a picked day and dismiss the panel. */
  const pick = useCallback((date: string): void => {
    onChange(date)
    onClose?.()
  }, [onChange, onClose])

  /** Move the grid one month back or forward. */
  const moveMonth = useCallback((delta: number): void => {
    setView((current) => {
      const date = new Date(current.year, current.month + delta, 1)
      return { year: date.getFullYear(), month: date.getMonth() }
    })
  }, [])

  const cells = useMemo<DayCell[]>(() => monthGrid(view.year, view.month), [view.month, view.year])
  const rows = useMemo<DayCell[][]>(() => {
    const result: DayCell[][] = []
    for (let index = 0; index < GRID_ROWS; index++) {
      result.push(cells.slice(index * GRID_COLUMNS, (index + 1) * GRID_COLUMNS))
    }
    return result
  }, [cells])

  // ── Roving tabindex and focus management ────────────────────────
  const rootRef = useRef<HTMLDivElement>(null)
  const initialIso = useRef<string>(value || today)
  const pendingFocus = useRef<string | undefined>(undefined)
  const [focusedIso, setFocusedIso] = useState<string>(() => value || today)

  // A changed selection moves the tab stop with it.
  useEffect(() => { setFocusedIso(value) }, [value])

  // Keep the tab stop on a cell that actually exists in the current grid.
  const activeIso = useMemo<string>(() => {
    if (cells.some((cell) => cell.iso === focusedIso)) return focusedIso
    return cells.find((cell) => cell.inMonth)?.iso ?? cells[0]?.iso ?? focusedIso
  }, [cells, focusedIso])

  /** Focus one day button by its ISO date. */
  const focusDay = useCallback((iso: string): void => {
    rootRef.current
      ?.querySelector<HTMLButtonElement>(`button[data-iso="${iso}"]`)
      ?.focus({ preventScroll: true })
  }, [])

  // The panel behaves like a small modal: put the caret on the selected day so
  // the arrow keys work immediately after opening.
  useEffect(() => { focusDay(initialIso.current) }, [focusDay])

  // A keyboard move can cross into a neighbouring month; the grid is rebuilt,
  // so focus the destination once those cells exist.
  useEffect(() => {
    const pending = pendingFocus.current
    if (pending === undefined || !cells.some((cell) => cell.iso === pending)) return
    pendingFocus.current = undefined
    focusDay(pending)
  }, [cells, focusDay])

  /** Move the roving tab stop to a day, rebuilding the grid if needed. */
  const moveFocus = useCallback((target: string): void => {
    setFocusedIso(target)
    if (cells.some((cell) => cell.iso === target)) {
      focusDay(target)
      return
    }
    const date = parseIso(target)
    setView({ year: date.getFullYear(), month: date.getMonth() })
    pendingFocus.current = target
  }, [cells, focusDay])

  /** Arrow keys / Home / End inside the 6×7 grid. */
  const onDayKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    const iso = event.currentTarget.dataset.iso
    if (iso === undefined) return
    const weekday = (parseIso(iso).getDay() + 6) % 7
    let delta: number
    switch (event.key) {
      case 'ArrowLeft': delta = -1; break
      case 'ArrowRight': delta = 1; break
      case 'ArrowUp': delta = -GRID_COLUMNS; break
      case 'ArrowDown': delta = GRID_COLUMNS; break
      case 'Home': delta = -weekday; break
      case 'End': delta = GRID_COLUMNS - 1 - weekday; break
      default: return
    }
    event.preventDefault()
    moveFocus(shiftIso(iso, delta))
  }, [moveFocus])

  /** Keep Tab / Shift+Tab inside the panel while it is open. */
  const trapTab = useCallback((event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') return
    const root = rootRef.current
    if (root === null) return
    const focusables = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .filter((element) => !element.disabled && element.tabIndex >= 0)
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (active === null || !root.contains(active)) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
      return
    }
    const index = focusables.indexOf(active as HTMLButtonElement)
    if (event.shiftKey && index <= 0) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (index === -1 || index === focusables.length - 1)) {
      event.preventDefault()
      first.focus()
    }
  }, [])

  const weekdays = locale === 'zh' ? WEEKDAYS_ZH : WEEKDAYS_EN
  const quickLabels = locale === 'zh' ? QUICK_ZH : QUICK_EN
  const quickDates = [today, shiftIso(today, 1), shiftIso(today, 2)]

  return (
    <div className={'ob-rem-cal'} ref={rootRef} onKeyDown={trapTab}>
      {/* ── Month header ───────────────────────────────────────── */}
      <div className={'ob-rem-cal-head'}>
        <button
          type={'button'}
          className={'ob-rem-cal-navbtn'}
          aria-label={locale === 'zh' ? '上个月' : 'Previous month'}
          onClick={() => { moveMonth(-1) }}
        >
          {ChevronLeftIcon !== undefined ? <ChevronLeftIcon size={14} /> : '‹'}
        </button>
        <button
          type={'button'}
          className={'ob-rem-cal-title'}
          aria-label={locale === 'zh' ? '回到选中日期' : 'Jump to the selected date'}
          onClick={() => {
            const date = parseIso(value)
            const anchor = Number.isNaN(date.getTime()) ? parseIso(today) : date
            setView({ year: anchor.getFullYear(), month: anchor.getMonth() })
          }}
        >
          {monthLabel(view.year, view.month, locale)}
        </button>
        <button
          type={'button'}
          className={'ob-rem-cal-navbtn'}
          aria-label={locale === 'zh' ? '下个月' : 'Next month'}
          onClick={() => { moveMonth(1) }}
        >
          {ChevronRightIcon !== undefined ? <ChevronRightIcon size={14} /> : '›'}
        </button>
      </div>

      {/* ── Quick picks ────────────────────────────────────────── */}
      <div className={'ob-rem-cal-quick'}>
        {quickLabels.map((label, index) => {
          const quickIso = quickDates[index] ?? today
          const isQuick = quickIso === value
          return (
            <button
              key={label}
              type={'button'}
              className={`ob-rem-cal-quickbtn${isQuick ? ' ob-rem-cal-quickbtn-active' : ''}`}
              aria-pressed={isQuick}
              onClick={() => { pick(quickIso) }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Weekday header ─────────────────────────────────────── */}
      <div className={'ob-rem-cal-week'}>
        {weekdays.map((label) => (
          <span key={label} className={'ob-rem-cal-weekday'}>{label}</span>
        ))}
      </div>

      {/* ── Day grid: 6 rows × 7 gridcells, one roving tab stop ─── */}
      <div className={'ob-rem-cal-grid'} role={'grid'} aria-label={locale === 'zh' ? '日期网格' : 'Date grid'}>
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className={'ob-rem-cal-row'} role={'row'}>
            {row.map((cell) => {
              const isSelected = cell.iso === value
              const isToday = cell.iso === today
              const className = [
                'ob-rem-cal-cell',
                cell.inMonth ? '' : 'ob-rem-cal-cell-out',
                isToday ? 'ob-rem-cal-cell-today' : '',
                isSelected ? 'ob-rem-cal-cell-selected' : '',
              ].filter((name) => name !== '').join(' ')
              return (
                <div
                  key={cell.iso}
                  className={'ob-rem-cal-cellwrap'}
                  role={'gridcell'}
                  aria-selected={isSelected}
                >
                  <button
                    type={'button'}
                    data-iso={cell.iso}
                    className={className}
                    tabIndex={cell.iso === activeIso ? 0 : -1}
                    aria-label={cellLabel(cell, locale)}
                    aria-current={isToday ? 'date' : undefined}
                    aria-pressed={isSelected}
                    onFocus={() => { setFocusedIso(cell.iso) }}
                    onKeyDown={onDayKeyDown}
                    onClick={() => { pick(cell.iso) }}
                  >
                    {cell.day}
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * CSS for the calendar, injected by styles.ts (same string-template style).
 *
 * The rules are scoped to the `ob-rem-cal-*` classes and read the host's theme
 * tokens (`--dsw-alias-*`) with light fallbacks. Derived surfaces use
 * `color-mix()` so they adapt to the host theme without a
 * `prefers-color-scheme` block that could disagree with the host.
 */
export const calendarCss: string = String.raw`
.ob-rem-cal {
  --ob-rem-cal-bg: var(--dsw-alias-bg-layer-1, #ffffff);
  --ob-rem-cal-bg-soft: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #ffffff) 93%, var(--dsw-alias-label-primary, #1a1a1a));
  --ob-rem-cal-border: var(--dsw-alias-border-l2, #d8d8dd);
  --ob-rem-cal-text: var(--dsw-alias-label-primary, #1a1a1a);
  --ob-rem-cal-text-2: var(--dsw-alias-label-secondary, #6b6b70);
  --ob-rem-cal-text-3: var(--dsw-alias-label-tertiary, #a1a1a8);
  --ob-rem-cal-accent: var(--dsw-alias-state-business-primary, #0a84ff);
  --ob-rem-cal-on-accent: var(--dsw-alias-label-on-color, #ffffff);
  box-sizing: border-box;
  width: 268px; padding: 10px 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--ob-rem-cal-border);
  background: var(--ob-rem-cal-bg);
  color: var(--ob-rem-cal-text);
  font: inherit;
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.18);
  user-select: none;
}
.ob-rem-cal, .ob-rem-cal * { box-sizing: border-box; }

.ob-rem-cal-head { display: flex; align-items: center; gap: 4px; }
.ob-rem-cal-navbtn {
  flex: none; width: 26px; height: 26px; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; border-radius: 8px; background: transparent;
  color: var(--ob-rem-cal-text-2); font: inherit; font-size: 17px; line-height: 1;
  cursor: pointer;
}
.ob-rem-cal-navbtn:hover { background: var(--ob-rem-cal-bg-soft); color: var(--ob-rem-cal-text); }
.ob-rem-cal-title {
  flex: 1; min-width: 0; padding: 4px 0;
  border: 0; border-radius: 8px; background: transparent;
  color: var(--ob-rem-cal-text); font: inherit; font-size: 13px; font-weight: 600;
  text-align: center; cursor: pointer;
}
.ob-rem-cal-title:hover { background: var(--ob-rem-cal-bg-soft); }

.ob-rem-cal-quick {
  display: flex; gap: 2px; margin: 9px 0 9px; padding: 2px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--ob-rem-cal-bg-soft) 88%, transparent);
}
.ob-rem-cal-quickbtn {
  flex: 1; min-width: 0; padding: 6px 4px;
  border: 0; border-radius: 7px;
  background: transparent; color: var(--ob-rem-cal-text-2);
  font: inherit; font-size: 12px; font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.ob-rem-cal-quickbtn:hover {
  color: var(--ob-rem-cal-text);
  background: color-mix(in srgb, var(--ob-rem-cal-bg) 62%, transparent);
}
.ob-rem-cal-quickbtn-active {
  color: var(--ob-rem-cal-accent); font-weight: 650;
  background: var(--ob-rem-cal-bg);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}

.ob-rem-cal-week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 3px; }
.ob-rem-cal-weekday {
  text-align: center; padding: 3px 0;
  font-size: 11px; font-weight: 600; color: var(--ob-rem-cal-text-3);
}

/* The grid is a column of 6 rows; each row owns the 7-column layout. */
.ob-rem-cal-grid { display: flex; flex-direction: column; gap: 2px; }
.ob-rem-cal-row { display: grid; grid-template-columns: repeat(7, 1fr); grid-auto-rows: 28px; gap: 2px; }
.ob-rem-cal-cellwrap { display: flex; align-items: center; justify-content: center; min-width: 0; }
.ob-rem-cal-cell {
  /* Round cells, like the task check circles: a square cell, centred in its
     column, so the ring and the filled state are true circles. */
  border: 0; border-radius: 50%; padding: 0;
  width: 28px; height: 28px; margin: 0 auto;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; color: var(--ob-rem-cal-text);
  font: inherit; font-size: 12px; font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.ob-rem-cal-cell:hover { background: var(--ob-rem-cal-bg-soft); }
.ob-rem-cal-cell-out { color: var(--ob-rem-cal-text-3); }
.ob-rem-cal-cell-today {
  color: var(--ob-rem-cal-accent); font-weight: 600;
  box-shadow: inset 0 0 0 1.5px var(--ob-rem-cal-accent);
}
.ob-rem-cal-cell-selected { background: var(--ob-rem-cal-accent); color: var(--ob-rem-cal-on-accent); font-weight: 600; box-shadow: none; }
.ob-rem-cal-cell-selected:hover { background: var(--ob-rem-cal-accent); color: var(--ob-rem-cal-on-accent); }

/* One accent ring for every focusable control in the panel. */
.ob-rem-cal-navbtn:focus-visible,
.ob-rem-cal-title:focus-visible,
.ob-rem-cal-quickbtn:focus-visible { outline: 2px solid var(--ob-rem-cal-accent); outline-offset: 1px; }
.ob-rem-cal-cell:focus-visible { outline: 2px solid var(--ob-rem-cal-accent); outline-offset: -2px; }
`
