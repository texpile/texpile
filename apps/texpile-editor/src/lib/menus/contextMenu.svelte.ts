// The one context menu in the app. A caller describes its items and where the pointer was;
// this shows them through the OS on macOS and through ContextMenuHost everywhere else
// (lib/platformSurfaces.ts), and runs whichever item was chosen.
import { activeWindow } from '$lib/childWindows/childWindowRegistry.svelte';
import type { Component } from 'svelte';
import { box } from '$lib/runes/box.svelte';
import { nativeBridge } from '$lib/workspace/fileSystem';
import { nativeContextMenus } from '$lib/platformSurfaces';

export type ContextMenuItem =
	| { separator: true }
	| {
			label: string;
			onclick?: () => void;
			/** items shown beside this one, which then runs nothing itself */
			submenu?: ContextMenuItem[];
			icon?: Component<{ class?: string }>;
			/** shortcut hint, Kbd syntax ("Mod+C"); shown, not bound */
			keys?: string;
			/** a setting the item turns on and off, or one of a set; undefined for an action */
			checked?: boolean;
			disabled?: boolean;
			/** drawn in the error tint: delete and the like */
			danger?: boolean;
			tip?: string;
	  };

/** above: the menu's bottom at y rather than its top, for a button at the foot of a box */
export type OpenMenu = { items: ContextMenuItem[]; x: number; y: number; above?: boolean; onClose?: () => void; win?: Window };

/** what ContextMenuHost draws; null between menus */
export const openMenu = box<OpenMenu | null>(null);

/** Kbd's "Mod+Shift+V" as Electron's "CmdOrCtrl+Shift+V" */
function accelerator(keys: string): string {
	return keys
		.split('+')
		.map((k) => (k.trim().toLowerCase() === 'mod' ? 'CmdOrCtrl' : k.trim()))
		.join('+');
}

type NativeItem =
	| { separator: true }
	| { id: string; label: string; enabled: boolean; checked?: boolean; toolTip?: string; accelerator?: string; submenu?: NativeItem[] };

/** a submenu item's id is its path, "2.3" */
function nativeItems(items: ContextMenuItem[], path = ''): NativeItem[] {
	return items.map((it, i) =>
		'separator' in it
			? { separator: true }
			: {
					id: path + i,
					label: it.label,
					enabled: !it.disabled,
					checked: it.checked,
					toolTip: it.tip,
					accelerator: it.keys ? accelerator(it.keys) : undefined,
					submenu: it.submenu && nativeItems(it.submenu, path + i + '.')
				}
	);
}

async function showNative(items: ContextMenuItem[], x: number, y: number): Promise<ContextMenuItem | null> {
	const chosen = await nativeBridge()!.popupMenu!({ items: nativeItems(items), x: Math.round(x), y: Math.round(y) });
	if (chosen === null) return null;
	let found: ContextMenuItem | undefined;
	let level: ContextMenuItem[] | undefined = items;
	for (const i of String(chosen).split('.')) {
		found = level?.[Number(i)];
		level = found && !('separator' in found) ? found.submenu : undefined;
	}
	return found ?? null;
}

/** show the menu; resolves once it has closed, chosen item already run. onClose runs before the
 *  item on both paths: an item that opens an inline input needs the focus hand-back to land first */
export async function showContextMenu(
	items: ContextMenuItem[],
	at: { x: number; y: number },
	opts?: { onClose?: () => void; above?: boolean }
): Promise<void> {
	// the window with focus: an editor in a window of its own has its menus drawn there, the OS one is this window's
	const win = activeWindow();
	if (nativeContextMenus() && win === window) {
		const it = await showNative(items, at.x, at.y);
		opts?.onClose?.();
		if (it && !('separator' in it)) it.onclick?.();
		return;
	}
	closeContextMenu();
	await new Promise<void>((resolve) => {
		openMenu.current = {
			items,
			x: at.x,
			y: at.y,
			above: opts?.above,
			win,
			onClose: () => {
				opts?.onClose?.();
				resolve();
			}
		};
	});
}

export function contextMenuOpen(): boolean {
	return openMenu.current !== null;
}

/** dismiss the app-drawn menu; the OS one closes on its own */
export function closeContextMenu(): void {
	const m = openMenu.current;
	if (!m) return;
	openMenu.current = null;
	m.onClose?.();
}
