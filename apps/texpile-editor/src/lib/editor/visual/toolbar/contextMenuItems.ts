// the visual editor's right-click menu entries: clipboard actions for every dialect, and the
// table block set with its selection-dependent visibility
import type { Component } from 'svelte';
import {
	addColumnBefore,
	addColumnAfter,
	deleteColumn,
	addRowBefore,
	addRowAfter,
	deleteRow,
	deleteTable,
	mergeCells,
	splitCell
} from 'prosemirror-tables';
import { Copy, Clipboard, Plus, Trash2, Combine, SplitSquareHorizontal } from '@lucide/svelte';
import { editorViewStore } from '$lib/stores/editorStore';
import { toaster } from '$lib/modals/toaster-svelte';
import { pasteFromClipboard, pasteWithoutFormatting } from '$lib/editor/paste/visualClipboardPaste';
import type { Dialect } from '$lib/editor/visual/dialect';
import { m } from '$lib/paraglide/messages';

export type ContextMenuEntry = {
	type: 'item' | 'separator';
	label?: string;
	icon?: Component;
	shortcut?: string;
	action?: () => void;
	/** which table selection kinds the entry applies to */
	showFor?: string[];
	showWhen?: () => boolean;
};

export type TableMenuDeps = {
	dialect: Dialect;
	canMerge(): boolean;
	canSplit(): boolean;
};

function editorView() {
	return editorViewStore.current;
}

export function buildMenuItems() {
	return [
		{
			type: 'item',
			label: m.ctxmenu_copy(),
			icon: Copy,
			shortcut: 'Mod+C',
			action: () => {
				const view = editorView()!;
				const { from, to } = view.state.selection;
				if (from === to) return;
				// what Ctrl+C writes: HTML carrying the slice marker, and the text in the editor's own markup
				const { dom, text } = view.serializeForClipboard(view.state.doc.slice(from, to));
				navigator.clipboard
					.write([
						new ClipboardItem({
							'text/html': new Blob([dom.innerHTML], { type: 'text/html' }),
							'text/plain': new Blob([text], { type: 'text/plain' })
						})
					])
					.then(() => {
						toaster.info({ title: m.ctxmenu_copied_toast(), duration: 3000 });
					})
					.catch((_err) => {
						toaster.info({ title: m.ctxmenu_copy_failed_toast(), duration: 3000 });
					});
			}
		},
		{
			type: 'item',
			label: m.ctxmenu_paste(),
			icon: Clipboard,
			shortcut: 'Mod+V',
			action: () => void pasteFromClipboard(editorView()!)
		},
		{
			type: 'item',
			label: m.ctxmenu_paste_without_formatting(),
			icon: Clipboard,
			shortcut: 'Mod+Shift+V',
			action: () => void pasteWithoutFormatting(editorView()!)
		}
	];
}

export function buildTableMenuItems(deps: TableMenuDeps): ContextMenuEntry[] {
	const { dialect } = deps;
	const cellMerging = dialect !== 'markdown';
	return [
		{
			type: 'item',
			label: m.ctxmenu_add_column_before(),
			icon: Plus,
			showFor: ['cell', 'column'],
			action: () => {
				const view = editorView()!;
				const { state, dispatch } = view;
				addColumnBefore(state, dispatch);
			}
		},
		{
			type: 'item',
			label: m.ctxmenu_add_column_after(),
			icon: Plus,
			showFor: ['cell', 'column'],
			action: () => {
				const view = editorView()!;
				const { state, dispatch } = view;
				addColumnAfter(state, dispatch);
			}
		},
		{ type: 'separator', showFor: ['cell', 'column'] },
		{
			type: 'item',
			label: m.ctxmenu_add_row_before(),
			icon: Plus,
			showFor: ['cell', 'row'],
			action: () => {
				const view = editorView()!;
				const { state, dispatch } = view;
				addRowBefore(state, dispatch);
			}
		},
		{
			type: 'item',
			label: m.ctxmenu_add_row_after(),
			icon: Plus,
			showFor: ['cell', 'row'],
			action: () => {
				const view = editorView()!;
				const { state, dispatch } = view;
				addRowAfter(state, dispatch);
			}
		},
		{ type: 'separator', showFor: ['cell', 'column', 'row'] },
		{
			type: 'item',
			label: m.ctxmenu_merge_cells(),
			icon: Combine,
			showFor: ['cell'],
			showWhen: () => cellMerging && deps.canMerge(),
			action: () => {
				const view = editorView()!;
				const { state, dispatch } = view;
				mergeCells(state, dispatch);
			}
		},
		{
			type: 'item',
			label: m.ctxmenu_split_cell(),
			icon: SplitSquareHorizontal,
			showFor: ['cell'],
			showWhen: () => cellMerging && deps.canSplit(),
			action: () => {
				const view = editorView()!;
				const { state, dispatch } = view;
				splitCell(state, dispatch);
			}
		},
		{ type: 'separator', showFor: ['cell'], showWhen: () => cellMerging && (deps.canMerge() || deps.canSplit()) },
		{
			type: 'item',
			label: m.ctxmenu_delete_column(),
			icon: Trash2,
			showFor: ['cell', 'column'],
			action: () => {
				const view = editorView()!;
				const { state, dispatch } = view;
				deleteColumn(state, dispatch);
			}
		},
		{
			type: 'item',
			label: m.ctxmenu_delete_row(),
			icon: Trash2,
			showFor: ['cell', 'row'],
			action: () => {
				const view = editorView()!;
				const { state, dispatch } = view;
				deleteRow(state, dispatch);
			}
		},
		{
			type: 'item',
			label: m.ctxmenu_delete_table(),
			icon: Trash2,
			showFor: ['cell', 'column', 'row'],
			action: () => {
				const view = editorView()!;
				const { state, dispatch } = view;
				deleteTable(state, dispatch);
			}
		}
	];
}
