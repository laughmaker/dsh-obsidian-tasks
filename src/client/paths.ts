/**
 * Vault-relative paths for the board's day notes.
 *
 * Mirrors the server's `defaultNoteForDate` (`src/board.ts`) so the page can
 * tell the user where a task will land — and so the pre-0.5 routes, which
 * require an explicit `file`, still receive a usable path.
 * @module dsh-obsidian-tasks/client/paths
 */
import type { VaultOption } from './api.ts'

/**
 * The Inbox file a vault uses for undated tasks.
 *
 * Mirrors the server's `inboxRelPath` (`src/board.ts`) so the composer can name
 * the destination even when an older Host does not report one.
 * @param option - the vault's layout options.
 * @returns the vault-relative path of the Inbox note.
 */
export function inboxRelPath(option: VaultOption | undefined): string {
  if (option?.inboxFile !== undefined && option.inboxFile !== '') return option.inboxFile
  if (option?.dailyDir !== undefined) return `${option.dailyDir}/Inbox.md`
  if (option?.tdlsDir !== undefined) return `${option.tdlsDir}/Inbox.md`
  return 'Inbox.md'
}

/**
 * The path a day note lives at when it has to be created.
 * @param date - `YYYY-MM-DD`.
 * @param option - the vault's layout options.
 * @returns the vault-relative path of the note.
 */
export function noteRelPath(date: string, option: VaultOption | undefined): string {
  if (option?.dailyDir !== undefined) return `${option.dailyDir}/${date}.md`
  if (option?.tdlsDir !== undefined) {
    return `${option.tdlsDir}/${date.slice(0, 4)}/${date.slice(0, 7)}/${date}/${date}.md`
  }
  return `${date}.md`
}
