/**
 * Vault configuration for dsh-obsidian-tasks.
 *
 * A single JSON file under the DSH home dir records which Obsidian vault the
 * tools operate on, how daily/TDL notes are laid out, and which directories are
 * off-limits. Everything defaults to the user's `Spark` PARA vault so the tools
 * work out of the box without any configuration step.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'

/** One configured vault and its task-note conventions. */
export interface VaultConfig {
  /** Stable short name used by tools to select this vault. */
  name: string
  /** Absolute path to the vault root. */
  path: string
  /** Directory (relative to the vault root) holding daily notes, if any. */
  dailyDir?: string
  /** Directory (relative to the vault root) holding the `00 TDLs` tree, if any. */
  tdlsDir?: string
  /** Vault-relative file holding undated "Inbox" tasks; defaults beside the daily notes. */
  inboxFile?: string
  /** Directories (relative, or absolute) the tools must never read or write. */
  exclude?: string[]
}

/** Whole-plugin configuration. */
export interface TasksConfig {
  /** Name of the vault used when a call omits `vault`. */
  defaultVault: string
  vaults: VaultConfig[]
}

/** Directories that are never touched, even if a vault does not list them. */
export const HARD_EXCLUDES = ['.obsidian', '.git', '.trash', 'node_modules', '21 Privates']

/** Location of the persisted configuration file. */
export function configPath(): string {
  return join(homedir(), '.dsh', 'obsidian-tasks', 'config.json')
}

/** Directory holding pre-write backups. */
export function backupDir(): string {
  return join(homedir(), '.dsh', 'obsidian-tasks', 'backups')
}

/**
 * Build the default configuration: the Spark vault as the sole, default vault.
 * @returns a config object pointing at the user's Spark PARA vault.
 */
export function defaultConfig(): TasksConfig {
  return {
    defaultVault: 'Spark',
    vaults: [
      {
        name: 'Spark',
        path: join(homedir(), 'Documents', 'Spark'),
        dailyDir: '20 Daily',
        tdlsDir: '00 TDLs',
        inboxFile: '20 Daily/Inbox.md',
        exclude: [...HARD_EXCLUDES],
      },
    ],
  }
}

/** Merge hard excludes into a loaded vault without duplicating entries. */
function withHardExcludes(vault: VaultConfig): VaultConfig {
  const merged = new Set([...(vault.exclude ?? []), ...HARD_EXCLUDES])
  return { ...vault, exclude: [...merged] }
}

/**
 * Read the configuration, falling back to {@link defaultConfig} and writing it
 * out on first use so the file exists for the user to edit.
 * @returns the effective configuration.
 */
export function loadConfig(): TasksConfig {
  const path = configPath()
  if (!existsSync(path)) {
    const seeded = defaultConfig()
    persistConfig(seeded)
    return seeded
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as TasksConfig
    if (!Array.isArray(parsed.vaults) || parsed.vaults.length === 0) {
      return defaultConfig()
    }
    const vaults = parsed.vaults.map(withHardExcludes)
    const defaultVault = vaults.some((v) => v.name === parsed.defaultVault)
      ? parsed.defaultVault
      : vaults[0].name
    return { defaultVault, vaults }
  } catch {
    return defaultConfig()
  }
}

/**
 * Persist a configuration to the config file.
 * @param config - configuration to write.
 */
export function persistConfig(config: TasksConfig): void {
  const path = configPath()
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf8')
}

/**
 * Resolve a vault by name, defaulting to the configured default vault.
 * @param config - the effective configuration.
 * @param name - optional vault name from a tool call.
 * @returns the matching vault.
 * @throws when the name is unknown.
 */
export function resolveVault(config: TasksConfig, name?: string): VaultConfig {
  const wanted = name ?? config.defaultVault
  const vault = config.vaults.find((v) => v.name === wanted)
  if (!vault) {
    throw new Error(
      `Unknown vault "${wanted}". Configured vaults: ${config.vaults.map((v) => v.name).join(', ')}`,
    )
  }
  return vault
}
