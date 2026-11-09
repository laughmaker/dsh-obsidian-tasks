/**
 * Obsidian task-management tools for DeepSeek Harness.
 *
 * Six model-facing tools over a configured Obsidian vault: list and search
 * tasks, add a task to a day's note, check or uncheck one, carry unfinished
 * work to another day, append to a note, and inspect or change the vault
 * configuration. Every write is path-guarded, backed up, and minimal — only the
 * affected line changes. The vault operations themselves live in `board.ts` so
 * the browser board's routes share them.
 * @module dsh-obsidian-tasks
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { loadConfig, persistConfig, resolveVault } from './config.ts'
import {
  addTask,
  addInboxTask,
  assertDate,
  boardContext,
  collectTasks,
  inboxTasks,
  isoDate,
  moveTask,
  moveTaskToInbox,
  noteForDate,
  tasksOfNote,
  toggleTask,
  appendNote,
} from './board.ts'

/** Plugin name registered with the Loader. */
export const name = 'obsidian-tasks'

/** Host services this plugin consumes. */
export const inject = ['tools']

/**
 * Mount the Obsidian task tools on a Cordis context.
 * @param ctx - host context providing the tools registry.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(
    defineTool({
      name: 'ob_task_list',
      description:
        'List Markdown checkbox tasks (["- [ ] ...") from an Obsidian vault. Filter by vault, a specific date note, a directory subtree, the undated Inbox file (inbox: true), completion state, or tag. Returns each task with its file, line number, state, and text.',
      parameters: {
        vault: { type: 'string', description: 'Vault name; defaults to the configured default vault' },
        date: { type: 'string', description: 'Only tasks in the note for this YYYY-MM-DD' },
        dir: { type: 'string', description: 'Only tasks under this vault-relative directory, e.g. "20 Daily"' },
        inbox: { type: 'boolean', description: 'Only undated tasks in the vault Inbox file' },
        status: {
          type: 'string',
          enum: ['all', 'open', 'done'],
          description: 'Filter by completion state; defaults to all',
        },
        tag: { type: 'string', description: 'Only tasks whose text contains this tag (without #)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            vault: { type: 'string', required: true },
            count: { type: 'integer', required: true },
            tasks: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  file: { type: 'string', required: true },
                  line: { type: 'integer', required: true },
                  done: { type: 'boolean', required: true },
                  text: { type: 'string', required: true },
                },
              },
            },
          },
        },
        render: (_args, v) => [
          {
            type: 'text',
            text: v.count === 0
              ? `No tasks found in vault "${v.vault}".`
              : `${v.count} task(s) in vault "${v.vault}":\n` +
                v.tasks
                  .map((t) => `${t.done ? '[x]' : '[ ]'} ${t.file}:${t.line}  ${t.text}`)
                  .join('\n'),
          },
        ],
      },
      async execute(args) {
        const { vault } = boardContext(args.vault)
        let tasks
        if (args.inbox === true) {
          tasks = inboxTasks(vault)
        } else if (args.date) {
          const abs = noteForDate(vault, assertDate(args.date))
          tasks = abs ? tasksOfNote(vault, abs) : []
        } else {
          tasks = collectTasks(vault, args.dir)
        }
        const status = args.status ?? 'all'
        tasks = tasks.filter((t) => (status === 'all' ? true : status === 'open' ? !t.done : t.done))
        if (args.tag) tasks = tasks.filter((t) => t.tag === args.tag || t.text.includes(`#${args.tag}`))
        return {
          vault: vault.name,
          count: tasks.length,
          tasks: tasks.map((t) => ({ file: t.file, line: t.line, done: t.done, text: t.text })),
        }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'ob_task_add',
      description:
        'Add a new open task to an Obsidian daily or TDL note for a date, creating the note from the daily template when it does not exist. Pass inbox: true to store an undated task in the vault Inbox file instead. Optionally nest it under a "## Heading".',
      parameters: {
        text: { type: 'string', required: true, description: 'Task text (without the checkbox)' },
        date: { type: 'string', description: 'YYYY-MM-DD; defaults to today (ignored when inbox is true)' },
        inbox: { type: 'boolean', description: 'Add to the undated Inbox file instead of a dated note' },
        vault: { type: 'string', description: 'Vault name; defaults to the configured default vault' },
        heading: { type: 'string', description: 'Optional "## Heading" to file the task under' },
        indent: { type: 'string', description: 'Leading whitespace for nesting, e.g. "  "' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            file: { type: 'string', required: true },
            line: { type: 'integer', required: true },
            created: { type: 'boolean', required: true },
            backup: { type: 'string' },
          },
        },
        render: (_args, v) => [
          { type: 'text', text: `${v.created ? 'Created note and added' : 'Added'} task at ${v.file}:${v.line}.` },
        ],
      },
      async execute(args) {
        const { vault } = boardContext(args.vault)
        if (args.inbox === true) return addInboxTask(vault, args.text, args.heading, args.indent ?? '')
        const date = assertDate(args.date ?? isoDate())
        return addTask(vault, date, args.text, args.heading, args.indent ?? '')
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'ob_task_done',
      description:
        'Check or uncheck one task in an Obsidian note, located by its file (vault-relative) and line number. Only that line changes.',
      parameters: {
        file: { type: 'string', required: true, description: 'Vault-relative path, e.g. "20 Daily/2026-10-12.md"' },
        line: { type: 'number', required: true, description: '1-based line number from ob_task_list' },
        done: { type: 'boolean', description: 'true to check, false to uncheck; defaults to true' },
        vault: { type: 'string', description: 'Vault name; defaults to the configured default vault' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            file: { type: 'string', required: true },
            line: { type: 'integer', required: true },
            done: { type: 'boolean', required: true },
            backup: { type: 'string' },
          },
        },
        render: (_args, v) => [
          { type: 'text', text: `Marked ${v.file}:${v.line} as ${v.done ? 'DONE' : 'OPEN'}.` },
        ],
      },
      async execute(args) {
        const { vault } = boardContext(args.vault)
        return toggleTask(vault, args.file, Math.trunc(args.line), args.done ?? true)
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'ob_task_move',
      description:
        'Carry an unfinished task from one note to another day: removes it from the source line and appends the same text to the target date note (creating it if needed). Pass toInbox: true to unschedule a dated task back into the Inbox file.',
      parameters: {
        file: { type: 'string', required: true, description: 'Source vault-relative path' },
        line: { type: 'number', required: true, description: '1-based source line number' },
        toDate: { type: 'string', description: 'Target YYYY-MM-DD (required unless toInbox is true)' },
        toInbox: { type: 'boolean', description: 'Move the task into the undated Inbox file' },
        vault: { type: 'string', description: 'Vault name; defaults to the configured default vault' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            from: { type: 'string', required: true },
            to: { type: 'string', required: true },
            text: { type: 'string', required: true },
            backup: { type: 'string' },
          },
        },
        render: (_args, v) => [{ type: 'text', text: `Moved "${v.text}" from ${v.from} to ${v.to}.` }],
      },
      async execute(args) {
        const { vault } = boardContext(args.vault)
        if (args.toInbox === true) return moveTaskToInbox(vault, args.file, Math.trunc(args.line))
        if (args.toDate === undefined) throw new Error('"toDate" is required unless toInbox is true')
        return moveTask(vault, args.file, Math.trunc(args.line), args.toDate)
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'ob_note_append',
      description: 'Append Markdown text to the end of an existing note in the vault (for logs, reviews, or notes). Path is vault-relative.',
      parameters: {
        file: { type: 'string', required: true, description: 'Vault-relative path, e.g. "20 Daily/2026-10-12.md"' },
        content: { type: 'string', required: true, description: 'Markdown text to append' },
        vault: { type: 'string', description: 'Vault name; defaults to the configured default vault' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            file: { type: 'string', required: true },
            backup: { type: 'string' },
          },
        },
        render: (_args, v) => [{ type: 'text', text: `Appended to ${v.file}.` }],
      },
      async execute(args) {
        const { vault } = boardContext(args.vault)
        return appendNote(vault, args.file, args.content)
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'ob_vault_config',
      description:
        'Show the current Obsidian vault configuration (default vault, vaults, daily/TDL dirs, excludes), or set the default vault by name. Edits persist to ~/.dsh/obsidian-tasks/config.json.',
      parameters: {
        setDefault: { type: 'string', description: 'Vault name to make the default' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            defaultVault: { type: 'string', required: true },
            vaults: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string', required: true },
                  path: { type: 'string', required: true },
                  dailyDir: { type: 'string' },
                  tdlsDir: { type: 'string' },
                },
              },
            },
            configFile: { type: 'string', required: true },
          },
        },
        render: (_args, v) => [
          {
            type: 'text',
            text:
              `Default vault: ${v.defaultVault}\n` +
              v.vaults
                .map((x) => `- ${x.name}: ${x.path}${x.dailyDir ? ` (daily: ${x.dailyDir})` : ''}${x.tdlsDir ? ` (TDLs: ${x.tdlsDir})` : ''}`)
                .join('\n') +
              `\nConfig: ${v.configFile}`,
          },
        ],
      },
      async execute(args) {
        const config = loadConfig()
        if (args.setDefault) {
          resolveVault(config, args.setDefault) // throws if unknown
          config.defaultVault = args.setDefault
          persistConfig(config)
        }
        return {
          defaultVault: config.defaultVault,
          vaults: config.vaults.map((x) => ({
            name: x.name,
            path: x.path,
            ...(x.dailyDir ? { dailyDir: x.dailyDir } : {}),
            ...(x.tdlsDir ? { tdlsDir: x.tdlsDir } : {}),
          })),
          configFile: `${process.env.HOME}/.dsh/obsidian-tasks/config.json`,
        }
      },
    }),
  )
}
