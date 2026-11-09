import { describe, expect, it } from 'vitest'
import { inboxRelPath, noteRelPath } from '../src/client/paths.ts'

describe('noteRelPath', () => {
  const date = '2026-11-05'

  it('uses the daily directory when configured', () => {
    expect(noteRelPath(date, { name: 'Daily', dailyDir: '20 Daily', tdlsDir: '00 TDLs' }))
      .toBe('20 Daily/2026-11-05.md')
  })

  it('matches the nested default TDL path when no daily directory exists', () => {
    expect(noteRelPath(date, { name: 'TDL', tdlsDir: '00 TDLs' }))
      .toBe('00 TDLs/2026/2026-11/2026-11-05/2026-11-05.md')
  })
})

describe('inboxRelPath', () => {
  it('sits beside the daily notes, matching the server default', () => {
    expect(inboxRelPath({ name: 'Daily', dailyDir: '20 Daily', tdlsDir: '00 TDLs' })).toBe('20 Daily/Inbox.md')
    expect(inboxRelPath({ name: 'TDL', tdlsDir: '00 TDLs' })).toBe('00 TDLs/Inbox.md')
    expect(inboxRelPath({ name: 'Bare' })).toBe('Inbox.md')
  })

  it('honours an explicit inboxFile from the selector', () => {
    expect(inboxRelPath({ name: 'Custom', dailyDir: '20 Daily', inboxFile: 'Notes/Someday.md' })).toBe('Notes/Someday.md')
  })
})
