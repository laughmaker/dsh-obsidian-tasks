import { describe, expect, it } from 'vitest'
import { parseScheduleToken, shiftDate } from '../src/client/schedule.ts'

describe('shiftDate', () => {
  it('moves a day forward and backward', () => {
    expect(shiftDate('2026-11-05', 1)).toBe('2026-11-06')
    expect(shiftDate('2026-11-05', -1)).toBe('2026-11-04')
  })

  it('rolls over month and year boundaries', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('parseScheduleToken', () => {
  const today = '2026-11-05'

  it('rejects empty input', () => {
    expect(parseScheduleToken('   ', today)).toBeUndefined()
  })

  it('keeps plain text untouched', () => {
    expect(parseScheduleToken('  买菜  ', today)).toEqual({ text: '买菜' })
  })

  it('leaves ordinary words such as 今天 alone', () => {
    expect(parseScheduleToken('看今天新闻', today)).toEqual({ text: '看今天新闻' })
  })

  it('consumes @明天 and schedules the next day', () => {
    expect(parseScheduleToken('交房租 @明天', today)).toEqual({ text: '交房租', date: '2026-11-06' })
  })

  it('consumes @后天 and schedules two days ahead', () => {
    expect(parseScheduleToken('@后天 体检', today)).toEqual({ text: '体检', date: '2026-11-07' })
  })

  it('consumes @今天 and keeps the day', () => {
    expect(parseScheduleToken('买菜 @今天', today)).toEqual({ text: '买菜', date: '2026-11-05' })
  })

  it('understands the English tokens', () => {
    expect(parseScheduleToken('pay rent @tomorrow', today)).toEqual({ text: 'pay rent', date: '2026-11-06' })
    expect(parseScheduleToken('call @today', today)).toEqual({ text: 'call', date: '2026-11-05' })
  })

  it('keeps the text when the token is all there is', () => {
    expect(parseScheduleToken('@明天', today)).toEqual({ text: '@明天', date: '2026-11-06' })
  })
})
