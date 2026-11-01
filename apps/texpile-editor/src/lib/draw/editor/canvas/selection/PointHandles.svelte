<script lang="ts">
	import type { CanvasGesture } from '../../state/gesture/canvasGesture.svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';

	const HANDLE_PX = 8;

	type Props = { editor: FigureEditorState; gesture: CanvasGesture };
	const props: Props = $props();

	const size = $derived(HANDLE_PX / props.editor.viewport.scale);
	// the handles follow the text, which has the move once it is dropped
	const offset = $derived(props.gesture.offset?.until === null ? props.gesture.offsetOf(props.editor.selected) : null);
</script>

<g transform={offset ? `translate(${offset[0]} ${offset[1]})` : undefined}>
	{#each props.editor.handles as h (h.key)}
		<circle
			data-handle={h.key}
			class="cursor-pointer"
			cx={h.at[0]}
			cy={h.at[1]}
			r={h.key === 'k' ? size / 3 : size / 2}
			fill={h.key === 'k' ? 'var(--primary-ink)' : 'var(--color-surface-50-950)'}
			stroke="var(--primary-ink)"
			stroke-width="1.5"
			vector-effect="non-scaling-stroke"
		/>
	{/each}
</g>
