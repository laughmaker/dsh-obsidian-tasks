/**
 * Node entry for dsh-obsidian-tasks.
 *
 * Composes the two host halves: the six model-facing tools (`tools.ts`) and the
 * HTTP routes that back the graphical board (`routes.ts`). Both drive the same
 * `board.ts` vault operations, so the board and the model can never drift.
 * @module dsh-obsidian-tasks
 */
import type { Context } from '@deepseek-ai/cordis'
import * as tools from './tools.ts'
import * as routes from './routes.ts'

/** Plugin name registered with the Loader. */
export const name = tools.name

/**
 * Host services the plugin consumes. `tools` is always present; `webServer` and
 * `connection` gate the board routes and are injected lazily, so the plugin
 * still loads (tools only) in a host without the web server.
 */
export const inject = ['tools']

/**
 * Mount the tools and the board routes on a Cordis context.
 * @param ctx - host context.
 */
export function apply(ctx: Context): void {
  tools.apply(ctx)
  routes.apply(ctx)
}
