<script lang="ts">
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import { dimensionDrawing } from './dimensionDrawing';
	import DimensionMark from './DimensionMark.svelte';
	import { pickMark } from './pickMarks';
	import PickMarkShape from './PickMarkShape.svelte';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const dimension = $derived(props.editor.dimension);
	const scale = $derived(props.editor.viewport.scale);
	const shown = $derived(dimension.placed ?? dimension.following);
	const drawing = $derived(shown && dimensionDrawing(shown.target, shown.placement, scale));
	const picked = $derived(dimension.picks.flatMap((p) => pickMark(p) ?? []));
	const hovered = $derived(dimension.hovered && pickMark(dimension.hovered));
</script>

<!-- a CAD sketch's colors: what is picked and the dimension in one, what the pointer is over in the selection's -->
<g pointer-events="none">
	{#if hovered}<g style:color="var(--primary-ink)"><PickMarkShape mark={hovered} {scale} /></g>{/if}
	<g style:color="var(--warning-ink)">
		{#each picked as mark, n (n)}<PickMarkShape {mark} {scale} />{/each}
		{#if drawing}<DimensionMark {drawing} />{/if}
	</g>
</g>
