/**
 * DS Bot bottom-bar adapter.
 *
 * DS Bot does not surface the generic DSH sidebar: it renders its own native
 * left column (`.bt-leftcol`) whose footer (`.bt-leftcol-foot`) ends with the
 * built-in "Plugins" button (`button.bt-account[aria-label="Plugins"]`). There
 * is no third-party slot in that footer, so we mount our own self-cleaning
 * button immediately after Plugins — the user's "右 of Plugin" position.
 *
 * Outside DS Bot (a plain dsh-web shell) there is no `.bt-leftcol-foot`, so this
 * is a no-op and the sidebar `sidebar.panellist` entry is used instead. If the
 * DS Bot footer or its anchor cannot be found we also do nothing, which leaves
 * the supported Plugins → Tasks list as the fallback path.
 *
 * The button is our own DOM, not DS Bot's: it is created here, carries a stable
 * marker for de-duplication, and is removed again on dispose.
 * @module dsh-obsidian-tasks/client/dsbotFooter
 */
import type { Context } from '@deepseek-ai/cordis'
import { PANEL_ID } from './BoardPage.tsx'

/** Marker that identifies the button this module owns inside the DS Bot foot. */
export const DSBOT_FOOT_ATTR = 'data-dsh-obsidian-tasks-foot'

/** The host sprite symbol used by the DSH checklist icon. */
const ICON_HREF = '#dsw-icon-checklist-outline-regular'

/** Bind the localized footer label (the host's translator, narrowed to our key). */
type Translate = (key: 'footer.open') => string

/** The anchored selector for DS Bot's built-in Plugins footer button. */
export const DSBOT_ANCHOR_SELECTOR = 'button.bt-account[aria-label="Plugins"], button.bt-account[title="Plugins"]'

/**
 * Whether the current document is the DS Bot shell (it renders `.bt-leftcol`).
 * In a plain dsh-web shell this is false, so the generic footer action is used.
 * @param doc - the document to inspect.
 * @returns true when DS Bot's native left column is present.
 */
export function dsBotHostActive(doc: Document | undefined): boolean {
  return !!doc && typeof doc.querySelector === 'function' && !!doc.querySelector('.bt-leftcol, .bt-leftcol-foot')
}

/**
 * Build our footer button. Mirrors DS Bot's own `button.bt-account` shape
 * (a `.bt-you` span holding a 15px glyph) so it reads as native chrome, and
 * keeps the localized `aria-label`/`title` for accessibility.
 * @param doc - the document that owns the element.
 * @param t - locale translator.
 * @param onOpen - click handler that opens the board.
 * @returns the button element.
 */
export function createDsBotFooterButton(doc: Document, t: Translate, onOpen: () => void): HTMLButtonElement {
  const button = doc.createElement('button')
  button.type = 'button'
  button.className = 'bt-account'
  button.setAttribute(DSBOT_FOOT_ATTR, '')
  button.setAttribute('aria-label', t('footer.open'))
  button.title = t('footer.open')
  button.addEventListener('click', onOpen)

  const span = doc.createElement('span')
  span.className = 'bt-you'
  span.setAttribute('aria-hidden', 'true')

  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.5')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('data-icon', 'dsw-icon-checklist-outline-regular')

  const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', ICON_HREF)
  svg.appendChild(use)
  span.appendChild(svg)
  button.appendChild(span)
  return button
}

/**
 * One reconciliation pass: ensure exactly one owned button sits right after the
 * Plugins anchor. Idempotent — a correct layout is left untouched so re-renders
 * do not churn focus; stray copies are removed.
 * @param doc - the document to reconcile.
 * @param t - locale translator.
 * @param onOpen - click handler that opens the board.
 */
export function syncDsBotFooter(doc: Document, t: Translate, onOpen: () => void): void {
  const foot = doc.querySelector<HTMLElement>('.bt-leftcol-foot')
  if (!foot) return
  const anchor = foot.querySelector<HTMLElement>(DSBOT_ANCHOR_SELECTOR)
  if (!anchor) return

  const owned = Array.from(foot.querySelectorAll<HTMLElement>(`[${DSBOT_FOOT_ATTR}]`))
  // Already correct: a single owned button directly after the anchor.
  if (owned.length === 1 && anchor.nextElementSibling === owned[0]) return

  for (const stale of owned) stale.remove()
  anchor.insertAdjacentElement('afterend', createDsBotFooterButton(doc, t, onOpen))
}

/**
 * Install the DS Bot footer button for one plugin lifetime.
 *
 * Reconciles on the next microtask and whenever the DOM changes, so a DS Bot
 * re-render that recreates the footer is handled without duplicates. Returns a
 * disposer that removes every owned button and stops observing; it is safe to
 * call more than once.
 * @param ctx - client context (needs `layout.selectPanel`).
 * @param t - locale translator.
 * @returns a cleanup function.
 */
export function installDsBotFooter(ctx: Context, t: Translate): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}

  const doc = document
  // Without a layout service the button could not open the board; leave the
  // supported Plugins → Tasks fallback in place instead.
  const layout = (ctx as unknown as { layout?: { selectPanel?: (id: string) => void } }).layout
  if (!layout || typeof layout.selectPanel !== 'function') return () => {}

  const open = (): void => {
    try { layout.selectPanel?.(PANEL_ID) } catch { /* Plugins → Tasks stays the fallback */ }
  }

  let disposed = false
  let scheduled = false
  let syncing = false

  const run = (): void => {
    scheduled = false
    if (disposed || syncing) return
    syncing = true
    try { syncDsBotFooter(doc, t, open) } finally { syncing = false }
  }
  const schedule = (): void => {
    if (disposed || scheduled) return
    scheduled = true
    Promise.resolve().then(run)
  }

  run()
  const observer = new MutationObserver(schedule)
  observer.observe(doc.body, { childList: true, subtree: true })

  return () => {
    disposed = true
    observer.disconnect()
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>(`[${DSBOT_FOOT_ATTR}]`))) el.remove()
  }
}
