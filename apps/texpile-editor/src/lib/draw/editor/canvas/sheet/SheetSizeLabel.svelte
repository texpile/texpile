<script lang="ts">
	import { BP_PER_CM } from '../../figure/lengthUnits';
	import { formatNumber } from '../../figure/numbers';
	import type { CanvasGesture } from '../../state/gesture/canvasGesture.svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';

	type Props = { editor: FigureEditorState; gesture: CanvasGesture };
	const props: Props = $props();

	const s = $derived(props.editor.sheet?.framed ? props.editor.sheet : null);
	// on the paper, whatever the picture's scale
	const size = $derived(s ? `${formatNumber(s.w / BP_PER_CM)} × ${formatNumber(s.h / BP_PER_CM)} cm` : '');
	const topLeft = $derived(s ? props.editor.viewport.toScreen(s.x, s.y + s.h) : null);
	// below the bottom edge, which stays put while the sheet is sized, so the readout does not travel
	const bottom = $derived(s ? props.editor.viewport.toScreen(s.x + s.w / 2, s.y) : null);
</script>

{#if s && topLeft && bottom}
	{#if props.gesture.sizing}
		<div
			class="badge preset-filled-primary-500 pointer-events-none absolute -translate-x-1/2 tabular-nums"
			style:left="{bottom[0]}px"
			style:top="{bottom[1] + 8}px"
		>
			{size}
		</div>
	{:else}
		<div
			class="text-muted pointer-events-none absolute -translate-y-full pb-1 text-xs tabular-nums"
			style:left="{topLeft[0]}px"
			style:top="{topLeft[1]}px"
		>
			{size}
		</div>
	{/if}
{/if}
