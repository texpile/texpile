<script lang="ts">
	import type { Dialect } from '$lib/editor/visual/dialect';
	import { editorViewStore } from '$lib/stores/editorStore';
	import { onMount } from 'svelte';
	import { CellSelection, mergeCells, splitCell } from 'prosemirror-tables';
	import { BookMarked, MessageSquarePlus } from '@lucide/svelte';
	import { TextSelection } from 'prosemirror-state';
	import { buildPmAnchor, setPmCommentPending } from '$lib/editor/visual/extensions/pmComments';
	import type { CommentAnchor } from '$lib/comments/anchor';
	import { buildMenuItems, buildTableMenuItems, type ContextMenuEntry } from './contextMenuItems';
	import { showContextMenu, type ContextMenuItem } from '$lib/menus/contextMenu.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** dialect-aware chrome (see lib/editor/dialect.ts): feature flags derive from this. */
		dialect?: Dialect;
		/** offered as a menu item when present; the anchor is rendered-dialect (see pmComments) */
		onAddComment?: (anchor: CommentAnchor | null) => void;
		/** pick citations from Zotero and insert at the caret; a menu item when present */
		onInsertCitation?: () => void;
	};
	let { dialect = 'latex', onAddComment, onInsertCitation }: Props = $props();
	// merged cells have no pipe-table syntax, so the markdown editor loses merge/split. Everywhere
	// else has a spanning form the serializer emits: \multicolumn/\multirow in LaTeX,
	// table.cell(colspan:/rowspan:) in Typst.

	let isOnTable = false;
	let selectionType: 'cell' | 'column' | 'row' | null = null;
	let canMerge = false;
	let canSplit = false;

	function detectSelectionType(): 'cell' | 'column' | 'row' | null {
		const { state } = editorViewStore.current!;
		const { selection } = state;

		if (selection instanceof CellSelection) {
			if (selection.isColSelection()) {
				return 'column';
			}
			if (selection.isRowSelection()) {
				return 'row';
			}
			return 'cell';
		}

		return null;
	}

	const menuItems = buildMenuItems(dialect);
	const tableMenuItems = buildTableMenuItems({ dialect, canMerge: () => canMerge, canSplit: () => canSplit });

	function getVisibleTableMenuItems() {
		let filtered;
		if (!selectionType) {
			filtered = tableMenuItems.filter((item) => {
				if (item.showWhen && !item.showWhen()) return false;
				return true;
			});
		} else {
			const sel = selectionType;
			filtered = tableMenuItems.filter((item) => {
				if (item.showWhen && !item.showWhen()) return false;

				if (item.type === 'separator') {
					return item.showFor?.includes(sel);
				}
				return item.showFor?.includes(sel);
			});
		}

		// drop leading/trailing and consecutive separators
		const result = [];
		for (let i = 0; i < filtered.length; i++) {
			const item = filtered[i];
			const isLast = i === filtered.length - 1;
			const isFirst = i === 0;

			if (item.type === 'separator') {
				if (isFirst || isLast) continue;
				if (result.length > 0 && result[result.length - 1].type === 'separator') continue;
			}
			result.push(item);
		}

		if (result.length > 0 && result[result.length - 1].type === 'separator') {
			result.pop();
		}

		return result;
	}

	function handleContextMenu(event: MouseEvent): void {
		// only override the context menu inside the editor
		if (!(event.target as Element).closest('.texpile-main-editor')) {
			return;
		}

		event.preventDefault();

		const coords = { left: event.clientX, top: event.clientY };
		const pos = editorViewStore.current!.posAtCoords(coords);

		if (pos) {
			const Resolvedpos = editorViewStore.current!.state.doc.resolve(pos.pos);
			isOnTable = false;
			for (let i = Resolvedpos.depth; i > 0; i--) {
				if (Resolvedpos.node(i).type.name === 'table') {
					isOnTable = true;
					break;
				}
			}
		}

		if (isOnTable) {
			selectionType = detectSelectionType();
			// calling the commands without dispatch just tests applicability
			const { state } = editorViewStore.current!;
			canMerge = mergeCells(state);
			canSplit = splitCell(state);
		} else {
			selectionType = null;
			canMerge = false;
			canSplit = false;
		}
		const sel = editorViewStore.current!.state.selection;
		const hasTextSelection = sel instanceof TextSelection && !sel.empty;

		const items: ContextMenuItem[] = menuItems.map(entry);
		if (onAddComment) {
			// the same gesture the floating tooltip offers, for people who reach for the menu;
			// disabled rather than hidden with nothing selected, so it is discoverable
			items.push(
				{ separator: true },
				{
					label: m.comments_add(),
					icon: MessageSquarePlus,
					disabled: !hasTextSelection,
					onclick: () =>
						run(() => {
							const view = editorViewStore.current!;
							const s = view.state.selection;
							if (!(s instanceof TextSelection) || s.empty) return;
							const anchor = buildPmAnchor(view.state.doc, s.from, s.to);
							onAddComment(anchor);
							// keep the commented text visible once the composer takes focus
							if (anchor) setPmCommentPending(view, { from: s.from, to: s.to });
						})
				}
			);
		}
		if (onInsertCitation)
			items.push(
				{ separator: true },
				{ label: m.zotero_insert_citation(), icon: BookMarked, onclick: () => run(() => onInsertCitation()) }
			);
		if (isOnTable) items.push({ separator: true }, ...getVisibleTableMenuItems().map(entry));
		void showContextMenu(items, { x: event.clientX, y: event.clientY });

		// empty transaction keeps the selection visible while the editor is blurred
		requestAnimationFrame(() => {
			if (editorViewStore.current && !editorViewStore.current!.hasFocus()) {
				const { state, dispatch } = editorViewStore.current;
				const tr = state.tr;
				dispatch(tr);
			}
		});
	}

	// both item builders share this shape, one of them without the ContextMenuEntry name
	type Entryish = Pick<ContextMenuEntry, 'label' | 'icon' | 'shortcut' | 'action'> & { type: string };
	function entry(e: Entryish): ContextMenuItem {
		return e.type === 'separator'
			? { separator: true }
			: { label: e.label ?? '', icon: e.icon, keys: e.shortcut, onclick: () => e.action && run(e.action) };
	}

	function run(action: () => void): void {
		action();
		editorViewStore.current!.focus();
	}

	onMount(() => {
		document.addEventListener('contextmenu', handleContextMenu);
		return () => document.removeEventListener('contextmenu', handleContextMenu);
	});
</script>

<style>
	/* keep the editor selection visible while the context menu is open */
	:global(.ProseMirror .ProseMirror-selectednode) {
		outline: 2px solid var(--selected-node-outline) !important;
	}

	:global(.ProseMirror.ProseMirror-hideselection *::selection),
	:global(.ProseMirror.ProseMirror-hideselection *::-moz-selection) {
		background: transparent !important;
	}

	:global(.ProseMirror *::selection),
	:global(.ProseMirror *::-moz-selection) {
		/* the shared selection colour (app.css), not its own grey: this rule exists to keep the
		   selection visible while the menu is open, and visible-but-recoloured still reads as a
		   different selection */
		background: var(--editor-selection);
	}

	:global(.ProseMirror-selectednode) {
		outline: 2px solid var(--selected-node-outline);
	}
</style>
