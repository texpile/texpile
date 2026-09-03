// The PDF pane's right-click menu: copy what the text layer has selected.
import { Copy } from '@lucide/svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { showContextMenu } from '$lib/menus/contextMenu.svelte';
import { m } from '$lib/paraglide/messages';

export function openPdfContextMenu(event: MouseEvent): void {
	event.preventDefault();
	// read now: a click on the menu can collapse the selection before Copy runs
	const text = window.getSelection()?.toString() ?? '';
	void showContextMenu(
		[
			{
				label: m.tbar_ctx_copy(),
				icon: Copy,
				keys: 'Mod+C',
				disabled: !text,
				onclick: () =>
					void navigator.clipboard.writeText(text).catch(() => toaster.info({ title: m.ctxmenu_copy_failed_toast(), duration: 3000 }))
			}
		],
		{ x: event.clientX, y: event.clientY }
	);
}
