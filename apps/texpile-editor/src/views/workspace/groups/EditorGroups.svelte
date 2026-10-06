<script lang="ts">
	// The editor column as editor groups side by side (lib/workspace/groups): the focused group is drawn
	// from the workspace's live state, a parked one from what it showed when focus left it
	import { flushSync, untrack } from 'svelte';
	import type { Node as PMNode } from 'prosemirror-model';
	import EditorPane from '../EditorPane.svelte';
	import GroupDivider from './GroupDivider.svelte';
	import { editorGroups, type EditorGroup, type GroupHost } from '$lib/workspace/groups/editorGroups.svelte';
	import { publishLiveDoc } from '$lib/workspace/groups/liveDocFollow';
	import { tabs } from '$lib/workspace/tabs.svelte';
	import { samePath } from '$lib/workspace/fileSystem';
	import type { EditorPaneProps } from '../editorPaneProps';
	import { parkedPaneProps } from './parkedPaneProps';
	import { caretAtPoint, type GroupClick } from './caretAtPoint';
	import { overlayProps } from './overlayProps';
	import { visualViewIn } from '$lib/editor/visual/groupView.svelte';
	import { activeFilePath } from '$lib/workspace/workspaceStore';
	import { draggedTab, type DraggedTab } from '$lib/workspace/groups/tabDrag';
	import { dropTab } from '$lib/workspace/groups/tabMoves';

	type Props = { live: EditorPaneProps; host: Omit<GroupHost, 'capture'> };
	const props: Props = $props();

	$effect(() => editorGroups.attach({ ...props.host, capture: () => ({ ...props.live }) }));
	$effect(() => {
		editorGroups.docOf = (id) => {
			const node = cells.get(id);
			return node ? (visualViewIn(node)?.state.doc ?? null) : null;
		};
		return () => (editorGroups.docOf = null);
	});
	// inside the write, before the load: what the open file holds now is what parked copies of it show
	$effect(() =>
		activeFilePath.onWrite(() => {
			const path = props.live.loadedPath;
			if (path) untrack(() => editorGroups.refreshParked(path, { ...props.live }));
		})
	);
	// a folder opens with the groups it was left with; each restored one is opened once in turn, so it has
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
		for (const g of editorGroups.list) void g.tabs?.list;
		if (root) untrack(() => editorGroups.save(root));
	});
	// a group whose last tab closed goes, as in VS Code
	$effect(() => {
		if (tabs.list.length === 0 && editorGroups.list.length > 1) untrack(() => editorGroups.close(editorGroups.focusedId));
	});

	function split(): void {
		editorGroups.splitRight();
	}
	function dropOn(to: number) {
		return (drop: DraggedTab, index: number) =>
			void dropTab({ tab: drop.tab, from: drop.group, to, side: null, index }, (tab) => props.live.onCloseTab(tab));
	}
	const focusedProps = $derived(
		overlayProps<EditorPaneProps>(props.live, {
			onSplit: split,
			groupId: editorGroups.focusedId,
			onDropTab: dropOn(editorGroups.focusedId),
			onVisualChange: (doc: PMNode) => {
				props.live.onVisualChange(doc);
				if (props.live.loadedPath) publishLiveDoc(props.live.loadedPath, doc);
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
		new Map(editorGroups.list.map((g) => [g.id, isLive(g) ? focusedProps : parkedPaneProps(g, props.live, { split, drop: dropOn(g.id) })]))
	);

	// a closed group's pane still reads its props while it is torn down, after its entry has gone
	const lastPane = new Map<number, EditorPaneProps>();
	function paneOf(id: number): EditorPaneProps {
		const pane = paneProps.get(id);
		if (pane) lastPane.set(id, pane);
		return pane ?? lastPane.get(id) ?? focusedProps;
	}

	let rowWidth = $state(0);
	const cells = new Map<number, HTMLElement>();
	function cell(node: HTMLElement, id: number) {
		cells.set(id, node);
		return { destroy: () => cells.delete(id) };
	}

	let click = $state<{ at: GroupClick; id: number } | null>(null);
	function onCellPointerDown(g: EditorGroup, event: PointerEvent) {
		if (editorGroups.isFocused(g)) return;
		const target = event.target instanceof Element ? event.target : null;
		// the strip's own handlers focus the group as their action needs; focusing it here redraws the strip
		// under the press, and the click then misses the tab or its close button
		if (target?.closest('[role=tablist]')) return;
		const visual = !!target?.closest('.ProseMirror');
		const inEditor = visual || !!target?.closest('.cm-content');
		// before the browser handles the press: on the same file the editor takes typing by then, and places
		// the caret itself
		flushSync(() => editorGroups.focus(g.id));
		const taken = !!target?.closest('[contenteditable="true"]');
		click = inEditor && !taken ? { at: { x: event.clientX, y: event.clientY, visual }, id: g.id } : null;
	}
	// a tab dragged over a group's editor: its sides open a new group there, its middle takes the tab in
	let dropHint = $state<{ id: number; side: 'left' | 'right' | null } | null>(null);
	function sideAt(node: HTMLElement, x: number): 'left' | 'right' | null {
		const r = node.getBoundingClientRect();
		return x < r.left + r.width / 4 ? 'left' : x > r.right - r.width / 4 ? 'right' : null;
	}
	function onCellDragOver(g: EditorGroup, event: DragEvent) {
		if (!draggedTab(event)) return;
		event.preventDefault();
		dropHint = { id: g.id, side: sideAt(event.currentTarget as HTMLElement, event.clientX) };
	}
	function onCellDrop(g: EditorGroup, event: DragEvent) {
		const drop = draggedTab(event);
		const hint = dropHint;
		dropHint = null;
		if (!drop || hint?.id !== g.id) return;
		event.preventDefault();
		void dropTab({ tab: drop.tab, from: drop.group, to: g.id, side: hint.side, index: null }, (tab) => props.live.onCloseTab(tab));
	}

	// keyboard focus coming into a parked group (Tab, a button) brings it into focus; the strip again acts itself
	function onCellFocusIn(g: EditorGroup, event: FocusEvent) {
		const target = event.target instanceof Element ? event.target : null;
		if (editorGroups.isFocused(g) || target?.closest('[role=tablist]')) return;
		editorGroups.focus(g.id);
	}

	// Ctrl+1 to 9: the group's editor takes the keyboard, as in VS Code
	$effect(() => {
		const id = editorGroups.keyboardFocus;
		if (id === null) return;
		untrack(() => {
			editorGroups.keyboardFocus = null;
			click = { at: null, id };
		});
	});
	// a parked editor takes no caret, so the click that woke it is replayed once it takes typing
	$effect(() => {
		const pending = click;
		const g = pending && editorGroups.list.find((x) => x.id === pending.id);
		if (!pending || !g || !isLive(g)) return;
		let frame = requestAnimationFrame(function land(): void {
			const node = cells.get(pending.id);
			if (!node || caretAtPoint(pending.at, node)) {
				click = null;
				return;
			}
			frame = requestAnimationFrame(land);
		});
		return () => cancelAnimationFrame(frame);
	});
</script>

<div class="flex min-h-0 min-w-0" style="grid-column: 1; grid-row: 2" bind:clientWidth={rowWidth}>
	{#each editorGroups.list as g, i (g.id)}
		{#if i > 0}<GroupDivider index={i - 1} {rowWidth} />{/if}
		<div
			class="relative flex min-h-0 min-w-0 flex-col"
			style="flex: {g.share} 1 0"
			use:cell={g.id}
			data-editor-group={g.id}
			onpointerdowncapture={(e) => onCellPointerDown(g, e)}
			onfocusincapture={(e) => onCellFocusIn(g, e)}
			ondragover={(e) => onCellDragOver(g, e)}
			ondragleave={(e) => {
				if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) dropHint = null;
			}}
			ondrop={(e) => onCellDrop(g, e)}
			role="presentation"
		>
			<EditorPane {...paneOf(g.id)} />
			{#if dropHint?.id === g.id}
				<div
					class="bg-primary-500/15 border-primary-500 pointer-events-none absolute inset-y-0 z-40 border-2 {dropHint.side === 'left'
						? 'left-0 w-1/2'
						: dropHint.side === 'right'
							? 'right-0 w-1/2'
							: 'inset-x-0'}"
				></div>
			{/if}
		</div>
	{/each}
</div>
