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
import { dsBotHostActive, installDsBotFooter } from './dsbotFooter.ts'
import { bindDsBotHost } from './dsbotHostPanel.ts'
import { LOCALE_NS, en, zh } from './locales.ts'

export { PANEL_ID } from './BoardPage.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy owned by the task board. */
    obsidianTasks: keyof typeof zh
  }
}

/** Services the sidebar entry, footer shortcut and main panel need. */
export const inject = ['slots', 'locale', 'layout', 'sessions']

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

  // DS Bot keeps its conversation/group details in its own right-hand drawer, which
  // pushes the centre column aside. The board folds that drawer through DS Bot's own
  // action surface, which the host hands out on its `shell.overlay` slot entries — so
  // the adapter needs this context to reach the slot registry. Bound for the plugin's
  // lifetime; in a plain dsh-web shell no such entry exists and every call no-ops.
  ctx.effect(() => {
    bindDsBotHost(ctx)
    return () => { bindDsBotHost(undefined) }
  }, 'obsidian-tasks: dsbot-host-panel')

  // DS Bot renders its own native left column and hides the DSH sidebar, so the
  // generic footer action below would be invisible there. Mount a dedicated,
  // self-cleaning button right after DS Bot's built-in Plugins footer button.
  // In a plain dsh-web shell this is a no-op and the footer action is used.
  ctx.effect(() => installDsBotFooter(ctx, t), 'obsidian-tasks: dsbot-foot')

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

  // A compact shortcut at the sidebar foot, immediately to the right of the
  // built-in Plugin button (`sidebar.footer.action` is a list ordered ascending;
  // the Plugin entry defaults to order 0, so order 10 lands after it). Clicking
  // it selects the board's main panel — the same call a sidebar row makes.
  //
  // This is the generic dsh-web path only. In DS Bot the sidebar is hidden and a
  // native footer button is mounted instead (see `installDsBotFooter`), so skip
  // rendering here to avoid a hidden or duplicate entry.
  const TasksFooterAction = ({ wide }: PropsRuntime<'sidebar.footer.action'>): ReactNode => {
    if (dsBotHostActive(typeof document === 'undefined' ? undefined : document)) return null
    return (
      <div className={'ob-foot-root'} data-rail={wide ? undefined : 'true'}>
        <button
          type={'button'}
          className={'ob-foot-badge'}
          title={t('footer.open')}
          aria-label={t('footer.open')}
          onClick={() => { ctx.layout.selectPanel(PANEL_ID) }}
        >
          <ChecklistIcon size={wide ? 16 : 18} />
          {wide && <span className={'ob-foot-label'}>{t('panel.label')}</span>}
        </button>
      </div>
    )
  }

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'obsidian-tasks',
    order: 10,
    label: () => t('footer.open'),
    locale: LOCALE_NS,
  }, TasksFooterAction))
}
