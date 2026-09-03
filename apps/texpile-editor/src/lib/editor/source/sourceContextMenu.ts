// The source editor's right-click menu: what the editor can do at the pointer, as items for the
// shared menu (lib/menus).
import type { EditorView as CMView } from '@codemirror/view';
import { selectAll } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { ArrowRight, BookMarked, Scissors, Copy, ClipboardPaste, Search, MessageSquarePlus } from '@lucide/svelte';
import { copySelection, cutSelection, pasteAtCursor } from '$lib/editor/source/cmClipboardUtils';
import { showContextMenu, type ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { m } from '$lib/paraglide/messages';

export type SourceMenuDeps = {
	onSyncToPdf?: (line: number) => void;
	onAddComment?: (from: number, to: number) => void;
	onInsertCitation?: () => void;
	/** preview = the Typst pane, not the PDF viewer */
	syncTarget?: 'pdf' | 'preview';
};

export function openSourceContextMenu(event: MouseEvent, view: CMView, deps: SourceMenuDeps): void {
	event.preventDefault();
	const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
	const main = view.state.selection.main;
	const line = view.state.doc.lineAt(pos ?? main.head).number;
	const selection = main.empty ? null : { from: main.from, to: main.to };
	const items: ContextMenuItem[] = [
		{ label: m.tbar_ctx_cut(), icon: Scissors, keys: 'Mod+X', disabled: !selection, onclick: () => void cutSelection(view) },
		{ label: m.tbar_ctx_copy(), icon: Copy, keys: 'Mod+C', disabled: !selection, onclick: () => void copySelection(view) },
		{ label: m.tbar_ctx_paste(), icon: ClipboardPaste, keys: 'Mod+V', onclick: () => void pasteAtCursor(view) },
		{
			label: m.tbar_ctx_select_all(),
			keys: 'Mod+A',
			onclick: () => {
				selectAll(view);
				view.focus();
			}
		}
	];
	// the same gesture the margin pill offers, for people who reach for the menu instead; disabled
	// rather than hidden with nothing selected, so it is discoverable
	if (deps.onAddComment) {
		const add = deps.onAddComment;
		items.push(
			{ separator: true },
			{
				label: m.comments_add(),
				icon: MessageSquarePlus,
				disabled: !selection,
				onclick: () => selection && add(selection.from, selection.to)
			}
		);
	}
	if (deps.onInsertCitation) {
		const cite = deps.onInsertCitation;
		items.push({ separator: true }, { label: m.zotero_insert_citation(), icon: BookMarked, onclick: () => cite() });
	}
	items.push({ separator: true }, { label: m.tbar_ctx_find(), icon: Search, keys: 'Mod+F', onclick: () => void openSearchPanel(view) });
	if (deps.onSyncToPdf) {
		const sync = deps.onSyncToPdf;
		items.push(
			{ separator: true },
			{
				label: deps.syncTarget === 'preview' ? m.tbar_ctx_show_in_preview() : m.tbar_ctx_show_in_pdf(),
				icon: ArrowRight,
				onclick: () => sync(line)
			}
		);
	}
	void showContextMenu(items, { x: event.clientX, y: event.clientY });
}
