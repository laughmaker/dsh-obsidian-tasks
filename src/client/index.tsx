/**
 * dsh-obsidian-tasks browser half.
 *
 * Registers two things on the client: a sidebar panel entry (the icon that opens
 * the board) and the main-column keyed panel it selects. Everything else — the
 * reads and writes — goes through the Host routes in `api.ts`, so this half
 * carries no filesystem access and reloads with the plugin.
 * @module dsh-obsidian-tasks/client
 */
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { BoardPage, PANEL_ID } from './BoardPage.tsx'
import { installStyles } from './styles.ts'
import { LOCALE_NS, en, zh } from './locales.ts'

export { PANEL_ID } from './BoardPage.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy owned by the task board. */
    obsidianTasks: keyof typeof zh
  }
}

/** Services the sidebar entry and main panel need. */
export const inject = ['slots', 'locale']

/** The shape of an icon component from the primitives package. */
type IconComponent = (props: { size?: number; className?: string }) => ReactNode

/**
 * The checklist glyph for the sidebar entry.
 *
 * The primitives package ships two naming schemes for the same artwork: the
 * source tree exports size-suffixed names (`IconChecklistOutline14/16`) while
 * the built runtime table the host serves exposes the shipped size class
 * (`IconChecklistOutlineMedium/Regular`). Resolve whichever this build actually
 * carries — preferring the 16px `Regular` for the 18px sidebar slot — so the
 * entry never renders `undefined` (React #130) under either build.
 */
const iconTable = primitives as unknown as Record<string, IconComponent | undefined>
const ChecklistIcon: IconComponent =
  iconTable.IconChecklistOutlineRegular
  ?? iconTable.IconChecklistOutlineMedium
  ?? iconTable.IconChecklistOutline16
  ?? iconTable.IconChecklistOutline14
  ?? (() => null)

/**
 * The sidebar entry's glyph, drawn at the size the sidebar asks for.
 * @param props - the sidebar's icon share: the requested edge and whether selected.
 * @returns the icon element.
 */
export function TasksPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return <ChecklistIcon size={size} />
}

/**
 * Mount the board's sidebar entry and main panel.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  const t = ctx.locale.bind(LOCALE_NS)
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'obsidian-tasks: dictionaries')
  installStyles(ctx)

  // The board is a global panel: it belongs to the profile, not a Session, and
  // the sidebar entry selects it. `key` matches the sidebar entry `id`.
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: LOCALE_NS,
  }, BoardPage))

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 5,
    // The entry label follows the host's language, like the rest of the board.
    label: () => t('panel.label'),
    locale: LOCALE_NS,
  }, TasksPanelIcon))
}
