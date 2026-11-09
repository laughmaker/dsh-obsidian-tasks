/**
 * Scheduling helpers for the board's add-task bar.
 *
 * Kept apart from the page component so the parsing rules can be unit-tested
 * without pulling React into the test runner.
 * @module dsh-obsidian-tasks/client/schedule
 */

/** Days ahead for each scheduling token. */
const SCHEDULE_TOKENS: Record<string, number> = {
  '今天': 0, 'today': 0,
  '明天': 1, 'tomorrow': 1,
  '后天': 2,
}

/**
 * Shift a `YYYY-MM-DD` by a signed day count.
 * @param date - the date to shift.
 * @param delta - days to add (negative moves back).
 * @returns the shifted date.
 */
export function shiftDate(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Pull a scheduling token out of the typed text: `@今天` / `@明天` / `@后天`
 * (English: `@today` / `@tomorrow`). The token is consumed — it never lands in
 * the note — and it overrides the target day chip. The `@` is required, so
 * ordinary text such as “看今天新闻” is never touched.
 * @param text - the raw input text.
 * @param today - today's `YYYY-MM-DD`.
 * @returns the cleaned text and the requested day, or undefined when the text is empty.
 */
export function parseScheduleToken(text: string, today: string): { text: string; date?: string } | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  const token = /@(今天|明天|后天|today|tomorrow)/i.exec(trimmed)
  if (token === null) return { text: trimmed }
  const offset = SCHEDULE_TOKENS[token[1].toLowerCase()]
  const cleaned = trimmed.replace(token[0], ' ').replace(/\s{2,}/g, ' ').trim()
  return { text: cleaned === '' ? trimmed : cleaned, date: shiftDate(today, offset) }
}
