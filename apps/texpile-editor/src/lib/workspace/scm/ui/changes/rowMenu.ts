// The look of the "…" menus on rows in Source Control, History and the Timeline, taken from the
// app's shared context menu (lib/menus/ContextMenuHost.svelte) so every menu in the workspace reads
// alike: a size-4 icon column (a spacer when an item has none), destructive items last, after a
// separator, in the error colour, and "…" only on items that ask for more input.

/** the menu's card, positioned by the caller */
export const MENU_CARD = 'bg-surface-50-950 border-surface-300-700 z-dropdown min-w-48 overflow-hidden card border py-1 text-sm shadow-lg';
/** one item; add MENU_DANGER for a destructive one */
export const MENU_ITEM =
	'hover:preset-tonal flex w-full items-center gap-2.5 px-3 py-1.5 text-left disabled:pointer-events-none disabled:opacity-40';
export const MENU_DANGER = 'text-error-ink';
/** an item's icon; a destructive item's icon keeps the item's colour */
export const MENU_ICON = 'text-muted size-4 shrink-0';
/** where an item with no icon keeps the column */
export const MENU_SPACER = 'size-4 shrink-0';
export const MENU_SEPARATOR = 'border-surface-200-800 my-1 border-t';
/** the "…" button that opens a row's menu */
export const MENU_TRIGGER = 'hover:preset-tonal rounded-base p-0.5';

/** A row's hover button takes no room until the row is hovered or has focus, as in VS Code: one
 *  that was only invisible kept its width and cut every row's text short by it. `shown` keeps it
 *  up while its menu is open. */
export function hoverAction(shown = false): string {
	return shown ? 'flex shrink-0' : 'hidden shrink-0 group-focus-within:flex group-hover:flex';
}
