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
	// another folder starts with one group
	$effect(() => {
		void tabs.generation;
		untrack(() => editorGroups.reset());
	});
	// a group whose last tab closed goes, as in VS Code
	$effect(() => {
		if (tabs.list.length === 0 && editorGroups.list.length > 1) untrack(() => editorGroups.close(editorGroups.focusedId));
	});

	function split(): void {
		editorGroups.splitRight();
	}
	const focusedProps = $derived(
		overlayProps<EditorPaneProps>(props.live, {
			onSplit: split,
			onVisualChange: (doc: PMNode) => {
				props.live.onVisualChange(doc);
				if (props.live.loadedPath) publishLiveDoc(props.live.loadedPath, doc);
			}
		})
	);

	/**
	 * Focused, and its file open and drawn in the workspace: until then it stays as it was. Drawn means
	 * the visual document is there too, or the pane would pass through its loading state and rebuild the
	 * editor it already has
	 */
	function isLive(g: EditorGroup): boolean {
		if (!editorGroups.isFocused(g)) return false;
		if (!g.frozen || !g.active) return true;
		const { loadedPath, kind, viewMode, visualDoc } = props.live;
		if (!loadedPath || !samePath(loadedPath, g.active.path)) return false;
		const structured = kind === 'tex' || kind === 'md' || kind === 'typ';
		return !structured || viewMode !== 'visual' || !!visualDoc;
	}

	// one props object per group, made again only when the group changes or goes live: each pane then
	// reads its props one getter at a time
	const paneProps = $derived(
		new Map(
			editorGroups.list.map((g) => [g.id, isLive(g) ? focusedProps : parkedPaneProps(g, props.live, () => editorGroups.focus(g.id), split)])
		)
	);

	let rowWidth = $state(0);
	const cells = new Map<number, HTMLElement>();
	function cell(node: HTMLElement, id: number) {
		cells.set(id, node);
		return { destroy: () => cells.delete(id) };
	}

	let click = $state<(GroupClick & { id: number }) | null>(null);
	function onCellPointerDown(g: EditorGroup, event: PointerEvent) {
		if (editorGroups.isFocused(g)) return;
		const target = event.target instanceof Element ? event.target : null;
		const visual = !!target?.closest('.ProseMirror');
		const inEditor = visual || !!target?.closest('.cm-content');
		// before the browser handles the press: on the same file the editor takes typing by then, and places
		// the caret itself
		flushSync(() => editorGroups.focus(g.id));
		const taken = !!target?.closest('[contenteditable="true"]');
		click = inEditor && !taken ? { x: event.clientX, y: event.clientY, visual, id: g.id } : null;
	}
	// a parked editor takes no caret, so the click that woke it is replayed once it takes typing
	$effect(() => {
		const pending = click;
		const g = pending && editorGroups.list.find((x) => x.id === pending.id);
		if (!pending || !g || !isLive(g)) return;
		let frame = requestAnimationFrame(function land(): void {
			const node = cells.get(pending.id);
			if (!node || caretAtPoint(pending, node)) {
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
			class="flex min-h-0 min-w-0 flex-col"
			style="flex: {g.share} 1 0"
			use:cell={g.id}
			data-editor-group={g.id}
			onpointerdowncapture={(e) => onCellPointerDown(g, e)}
			onfocusincapture={() => editorGroups.isFocused(g) || editorGroups.focus(g.id)}
			role="presentation"
		>
			<EditorPane {...paneProps.get(g.id)!} />
		</div>
	{/each}
</div>
