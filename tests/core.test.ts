import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertInsideVault,
  parseTasks,
  setTaskState,
  setTaskText,
  removeTask,
  extractTaskLine,
  renderTask,
  listMarkdownFiles,
} from '../src/vault.ts'
import type { VaultConfig } from '../src/config.ts'

let root: string
let vault: VaultConfig

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'obtest-'))
  vault = { name: 'T', path: root, dailyDir: '20 Daily', exclude: ['21 Privates', '.obsidian'] }
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('parseTasks', () => {
  it('finds tasks with correct line numbers and states', () => {
    const body = ['# Day', '', '- [ ] alpha', '  - [x] beta', '1. [X] gamma', 'not a task'].join('\n')
    const t = parseTasks(body)
    expect(t.map((x) => [x.line, x.done, x.text])).toEqual([
      [3, false, 'alpha'],
      [4, true, 'beta'],
      [5, true, 'gamma'],
    ])
  })
})

describe('setTaskState', () => {
  it('checks a line and leaves others intact', () => {
    const body = ['- [ ] a', '- [ ] b'].join('\n')
    const next = setTaskState(body, 2, true)
    expect(next.split('\n')).toEqual(['- [ ] a', '- [x] b'])
  })
  it('unchecks', () => {
    expect(setTaskState('- [x] a', 1, false)).toBe('- [ ] a')
  })
  it('rejects a non-task line', () => {
    expect(() => setTaskState('hello', 1, true)).toThrow()
  })
})

describe('setTaskText', () => {
  it('replaces only the text and keeps indent, marker and state', () => {
    const body = ['## Today', '  - [x] old text', '- [ ] other'].join('\n')
    const next = setTaskText(body, 2, 'new text')
    expect(next.split('\n')).toEqual(['## Today', '  - [x] new text', '- [ ] other'])
  })

  it('keeps a numbered marker and an unchecked box', () => {
    expect(setTaskText('1. [ ] alpha', 1, 'beta')).toBe('1. [ ] beta')
  })

  it('trims the new text', () => {
    expect(setTaskText('- [ ] alpha', 1, '  beta  ')).toBe('- [ ] beta')
  })

  it('rejects a non-task line', () => {
    expect(() => setTaskText('hello', 1, 'x')).toThrow('Line 1 is not a task checkbox')
  })

  it('rejects an out-of-range line', () => {
    expect(() => setTaskText('- [ ] a', 9, 'x')).toThrow('Line 9 is out of range')
  })
})

describe('removeTask', () => {
  it('removes only the target line', () => {
    const body = ['- [ ] keep', '- [ ] drop me', '- [ ] tail'].join('\n')
    expect(removeTask(body, 2).split('\n')).toEqual(['- [ ] keep', '- [ ] tail'])
  })

  it('rejects a non-task line', () => {
    expect(() => removeTask('hello', 1)).toThrow('Line 1 is not a task checkbox')
  })

  it('rejects an out-of-range line', () => {
    expect(() => removeTask('- [ ] a', 0)).toThrow('Line 0 is out of range')
  })
})

describe('extractTaskLine', () => {
  it('removes the line and returns the task text', () => {
    const body = ['- [ ] keep', '- [ ] move me', '- [ ] tail'].join('\n')
    const { body: next, task } = extractTaskLine(body, 2)
    expect(task.text).toBe('move me')
    expect(next.split('\n')).toEqual(['- [ ] keep', '- [ ] tail'])
  })
})

describe('renderTask', () => {
  it('renders with indent', () => {
    expect(renderTask('do it', '  ')).toBe('  - [ ] do it')
  })
})

describe('assertInsideVault', () => {
  it('accepts a path inside the vault', () => {
    expect(() => assertInsideVault(vault, join(root, '20 Daily', 'x.md'))).not.toThrow()
  })
  it('rejects traversal outside the root', () => {
    expect(() => assertInsideVault(vault, join(root, '..', 'evil.md'))).toThrow()
  })
  it('rejects excluded directories', () => {
    expect(() => assertInsideVault(vault, join(root, '21 Privates', 'secret.md'))).toThrow()
    expect(() => assertInsideVault(vault, join(root, '.obsidian', 'workspace.json'))).toThrow()
  })
})

describe('listMarkdownFiles', () => {
  it('walks md files and skips excluded dirs', () => {
    mkdirSync(join(root, '20 Daily'), { recursive: true })
    mkdirSync(join(root, '21 Privates'), { recursive: true })
    writeFileSync(join(root, '20 Daily', '2026-01-01.md'), '- [ ] a')
    writeFileSync(join(root, '21 Privates', 'p.md'), '- [ ] secret')
    const files = listMarkdownFiles(vault, root).map((f) => f.split('/').pop())
    expect(files).toEqual(['2026-01-01.md'])
  })
})
