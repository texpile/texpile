// The one context menu in the app. A caller describes its items and where the pointer was;
// this shows them through the OS on macOS and through ContextMenuHost everywhere else
// (lib/platformSurfaces.ts), and runs whichever item was chosen.
import type { Component } from 'svelte';
import { box } from '$lib/runes/box.svelte';
import { nativeBridge } from '$lib/workspace/fileSystem';
import { nativeContextMenus } from '$lib/platformSurfaces';

export type ContextMenuItem =
	| { separator: true }
	| {
			label: string;
			onclick: () => void;
			icon?: Component<{ class?: string }>;
			/** shortcut hint, Kbd syntax ("Mod+C"); shown, not bound */
			keys?: string;
			disabled?: boolean;
			/** drawn in the error tint: delete and the like */
			danger?: boolean;
			tip?: string;
	  };

export type OpenMenu = { items: ContextMenuItem[]; x: number; y: number; onClose?: () => void };

/** what ContextMenuHost draws; null between menus */
export const openMenu = box<OpenMenu | null>(null);

/** Kbd's "Mod+Shift+V" as Electron's "CmdOrCtrl+Shift+V" */
function accelerator(keys: string): string {
	return keys
		.split('+')
		.map((k) => (k.trim().toLowerCase() === 'mod' ? 'CmdOrCtrl' : k.trim()))
		.join('+');
}

async function showNative(items: ContextMenuItem[], x: number, y: number): Promise<ContextMenuItem | null> {
	const chosen = await nativeBridge()!.popupMenu!({
		items: items.map((it, i) =>
			'separator' in it ? { separator: true } : { id: String(i), label: it.label, enabled: !it.disabled, accelerator: it.keys ? accelerator(it.keys) : undefined }
		),
		x: Math.round(x),
		y: Math.round(y)
	});
	return chosen === null ? null : (items[Number(chosen)] ?? null);
}

/** show the menu; resolves once it has closed, chosen item already run. onClose runs before the
 *  item on both paths: an item that opens an inline input needs the focus hand-back to land first */
export async function showContextMenu(items: ContextMenuItem[], at: { x: number; y: number }, opts?: { onClose?: () => void }): Promise<void> {
	if (nativeContextMenus()) {
		const it = await showNative(items, at.x, at.y);
		opts?.onClose?.();
		if (it && !('separator' in it)) it.onclick();
		return;
	}
	closeContextMenu();
	await new Promise<void>((resolve) => {
		openMenu.current = {
			items,
			x: at.x,
			y: at.y,
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
