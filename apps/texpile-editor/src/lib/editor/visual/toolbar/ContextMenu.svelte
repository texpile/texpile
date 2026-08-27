<script lang="ts">
	import type { Dialect } from '$lib/editor/visual/dialect';
	import { editorViewStore } from '$lib/stores/editorStore';
	import { onMount } from 'svelte';
	import { CellSelection, mergeCells, splitCell } from 'prosemirror-tables';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { BookMarked, Library, MessageSquarePlus } from '@lucide/svelte';
	import { TextSelection } from 'prosemirror-state';
	import { buildPmAnchor, setPmCommentPending } from '$lib/editor/visual/extensions/pmComments';
	import type { CommentAnchor } from '$lib/comments/anchor';
	import Kbd from '$lib/components/Kbd.svelte';
	import { buildMenuItems, buildTableMenuItems } from './contextMenuItems';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** dialect-aware chrome (see lib/editor/dialect.ts): feature flags derive from this. */
		dialect?: Dialect;
		/** offered as a menu item when present; the anchor is rendered-dialect (see pmComments) */
		onAddComment?: (anchor: CommentAnchor | null) => void;
		/** pick citations from Zotero and insert at the caret; a menu item when present */
		onInsertCitation?: () => void;
		/** pick citations from the personal library and insert at the caret; a menu item when present */
		onInsertLibraryCitation?: () => void;
	};
	let { dialect = 'latex', onAddComment, onInsertCitation, onInsertLibraryCitation }: Props = $props();
	// merged cells have no pipe-table syntax, so the markdown editor loses merge/split. Everywhere
	// else has a spanning form the serializer emits: \multicolumn/\multirow in LaTeX,
	// table.cell(colspan:/rowspan:) in Typst.

	let isVisible: boolean = $state(false);
	let isOnTable: boolean = $state(false);
	/** captured when the menu opens: a text selection Comment could act on */
	let hasTextSelection: boolean = $state(false);
	let selectionType: 'cell' | 'column' | 'row' | null = $state(null);
	let canMerge: boolean = $state(false);
	let canSplit: boolean = $state(false);
	let cursorX: number = $state(0);
	let cursorY: number = $state(0);

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
		hasTextSelection = sel instanceof TextSelection && !sel.empty;

		isVisible = true;
		cursorX = event.clientX;
		cursorY = event.clientY;

		// empty transaction keeps the selection visible while the editor is blurred
		requestAnimationFrame(() => {
			if (editorViewStore.current && !editorViewStore.current!.hasFocus()) {
				const { state, dispatch } = editorViewStore.current;
				const tr = state.tr;
				dispatch(tr);
			}
		});
	}

	function handleClickOutside(event: MouseEvent): void {
		if (isVisible && !(event.target as Element).closest('.context-menu-popover')) {
			isVisible = false;
		}
	}

	function handleItemClick(action: () => void): void {
		action();
		isVisible = false;
		editorViewStore.current!.focus();
	}

	onMount(() => {
		document.addEventListener('contextmenu', handleContextMenu);
		document.addEventListener('click', handleClickOutside);

		return () => {
			document.removeEventListener('contextmenu', handleContextMenu);
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

<Popover
	open={isVisible}
	onOpenChange={(e) => (isVisible = e.open)}
	positioning={{
		getAnchorRect: () => ({
			x: cursorX,
			y: cursorY,
			width: 0,
			height: 0
		}),
		placement: 'bottom-start',
		gutter: 2
	}}
	closeOnInteractOutside={true}
	closeOnEscape={true}
	portalled={true}
	autoFocus={false}
>
	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content class="card bg-surface-50-950 context-menu-popover border-surface-300-700 min-w-[240px] border shadow-lg">
				<div class="py-1">
					{#each menuItems as item, i (i)}
						{#if item.type === 'separator'}
							<div class="my-1 border-t"></div>
						{:else}
							<button
								type="button"
								class="hover:preset-tonal-primary flex w-full items-center gap-3 px-4 py-2 text-left"
								onclick={() => handleItemClick(item.action)}
								onmousedown={(e) => e.preventDefault()}
							>
								<item.icon class="h-4 w-4 flex-shrink-0" />
								<span class="min-w-0 flex-1 text-sm">{item.label}</span>
								{#if item.shortcut}
									<Kbd keys={item.shortcut} />
								{/if}
							</button>
						{/if}
					{/each}

					{#if onAddComment}
						<!-- the same gesture the floating tooltip offers, for people who reach for the menu;
						     disabled rather than hidden with nothing selected, so it is discoverable -->
						<div class="my-1 border-t"></div>
						<button
							type="button"
							class="hover:preset-tonal-primary flex w-full items-center gap-3 px-4 py-2 text-left disabled:opacity-50"
							disabled={!hasTextSelection}
							onclick={() =>
								handleItemClick(() => {
									const view = editorViewStore.current!;
									const sel = view.state.selection;
									if (!(sel instanceof TextSelection) || sel.empty) return;
									const anchor = buildPmAnchor(view.state.doc, sel.from, sel.to);
									onAddComment(anchor);
									// keep the commented text visible once the composer takes focus
									if (anchor) setPmCommentPending(view, { from: sel.from, to: sel.to });
								})}
							onmousedown={(e) => e.preventDefault()}
						>
							<MessageSquarePlus class="h-4 w-4 flex-shrink-0" />
							<span class="min-w-0 flex-1 text-sm">{m.comments_add()}</span>
						</button>
					{/if}

					{#if onInsertCitation}
						<div class="my-1 border-t"></div>
						<button
							type="button"
							class="hover:preset-tonal-primary flex w-full items-center gap-3 px-4 py-2 text-left"
							onclick={() => handleItemClick(() => onInsertCitation())}
							onmousedown={(e) => e.preventDefault()}
						>
							<BookMarked class="h-4 w-4 flex-shrink-0" />
							<span class="min-w-0 flex-1 text-sm">{m.zotero_insert_citation()}</span>
						</button>
					{/if}

					{#if onInsertLibraryCitation}
						<button
							type="button"
							class="hover:preset-tonal-primary flex w-full items-center gap-3 px-4 py-2 text-left"
							onclick={() => handleItemClick(() => onInsertLibraryCitation())}
							onmousedown={(e) => e.preventDefault()}
						>
							<Library class="h-4 w-4 flex-shrink-0" />
							<span class="min-w-0 flex-1 text-sm">{m.library_insert_citation()}</span>
						</button>
					{/if}

					{#if isOnTable}
						<div class="my-1 border-t"></div>
						{#each getVisibleTableMenuItems() as item, i (i)}
							{#if item?.type === 'separator'}
								<div class="my-1 border-t"></div>
							{:else}
								<button
									type="button"
									class="hover:preset-tonal-primary flex w-full items-center gap-3 px-4 py-2 text-left"
									onclick={() => item.action && handleItemClick(item.action)}
									onmousedown={(e) => e.preventDefault()}
								>
									<item.icon class="h-4 w-4 flex-shrink-0" />
									<span class="min-w-0 flex-1 text-sm">{item.label}</span>
								</button>
							{/if}
						{/each}
					{/if}
				</div>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>

<style>
	/* keep the editor selection visible while the context menu is open */
	:global(.ProseMirror .ProseMirror-selectednode) {
		outline: 2px solid #8cf !important;
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
		background: var(--editor-selection, #d3d3d3);
	}

	:global(.ProseMirror-selectednode) {
		outline: 2px solid #8cf;
	}
</style>
