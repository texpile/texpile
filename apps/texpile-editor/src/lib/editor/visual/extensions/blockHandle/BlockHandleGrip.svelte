<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { GripVertical } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	type BlockHandleGripProps = {
		onSelect: () => void;
		onDragStart: (event: DragEvent) => void;
	};
	const props: BlockHandleGripProps = $props();
</script>

<button
	type="button"
	class="block-handle-btn cursor-grab"
	aria-label={m.blockhandle_drag_move()}
	use:tip={m.blockhandle_drag_move()}
	draggable="true"
	onclick={props.onSelect}
	ondragstart={props.onDragStart}
>
	<GripVertical class="size-4" />
</button>
