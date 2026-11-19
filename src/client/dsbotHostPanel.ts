/**
 * DS Bot right-hand details panel: fold it through DS Bot's own action, and put
 * it back the way it was when the task board is left.
 *
 * DS Bot draws its conversation/group details as a native `<aside class="bt-panel">`
 * that pushes the DSH centre column right by its own width (320 px). Hiding that
 * node with CSS leaves both the node and the 320 px push in place, so the board
 * still stops short of the window edge — that is not a fold. DS Bot's real fold
 * is its own `closePanel()` action: it clears `ui.details`, the panel unmounts
 * (`Overlays` → `pane` becomes null), and `BotPanel`'s layout effect releases the
 * width with `chatRoom.setRight(null)`.
 *
 * DS Bot 0.3.8 registers an overlay whose injected face contains its actions
 * and `hooks.ui` state source. Use the slot registry to find that entry and
 * check its shape before calling this version-dependent host interface.
 *
 * Nothing is persisted: `ui` is an in-memory source, `closePanel()`/`showDetails()`
 * never touch storage, so a temporary fold cannot leak into the user's preferences.
 * @module dsh-obsidian-tasks/client/dsbotHostPanel
 */
/** The slot DS Bot registers its frame-wide overlays (and their face) into. */
const OVERLAY_SLOT = 'shell.overlay' as const

/** The panel state DS Bot keeps for its right-hand details drawer. */
export interface HostPanelState {
  /** Owner id of the open details panel, or null when the panel is closed. */
  details?: string | null
  /** Which tab the open panel shows: `details`, `browser` or `side`. */
  view?: string | null
  /** Browser/devtools tab inside the panel, when it carries one. */
  tab?: string | null
  /** Side chat inside the panel, for the `side` view. */
  side?: string | null
}

/** The subset of DS Bot's action surface this adapter drives. */
export interface HostPanelActions {
  /** DS Bot's own "fold the details panel" action — the panel's × button calls it. */
  closePanel?: () => void
  /** DS Bot's own "show details for this owner" action. */
  showDetails?: (id: string, tab?: string | null) => void
  /** Opens a side chat inside the panel, for restoring the `side` view. */
  openSideChat?: (id: string, chatId?: string | null) => void
  /** Switches the open panel's tab, for restoring the `browser` view. */
  setPanelView?: (view: string) => void
}

/** One entry's injected face, narrowed to what folding needs. */
export interface HostPanelFace {
  actions: HostPanelActions
  ui: {
    getSnapshot: () => HostPanelState
    subscribe?: (listener: () => void) => () => void
  }
}

/** The panel state captured on entry, so leaving can put it back exactly. */
interface HostPanelRestore {
  sessionId: string
  id: string
  view: string
  tab: string | null
  side: string | null
}

/** One registry entry, narrowed to the injected face this module reads. */
export interface HostSlotEntry {
  options: { id?: unknown }
  /** The registrant's business face; absent on entries that inject nothing. */
  inject?: ((...args: never[]) => Record<string, unknown>) | undefined
}

/**
 * The slot-registry read this adapter needs. Structural on purpose: the registry
 * type is only augmented inside the client program, and this module must also
 * typecheck where that augmentation is not loaded.
 */
export interface HostSlotSource {
  entries: (key: 'shell.overlay') => readonly HostSlotEntry[]
}

/** Client context carrying the slot registry. */
export interface SlotContext {
  slots?: HostSlotSource
  sessions?: {
    list: {
      getSnapshot: () => {
        byId?: Record<string, { id: string; retainedBy?: { mainView?: number } } | undefined>
      }
    }
  }
}

function currentSession(ctx: SlotContext | undefined): string | undefined {
  const sessions = ctx?.sessions?.list.getSnapshot().byId
  return Object.values(sessions ?? {}).find((session) => (session?.retainedBy?.mainView ?? 0) > 0)?.id
}

/** Bound context (set by the plugin's `apply`), so the page needs no plumbing. */
let bound: SlotContext | undefined

/** Nesting depth of board mounts; the outermost one owns the state transition. */
let depth = 0

/** What to restore when the last board mount goes away; null when nothing was open. */
let pending: HostPanelRestore | null = null

/**
 * Point the adapter at a client context. Called once per plugin lifetime; also
 * resets the mount bookkeeping, so a reloaded plugin starts from a clean slate.
 * @param ctx - client context carrying the slot registry.
 */
export function bindDsBotHost(ctx: SlotContext | undefined): void {
  bound = ctx
  depth = 0
  pending = null
}

/**
 * Read every `shell.overlay` entry's injected face and return the first one that
 * really is DS Bot's action surface.
 *
 * Entries are re-read on each call because registrations come and go with DS Bot's
 * own effects; `inject` runs with no arguments in the root scope, which is exactly
 * how the renderer calls it. Non-DS-Bot entries (the release banner registers here
 * too) inject other shapes and are skipped by the capability check. A throwing
 * inject is ignored: one bad entry must not disable the fold.
 * @returns DS Bot's face, or undefined when this shell has none.
 */
export function resolveDsBotFace(): HostPanelFace | undefined {
  const slots = bound?.slots
  if (!slots || typeof slots.entries !== 'function') return undefined
  let entries: readonly HostSlotEntry[]
  try {
    entries = slots.entries(OVERLAY_SLOT)
  } catch {
    return undefined
  }
  for (const entry of entries) {
    if (entry.options.id !== 'bot') continue
    if (typeof entry.inject !== 'function') continue
    let face: Record<string, unknown>
    try {
      face = entry.inject()
    } catch {
      continue
    }
    const candidate = face as { actions?: HostPanelActions; hooks?: { ui?: HostPanelFace['ui'] } } | null
    const actions = candidate?.actions
    const ui = candidate?.hooks?.ui
    if (typeof actions?.closePanel !== 'function') continue
    if (typeof ui?.getSnapshot !== 'function') continue
    if (typeof actions.showDetails !== 'function') continue
    return { actions, ui }
  }
  return undefined
}

/**
 * Fold DS Bot's details panel while the board is on screen and restore the state
 * it had on entry when the board goes away.
 *
 * Only a panel that is actually open is folded — a closed panel is left alone and
 * nothing is remembered, so leaving does not open a panel the user did not have.
 * The restore is skipped when the user opened some other panel in the meantime,
 * which keeps their own choice theirs.
 *
 * Overlapping mounts share one transition (depth counting): React re-mounts a panel
 * without unmounting in between, and that must not fold twice or restore early.
 * @returns a disposer that undoes this mount's share; safe to call more than once.
 */
export function foldDsBotPanelForBoard(): () => void {
  const face = resolveDsBotFace()
  if (!face) return () => {}

  const ctx = bound
  depth += 1
  if (depth === 1) {
    const state = face.ui.getSnapshot()
    const id = typeof state?.details === 'string' && state.details !== '' ? state.details : null
    const sessionId = currentSession(ctx)
    if (id !== null && sessionId !== undefined) {
      pending = {
        sessionId,
        id,
        view: typeof state.view === 'string' && state.view !== '' ? state.view : 'details',
        tab: typeof state.tab === 'string' ? state.tab : null,
        side: typeof state.side === 'string' ? state.side : null,
      }
      face.actions.closePanel?.()
    } else {
      pending = null
    }
  }

  let released = false
  return () => {
    if (released) return
    released = true
    depth = Math.max(0, depth - 1)
    if (depth > 0) return
    const restore = pending
    pending = null
    if (restore === null) return
    if (currentSession(ctx) === restore.sessionId) restoreDsBotPanel(restore)
  }
}

/**
 * Put DS Bot's panel back where it was on entry.
 *
 * Re-resolved and re-read at restore time, so the panel is only reopened while it
 * is still closed: anything the user opened while the board was up stays theirs.
 * @param restore - the state captured on entry.
 */
function restoreDsBotPanel(restore: HostPanelRestore): void {
  const face = resolveDsBotFace()
  if (!face) return
  const state = face.ui.getSnapshot()
  if (!state || (state.details ?? null) !== null) return
  const actions = face.actions
  actions.showDetails?.(restore.id, restore.tab)
  if (restore.view === 'side') actions.openSideChat?.(restore.id, restore.side)
  else if (restore.view === 'browser') actions.setPanelView?.('browser')
}
