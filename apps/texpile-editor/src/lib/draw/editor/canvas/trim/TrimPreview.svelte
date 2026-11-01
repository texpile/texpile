<script lang="ts">
	import type { FigureEditorState } from '../../state/editorState.svelte';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const removed = $derived(props.editor.tool === 'trim' ? props.editor.trim.hovered?.removed : null);
</script>

{#if removed}
	<polyline
		points={removed.map((p) => p.join(',')).join(' ')}
		fill="none"
		stroke="var(--error-ink)"
		stroke-width="3"
		stroke-dasharray="6 4"
		stroke-linecap="round"
		vector-effect="non-scaling-stroke"
		pointer-events="none"
		data-trim-preview
	/>
{/if}
