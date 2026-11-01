<script lang="ts">
	import type { CanvasGesture } from '../../state/gesture/canvasGesture.svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import { lockedBox } from './lockedBox';

	type Props = { editor: FigureEditorState; gesture: CanvasGesture };
	const props: Props = $props();

	const box = $derived(props.gesture.lockedShown ? lockedBox(props.editor, props.gesture.lockedShown) : null);
</script>

{#if box}
	<rect
		x={box.x}
		y={box.y}
		width={box.w}
		height={box.h}
		fill="none"
		style:stroke="var(--color-surface-400-600)"
		stroke-width="1"
		stroke-dasharray="4 3"
		vector-effect="non-scaling-stroke"
		pointer-events="none"
	/>
{/if}
