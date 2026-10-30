// Texpile's menuStyles.ts: one look for every list the editor opens
export const menuPanelClass = 'card bg-surface-50-950 border-surface-200-800 border p-1 text-sm shadow-xl';
export const menuItemClass =
	'flex w-full cursor-pointer items-center gap-3 rounded-base px-2.5 py-1 text-left text-sm hover:preset-tonal data-[highlighted]:preset-tonal data-[disabled]:opacity-40 disabled:pointer-events-none disabled:opacity-40';
// no taller than the room the positioner found, and scrolling past that, so no item is ever out of reach
export const menuContentClass = `${menuPanelClass} z-[1200] flex max-h-[var(--available-height,100vh)] min-w-48 flex-col gap-0 overflow-y-auto`;
// a menu bar row is its label with the shortcut at the far end
export const menuBarItemClass = `${menuItemClass} justify-between`;
export const separatorClass = 'border-surface-200-800 my-1 border-t';
// the menu bar's own buttons
export const triggerClass = 'rounded-base px-2 py-1 text-xs hover:preset-tonal data-[disabled]:opacity-40';
