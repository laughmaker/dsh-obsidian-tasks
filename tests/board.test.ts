import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addTask,
  appendNote,
  appendNoteToDate,
  boardForDate,
  dayNotes,
  deleteTask,
  editTask,
  firstSectionHeading,
  headingsByLine,
  moveTask,
  moveTaskToInbox,
  inboxNote,
  inboxRelPath,
  inboxTasks,
  addInboxTask,
  noteVersion,
  shiftDate,
  tasksInRange,
  tasksOfNote,
  timelineFor,
  toggleTask,
} from '../src/board.ts'
import type { VaultConfig } from '../src/config.ts'

let root: string
let vault: VaultConfig
const dayNote = (root: string, date: string): string => join(root, '20 Daily', `${date}.md`)

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'obboard-'))
  mkdirSync(join(root, '20 Daily'), { recursive: true })
  vault = { name: 'T', path: root, dailyDir: '20 Daily', exclude: ['21 Privates', '.obsidian'] }
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('headingsByLine', () => {
  it('maps each line to its nearest heading above', () => {
    const body = ['# Day', '1. Work', '  - [ ] a', '2. Study', '  - [ ] b'].join('\n')
    const m = headingsByLine(body)
    expect(m.get(3)).toBe('Day')
    expect(m.get(5)).toBe('Day')
  })
})

describe('tasksOfNote', () => {
  it('returns tasks with grouping headings and tags', () => {
    writeFileSync(dayNote(root, '2026-01-02'), ['## Work', '- [ ] alpha #proj', '- [x] beta', '', '## Study', '- [ ] gamma'].join('\n'))
    const tasks = tasksOfNote(vault, dayNote(root, '2026-01-02'))
    expect(tasks.map((t) => [t.line, t.done, t.group])).toEqual([
      [2, false, 'Work'],
      [3, true, 'Work'],
      [6, false, 'Study'],
    ])
    expect(tasks[0]!.tag).toBe('proj')
  })

  it('returns an empty list for a missing note', () => {
    expect(tasksOfNote(vault, dayNote(root, '2026-01-09'))).toEqual([])
  })
})

describe('firstSectionHeading', () => {
  it('returns the first level-2-or-deeper section heading', () => {
    const body = ['# 2026-01-01', '', '## Today', '', 'some text', '', '## Notes', '', '- [ ] x'].join('\n')
    expect(firstSectionHeading(body)).toBe('Today')
  })

  it('ignores the note title and returns undefined without a section', () => {
    expect(firstSectionHeading(['# 2026-01-01', '', '- [ ] x'].join('\n'))).toBeUndefined()
    expect(firstSectionHeading('')).toBeUndefined()
  })

  it('trims the heading text', () => {
    expect(firstSectionHeading('##   Today  \n')).toBe('Today')
  })
})

describe('addTask', () => {
  it('creates the note from the template and adds the task', () => {
    const res = addTask(vault, '2026-01-03', 'write report')
    expect(res.created).toBe(true)
    const body = readFileSync(dayNote(root, '2026-01-03'), 'utf8')
    expect(body).toContain('- [ ] write report')
    expect(body).toContain('# 2026-01-03')
  })

  it('files a task under a matching heading', () => {
    writeFileSync(dayNote(root, '2026-01-04'), ['## Today', '', '## Next', ''].join('\n'))
    addTask(vault, '2026-01-04', 'under today', '## Today')
    const body = readFileSync(dayNote(root, '2026-01-04'), 'utf8')
    const idx = body.indexOf('- [ ] under today')
    expect(idx).toBeGreaterThan(body.indexOf('## Today'))
    expect(idx).toBeLessThan(body.indexOf('## Next'))
  })

  it('files a task under the first ## section when no heading is given', () => {
    writeFileSync(dayNote(root, '2026-01-11'), ['# 2026-01-11', '', '## Today', '', '## Notes', '', '- [ ] existing'].join('\n'))
    const res = addTask(vault, '2026-01-11', 'lands under today')
    expect(res.created).toBe(false)
    expect(res.file).toBe('20 Daily/2026-01-11.md')
    const body = readFileSync(dayNote(root, '2026-01-11'), 'utf8')
    const idx = body.indexOf('- [ ] lands under today')
    expect(idx).toBeGreaterThan(body.indexOf('## Today'))
    expect(idx).toBeLessThan(body.indexOf('## Notes'))
    expect(body.split('\n')[res.line - 1]).toBe('- [ ] lands under today')
  })

  it('falls back to the end of the note when it has no ## section', () => {
    writeFileSync(dayNote(root, '2026-01-14'), ['# 2026-01-14', '', '- [ ] existing'].join('\n'))
    const res = addTask(vault, '2026-01-14', 'no section here')
    const body = readFileSync(dayNote(root, '2026-01-14'), 'utf8')
    expect(body.split('\n')[res.line - 1]).toBe('- [ ] no section here')
    expect(body.indexOf('no section here')).toBeGreaterThan(body.indexOf('- [ ] existing'))
  })
})

describe('toggleTask', () => {
  it('checks only the target line and backs up first', () => {
    writeFileSync(dayNote(root, '2026-01-05'), ['- [ ] a', '- [ ] b'].join('\n'))
    const res = toggleTask(vault, '20 Daily/2026-01-05.md', 2, true)
    expect(res.done).toBe(true)
    const lines = readFileSync(dayNote(root, '2026-01-05'), 'utf8').split('\n')
    expect(lines).toEqual(['- [ ] a', '- [x] b'])
  })
})

describe('editTask', () => {
  it('rewrites only the target line and keeps the rest of the note', () => {
    const note = ['---', 'tags: [daily]', '---', '', '## Today', '', '- [ ] alpha', '- [x] beta'].join('\n')
    writeFileSync(dayNote(root, '2026-01-15'), note)
    const res = editTask(vault, '20 Daily/2026-01-15.md', 7, 'renamed task')
    expect(res.file).toBe('20 Daily/2026-01-15.md')
    expect(res.line).toBe(7)
    expect(res.done).toBe(false)
    const lines = readFileSync(dayNote(root, '2026-01-15'), 'utf8').split('\n')
    expect(lines).toEqual(['---', 'tags: [daily]', '---', '', '## Today', '', '- [ ] renamed task', '- [x] beta'])
  })

  it('keeps the checkbox state of an edited line', () => {
    writeFileSync(dayNote(root, '2026-01-16'), ['- [ ] a', '- [x] b'].join('\n'))
    const res = editTask(vault, '20 Daily/2026-01-16.md', 2, 'b renamed')
    expect(res.done).toBe(true)
    expect(readFileSync(dayNote(root, '2026-01-16'), 'utf8').split('\n')).toEqual(['- [ ] a', '- [x] b renamed'])
  })

  it('returns a backup path when the note already existed', () => {
    writeFileSync(dayNote(root, '2026-01-17'), '- [ ] a')
    const res = editTask(vault, '20 Daily/2026-01-17.md', 1, 'a edited')
    expect(typeof res.backup).toBe('string')
    expect(res.backup).toBeTruthy()
  })
})

describe('deleteTask', () => {
  it('removes the task line and keeps the rest of the note', () => {
    const note = ['---', 'tags: [daily]', '---', '', '## Today', '', '- [ ] keep', '- [ ] drop me', '- [ ] tail'].join('\n')
    writeFileSync(dayNote(root, '2026-01-18'), note)
    const res = deleteTask(vault, '20 Daily/2026-01-18.md', 8)
    expect(res.file).toBe('20 Daily/2026-01-18.md')
    const lines = readFileSync(dayNote(root, '2026-01-18'), 'utf8').split('\n')
    expect(lines).toEqual(['---', 'tags: [daily]', '---', '', '## Today', '', '- [ ] keep', '- [ ] tail'])
    expect(readFileSync(dayNote(root, '2026-01-18'), 'utf8')).not.toContain('drop me')
  })

  it('returns a backup path when the note already existed', () => {
    writeFileSync(dayNote(root, '2026-01-19'), '- [ ] a')
    const res = deleteTask(vault, '20 Daily/2026-01-19.md', 1)
    expect(typeof res.backup).toBe('string')
    expect(res.backup).toBeTruthy()
  })

  it('refuses to delete a non-task line', () => {
    writeFileSync(dayNote(root, '2026-01-20'), ['## Today', '- [ ] a'].join('\n'))
    expect(() => deleteTask(vault, '20 Daily/2026-01-20.md', 1)).toThrow(/not a task checkbox/)
    expect(readFileSync(dayNote(root, '2026-01-20'), 'utf8')).toContain('## Today')
  })
})

describe('moveTask', () => {
  it('is a no-op when the target is the source day', () => {
    writeFileSync(dayNote(root, '2026-01-06'), ['- [ ] keep', '- [ ] carry me'].join('\n'))
    const before = readFileSync(dayNote(root, '2026-01-06'), 'utf8')
    const res = moveTask(vault, '20 Daily/2026-01-06.md', 2, '2026-01-06')
    expect(res.from).toBe('20 Daily/2026-01-06.md')
    expect(res.to).toBe('20 Daily/2026-01-06.md')
    expect(readFileSync(dayNote(root, '2026-01-06'), 'utf8')).toBe(before)
  })

  it('removes from source and appends to the target day', () => {
    writeFileSync(dayNote(root, '2026-01-06'), ['- [ ] keep', '- [ ] carry me'].join('\n'))
    const res = moveTask(vault, '20 Daily/2026-01-06.md', 2, '2026-01-07')
    expect(res.text).toBe('carry me')
    expect(readFileSync(dayNote(root, '2026-01-06'), 'utf8')).toBe('- [ ] keep')
    expect(readFileSync(dayNote(root, '2026-01-07'), 'utf8')).toContain('- [ ] carry me')
  })
})

describe('note version guard', () => {
  it('rejects a line-number write made against a stale note', () => {
    const file = dayNote(root, '2026-01-21')
    writeFileSync(file, ['- [ ] a', '- [ ] b'].join('\n'))
    const stale = noteVersion(readFileSync(file, 'utf8'))
    // A concurrent edit changes the note, shifting the meaning of every later line.
    writeFileSync(file, ['- [ ] inserted', '- [ ] a', '- [ ] b'].join('\n'))
    expect(() => toggleTask(vault, '20 Daily/2026-01-21.md', 2, true, stale)).toThrow(/TASK_CONFLICT/)
    expect(() => editTask(vault, '20 Daily/2026-01-21.md', 2, 'x', stale)).toThrow(/TASK_CONFLICT/)
    expect(() => deleteTask(vault, '20 Daily/2026-01-21.md', 2, stale)).toThrow(/TASK_CONFLICT/)
    expect(() => moveTask(vault, '20 Daily/2026-01-21.md', 2, '2026-01-22', stale)).toThrow(/TASK_CONFLICT/)
    // Nothing was written by any of the rejected calls.
    expect(readFileSync(file, 'utf8')).toBe(['- [ ] inserted', '- [ ] a', '- [ ] b'].join('\n'))
  })

  it('accepts a write against the current version', () => {
    const file = dayNote(root, '2026-01-22')
    writeFileSync(file, ['- [ ] a', '- [ ] b'].join('\n'))
    const current = noteVersion(readFileSync(file, 'utf8'))
    expect(() => toggleTask(vault, '20 Daily/2026-01-22.md', 2, true, current)).not.toThrow()
    expect(readFileSync(file, 'utf8')).toBe(['- [ ] a', '- [x] b'].join('\n'))
  })

  it('still works without an expected version (older callers)', () => {
    const file = dayNote(root, '2026-01-23')
    writeFileSync(file, '- [ ] a')
    expect(() => toggleTask(vault, '20 Daily/2026-01-23.md', 1, true)).not.toThrow()
  })
})

describe('Inbox (undated tasks)', () => {
  const inboxPath = (root: string): string => join(root, '20 Daily', 'Inbox.md')

  it('sits beside the daily notes by default', () => {
    expect(inboxRelPath(vault)).toBe('20 Daily/Inbox.md')
    expect(inboxRelPath({ ...vault, dailyDir: undefined, tdlsDir: '00 TDLs' })).toBe('00 TDLs/Inbox.md')
    expect(inboxRelPath({ ...vault, inboxFile: 'Notes/Someday.md' })).toBe('Notes/Someday.md')
  })

  it('creates the note from the template on the first add', () => {
    const res = addInboxTask(vault, 'someday refactor')
    expect(res.created).toBe(true)
    expect(res.file).toBe('20 Daily/Inbox.md')
    const body = readFileSync(inboxPath(root), 'utf8')
    expect(body).toContain('## Tasks')
    expect(body).toContain('- [ ] someday refactor')
    expect(res.line).toBeGreaterThan(0)
  })

  it('appends later tasks under the first section', () => {
    addInboxTask(vault, 'one')
    const res = addInboxTask(vault, 'two')
    expect(res.created).toBe(false)
    const body = readFileSync(inboxPath(root), 'utf8')
    expect(body.indexOf('- [ ] one')).toBeLessThan(body.indexOf('- [ ] two'))
    expect(body.indexOf('- [ ] two')).toBeGreaterThan(body.indexOf('## Tasks'))
  })

  it('is invisible to the day timeline but counted by tag', () => {
    addInboxTask(vault, 'undated #idea')
    writeFileSync(dayNote(root, '2026-05-01'), '- [ ] dated #idea')
    const t = timelineFor(vault, '2026-01-01')
    expect(t.days.map((d) => d.date)).toEqual(['2026-05-01'])
    expect(t.tags).toEqual([{ tag: 'idea', count: 2 }])
  })

  it('carries a dated task back into the Inbox', () => {
    writeFileSync(dayNote(root, '2026-05-02'), ['- [ ] keep', '- [ ] unschedule me'].join('\n'))
    const res = moveTaskToInbox(vault, '20 Daily/2026-05-02.md', 2)
    expect(res.to).toBe('20 Daily/Inbox.md')
    expect(readFileSync(dayNote(root, '2026-05-02'), 'utf8')).toBe('- [ ] keep')
    expect(readFileSync(inboxPath(root), 'utf8')).toContain('- [ ] unschedule me')
  })

  it('schedules an Inbox task onto a day note', () => {
    addInboxTask(vault, 'pick me')
    const line = inboxTasks(vault)[0]!.line
    moveTask(vault, '20 Daily/Inbox.md', line, '2026-05-03')
    expect(inboxTasks(vault)).toEqual([])
    expect(readFileSync(dayNote(root, '2026-05-03'), 'utf8')).toContain('- [ ] pick me')
  })

  it('reports the Inbox note as absent until it exists', () => {
    expect(inboxNote(vault)).toBeUndefined()
    addInboxTask(vault, 'x')
    expect(inboxNote(vault)?.file).toBe('20 Daily/Inbox.md')
  })

  it('rejects an Inbox path that escapes the vault', () => {
    expect(() => inboxRelPath({ ...vault, inboxFile: '../Escape.md' })).not.toThrow()
    expect(() => addInboxTask({ ...vault, inboxFile: '../Escape.md' }, 'x')).toThrow()
  })
})

describe('appendNote', () => {
  it('appends content to the note', () => {
    writeFileSync(dayNote(root, '2026-01-08'), '# Day')
    appendNote(vault, '20 Daily/2026-01-08.md', '## Review\n\nDone.')
    expect(readFileSync(dayNote(root, '2026-01-08'), 'utf8')).toContain('## Review')
  })
})

describe('appendNoteToDate', () => {
  it('creates a missing day note from the template and appends the content', () => {
    const res = appendNoteToDate(vault, '2026-01-12', '## Review\n\nDone well.')
    expect(res.created).toBe(true)
    expect(res.file).toBe('20 Daily/2026-01-12.md')
    const body = readFileSync(dayNote(root, '2026-01-12'), 'utf8')
    expect(body).toContain('# 2026-01-12')
    expect(body).toContain('## Today')
    expect(body).toContain('## Review')
    expect(body).toContain('Done well.')
    expect(body.indexOf('## Review')).toBeGreaterThan(body.indexOf('## Today'))
  })

  it('appends to an existing day note without creating a second file', () => {
    writeFileSync(dayNote(root, '2026-01-13'), ['# 2026-01-13', '', '- [ ] existing'].join('\n'))
    const res = appendNoteToDate(vault, '2026-01-13', '## Review\n\nAlso done.')
    expect(res.created).toBe(false)
    expect(res.file).toBe('20 Daily/2026-01-13.md')
    const body = readFileSync(dayNote(root, '2026-01-13'), 'utf8')
    expect(body).toContain('- [ ] existing')
    expect(body).toContain('## Review')
    expect(body).toContain('Also done.')
  })

  it('rejects a malformed date', () => {
    expect(() => appendNoteToDate(vault, '2026-1-3', 'x')).toThrow(/Invalid date/)
  })
})

describe('boardForDate', () => {
  it('includes the anchor and neighbours within the window', () => {
    writeFileSync(dayNote(root, '2026-01-10'), '- [ ] today')
    writeFileSync(dayNote(root, '2026-01-09'), '- [ ] yesterday')
    const groups = boardForDate(vault, '2026-01-10', 1)
    const dates = groups.map((g) => g.date)
    expect(dates).toContain('2026-01-10')
    expect(dates).toContain('2026-01-09')
  })
})

describe('shiftDate', () => {
  it('moves across month boundaries', () => {
    expect(shiftDate('2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('dayNotes', () => {
  it('lists the daily tree in date order and ignores other notes', () => {
    writeFileSync(dayNote(root, '2026-01-03'), '- [ ] c')
    writeFileSync(dayNote(root, '2026-01-01'), '- [ ] a')
    writeFileSync(join(root, '20 Daily', 'notes.md'), 'not a day note')
    expect(dayNotes(vault).map((n) => n.date)).toEqual(['2026-01-01', '2026-01-03'])
  })

  it('finds day notes in the TDLs layout too', () => {
    const tdl = join(root, '00 TDLs', '2026', '01', '2026-01-05.md')
    mkdirSync(join(root, '00 TDLs', '2026', '01'), { recursive: true })
    writeFileSync(tdl, '- [ ] tdl task')
    const notes = dayNotes({ ...vault, tdlsDir: '00 TDLs' })
    expect(notes.map((n) => n.date)).toEqual(['2026-01-05'])
    expect(notes[0]!.absPath).toBe(tdl)
  })

  it('keeps only the notes on or after since', () => {
    writeFileSync(dayNote(root, '2026-01-01'), '- [ ] a')
    writeFileSync(dayNote(root, '2026-01-02'), '- [ ] b')
    writeFileSync(dayNote(root, '2026-01-03'), '- [ ] c')
    expect(dayNotes(vault, '2026-01-02').map((n) => n.date)).toEqual(['2026-01-02', '2026-01-03'])
  })
})

describe('timelineFor', () => {
  it('counts open and total tasks per day, month and year, and open-task tags', () => {
    writeFileSync(dayNote(root, '2026-01-02'), ['- [ ] alpha #proj', '- [ ] beta #proj', '- [x] gamma #done'].join('\n'))
    writeFileSync(dayNote(root, '2026-01-03'), '# an empty day')
    const t = timelineFor(vault, '2026-01-01')
    expect(t.days).toEqual([{ date: '2026-01-02', count: 2, total: 3 }])
    expect(t.months).toEqual([{ month: '2026-01', count: 2, total: 3 }])
    expect(t.years).toEqual([{ year: '2026', count: 2, total: 3 }])
    // `#done` only appears on a completed task, so it must not contribute.
    expect(t.tags).toEqual([{ tag: 'proj', count: 2 }])
  })

  it('counts only open tasks in tag totals', () => {
    writeFileSync(dayNote(root, '2026-01-02'), [
      '- [ ] alpha #proj',
      '- [x] beta #proj',
      '- [x] gamma #archived',
    ].join('\n'))
    const t = timelineFor(vault, '2026-01-01')
    expect(t.tags).toEqual([{ tag: 'proj', count: 1 }])
    expect(t.days).toEqual([{ date: '2026-01-02', count: 1, total: 3 }])
  })

  it('honours the since bound', () => {
    writeFileSync(dayNote(root, '2026-01-02'), '- [ ] alpha')
    const t = timelineFor(vault, '2026-02-01')
    expect(t.days).toEqual([])
    expect(t.months).toEqual([])
    expect(t.years).toEqual([])
    expect(t.tags).toEqual([])
  })

  it('counts a TDLs-layout note too', () => {
    mkdirSync(join(root, '00 TDLs', '2026', '03'), { recursive: true })
    writeFileSync(join(root, '00 TDLs', '2026', '03', '2026-03-04.md'), ['- [ ] one', '- [x] two'].join('\n'))
    const t = timelineFor({ ...vault, tdlsDir: '00 TDLs' }, '2026-01-01')
    expect(t.days).toEqual([{ date: '2026-03-04', count: 1, total: 2 }])
    expect(t.months).toEqual([{ month: '2026-03', count: 1, total: 2 }])
    expect(t.years).toEqual([{ year: '2026', count: 1, total: 2 }])
  })

  it('defaults to the last five years', () => {
    const year = new Date().getFullYear()
    writeFileSync(dayNote(root, `${year}-06-01`), '- [ ] recent')
    const t = timelineFor(vault)
    expect(t.days.map((d) => d.date)).toEqual([`${year}-06-01`])
  })
})

describe('tasksInRange', () => {
  it('returns the notes of the range with their tasks', () => {
    writeFileSync(dayNote(root, '2026-01-02'), ['## Work', '- [ ] alpha'].join('\n'))
    writeFileSync(dayNote(root, '2026-01-03'), ['## Work', '- [x] beta'].join('\n'))
    const groups = tasksInRange(vault, '2026-01-02', '2026-01-03')
    expect(groups.map((g) => g.date)).toEqual(['2026-01-02', '2026-01-03'])
    expect(groups[0]!.file).toBe('20 Daily/2026-01-02.md')
    expect(groups[0]!.tasks).toEqual([
      { file: '20 Daily/2026-01-02.md', line: 2, done: false, version: expect.any(String), text: 'alpha', group: 'Work' },
    ])
    expect(groups[0]!.tasks[0]!.version).toHaveLength(64)
    expect(groups[1]!.tasks[0]!.done).toBe(true)
  })

  it('excludes notes outside the range', () => {
    writeFileSync(dayNote(root, '2026-01-01'), '- [ ] before')
    writeFileSync(dayNote(root, '2026-01-02'), '- [ ] inside')
    writeFileSync(dayNote(root, '2026-01-03'), '- [ ] after')
    const groups = tasksInRange(vault, '2026-01-02', '2026-01-02')
    expect(groups.map((g) => g.date)).toEqual(['2026-01-02'])
  })

  it('returns nothing when the range holds no note', () => {
    writeFileSync(dayNote(root, '2026-01-01'), '- [ ] a')
    expect(tasksInRange(vault, '2026-01-02', '2026-01-03')).toEqual([])
  })

  it('rejects a backwards range and a malformed date', () => {
    expect(() => tasksInRange(vault, '2026-01-03', '2026-01-02')).toThrow(/is after/)
    expect(() => tasksInRange(vault, '2026-1-2', '2026-01-03')).toThrow(/Invalid date/)
  })
})
