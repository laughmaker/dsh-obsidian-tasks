/**
 * 历史静态预览 · 不再随产品更新（2026-11-06 标注）
 *
 * 本脚本是旧版看板「添加条」的静态 HTML 快照，里面的 class 名与手写结构
 * 停留在 0.12.x 之前；产品页面早已是 `src/client/*` 的 React 组件（当前类名
 * 见 docs/20261106_全量优化实施契约_v1.md）。为避免维护两套 UI，本脚本不再随
 * 产品更新，也不代表当前界面；README 已移除它的使用说明。
 * 核对当前界面请用 `dsh web` 的实际页面，或运行 `script/e2e-client.mjs`。
 *
 * ---------------------------------------------------------------------------
 *
 * Render a static preview of the redesigned task board.
 *
 * HISTORICAL ONLY — see the note above. The board page is React, so it cannot be
 * rendered outside the DSH shell; this script reuses the *real* stylesheet from
 * `src/client/styles.ts` (plus the calendar sheet that now lives in
 * `src/client/Calendar.tsx` as `calendarCss`) and rebuilds the new markup by
 * hand, so the layout can be inspected (and regression-checked) in a plain
 * browser.
 *
 * Output goes to `~/tmp/`:
 *   ob-addbar-preview-light.html  light theme, Chinese copy
 *   ob-addbar-preview-dark.html   dark theme, Chinese copy
 *   ob-addbar-preview-zh.html     the Chinese variant
 *   ob-addbar-preview-menu.html   light theme with the calendar popover open
 *   ob-addbar-preview-month.html  the month view (timeline on the 月 tab)
 *
 * Run: node script/preview-addbar.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

/**
 * Extract the body of a `String.raw` template from a source file.
 * @param source - the whole source file.
 * @param marker - a unique marker that precedes the template.
 * @returns the template body.
 */
function rawTemplate(source, marker) {
  const at = source.indexOf(marker)
  if (at < 0) throw new Error(`could not find "${marker}" in the source`)
  const start = source.indexOf('String.raw`', at)
  if (start < 0) throw new Error(`could not find the template after "${marker}"`)
  const end = source.indexOf('`', start + 'String.raw`'.length)
  if (end < 0) throw new Error(`unterminated template after "${marker}"`)
  return source.slice(start + 'String.raw`'.length, end)
}

const styles = readFileSync(join(ROOT, 'src/client/styles.ts'), 'utf8')
const calendar = readFileSync(join(ROOT, 'src/client/Calendar.tsx'), 'utf8')
// The board sheet plus the calendar sheet, exactly as `styles.ts` composes them.
const css = [
  rawTemplate(styles, 'export const css'),
  rawTemplate(calendar, 'export const calendarCss'),
].join('\n')

const TOKENS = {
  light: {
    '--dsw-alias-label-primary': '#1a1a1a',
    '--dsw-alias-label-secondary': '#666',
    '--dsw-alias-label-tertiary': '#999',
    '--dsw-alias-border-l2': '#e6e6e6',
    '--dsw-alias-bg-base': '#ffffff',
    '--dsw-alias-bg-layer-1': '#ffffff',
    '--dsw-alias-bg-layer-2': '#f2f2f5',
    '--dsw-alias-bg-layer-3': '#e8e8ee',
    '--dsw-alias-state-business-primary': '#0a84ff',
    '--dsw-alias-state-error-primary': '#b91c1c',
    '--dsw-alias-state-success-primary': '#15803d',
  },
  dark: {
    '--dsw-alias-label-primary': '#e8e8ed',
    '--dsw-alias-label-secondary': '#a1a1a6',
    '--dsw-alias-label-tertiary': '#76767c',
    '--dsw-alias-border-l2': '#2b2b30',
    '--dsw-alias-bg-base': '#17171a',
    '--dsw-alias-bg-layer-1': '#1e1e22',
    '--dsw-alias-bg-layer-2': '#212125',
    '--dsw-alias-bg-layer-3': '#2c2c31',
    '--dsw-alias-state-business-primary': '#0a84ff',
    '--dsw-alias-state-error-primary': '#ff6b6b',
    '--dsw-alias-state-success-primary': '#4ade80',
  },
}

/** The day the preview pretends to be "today". */
const TODAY = '2026-11-05'
/** The day the list shows. */
const DAY = '2026-11-05'

/** Chinese copy of the strings the preview shows (the board's default). */
const ZH = {
  lang: 'zh',
  langBtn: 'EN',
  langTitle: '切换语言',
  collapseTitle: '折叠侧栏',
  vaultTitle: '库',
  today: '今天',
  scheduled: '计划',
  all: '全部',
  completed: '已完成',
  lists: '列表',
  tags: '标签',
  newTask: '新建任务',
  open: '项未完成',
  completedCount: '{n} 项已完成',
  clear: '清除',
  hide: '隐藏',
  hideCompleted: '隐藏已完成',
  editTitle: '点击修改任务内容，回车保存',
  editingSample: '正在编辑的任务文字',
  placeholder: '添加任务，回车确认',
  monthDay: '11月5日',
  weekday: '周四',
  // ── The timeline section of the sidebar ──────────────────────────
  timeline: '时间线',
  tlEmpty: '这段时间还没有任务。',
  tlExpand: '展开 / 收起',
  tlCount: '{n} 项未完成任务',
  /**
   * The timeline tree, newest first at every level: a year, its months, and
   * the days of a month. `open` marks the expanded branches.
   */
  tlTree: [
    {
      year: '2026',
      count: 62,
      open: true,
      months: [
        {
          key: '2026-11',
          label: '11月',
          count: 16,
          open: true,
          days: [
            { key: '2026-11-05', label: '11月5日', count: 2 },
            { key: '2026-11-04', label: '11月4日', count: 4 },
            { key: '2026-11-03', label: '11月3日', count: 1 },
            { key: '2026-11-02', label: '11月2日', count: 6 },
            { key: '2026-11-01', label: '11月1日', count: 3 },
          ],
        },
        { key: '2026-10', label: '10月', count: 34, open: false, days: [] },
        { key: '2026-09', label: '9月', count: 12, open: false, days: [] },
      ],
    },
    {
      year: '2025',
      count: 39,
      open: false,
      months: [
        { key: '2025-12', label: '12月', count: 21, open: false, days: [] },
        { key: '2025-11', label: '11月', count: 18, open: false, days: [] },
      ],
    },
  ],
  listDays: [
    { weekday: '周四', date: '11月5日', color: '#ff9500', count: 2, active: true },
    { weekday: '周五', date: '11月6日', color: '#007aff', count: 1, active: false },
    { weekday: '周六', date: '11月7日', color: '#34c759', count: 0, active: false },
  ],
  tagRows: [
    { tag: 'work', count: 3 },
    { tag: 'home', count: 2 },
    { tag: 'idea', count: 1 },
  ],
  addHint: '回车添加 · 写入 20 Daily/2026-11-05.md',
  addHintNew: '（当天笔记不存在，将自动新建）',
  addTip: '· 提示：写 @明天 / @后天 可以改到别的日期',
  notice: '已添加到 20 Daily/2026-11-05.md',
  tasks: [
    { text: '把插件的新版看板跑通', tag: 'work', date: '11月5日', done: false },
    { text: '给妈妈打电话', date: '11月5日', done: false },
    { text: '交房租', date: '11月5日', done: true },
  ],
  /** The month view: the pane shows the month, the rows are grouped by day. */
  monthTitle: '2026年11月',
  monthGroups: [
    {
      heading: '周四 11月5日',
      tasks: [
        { text: '把插件的新版看板跑通', tag: 'work', date: '11月5日', done: false },
        { text: '给妈妈打电话', date: '11月5日', done: false },
      ],
    },
    {
      heading: '周三 11月4日',
      tasks: [
        { text: '整理月度复盘', tag: 'work', date: '11月4日', done: false },
        { text: '买咖啡豆', date: '11月4日', done: false },
        { text: '交房租', date: '11月4日', done: true },
      ],
    },
    {
      heading: '周一 11月2日',
      tasks: [
        { text: '更新插件依赖', tag: 'idea', date: '11月2日', done: false },
      ],
    },
  ],
  notes: '复盘笔记',
  notesHint: '追加到当天的日记 · 20 Daily/2026-11-05.md',
  calTitle: '2026年11月',
  calQuick: ['今天', '明天', '后天'],
  calWeekdays: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
}

/** English copy of the same strings. */
const EN = {
  lang: 'en',
  langBtn: '中',
  langTitle: 'Switch language',
  collapseTitle: 'Collapse sidebar',
  vaultTitle: 'Vault',
  today: 'Today',
  scheduled: 'Scheduled',
  all: 'All',
  completed: 'Completed',
  lists: 'Lists',
  tags: 'Tags',
  newTask: 'New task',
  open: 'open',
  completedCount: '{n} completed',
  clear: 'Clear',
  hide: 'Hide',
  hideCompleted: 'Hide completed',
  editTitle: 'Click to edit the text, Enter to save',
  editingSample: 'Task text being edited',
  placeholder: 'Add a task, press Enter',
  monthDay: 'Nov 5',
  weekday: 'Thu',
  // ── The timeline section of the sidebar ──────────────────────────
  timeline: 'Timeline',
  tlEmpty: 'No tasks in this period.',
  tlExpand: 'Expand / collapse',
  tlCount: '{n} open tasks',
  tlTree: [
    {
      year: '2026',
      count: 62,
      open: true,
      months: [
        {
          key: '2026-11',
          label: 'Nov',
          count: 16,
          open: true,
          days: [
            { key: '2026-11-05', label: 'Nov 5', count: 2 },
            { key: '2026-11-04', label: 'Nov 4', count: 4 },
            { key: '2026-11-03', label: 'Nov 3', count: 1 },
            { key: '2026-11-02', label: 'Nov 2', count: 6 },
            { key: '2026-11-01', label: 'Nov 1', count: 3 },
          ],
        },
        { key: '2026-10', label: 'Oct', count: 34, open: false, days: [] },
        { key: '2026-09', label: 'Sep', count: 12, open: false, days: [] },
      ],
    },
    {
      year: '2025',
      count: 39,
      open: false,
      months: [
        { key: '2025-12', label: 'Dec', count: 21, open: false, days: [] },
        { key: '2025-11', label: 'Nov', count: 18, open: false, days: [] },
      ],
    },
  ],
  listDays: [
    { weekday: 'Thu', date: 'Nov 5', color: '#ff9500', count: 2, active: true },
    { weekday: 'Fri', date: 'Nov 6', color: '#007aff', count: 1, active: false },
    { weekday: 'Sat', date: 'Nov 7', color: '#34c759', count: 0, active: false },
  ],
  tagRows: [
    { tag: 'work', count: 3 },
    { tag: 'home', count: 2 },
    { tag: 'idea', count: 1 },
  ],
  addHint: 'Press Enter to add · writes 20 Daily/2026-11-05.md',
  addHintNew: '(the day note will be created)',
  addTip: '· Tip: write @tomorrow to pick another day',
  notice: 'Added to 20 Daily/2026-11-05.md',
  tasks: [
    { text: 'Ship the redesigned task board', tag: 'work', date: 'Nov 5', done: false },
    { text: 'Call mum', date: 'Nov 5', done: false },
    { text: 'Pay the rent', date: 'Nov 5', done: true },
  ],
  monthTitle: 'November 2026',
  monthGroups: [
    {
      heading: 'Thu Nov 5',
      tasks: [
        { text: 'Ship the redesigned task board', tag: 'work', date: 'Nov 5', done: false },
        { text: 'Call mum', date: 'Nov 5', done: false },
      ],
    },
    {
      heading: 'Wed Nov 4',
      tasks: [
        { text: 'Write the monthly review', tag: 'work', date: 'Nov 4', done: false },
        { text: 'Buy coffee beans', date: 'Nov 4', done: false },
        { text: 'Pay the rent', date: 'Nov 4', done: true },
      ],
    },
    {
      heading: 'Mon Nov 2',
      tasks: [
        { text: 'Update the plugin dependencies', tag: 'idea', date: 'Nov 2', done: false },
      ],
    },
  ],
  notes: 'Daily review',
  notesHint: 'appended to the day’s note · 20 Daily/2026-11-05.md',
  calTitle: 'November 2026',
  calQuick: ['Today', 'Tomorrow', 'Day after tomorrow'],
  calWeekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
}

// ── Glyphs, copied from `BoardPage.tsx` and `Calendar.tsx` ─────────────────

/** The small calendar glyph of the day-list rows (`CalendarGlyph small`). */
const CALENDAR_GLYPH = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">'
  + '<rect x="2.5" y="3" width="11" height="10.5" rx="2" fill="none" stroke="#fff" stroke-width="1.2"/>'
  + '<path d="M2.5 6.2h11M5.5 1.6v2.6M10.5 1.6v2.6" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>'
  + '<circle cx="5.8" cy="9" r="0.85" fill="#fff"/>'
  + '<circle cx="8" cy="9" r="0.85" fill="#fff"/>'
  + '<circle cx="10.2" cy="9" r="0.85" fill="#fff"/>'
  + '</svg>'

/** The outlined calendar of the date pill and the date chip. */
const CALENDAR_OUTLINE = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">'
  + '<rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.2"/>'
  + '<path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'
  + '</svg>'

/** The chevron of the date chip. */
const CHEVRON_DOWN = '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">'
  + '<path d="M4 6.5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
  + '</svg>'

/** The host's "panel on the left" glyph, used by the sidebar collapse control. */
const PANEL_LEFT = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">'
  + '<path fill="currentColor" fill-rule="evenodd" d="M9.67 0.52c1.16 0 2.09 0 2.83.08.75.08 1.38.25 1.93.65.32.24.6.52.84.85.4.55.57 1.18.65 1.93.08.74.08 1.66.08 2.82v2.3c0 1.16 0 2.08-.08 2.82-.08.75-.25 1.38-.65 1.93-.24.32-.52.6-.84.85-.55.4-1.18.57-1.93.65-.74.08-1.66.08-2.83.08H6.33c-1.16 0-2.09 0-2.83-.08-.75-.08-1.38-.25-1.93-.65a2.7 2.7 0 0 1-.84-.85c-.4-.55-.57-1.18-.65-1.93C.08 11.31.08 10.39.08 9.23V6.85c0-1.16 0-2.09.08-2.82.08-.75.25-1.38.65-1.93.24-.32.52-.6.84-.85.55-.4 1.18-.57 1.93-.65C4.32.52 5.25.52 6.33.52h3.34Zm-4.13 1.37v12.22c.24 0 .5 0 .79 0h3.34c1.19 0 2.03 0 2.51-.07.64-.07 1.01-.2 1.25-.4.21-.15.37-.34.52-.55.2-.28.33-.6.4-1.1.07-.64.08-1.62.08-2.65V6.85c0-1.03 0-2.01-.07-2.65-.07-.5-.2-.82-.4-1.1a1.5 1.5 0 0 0-.52-.55c-.25-.2-.61-.33-1.25-.4-.49-.06-1.32-.07-2.52-.07H6.33c-.29 0-.55 0-.79 0Z"/>'
  + '</svg>'

/** The chevron of the daily-review header (pointing right). */
const CHEVRON_RIGHT = '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" class="ob-rem-chev">'
  + '<path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
  + '</svg>'

/** The plus of the round add button and the "new task" button. */
const PLUS = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">'
  + '<path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>'
  + '</svg>'

/** The tick of a finished task. */
const TICK = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">'
  + '<path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  + '</svg>'

/** The close cross of the notice. */
const CROSS = '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">'
  + '<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
  + '</svg>'

/** The glyph of one smart-filter card. */
function cardGlyph(icon) {
  const glyph = {
    today: '<rect x="3" y="4" width="10" height="9" rx="2" fill="none" stroke="#fff" stroke-width="1.3"/>'
      + '<path d="M3 7h10" stroke="#fff" stroke-width="1.3"/>'
      + '<text x="8" y="11.5" text-anchor="middle" font-size="5.5" fill="#fff" font-weight="700">5</text>',
    scheduled: '<rect x="2.5" y="3.5" width="11" height="10" rx="2" fill="none" stroke="#fff" stroke-width="1.3"/>'
      + '<path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>',
    all: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>',
    completed: '<path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  }[icon]
  return `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${glyph}</svg>`
}

/** The 6×7 day grid of the calendar, Monday first. */
function calendarGrid(year, month) {
  const cells = []
  const offset = (new Date(year, month, 1).getDay() + 6) % 7
  for (let index = 0; index < 42; index++) {
    const date = new Date(year, month, 1 - offset + index)
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    cells.push({ iso, day: date.getDate(), inMonth: date.getMonth() === month })
  }
  return cells
}

/** The calendar panel, as `Calendar.tsx` renders it. */
function calendarPanel(copy) {
  const cells = calendarGrid(2026, 10)
  const body = cells.map((cell) => {
    const classes = ['ob-rem-cal-cell']
    if (!cell.inMonth) classes.push('ob-rem-cal-cell-out')
    if (cell.iso === TODAY) classes.push('ob-rem-cal-cell-today')
    if (cell.iso === DAY) classes.push('ob-rem-cal-cell-selected')
    return `<button type="button" class="${classes.join(' ')}" aria-label="${cell.iso}">${cell.day}</button>`
  }).join('')
  return `<div class="ob-rem-cal">
    <div class="ob-rem-cal-head">
      <button type="button" class="ob-rem-cal-navbtn" aria-label="上个月">‹</button>
      <button type="button" class="ob-rem-cal-title" aria-label="回到选中日期">${copy.calTitle}</button>
      <button type="button" class="ob-rem-cal-navbtn" aria-label="下个月">›</button>
    </div>
    <div class="ob-rem-cal-quick">
      ${copy.calQuick.map((label) => `<button type="button" class="ob-rem-cal-quickbtn">${label}</button>`).join('')}
    </div>
    <div class="ob-rem-cal-week">
      ${copy.calWeekdays.map((label) => `<span class="ob-rem-cal-weekday">${label}</span>`).join('')}
    </div>
    <div class="ob-rem-cal-grid" role="grid">${body}</div>
  </div>`
}

/** One coloured smart-filter card. */
function smartCard(label, count, icon, color, active) {
  return `<button type="button" class="ob-rem-card${active ? ' ob-rem-card-active' : ''}" style="background:${color}">
    <span class="ob-rem-card-top">
      <span class="ob-rem-card-icon">${cardGlyph(icon)}</span>
      <span class="ob-rem-card-count">${count}</span>
    </span>
    <span class="ob-rem-card-label">${label}</span>
  </button>`
}

/** One task row of the sample list. */
function taskRow(task, accent, copy) {
  return `<div class="ob-rem-trow${task.done ? ' ob-rem-trow-done' : ''}">
    <button type="button" class="ob-rem-check${task.done ? ' ob-rem-check-done' : ''}"${task.done ? ` style="background:${accent};border-color:${accent}"` : ''}>${TICK}</button>
    <div class="ob-rem-tbody">
      <div class="ob-rem-ttext"><button type="button" class="ob-rem-tedit" title="${copy.editTitle}">${task.text}</button>${task.tag === undefined ? '' : `<button type="button" class="ob-rem-tag">#${task.tag}</button>`}</div>
      ${task.done ? '' : `<div class="ob-rem-tmeta"><div class="ob-rem-chipwrap"><button class="ob-rem-chip">${CALENDAR_OUTLINE}${task.date}</button></div></div>`}
    </div>
  </div>`
}

/** The chevron of a timeline branch, as `BoardPage.tsx` renders it. */
function timelineChevron(open) {
  return '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"'
    + ` class="${open ? 'ob-rem-tlchev ob-rem-tlchev-open' : 'ob-rem-tlchev'}">`
    + '<path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
    + '</svg>'
}

/**
 * The vertical timeline tree, as `BoardPage.tsx` renders it: a spine with a
 * dot per level, a year that expands into its months and a month that expands
 * into its days.
 * @param copy - the language dictionary to use.
 * @param active - the key of the node the current view points at, if any.
 * @returns the tree markup.
 */
function timelineTree(copy, active, footer = '') {
  const years = copy.tlTree
  if (years.length === 0) return `<div class="ob-rem-tl"><div class="ob-rem-tlempty">${copy.tlEmpty}</div></div>`
  const body = years.map((year) => {
    const months = year.months.map((month) => {
      const days = month.days.map((day) => {
        const opacity = day.count >= 4 ? 1 : day.count >= 2 ? 0.75 : 0.5
        return `<div class="ob-rem-tlnode ob-rem-tlnode-day${active === day.key ? ' ob-rem-tlnode-active' : ''}">
          <span class="ob-rem-tldot" style="opacity:${opacity}"></span>
          <button type="button" class="ob-rem-tlname ob-rem-tlname-day" title="${timelineTitle(copy, day.count)}">${day.label}</button>
          <span class="ob-rem-tlnodecount">${day.count}</span>
        </div>`
      }).join('')
      return `<div class="ob-rem-tlgroup">
        <div class="ob-rem-tlnode ob-rem-tlnode-month${active === month.key ? ' ob-rem-tlnode-active' : ''}">
          <span class="ob-rem-tlring"></span>
          <span class="ob-rem-tlbranch"></span>
          <span class="ob-rem-tldot"></span>
          <button type="button" class="ob-rem-tlbig ob-rem-tlbig-month" title="${timelineTitle(copy, month.count)}">${month.label}</button>
          <span class="ob-rem-tlbar">${month.count} 项</span>
          <button type="button" class="ob-rem-tlchevbtn" aria-expanded="${month.open}" aria-label="${copy.tlExpand}">${timelineChevron(month.open)}</button>
        </div>
        ${month.open ? `<div class="ob-rem-tlchildren">${days}</div>` : ''}
      </div>`
    }).join('')
    return `<div class="ob-rem-tlgroup">
      <div class="ob-rem-tlnode ob-rem-tlnode-year${active === year.year ? ' ob-rem-tlnode-active' : ''}">
        <span class="ob-rem-tlring"></span>
        <span class="ob-rem-tlbranch"></span>
        <span class="ob-rem-tldot"></span>
        <button type="button" class="ob-rem-tlbig" title="${timelineTitle(copy, year.count)}">${year.year}</button>
        <span class="ob-rem-tlbar">${year.count} 项</span>
        <button type="button" class="ob-rem-tlchevbtn" aria-expanded="${year.open}" aria-label="${copy.tlExpand}">${timelineChevron(year.open)}</button>
      </div>
      ${year.open ? `<div class="ob-rem-tlchildren">${months}</div>` : ''}
    </div>`
  }).join('')
  return `<div class="ob-rem-tl">${body}${footer}</div>`
}

/** The tooltip of a timeline node: the number of open tasks. */
function timelineTitle(copy, count) {
  return copy.tlCount.replace('{n}', String(count))
}
/**
 * The whole board, as the page renders it.
 * @param copy - the language dictionary to use.
 * @param opts - `menuOpen` draws the calendar popover, `monthView` shows the
 *   month period in the right pane.
 * @returns the board markup.
 */
function markup(copy, opts) {
  const { menuOpen = false, monthView = false } = opts
  const accent = monthView ? '#af52de' : '#007aff'
  const open = monthView ? 16 : copy.tasks.filter((task) => !task.done).length
  const done = monthView ? 5 : copy.tasks.filter((task) => task.done).length
  const dateLabel = `${copy.monthDay} ${copy.weekday}`
  const title = monthView ? copy.monthTitle : copy.today
  // The timeline node the current view points at: the month node in the month
  // view, nothing in the "today" view (the board only marks a period node).
  const activeTimeline = monthView ? '2026-11' : undefined

  // No smart card is active in a period view (the real board only lights one
  // up for the smart filters).
  const cards = [
    smartCard(copy.today, 2, 'today', '#0a84ff', !monthView),
    smartCard(copy.scheduled, 3, 'scheduled', '#ff375f', false),
    smartCard(copy.all, 9, 'all', '#5a5a5f', false),
    smartCard(copy.completed, 5, 'completed', '#8e8e93', false),
  ].join('')

  const dayRows = copy.listDays.map((day) => `<button type="button" class="ob-rem-listrow${day.active ? ' ob-rem-listrow-active' : ''}">
        <span class="ob-rem-listdot" style="background:${day.color}">${CALENDAR_GLYPH}</span>
        <span class="ob-rem-listname"><span class="ob-rem-listday">${day.weekday}</span><span class="ob-rem-listdate">${day.date}</span></span>
        ${day.count > 0 ? `<span class="ob-rem-listcount">${day.count}</span>` : ''}
      </button>`).join('')

  const tagRows = `<div class="ob-rem-tlsection">${copy.tags}</div>` + copy.tagRows.map((row) => `<button type="button" class="ob-rem-tlrow">
        <span class="ob-rem-tlrow-dot"></span>
        <span class="ob-rem-tlname ob-rem-tlname-day">${row.tag}</span>
        <span class="ob-rem-tlnodecount">${row.count}</span>
      </button>`).join('')

  const taskBlocks = monthView
    ? copy.monthGroups.map((group) => `<div class="ob-rem-group">
        <div class="ob-rem-grouplabel">${group.heading}</div>
        ${group.tasks.map((task) => taskRow(task, accent, copy)).join('\n        ')}
      </div>`).join('\n      ')
    : copy.tasks.map((task) => taskRow(task, accent, copy)).join('\n      ')

  return `<div class="ob-rem-page">
  <div class="ob-rem-side">
    <div class="ob-rem-vaultrow">
      <span class="ob-rem-vaultname" title="${copy.vaultTitle}">Spark</span>
      <button type="button" class="ob-rem-collapse" title="${copy.collapseTitle}" aria-label="${copy.collapseTitle}">${PANEL_LEFT}</button>
    </div>
    <div class="ob-rem-cards">
      ${cards}
    </div>
    <div class="ob-rem-sidehead">
      <span class="ob-rem-mylists">${copy.timeline}</span>
      <button type="button" class="ob-rem-newtask">${PLUS}${copy.newTask}</button>
    </div>
    ${timelineTree(copy, activeTimeline, tagRows)}
  </div>
  <div class="ob-rem-pane">
    <div class="ob-rem-pane-head">
      <h1 class="ob-rem-bigtitle" style="color:${accent}">${title}</h1>
      <div class="ob-rem-headright">
        <span class="ob-rem-bigcount" style="color:${accent}">${open}</span>
        <span class="ob-rem-bigcountlabel">${copy.open}</span>
      </div>
    </div>
    <div class="ob-rem-subbar">
      <span class="ob-rem-completed">${copy.completedCount.replace('{n}', String(done))}</span>
      <span class="ob-rem-dot-sep">·</span>
      <button class="ob-rem-linkbtn">${copy.clear}</button>
      <span class="ob-rem-grow"></span>
      <div class="ob-rem-datectl">
        <button type="button" class="ob-rem-datepill" title="${copy.today}">${CALENDAR_OUTLINE}${dateLabel}</button>
      </div>
      <button class="ob-rem-linkbtn" title="${copy.hideCompleted}">${copy.hideCompleted}</button>
    </div>

    <div class="ob-rem-addbar">
      <div class="ob-rem-addbar-row">
        <button type="button" class="ob-rem-addbtn" title="${copy.newTask}" aria-label="${copy.newTask}">${PLUS}</button>
        <input class="ob-rem-add-input" placeholder="${copy.placeholder}">
        <div class="ob-rem-addtarget">
          <button type="button" class="ob-rem-datechip" title="${copy.newTask}">${CALENDAR_OUTLINE}${dateLabel}${CHEVRON_DOWN}</button>
          ${menuOpen ? `<div class="ob-rem-calpop ob-rem-calpop-right">${calendarPanel(copy)}</div>` : ''}
        </div>
      </div>
      <div class="ob-rem-addhint">
        <span class="ob-rem-addhint-main">${copy.addHint}</span>
        <span class="ob-rem-addhint-new">${copy.addHintNew}</span>
        <span class="ob-rem-addhint-tip">${copy.addTip}</span>
      </div>
    </div>

    <div class="ob-rem-notice ob-rem-notice-ok">
      <span class="ob-rem-notice-text">${copy.notice}</span>
      <button type="button" class="ob-rem-notice-x" aria-label="关闭提示">${CROSS}</button>
    </div>

    <div class="ob-rem-rows">
      ${taskBlocks}
      <div class="ob-rem-trow">
        <button type="button" class="ob-rem-check">${TICK}</button>
        <div class="ob-rem-tbody">
          <div class="ob-rem-editrow">
            <input class="ob-rem-edit-input" value="${copy.editingSample}">
            <button type="button" class="ob-rem-editbtn ob-rem-editbtn-danger">${CROSS}</button>
          </div>
        </div>
      </div>
    </div>

    <div class="ob-rem-notes">
      <button type="button" class="ob-rem-notes-head" aria-expanded="false">
        ${CHEVRON_RIGHT}
        <span class="ob-rem-notes-title">${copy.notes}</span>
      </button>
    </div>
  </div>
</div>`
}

/**
 * Build one themed HTML document.
 * @param theme - 'light' or 'dark'.
 * @param copy - the language dictionary to use.
 * @param opts - the board options, see `markup`.
 * @returns the whole document.
 */
function document(theme, copy, opts) {
  const vars = Object.entries(TOKENS[theme]).map(([k, v]) => `${k}:${v}`).join(';')
  const title = opts.monthView ? copy.monthTitle : copy.today
  return `<!doctype html><html lang="${copy.lang === 'zh' ? 'zh-CN' : 'en'}" data-theme="${theme}"><head><meta charset="utf-8">
<title>${title} · ${theme}</title>
<style>:root{${vars}}
html,body{height:100%}
body{margin:0;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",Arial,sans-serif;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
${css}
</style></head><body>${markup(copy, opts)}</body></html>`
}

const outDir = join(homedir(), 'tmp')
mkdirSync(outDir, { recursive: true })

/**
 * The language of the preview: Chinese by default, English with
 * `PREVIEW_LANG=en node script/preview-addbar.mjs`. The `-zh` file always
 * carries the Chinese copy.
 */
const LANG = process.env.PREVIEW_LANG === 'en' ? EN : ZH

/** Write one preview file and report its path. */
function write(name, theme, copy, opts) {
  const file = join(outDir, name)
  writeFileSync(file, document(theme, copy, opts))
  console.log(file)
}

write('ob-addbar-preview-light.html', 'light', LANG, {})
write('ob-addbar-preview-dark.html', 'dark', LANG, {})
write('ob-addbar-preview-zh.html', 'light', ZH, {})
write('ob-addbar-preview-menu.html', 'light', LANG, { menuOpen: true })
write('ob-addbar-preview-month.html', 'light', ZH, { monthView: true })
