import type { Context } from '@deepseek-ai/cordis'
import { calendarCss } from './Calendar.tsx'

/**
 * Stylesheet for the task board.
 *
 * The visual language is a calm Reminders-like workspace: a quiet sidebar of
 * smart views on the right, a secondary date index, and one readable content
 * column on the left. Colour
 * is reserved for meaning (view identity, completion, warnings); chrome stays
 * on the host's theme tokens so light and dark are both native.
 *
 * The host's module loader has no CSS pipeline, so the plugin injects one
 * global `<style>` sheet stamped with the plugin id (evicted on unload). The
 * calendar sheet lives with its component and is appended below.
 */
export const PLUGIN_ID = 'dsh-obsidian-tasks'

/** Stylesheet name (for the style tag's data attribute). */
export const SHEET_NAME = 'board.css'

export const css = String.raw`
.ob-rem-page {
  --ob-accent: var(--dsw-alias-state-business-primary, #0a84ff);
  /* The two filled action icons (+ and the done check) use the same vivid
     blue as the Today smart-view icon (navItems[0].color in BoardPage.tsx),
     not the host's theme token, which can be a pale blue in dark mode. */
  --ob-today-accent: #0a84ff;
  /* Every quiet 1px divider in the board (header rule, vault row, sidebar
     seam, timeline guides, tag index) uses this one soft border colour. */
  --ob-border: color-mix(in srgb, var(--dsw-alias-border-l2, #e6e6e6) 65%, transparent);
  --ob-on-accent: var(--dsw-alias-label-on-color, #fff);
  --ob-content-max: 820px;
  --ob-mark: 20px;
  --ob-side-w: 248px;
  container-type: inline-size;
  position: relative;
  /* The browser column sits on the right: the main pane owns the first grid
     column and the sidebar the second, so the whole column (smart views and
     timeline together) flips without changing the component tree. */
  display: grid; grid-template-columns: minmax(0, 1fr) var(--ob-side-w);
  height: 100%; min-height: 0;
  color: var(--dsw-alias-label-primary, #1a1a1a);
  font: inherit; background: var(--dsw-alias-bg-base, #fff);
}
.ob-rem-page > .ob-rem-side { grid-column: 2; grid-row: 1; }
.ob-rem-page > .ob-rem-pane { grid-column: 1; grid-row: 1; }
.ob-rem-page-collapsed { grid-template-columns: minmax(0, 1fr) 56px; }

/* Drag handle between the pane and the right-hand browser column. It sits on
   the seam so it never steals width, and grows visually only while hovered or
   dragging. */
.ob-rem-resizer {
  position: absolute; top: 0; bottom: 0; z-index: 8;
  right: calc(var(--ob-side-w) - 3px); width: 7px;
  border: 0; padding: 0; background: transparent; cursor: col-resize;
  touch-action: none;
}
.ob-rem-resizer::after {
  content: ''; position: absolute; top: 0; bottom: 0; right: 3px; width: 1px;
  background: transparent; transition: background 0.12s ease;
}
.ob-rem-resizer:hover::after,
.ob-rem-resizer:focus-visible::after,
.ob-rem-resizer[data-dragging='true']::after {
  background: color-mix(in srgb, var(--ob-accent) 70%, transparent);
}
.ob-rem-resizer:focus-visible { outline: none; }
.ob-rem-page[data-resizing='true'] { cursor: col-resize; user-select: none; }

/* ── Right-hand browser ───────────────────────────────────────── */
.ob-rem-side {
  position: relative; isolation: isolate;
  display: flex; flex-direction: column; min-height: 0; gap: 2px;
  padding: 12px 10px; overflow: hidden;
  /* One surface: the browser column uses exactly the page container's flat
     base colour, so no gradient, glow or dot texture sets it apart. The
     left border is the only thing that separates it from the main pane. */
  background: var(--dsw-alias-bg-base, #fff);
  border-left: 1px solid var(--ob-border);
  box-sizing: border-box;
  box-shadow: none;
}
.ob-rem-vaultrow {
  display: flex; align-items: center; gap: 8px;
  margin: 0 1px 8px; padding: 2px 2px 10px;
  border-bottom: 1px solid var(--ob-border);
  min-height: 34px;
}
.ob-rem-vaultname {
  flex: 1; min-width: 0; font-size: 13px; font-weight: 650; letter-spacing: -0.01em;
  color: var(--dsw-alias-label-primary, #1a1a1a);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ob-rem-vaultselect {
  appearance: none; -webkit-appearance: none;
  flex: 1; min-width: 0; max-width: 100%;
  padding: 5px 22px 5px 9px;
  border: 1px solid transparent; border-radius: 8px;
  background-color: transparent;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2.5 4L5 6.5 7.5 4' fill='none' stroke='%23888b92' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 8px center; background-size: 10px 10px;
  color: var(--dsw-alias-label-primary, #1a1a1a);
  font: inherit; font-size: 12.5px; font-weight: 600; letter-spacing: -0.01em;
  cursor: pointer;
  transition: background-color 0.12s ease, border-color 0.12s ease;
}
.ob-rem-vaultselect:hover {
  background-color: var(--dsw-alias-bg-layer-3, #e8e8ee);
  border-color: color-mix(in srgb, var(--dsw-alias-border-l2, #e6e6e6) 55%, transparent);
}
.ob-rem-collapse {
  flex: none; width: 32px; height: 32px; border-radius: 9px; border: 0;
  background: transparent; color: var(--dsw-alias-label-tertiary, #999);
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
}
.ob-rem-collapse:hover:not(:disabled):not([aria-disabled='true']) { background: var(--dsw-alias-bg-layer-3, #e8e8ee); color: var(--dsw-alias-label-primary, #1a1a1a); }
.ob-rem-collapse:disabled, .ob-rem-collapse[aria-disabled='true'] { cursor: default; opacity: 0.55; }
/* The host's panel glyph ships at its own intrinsic size and ignores the
   size prop in some builds; clamp it to the 15px used by the nav/timeline
   glyphs so every icon in the column reads at the same scale. max-* also
   wins over an inline width set by the host component. */
.ob-rem-side .ob-rem-collapse svg {
  width: 15px; height: 15px; max-width: 15px; max-height: 15px; flex: none;
}
.ob-rem-collapse-flip svg { transform: scaleX(-1); }
/* With the sidebar on the right, the panel glyph must point the other way:
   the expanded state shows a right-hand panel, the collapsed rail a left one. */
.ob-rem-side .ob-rem-collapse:not(.ob-rem-collapse-flip) svg { transform: scaleX(-1); }
.ob-rem-side .ob-rem-collapse.ob-rem-collapse-flip svg { transform: none; }

/* Smart-view rows: colour identifies a view, it does not fill the row. */
.ob-rem-nav { display: flex; flex-direction: column; gap: 1px; }
.ob-rem-navrow {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 6px 7px; border: 0; border-radius: 8px;
  background: transparent; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary, #1a1a1a);
  text-align: left; cursor: pointer;
}
.ob-rem-navrow:hover { background: var(--dsw-alias-bg-layer-3, #e8e8ee); }
/* The active view is a soft fill only; no accent bar on the left edge. */
.ob-rem-navrow-active {
  background: color-mix(in srgb, var(--ob-nav-color, var(--ob-accent)) 12%, transparent);
}
.ob-rem-navrow-active:hover {
  background: color-mix(in srgb, var(--ob-nav-color, var(--ob-accent)) 22%, transparent);
}
.ob-rem-navicon {
  flex: none; width: 24px; height: 24px; border-radius: 7px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--ob-nav-color, var(--ob-accent));
  background: color-mix(in srgb, var(--ob-nav-color, var(--ob-accent)) 14%, transparent);
}
.ob-rem-navlabel { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ob-rem-navrow-active .ob-rem-navlabel { font-weight: 600; }
.ob-rem-navcount {
  flex: none; min-width: 18px; text-align: right;
  font-size: 11px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-tertiary, #999);
}
.ob-rem-navrow-active .ob-rem-navcount { color: var(--dsw-alias-label-secondary, #666); }

/* Icon rail (user-collapsed or narrow page). */
.ob-rem-rail { display: flex; flex-direction: column; align-items: center; gap: 7px; padding-top: 4px; }
.ob-rem-railbtn {
  width: 32px; height: 32px; border-radius: 9px; border: 0; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--ob-nav-color, var(--ob-accent));
  background: color-mix(in srgb, var(--ob-nav-color, var(--ob-accent)) 18%, transparent);
  cursor: pointer;
}
.ob-rem-railbtn:hover { filter: brightness(0.96); }
.ob-rem-railbtn-active { box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--dsw-alias-label-primary, #1a1a1a) 18%, transparent); }
.ob-rem-railbtn-add { background: var(--ob-today-accent); color: var(--ob-on-accent); margin-top: 4px; }
.ob-rem-railbtn-add:hover { background: color-mix(in srgb, var(--ob-today-accent) 86%, #000); }
.ob-rem-railhint {
  flex: none; width: 28px; height: 24px; margin: 6px 0 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 7px; font-size: 13px; line-height: 1;
  color: var(--dsw-alias-label-tertiary, #999);
  background: var(--dsw-alias-bg-layer-2, #f2f2f5);
  cursor: help;
}

/* ── Timeline (secondary browsing, visually quiet) ───────────── */
.ob-rem-sidehead { display: flex; align-items: center; gap: 5px; margin: 18px 2px 4px; padding: 0 8px; }
.ob-rem-tl-icon {
  flex: none; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center;
  color: var(--dsw-alias-label-secondary, #666);
}
.ob-rem-tl-label {
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--dsw-alias-label-tertiary, #999);
}
.ob-rem-tl {
  position: relative;
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  padding: 2px 2px 8px;
}
.ob-rem-tltree { position: relative; }
.ob-rem-tlgroup { margin-bottom: 1px; }
/* Each expanded period owns its guide. Its centre is directly below the dot.
   The horizontal branch runs from the guide to the dot column (28px). */
.ob-rem-tlchildren {
  margin-left: 15.5px; padding-left: 14.5px;
  border-left: 1px solid var(--ob-border);
}
.ob-rem-tlrow {
  position: relative;
  display: flex; align-items: center; gap: 2px;
  min-width: 0; padding: 4px 5px; border-radius: 6px;
}
.ob-rem-tlchildren > .ob-rem-tlgroup > .ob-rem-tlrow::before,
.ob-rem-tlchildren > .ob-rem-tlrow::before {
  content: ''; position: absolute; left: -15.5px; top: 50%; width: 28px;
  border-top: 1px solid var(--ob-border); pointer-events: none;
}
.ob-rem-tlrow-year { padding-top: 7px; padding-bottom: 7px; }
.ob-rem-tlrow-month { padding-top: 4px; padding-bottom: 4px; }
.ob-rem-tlrow-day { padding-top: 2px; padding-bottom: 2px; }
.ob-rem-tlrow:hover { background: var(--dsw-alias-bg-layer-3, #e8e8ee); }
.ob-rem-tlrow-active {
  background: color-mix(in srgb, var(--ob-accent) 11%, var(--dsw-alias-bg-layer-1, #fff));
}
.ob-rem-tlname {
  flex: 1; min-width: 0; border: 0; background: transparent; padding: 0; font: inherit;
  text-align: left; color: inherit; cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ob-rem-tlname:hover { text-decoration: underline; text-underline-offset: 2px; }
.ob-rem-tlname-year { font-size: 13px; font-weight: 650; letter-spacing: -0.01em; }
.ob-rem-tlname-month { font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-secondary, #666); }
.ob-rem-tlname-day { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #666); }
.ob-rem-tlrow-active .ob-rem-tlname { color: var(--dsw-alias-label-primary, #1a1a1a); font-weight: 600; }
.ob-rem-tlcount {
  flex: none; margin-left: auto; padding-left: 8px;
  font-size: 10.5px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-tertiary, #aaa);
}
.ob-rem-tlrow-active .ob-rem-tlcount { color: var(--dsw-alias-label-secondary, #666); }
/* Round disclosure buttons retain the original 22px target and keyboard focus.
   The dot itself is the node marker; filled means expanded, accent means selected. */
.ob-rem-tltoggle, .ob-rem-tldaymarker {
  flex: none; width: 22px; height: 22px; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
}
.ob-rem-tltoggle {
  border: 0; border-radius: 6px; background: transparent;
  color: var(--dsw-alias-label-secondary, #666); cursor: pointer;
}
.ob-rem-tltoggle:hover { background: var(--dsw-alias-bg-layer-3, #e8e8ee); color: var(--ob-accent); }
.ob-rem-tldot {
  box-sizing: border-box; width: 7px; height: 7px; border: 1px solid currentColor;
  border-radius: 50%; background: transparent; flex: none;
}
.ob-rem-tltoggle[aria-expanded='true'] .ob-rem-tldot { background: currentColor; }
.ob-rem-tldaymarker { color: var(--dsw-alias-label-tertiary, #999); }
.ob-rem-tldot-day { width: 6px; height: 6px; }
.ob-rem-tlrow:hover .ob-rem-tldaymarker { color: var(--ob-accent); }
.ob-rem-tlrow-active .ob-rem-tltoggle .ob-rem-tldot { border-color: var(--ob-accent); }
.ob-rem-tlrow-active .ob-rem-tltoggle[aria-expanded='true'] .ob-rem-tldot { background: var(--ob-accent); }
.ob-rem-tlrow-active .ob-rem-tldot-day {
  color: var(--ob-accent); background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ob-accent) 22%, transparent);
}
.ob-rem-tlempty { padding: 8px 4px; font-size: 11.5px; color: var(--dsw-alias-label-tertiary, #999); }
.ob-rem-tlerror { padding: 8px 6px; font-size: 11.5px; line-height: 1.5; color: var(--dsw-alias-label-secondary, #666); }

/* Tag index at the bottom of the timeline. */
.ob-rem-tags {
  position: relative; z-index: 2;
  margin-top: 12px; padding-top: 10px;
  border-top: 1px solid var(--ob-border);
  /* Inherit the browser column's surface instead of painting a solid block. */
  background: transparent;
}
.ob-rem-tagshead {
  padding: 0 4px 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--dsw-alias-label-tertiary, #999);
}
.ob-rem-tagrow {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 3px 5px; border: 0; border-radius: 6px; background: transparent;
  font: inherit; text-align: left; color: var(--dsw-alias-label-secondary, #666); cursor: pointer;
}
.ob-rem-tagrow:hover { background: var(--dsw-alias-bg-layer-3, #e8e8ee); }
.ob-rem-tagrow-active { background: color-mix(in srgb, var(--ob-accent) 12%, transparent); color: var(--ob-accent); }
.ob-rem-taghash { flex: none; font-size: 10.5px; color: var(--dsw-alias-label-tertiary, #aaa); }
.ob-rem-tagname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; }

/* ── Right pane ───────────────────────────────────────────────── */
.ob-rem-pane { min-height: 0; overflow-y: auto; background: var(--dsw-alias-bg-base, #fff); }
.ob-rem-content {
  width: 100%; max-width: var(--ob-content-max, 820px); margin: 0 auto;
  min-height: 100%; box-sizing: border-box;
  display: flex; flex-direction: column;
  padding: 30px 40px 56px;
}
.ob-rem-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 2px 2px 0; }
.ob-rem-titlewrap { min-width: 0; }
.ob-rem-eyebrow {
  margin-bottom: 3px;
  font-size: 10.5px; font-weight: 650; letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--dsw-alias-label-tertiary, #999);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ob-rem-bigtitle {
  margin: 0; font-size: 26px; line-height: 1.15; font-weight: 700; letter-spacing: -0.025em;
  color: var(--dsw-alias-label-primary, #1a1a1a);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ob-rem-headright { display: flex; align-items: baseline; gap: 5px; flex: none; }
.ob-rem-bigcount { font-size: 15px; font-weight: 650; letter-spacing: -0.01em; color: var(--dsw-alias-label-primary, #1a1a1a); font-variant-numeric: tabular-nums; }
.ob-rem-bigcountlabel { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #666); }

.ob-rem-subbar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
  margin: 9px 0 18px; padding-bottom: 14px;
  border-bottom: 1px solid var(--ob-border);
  font-size: 12px; color: var(--dsw-alias-label-secondary, #666);
}
.ob-rem-completed { color: var(--dsw-alias-label-tertiary, #999); }
.ob-rem-grow { flex: 1; }
.ob-rem-linkbtn {
  border: 0; background: transparent; color: var(--dsw-alias-label-tertiary, #999);
  font: inherit; font-size: 12px; cursor: pointer; padding: 0;
}
.ob-rem-linkbtn:hover { color: var(--dsw-alias-label-secondary, #666); text-decoration: underline; }
.ob-rem-tagfilter {
  display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid color-mix(in srgb, var(--ob-accent) 45%, transparent);
  background: color-mix(in srgb, var(--ob-accent) 8%, transparent); color: var(--ob-accent);
  border-radius: 999px; padding: 2px 8px; font: inherit; font-size: 11.5px; cursor: pointer;
}
.ob-rem-datectl { position: relative; }
.ob-rem-datepill {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #ddd); border-radius: 7px;
  padding: 3px 8px; font: inherit; font-size: 11.5px; white-space: nowrap;
  color: var(--dsw-alias-label-secondary, #666);
  background: var(--dsw-alias-bg-layer-1, #fff); cursor: pointer;
}
.ob-rem-datepill:hover { color: var(--dsw-alias-label-primary, #1a1a1a); border-color: var(--dsw-alias-label-tertiary, #b9b9c0); }
.ob-rem-calpop { position: absolute; top: calc(100% + 8px); right: 0; z-index: 20; }
.ob-rem-calpop-left { right: auto; left: 0; }
/* Keep the fixed-size calendar usable inside the smallest embedded panel. */
.ob-rem-calpop .ob-rem-cal { width: min(268px, calc(100cqw - 80px)); max-width: 268px; }

/* ── Add-task composer ────────────────────────────────────────── */
/* Sticky composer: the top padding is the breathing room it keeps once pinned. */
.ob-rem-addbar { position: sticky; top: 0; z-index: 4; padding: 16px 0 16px; background: var(--dsw-alias-bg-base, #fff); }
.ob-rem-addcard {
  display: flex; flex-direction: column; gap: 8px;
  padding: 12px 13px 10px; border: 0; border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.04);
  transition: box-shadow 0.12s ease;
}
/* Focus is expressed only by the input's bottom rule: the card has no border
   and no second ring around the composer. */
.ob-rem-addcard:focus-within { border: 0; box-shadow: 0 1px 3px rgb(0 0 0 / 0.04); }
.ob-rem-addbar-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ob-rem-addbtn {
  flex: none; width: 24px; height: 24px; border-radius: 50%; border: 0; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--ob-today-accent); color: var(--ob-on-accent); cursor: pointer;
}
.ob-rem-addbtn:hover { background: color-mix(in srgb, var(--ob-today-accent) 86%, #000); }
.ob-rem-addbtn:disabled { opacity: 0.45; cursor: default; }
.ob-rem-add-submit {
  flex: none; min-height: 30px; padding: 4px 12px; border: 0; border-radius: 7px;
  color: var(--ob-on-accent); background: var(--ob-accent); font: inherit; font-size: 11.5px; font-weight: 650;
  white-space: nowrap; cursor: pointer;
}
.ob-rem-add-submit:hover:not(:disabled) { background: color-mix(in srgb, var(--ob-accent) 86%, #000); }
.ob-rem-add-submit:disabled {
  color: var(--dsw-alias-label-secondary, #666); background: var(--dsw-alias-bg-layer-2, #f2f2f5);
  cursor: default;
}
.ob-rem-add-input {
  flex: 1; min-width: 0; border: 0; border-bottom: 1px solid transparent;
  padding: 2px 1px 3px; border-radius: 0;
  background: transparent; outline: none;
  color: var(--dsw-alias-label-primary, #1a1a1a); font: inherit; font-size: 13.5px;
  transition: border-bottom-color 0.12s ease;
}
.ob-rem-add-input:focus, .ob-rem-add-input:focus-visible {
  outline: none; border-bottom-color: var(--ob-accent);
}
.ob-rem-add-input::placeholder { color: var(--dsw-alias-label-tertiary, #aaa); }
.ob-rem-add-input:disabled { opacity: 0.6; }
.ob-rem-addtarget { position: relative; flex: none; display: flex; align-items: center; gap: 5px; }
/* Target menu: where a new task goes — Inbox, a relative day, or a picked date. */
.ob-rem-targetmenu {
  position: absolute; top: calc(100% + 8px); right: 0; z-index: 20;
  display: flex; flex-direction: column; gap: 1px; min-width: 168px;
  padding: 4px; border: 1px solid var(--dsw-alias-border-l2, #e6e6e6); border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  box-shadow: 0 10px 26px rgb(0 0 0 / 0.16);
}
.ob-rem-targetmenu-item {
  display: flex; align-items: center; gap: 7px; width: 100%;
  padding: 6px 8px; border: 0; border-radius: 7px;
  background: transparent; color: var(--dsw-alias-label-primary, #1a1a1a);
  font: inherit; font-size: 12.5px; text-align: left; cursor: pointer;
}
.ob-rem-targetmenu-item:hover { background: var(--dsw-alias-bg-layer-3, #e8e8ee); }
.ob-rem-targetmenu-item[aria-checked='true'] { color: var(--ob-accent); font-weight: 600; }
.ob-rem-targetmenu-item:disabled { color: var(--dsw-alias-label-tertiary, #999); cursor: not-allowed; }
.ob-rem-targetmenu-item:disabled:hover { background: transparent; }
.ob-rem-targetmenu-date { margin-top: 2px; padding-top: 7px; border-top: 1px solid var(--dsw-alias-border-l2, #e6e6e6); border-radius: 0 0 7px 7px; color: var(--dsw-alias-label-secondary, #666); }
.ob-rem-addtarget-label { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, #aaa); }
.ob-rem-datechip {
  display: inline-flex; align-items: center; gap: 4px;
  border: 0; border-radius: 6px; padding: 3px 6px;
  font: inherit; font-size: 11.5px; white-space: nowrap;
  color: var(--dsw-alias-label-secondary, #666);
  background: var(--dsw-alias-bg-layer-2, #f2f2f5); cursor: pointer;
}
.ob-rem-datechip:hover { color: var(--dsw-alias-label-primary, #1a1a1a); background: var(--dsw-alias-bg-layer-3, #e8e8ee); }
.ob-rem-datechip-other { color: var(--ob-accent); background: color-mix(in srgb, var(--ob-accent) 10%, transparent); }
.ob-rem-addhint {
  display: flex; align-items: center; gap: 7px; padding-left: 34px;
  font-size: 10.5px; color: var(--dsw-alias-label-tertiary, #aaa); min-width: 0;
}
.ob-rem-addhint-main { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ob-rem-addhint-new { flex: none; color: var(--dsw-alias-state-warning-primary, #c93400); font-weight: 550; }
.ob-rem-addhint-tip { flex: none; margin-left: auto; opacity: 0.8; }
.ob-rem-addhint-token {
  padding-left: 34px; font-size: 10.5px; line-height: 1.4;
  color: var(--dsw-alias-label-secondary, #666);
}

/* ── One-line status strip: replaces the old overdue / done cards ─ */
.ob-rem-statusbar {
  display: flex; align-items: center; gap: 9px; width: 100%;
  min-height: 36px; box-sizing: border-box;
  margin: 2px 0 10px; padding: 4px 10px;
  border: 0; border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #f8f8fa);
  font: inherit; text-align: left; color: inherit;
}
button.ob-rem-statusbar { cursor: pointer; }
.ob-rem-statusbar.ob-rem-statusbar-alert {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #ff3b30) 7%, var(--dsw-alias-bg-layer-1, #fff));
}
.ob-rem-statusbar.ob-rem-statusbar-ok {
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #34c759) 6%, var(--dsw-alias-bg-layer-1, #fff));
}
.ob-rem-statusbar-icon {
  flex: none; width: 24px; height: 24px; border-radius: 7px;
  display: inline-flex; align-items: center; justify-content: center;
}
.ob-rem-statusbar-alert .ob-rem-statusbar-icon {
  color: var(--dsw-alias-state-error-primary, #d70015);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #ff3b30) 12%, transparent);
}
.ob-rem-statusbar-ok .ob-rem-statusbar-icon {
  color: var(--dsw-alias-state-success-primary, #218c47);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #34c759) 12%, transparent);
}
.ob-rem-statusbar-copy { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; overflow: hidden; }
.ob-rem-statusbar-title {
  flex: 0 1 auto; min-width: 0; font-size: 12px; font-weight: 650;
  color: var(--dsw-alias-label-primary, #1a1a1a);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ob-rem-statusbar-hint {
  min-width: 0; font-size: 11px; color: var(--dsw-alias-label-secondary, #666);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ob-rem-statusbar-action {
  flex: none; margin-left: auto; padding: 2px 4px;
  border: 0; background: transparent; font: inherit; font-size: 11.5px; font-weight: 600;
  color: var(--ob-accent); cursor: pointer; white-space: nowrap;
}
.ob-rem-statusbar-action:hover { text-decoration: underline; }

/* Reusable retry control for the main error state and the timeline sidebar. */
.ob-rem-retry {
  display: inline-flex; align-items: center; justify-content: center;
  margin-top: 8px; padding: 4px 10px;
  border: 1px solid var(--dsw-alias-border-l2, #ddd); border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--ob-accent); font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer;
}
.ob-rem-retry:hover {
  border-color: var(--ob-accent);
  background: color-mix(in srgb, var(--ob-accent) 8%, var(--dsw-alias-bg-layer-1, #fff));
}

/* ── Task rows ────────────────────────────────────────────────── */
.ob-rem-rows { margin-top: 2px; }
.ob-rem-group { margin-bottom: 2px; }
.ob-rem-grouplabel {
  padding: 16px 2px 5px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--dsw-alias-label-tertiary, #999);
}
.ob-rem-trow {
  position: relative;
  display: flex; align-items: flex-start; gap: 11px;
  padding: 10px 42px 10px 6px;
  /* No row divider: the list reads as one quiet block. The inline editor
     still paints its own underline (inset shadow) as the caret line. */
  transition: background 0.1s ease;
}
/* Rows are static until edited: no hover fill, just the action affordances. */
.ob-rem-trow:hover { background: transparent; }
/* Rows with two trailing actions (carry + Inbox) reserve room so the inline
   editor's delete button never sits underneath them. */
.ob-rem-trow-two-meta { padding-right: 74px; }
/* While editing, the row keeps its quiet surface; the input's own inset
   underline is the only line that marks the caret. */
.ob-rem-trow-editing,
.ob-rem-trow-editing:hover,
.ob-rem-trow-editing:focus-within {
  background: transparent;
}
.ob-rem-check {
  flex: none; width: var(--ob-mark, 20px); height: var(--ob-mark, 20px); margin-top: 1px; border-radius: 50%;
  border: 1.5px solid var(--dsw-alias-label-tertiary, #b9b9c0); background: transparent;
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0;
  transition: background 0.12s, border-color 0.12s, opacity 0.12s;
}
.ob-rem-check:hover { border-color: var(--ob-today-accent); }
.ob-rem-check:disabled { opacity: 0.55; cursor: default; }
.ob-rem-check svg { opacity: 0; transition: opacity 0.1s; }
.ob-rem-check-done { background: var(--ob-today-accent); border-color: var(--ob-today-accent); }
.ob-rem-check-done svg { opacity: 1; }
.ob-rem-tbody { flex: 1; min-width: 0; }
.ob-rem-ttextline { display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 6px; }
.ob-rem-tedit {
  border: 0; background: transparent; padding: 0; margin: 0;
  font: inherit; font-size: 13.5px; line-height: 1.45; text-align: left;
  color: inherit; cursor: text; word-break: break-word;
}
.ob-rem-tedit:hover { text-decoration: underline; text-underline-offset: 2px; text-decoration-color: var(--dsw-alias-label-tertiary, #bbb); }
.ob-rem-trow-done .ob-rem-tedit {
  color: var(--dsw-alias-label-secondary, #666);
  text-decoration: line-through;
  text-decoration-color: var(--dsw-alias-label-tertiary, #aaa);
}
.ob-rem-tag {
  border: 0; border-radius: 999px; padding: 1px 6px;
  background: color-mix(in srgb, var(--ob-accent) 9%, transparent); color: var(--ob-accent);
  font: inherit; font-size: 10.5px; font-weight: 600; cursor: pointer;
}
.ob-rem-tag:hover { background: color-mix(in srgb, var(--ob-accent) 15%, transparent); text-decoration: none; }
.ob-rem-tmeta {
  position: absolute; top: 7px; right: 6px;
  display: flex; gap: 6px; margin: 0;
  opacity: 0.72; transition: opacity 0.1s ease;
}
.ob-rem-trow:hover .ob-rem-tmeta, .ob-rem-trow:focus-within .ob-rem-tmeta { opacity: 1; }
.ob-rem-chipwrap { position: relative; display: inline-flex; }
.ob-rem-chip {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  width: 26px; height: 26px; box-sizing: border-box;
  border: 0; border-radius: 6px; padding: 0; font: inherit; font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary, #999); background: transparent; cursor: pointer;
}
.ob-rem-chip:hover { color: var(--dsw-alias-label-secondary, #666); background: var(--dsw-alias-bg-layer-2, #f2f2f5); }
/* Top-align the input with the read-only text button: centring it inside the
   taller delete-button row nudged the text ~1px down on focus. */
.ob-rem-editrow { display: flex; align-items: flex-start; gap: 8px; }
.ob-rem-edit-input {
  flex: 1; min-width: 0; font: inherit; font-size: 13.5px; line-height: 1.45;
  /* Same box as .ob-rem-tedit: no padding and no real border. A border-bottom
     plus padding used to make the row 5px taller and nudge the text right, so
     the underline is painted as an inset shadow instead (zero layout cost). */
  padding: 0; border-radius: 0; background: transparent; border: 0;
  box-shadow: inset 0 -1px 0 var(--dsw-alias-label-tertiary, #b9b9c0);
  color: var(--dsw-alias-label-primary, #1a1a1a); outline: none;
}
.ob-rem-edit-input:focus { box-shadow: inset 0 -1px 0 var(--ob-today-accent); }
.ob-rem-editbtn {
  flex: none; width: 22px; height: 22px; border-radius: 6px; border: 0; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--dsw-alias-bg-layer-2, #f2f2f5);
  color: var(--dsw-alias-label-secondary, #666); cursor: pointer;
}
.ob-rem-editbtn:hover { background: var(--dsw-alias-bg-layer-3, #e8e8ee); color: var(--dsw-alias-label-primary, #1a1a1a); }
.ob-rem-editbtn-danger:hover {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #ff3b30) 14%, transparent);
  color: var(--dsw-alias-state-error-primary, #b91c1c);
}

/* Empty and loading states. */
.ob-rem-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  min-height: 220px; padding: 40px 16px; text-align: center;
  font-size: 12.5px; color: var(--dsw-alias-label-tertiary, #999);
}
.ob-rem-empty-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; margin-bottom: 2px; border-radius: 50%;
  background: var(--dsw-alias-bg-layer-2, #f2f2f5); color: var(--dsw-alias-label-tertiary, #aaa);
}
.ob-rem-empty-title { font-size: 13.5px; font-weight: 600; color: var(--dsw-alias-label-secondary, #666); }
.ob-rem-empty-hint { font-size: 11.5px; color: var(--dsw-alias-label-tertiary, #aaa); }
.ob-rem-empty-action {
  margin-top: 4px; border: 0; background: transparent; color: var(--ob-accent);
  font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; padding: 3px 6px; border-radius: 6px;
}
.ob-rem-empty-action:hover { background: color-mix(in srgb, var(--ob-accent) 8%, transparent); }

/* ── Toast: floats, never pushes the list around ───────────────── */
.ob-rem-toast {
  /* The main pane is on the left now, so the toast floats over that pane
     rather than over the right-hand browser column. */
  position: absolute; left: 20px; bottom: 18px; z-index: 40;
  display: flex; align-items: flex-start; gap: 8px;
  max-width: min(380px, calc(100% - 40px));
  padding: 9px 10px 9px 12px; border-radius: 9px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.16);
  font-size: 12px; line-height: 1.4;
}
.ob-rem-toast-text { flex: 1; min-width: 0; word-break: break-word; }
.ob-rem-toast-x {
  flex: none; border: 0; background: transparent; padding: 1px; cursor: pointer;
  color: inherit; opacity: 0.6; display: inline-flex; align-items: center;
}
.ob-rem-toast-x:hover { opacity: 1; }
.ob-rem-toast-ok {
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #34c759) 12%, var(--dsw-alias-bg-layer-1, #fff));
  color: var(--dsw-alias-state-success-primary, #146c2e);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary, #34c759) 24%, transparent);
}
.ob-rem-toast-error {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #ff3b30) 10%, var(--dsw-alias-bg-layer-1, #fff));
  color: var(--dsw-alias-state-error-primary, #a81712);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #ff3b30) 24%, transparent);
}

/* Keyboard focus is visible everywhere, even where the mouse chrome is quiet.
   One accent for every focusable control, in both themes. */
.ob-rem-navrow:focus-visible,
.ob-rem-railbtn:focus-visible,
.ob-rem-tlname:focus-visible,
.ob-rem-tltoggle:focus-visible,
.ob-rem-tagrow:focus-visible,
.ob-rem-datepill:focus-visible,
.ob-rem-targetmenu-item:focus-visible,
.ob-rem-datechip:focus-visible,
.ob-rem-addbtn:focus-visible,
.ob-rem-add-submit:focus-visible,
.ob-rem-collapse:focus-visible,
.ob-rem-linkbtn:focus-visible,
.ob-rem-tagfilter:focus-visible,
.ob-rem-empty-action:focus-visible,
.ob-rem-check:focus-visible,
.ob-rem-tedit:focus-visible,
.ob-rem-chip:focus-visible,
.ob-rem-tag:focus-visible,
.ob-rem-editbtn:focus-visible,
.ob-rem-toast-x:focus-visible,
.ob-rem-vaultselect:focus-visible,
.ob-rem-retry:focus-visible,
.ob-rem-statusbar:focus-visible,
.ob-rem-statusbar-action:focus-visible {
  outline: 2px solid var(--ob-accent); outline-offset: 1px;
}
.ob-rem-add-input:focus-visible { outline: none; border-bottom-color: var(--ob-accent); }

/* ── Respond to the embedded board, not the host window ───────── */
@container (max-width: 1100px) {
  .ob-rem-content { padding: 24px 28px 44px; }
}
@container (max-width: 760px) {
  .ob-rem-content { padding: 20px 18px 36px; }
  .ob-rem-bigtitle { font-size: 23px; }
  .ob-rem-addhint-tip { display: none; }
  .ob-rem-addtarget-label { display: none; }
  .ob-rem-subbar { gap: 8px; }
}
@container (max-width: 520px) {
  .ob-rem-content { padding: 16px 12px 32px; }
  .ob-rem-header { align-items: flex-start; }
  .ob-rem-eyebrow { white-space: normal; }
  .ob-rem-addbar-row { flex-wrap: wrap; }
  .ob-rem-add-input { flex: 1 1 calc(100% - 34px); }
  .ob-rem-addtarget { margin-left: 34px; }
  .ob-rem-addtarget .ob-rem-calpop { left: -46px; right: auto; }
  .ob-rem-addtarget .ob-rem-targetmenu { left: -46px; right: auto; }
  .ob-rem-add-submit { margin-left: auto; }
  .ob-rem-datepill { padding: 3px 6px; }
  .ob-rem-statusbar-hint { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .ob-rem-check svg, .ob-rem-addcard, .ob-rem-trow { transition: none; }
}

/* Theme is carried by the host --dsw-alias-* tokens and color-mix(); no
   prefers-color-scheme overrides, so the board always matches the host. */
` + calendarCss

/**
 * Mount the board stylesheet for exactly the owning plugin lifetime.
 * @param ctx - owning plugin context.
 */
export function installStyles(ctx: Context): void {
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = PLUGIN_ID
    tag.dataset.pluginCss = `${PLUGIN_ID}/${SHEET_NAME}`
    tag.textContent = css
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'obsidian-tasks: board stylesheet')
}
