<script lang="ts">
	// The editor column as the slots of an editor layout (lib/workspace/groups): the focused slot is drawn
	// from the workspace's live state, a parked one from what it showed when focus left it
	import { flushSync, untrack } from 'svelte';
	import type { Node as PMNode } from 'prosemirror-model';
	import GroupCell from './GroupCell.svelte';
	import EditorWindow from './window/EditorWindow.svelte';
	import GroupDivider from './GroupDivider.svelte';
	import { editorGroups, type EditorGroup, type GroupHost } from '$lib/workspace/groups/editorGroups.svelte';
	import { publishFile } from '$lib/workspace/groups/fileFeed.svelte';
	import { followParked } from './parkedFollow.svelte';
	import { tabs, type Tab } from '$lib/workspace/tabs.svelte';
	import { basename, samePath } from '$lib/workspace/fileSystem';
	import { windowFocus } from './window/windowFocus.svelte';
	import type { EditorPaneProps } from '../editorPaneProps';
	import { parkedPaneProps } from './parkedPaneProps';
	import { clickLanding } from './clickLanding.svelte';
	import { overlayProps } from './overlayProps';
	import { visualEditorIn } from '$lib/editor/editorsOnScreen.svelte';
	import { activeFilePath } from '$lib/workspace/workspaceStore';
	import { draggedFiles, draggedTab, slotDrag, tabOut, type DraggedTab } from '$lib/workspace/groups/slotDrag.svelte';
	import { dropTab, dropToSplit, moveToWindow } from '$lib/workspace/groups/tabMoves';
	import { splitTarget, zoneAt, type DropZone } from '$lib/workspace/groups/splitDrop';
	import { layoutTracks, MIN_COLUMN_PX, MIN_ROW_PX, revealShift, trackSpan, trackTemplate } from '$lib/workspace/groups/groupSizes';
	import { cellOf, tracksOf } from '$lib/workspace/groups/layouts';
	import { followSplitScroll } from '../pane/splitScroll.svelte';
	import { switchParkedMode } from '../pane/parkedModeSwitch';
	import { rebreakResizedEditors } from '$lib/editor/visual/linebreak/lineBreakPlugin';
	import { m } from '$lib/paraglide/messages';

	type Props = { live: EditorPaneProps; host: Omit<GroupHost, 'capture'> };
	const props: Props = $props();

	$effect(() => editorGroups.attach({ ...props.host, capture: () => ({ ...props.live }) }));
	$effect(() => {
		editorGroups.ownOf = (id) => {
			const view = visualEditorIn(cells.get(id) ?? null);
			const shown = paneProps.get(id);
			return view && shown ? { doc: view.state.doc, shown } : null;
		};
		return () => (editorGroups.ownOf = null);
	});
	// a folder opens with the layout it was left with; each restored one is opened once in turn, so it has
	// something to show, as VS Code opens every editor of the layout it restores
	$effect(() => {
		void tabs.generation;
		untrack(() => {
			editorGroups.restore(tabs.persistedRoot);
			void visitUnseen();
		});
	});
	async function visitUnseen(): Promise<void> {
		const home = editorGroups.focusedId;
		const unseen = editorGroups.list.filter((g) => g.unseen).map((g) => g.id);
		if (!unseen.length) return;
		// the folder's own file first, which the workspace opens on its own
		for (let i = 0; i < 200 && !activeFilePath.current; i++) await new Promise((r) => setTimeout(r, 50));
		await editorGroups.whenDrawn();
		for (const id of unseen) {
			editorGroups.focus(id);
			await editorGroups.whenDrawn();
		}
		editorGroups.focus(home);
	}
	$effect(() => {
		const root = tabs.persistedRoot;
		void editorGroups.focusedId;
		void editorGroups.layout;
		void editorGroups.split;
		void props.live.viewMode;
		for (const g of editorGroups.list) void g.tabs?.list;
		if (root) untrack(() => editorGroups.save(root));
	});

	$effect(() => {
		tabOut.current = (drag, at) => void moveToWindow(drag.tab, drag.group, at, (tab) => props.live.onCloseTab(tab));
		return () => (tabOut.current = null);
	});

	function dropOn(to: number) {
		return (drop: DraggedTab, index: number) =>
			void dropTab({ tab: drop.tab, from: drop.group, to, index }, (tab) => props.live.onCloseTab(tab));
	}
	function openOn(to: number) {
		return (paths: string[], index: number) => editorGroups.openIn(to, paths, index);
	}
	const split = $derived(editorGroups.layout !== 'one');
	// a slot left without a file stays, and asks for one
	const emptyNote = $derived(split ? m.groups_drop_file() : undefined);
	const focusedProps = $derived(
		overlayProps<EditorPaneProps>(props.live, {
			emptyNote,
			groupId: editorGroups.focusedId,
			onDropTab: dropOn(editorGroups.focusedId),
			onDropFiles: openOn(editorGroups.focusedId),
			onVisualChange: (doc: PMNode) => {
				const live = props.live;
				live.onVisualChange(doc);
				if (live.loadedPath) publishFile(live.loadedPath, live.texSource, { doc, map: live.sourceMap, meta: live.docMeta });
			}
		})
	);

	/**
	 * The workspace has `path` open and drawn. Drawn means the visual document is there too: a group that
	 * went live before it would pass through its loading state and rebuild the editor it already has
	 */
	function shows(path: string | null): boolean {
		const { loadedPath, kind, viewMode, visualDoc } = props.live;
		if (!path) return !loadedPath;
		if (!loadedPath || !samePath(loadedPath, path)) return false;
		const structured = kind === 'tex' || kind === 'md' || kind === 'typ';
		return !structured || viewMode !== 'visual' || !!visualDoc;
	}
	/** focused, and once drawn: until then a group that takes focus stays as it was */
	function isLive(g: EditorGroup): boolean {
		return editorGroups.isFocused(g) && (!g.frozen || shows(g.active?.path ?? null));
	}
	// per group: focus moving to a group on the same file changes nothing else
	$effect(() => {
		void editorGroups.focusedId;
		const path = activeFilePath.current;
		if (shows(path)) untrack(() => editorGroups.markDrawn(path));
	});

	// one props object per group, made again only when the group changes or goes live: each pane then
	// reads its props one getter at a time
	const paneProps = $derived(
		new Map(
			editorGroups.list.map((g) => {
				const pane = isLive(g)
					? focusedProps
					: parkedPaneProps(g, props.live, {
							emptyNote,
							drop: dropOn(g.id),
							open: openOn(g.id),
							setMode: (mode) => void switchParkedMode(g.id, mode, cells.get(g.id) ?? null, props.host.parseFile)
						});
				// a window of its own shows one file, with its own toolbar
				return [g.id, g.window ? overlayProps(pane, { single: true, emptyNote: undefined }) : pane];
			})
		)
	);

	followParked({
		live: () => props.live,
		parked: () =>
			editorGroups.list.flatMap((g) => {
				const pane = paneProps.get(g.id);
				const path = pane?.loadedPath;
				return pane && path && !editorGroups.isFocused(g) ? [{ path, pane, cell: cells.get(g.id) ?? null }] : [];
			}),
		parseFile: () => props.host.parseFile
	});

	// a closed group's pane still reads its props while it is torn down, after its entry has gone
	const lastPane = new Map<number, EditorPaneProps>();
	function paneOf(id: number): EditorPaneProps {
		const pane = paneProps.get(id);
		if (pane) lastPane.set(id, pane);
		return pane ?? lastPane.get(id) ?? focusedProps;
	}

	// the content box, not clientWidth: its observer misses a scrollbar going away, and the slots then stay that much short
	let content = $state<DOMRectReadOnly>();
	const room = $derived({ width: Math.floor(content?.width ?? 0), height: Math.floor(content?.height ?? 0) });
	// scrollbar included: a narrow area scrolls sideways, and the preview still stands the same height beside it
	let outerHeight = $state(0);
	const tracks = $derived(tracksOf(editorGroups.layout));
	const sizes = $derived(room.width > 0 && room.height > 0 ? layoutTracks(tracks, editorGroups.split, room) : null);
	const cells = new Map<number, HTMLElement>();
	function register(id: number, node: HTMLElement): () => void {
		cells.set(id, node);
		return () => cells.delete(id);
	}
	followSplitScroll(cells, (id) => editorGroups.activeOf(id)?.path ?? null);
	// a layout picked or a divider moved: lines broken for the new widths before the frame shows, not a frame after
	$effect(() => {
		void editorGroups.layout;
		void editorGroups.split;
		untrack(rebreakResizedEditors);
	});
	let scroller = $state<HTMLElement>();
	function revealFocused(): void {
		const el = cells.get(editorGroups.focusedId);
		if (!scroller || !el) return;
		const view = scroller.getBoundingClientRect();
		const box = el.getBoundingClientRect();
		scroller.scrollLeft += revealShift(box.left - view.left, box.width, scroller.clientWidth);
		scroller.scrollTop += revealShift(box.top - view.top, box.height, scroller.clientHeight);
	}
	// the preview's sync button stands level with the focused row, and a split preview's divider with the rows' one
	let scrolled = $state(0);
	$effect(() => {
		editorGroups.rowTops = sizes && tracks.rows > 1 ? [0, sizes.rows[0] + 1].map((top) => top - scrolled) : [0];
		editorGroups.rowSizes = sizes?.rows ?? [];
		editorGroups.columnHeight = outerHeight;
	});
	// the slot being typed in stays on screen when the editor area narrows under it (the preview opening).
	// Not on a click: scrolling under the press would move where its caret lands
	$effect(() => {
		void sizes;
		untrack(revealFocused);
	});

	const landing = clickLanding({ cell: (id) => cells.get(id), live: (id) => !!editorGroups.list.find((g) => g.id === id && isLive(g)) });
	function onCellPointerDown(g: EditorGroup, event: PointerEvent) {
		if (editorGroups.isFocused(g)) return;
		const target = event.target instanceof Element ? event.target : null;
		// the strip's own handlers focus the group as their action needs; focusing it here redraws the strip
		// under the press, and the click then misses the tab or its close button
		if (target?.closest('[role=tablist], [data-strip-controls]')) return;
		const visual = !!target?.closest('.ProseMirror');
		const inEditor = visual || !!target?.closest('.cm-content');
		// before the browser handles the press: on the same file the editor takes typing by then, and places
		// the caret itself
		flushSync(() => editorGroups.focus(g.id));
		const taken = !!target?.closest('[contenteditable="true"]');
		if (inEditor && !taken) landing.start({ x: event.clientX, y: event.clientY, visual }, g.id);
		else landing.clear();
	}
	// a tab or files from the tree dragged over a slot's editor: the slot takes them in, or on an edge the
	// layout grows that way and the new slot takes them
	let dropHint = $state.raw<{ drag: DraggedTab | string[]; id: number; zone: DropZone } | null>(null);
	// a drag that ends anywhere (another strip, outside the window, Escape) takes its hint with it
	const shownHint = $derived(dropHint && dropHint.drag === slotDrag.current ? dropHint : null);
	function zoneOf(g: EditorGroup, event: DragEvent): DropZone {
		const zone = zoneAt((event.currentTarget as HTMLElement).getBoundingClientRect(), event.clientX, event.clientY);
		return splitTarget(editorGroups.layout, editorGroups.grid.indexOf(g), zone) ? zone : 'center';
	}
	function onCellDragOver(g: EditorGroup, event: DragEvent) {
		const drag = draggedTab(event) ?? draggedFiles(event);
		if (!drag) return;
		event.preventDefault();
		const zone = g.window ? 'center' : zoneOf(g, event);
		if (dropHint?.drag !== drag || dropHint.id !== g.id || dropHint.zone !== zone) dropHint = { drag, id: g.id, zone };
	}
	function closeTab(tab: Tab) {
		props.live.onCloseTab(tab);
	}
	function onCellDrop(g: EditorGroup, event: DragEvent) {
		const drop = draggedTab(event);
		const files = draggedFiles(event);
		const hint = shownHint;
		dropHint = null;
		if ((!drop && !files) || hint?.id !== g.id) return;
		event.preventDefault();
		const split = splitTarget(editorGroups.layout, editorGroups.grid.indexOf(g), hint.zone);
		if (split) void dropToSplit(split, g.id, drop ? { tab: drop.tab, from: drop.group } : (files ?? []), closeTab);
		else if (drop) void dropTab({ tab: drop.tab, from: drop.group, to: g.id, index: null }, closeTab);
		else if (files) editorGroups.openIn(g.id, files, null);
	}

	// keyboard focus coming into a parked group (Tab, a button) brings it into focus; the strip again acts itself
	function onCellFocusIn(g: EditorGroup, event: FocusEvent) {
		const target = event.target instanceof Element ? event.target : null;
		if (editorGroups.isFocused(g) || target?.closest('[role=tablist], [data-strip-controls]')) return;
		editorGroups.focus(g.id);
	}

	const windows = windowFocus((id) => landing.start(null, id));
	function windowTitle(g: EditorGroup): string {
		const path = editorGroups.isFocused(g) ? activeFilePath.current : g.active?.path;
		return path ? basename(path) : '';
	}

	// Ctrl+1 to 4: the slot's editor takes the keyboard, as in VS Code
	$effect(() => {
		const id = editorGroups.keyboardFocus;
		if (id === null) return;
		untrack(() => {
			editorGroups.keyboardFocus = null;
			landing.start(null, id);
			revealFocused();
		});
	});
</script>

<div class="flex min-h-0 min-w-0 flex-col" style="grid-column: 1; grid-row: 2">
	<div
		class="min-h-0 min-w-0 flex-1 overflow-auto"
		bind:this={scroller}
		bind:contentRect={content}
		bind:offsetHeight={outerHeight}
		onscroll={() => (scrolled = scroller?.scrollTop ?? 0)}
	>
		<div
			class="grid h-full w-full"
			style={sizes
				? `grid-template-columns: ${trackTemplate(sizes.columns, MIN_COLUMN_PX)}; grid-template-rows: ${trackTemplate(sizes.rows, MIN_ROW_PX)}; width: max(100%, ${trackSpan(sizes.columns, MIN_COLUMN_PX)}px); height: max(100%, ${trackSpan(sizes.rows, MIN_ROW_PX)}px)`
				: ''}
		>
			{#if sizes && tracks.columns > 1}
				<GroupDivider axis="column" sizes={sizes.columns} least={MIN_COLUMN_PX} style="grid-column: 2; grid-row: 1 / -1" />
			{/if}
			{#if sizes && tracks.rows > 1}
				<GroupDivider axis="row" sizes={sizes.rows} least={MIN_ROW_PX} style="grid-row: 2; grid-column: 1 / -1" />
			{/if}
			{#each editorGroups.grid as g, i (g.id)}
				{@const at = cellOf(editorGroups.layout, i)}
				<GroupCell
					id={g.id}
					pane={paneOf(g.id)}
					hint={shownHint?.id === g.id ? shownHint.zone : null}
					style="grid-column: {at.column * 2 + 1}; grid-row: {at.row * 2 + 1}"
					{register}
					onPointerDown={(e) => onCellPointerDown(g, e)}
					onFocusIn={(e) => onCellFocusIn(g, e)}
					onDragOver={(e) => onCellDragOver(g, e)}
					onDragOff={() => (dropHint = null)}
					onDrop={(e) => onCellDrop(g, e)}
				/>
			{/each}
		</div>
	</div>
</div>
{#each editorGroups.list.filter((x) => x.window) as g (g.id)}
	<EditorWindow
		id={g.id}
		at={g.window!}
		title={windowTitle(g)}
		cell={{
			id: g.id,
			pane: paneOf(g.id),
			hint: shownHint?.id === g.id ? shownHint.zone : null,
			register,
			onPointerDown: (e) => onCellPointerDown(g, e),
			onFocusIn: (e) => onCellFocusIn(g, e),
			onDragOver: (e) => onCellDragOver(g, e),
			onDragOff: () => (dropHint = null),
			onDrop: (e) => onCellDrop(g, e)
		}}
		onWindowFocus={() => windows.focusSoon(g.id)}
		onClosed={() => editorGroups.removeWindow(g.id)}
	/>
{/each}
