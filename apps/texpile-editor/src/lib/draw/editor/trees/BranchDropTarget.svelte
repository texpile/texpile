<script lang="ts">
	import type { CanvasGesture } from '../state/gesture/canvasGesture.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';

	const PAD_PX = 4;

	type Props = { editor: FigureEditorState; gesture: CanvasGesture };
	const props: Props = $props();

	const b = $derived(props.gesture.dropOnto);
	const k = $derived(1 / props.editor.viewport.scale);
</script>

<!-- the node a carried branch goes under when it is let go -->
{#if b}
	<rect
		pointer-events="none"
		x={b.x1 - PAD_PX * k}
		y={b.y1 - PAD_PX * k}
		width={b.x2 - b.x1 + 2 * PAD_PX * k}
		height={b.y2 - b.y1 + 2 * PAD_PX * k}
		rx={3 * k}
		fill="var(--primary-tint)"
		stroke="var(--primary-ink)"
		stroke-width="1.5"
		vector-effect="non-scaling-stroke"
	/>
{/if}
