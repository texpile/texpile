// one look for every list Texpile opens: the menu bar, right-click menus, toolbar dropdowns, suggestion lists and a
// select's open list (app.css draws that one to match), so none of them can drift apart
export const menuPanelClass = 'card bg-surface-50-950 border-surface-200-800 border p-1 text-sm shadow-xl';
// no taller than the room the positioner found, and scrolling past that, so no item is ever out of reach
export const menuContentClass = `${menuPanelClass} z-[1200] flex max-h-[var(--available-height,100vh)] min-w-48 flex-col gap-0 overflow-y-auto`;
// data-highlighted is set by the pointer and the arrow keys alike
export const menuItemClass =
	'flex w-full cursor-pointer items-center gap-3 rounded-base px-2.5 py-1 text-left text-sm hover:preset-tonal data-[highlighted]:preset-tonal data-[disabled]:opacity-40 disabled:pointer-events-none disabled:opacity-40';
// a menu bar row is its label with the shortcut at the far end
export const menuBarItemClass = `${menuItemClass} justify-between`;
export const menuGroupLabelClass = 'text-muted px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wide uppercase';
export const separatorClass = 'border-surface-200-800 my-1 border-t';
// the menu bar's own buttons, and a toolbar dropdown that names what it picked
export const triggerClass = 'rounded-base px-2 py-1 text-xs hover:preset-tonal data-[disabled]:opacity-40';
export const labelTriggerClass =
	'text-surface-800-200 hover:bg-surface-200-800 flex h-7 items-center gap-1 rounded-base px-2 text-sm font-medium transition-colors';
