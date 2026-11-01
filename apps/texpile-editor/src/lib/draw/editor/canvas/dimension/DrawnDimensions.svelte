<script lang="ts">
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import type { CanvasGesture } from '../../state/gesture/canvasGesture.svelte';
	import DimensionMark from './DimensionMark.svelte';
	import { previewDimensions } from './previewDimensions';

	type Props = { editor: FigureEditorState; gesture: CanvasGesture };
	const props: Props = $props();

	const preview = $derived(props.gesture.preview);
	const dimensions = $derived(
		preview ? previewDimensions(preview, (u, v) => props.editor.toCanvas(u, v), props.editor.viewport.scale) : []
	);
</script>

<g pointer-events="none" style:color="var(--primary-ink)">
	{#each dimensions as d (d.field)}
		{#if d.drawing}<DimensionMark drawing={d.drawing} />{/if}
	{/each}
</g>
