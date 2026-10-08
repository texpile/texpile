<script lang="ts">
	// One editor slot: its pane, the outline of a drop it would take, and the gestures that bring it into focus
	import EditorPane from '../EditorPane.svelte';
	import type { EditorPaneProps } from '../editorPaneProps';
	import type { DropZone } from '$lib/workspace/groups/splitDrop';

	type Props = {
		id: number;
		pane: EditorPaneProps;
		/** where a drop would land: the whole slot, or the half a split on that edge would take */
		hint: DropZone | null;
		style?: string;
		register: (id: number, node: HTMLElement) => () => void;
		onPointerDown: (e: PointerEvent) => void;
		onFocusIn: (e: FocusEvent) => void;
		onDragOver: (e: DragEvent) => void;
		/** the drag left the slot, or went over its strip, which marks its own drop place */
		onDragOff: () => void;
		onDrop: (e: DragEvent) => void;
	};
	const props: Props = $props();

	const HALVES: Record<DropZone, string> = {
		center: 'inset-0',
		left: 'inset-y-0 left-0 w-1/2',
		right: 'inset-y-0 right-0 w-1/2',
		top: 'inset-x-0 top-0 h-1/2',
		bottom: 'inset-x-0 bottom-0 h-1/2'
	};

	function cell(node: HTMLElement, id: number) {
		return { destroy: props.register(id, node) };
	}
</script>

<div
	class="relative flex min-h-0 min-w-0 flex-col"
	style={props.style}
	use:cell={props.id}
	data-editor-group={props.id}
	onpointerdowncapture={props.onPointerDown}
	onfocusincapture={props.onFocusIn}
	ondragover={props.onDragOver}
	ondragenter={(e) => {
		if (e.target instanceof Element && e.target.closest('[role=tablist]')) props.onDragOff();
	}}
	ondragleave={(e) => {
		if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) props.onDragOff();
	}}
	ondrop={props.onDrop}
	role="presentation"
>
	<EditorPane {...props.pane} />
	{#if props.hint}
		<div class="bg-primary-500/15 border-primary-500 pointer-events-none absolute z-40 border-2 {HALVES[props.hint]}"></div>
	{/if}
</div>
