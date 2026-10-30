<script lang="ts">
	import type { CanvasGesture } from '../../state/gesture/canvasGesture.svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import { rotationPivot } from '../../state/gesture/drags/rotateDrag';

	const R_PX = 4.5;

	type Props = { editor: FigureEditorState; gesture: CanvasGesture };
	const props: Props = $props();

	// none while the selection is carried, or redrawn under a turn
	const pivot = $derived(props.gesture.carrying || props.editor.preview !== null ? null : rotationPivot(props.editor));
	const k = $derived(1 / props.editor.viewport.scale);
</script>

<!-- above the selection, as Excalidraw's: a drag turns it about its middle -->
{#if pivot}
	<line
		x1={pivot.top[0]}
		y1={pivot.top[1]}
		x2={pivot.handle[0]}
		y2={pivot.handle[1] - R_PX * k}
		stroke="var(--primary-ink)"
		stroke-width="1"
		vector-effect="non-scaling-stroke"
		pointer-events="none"
	/>
	<circle
		data-handle="rot"
		aria-label="Rotate"
		class="cursor-grab"
		cx={pivot.handle[0]}
		cy={pivot.handle[1]}
		r={R_PX * k}
		fill="var(--color-surface-50-950)"
		stroke="var(--primary-ink)"
		stroke-width="1.5"
		vector-effect="non-scaling-stroke"
	/>
{/if}
