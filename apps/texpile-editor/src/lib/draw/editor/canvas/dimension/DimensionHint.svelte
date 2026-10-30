<script lang="ts">
	import CanvasPrompt from '../notices/CanvasPrompt.svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const dimension = $derived(props.editor.dimension);
	// what the next click does, as CAD's prompt line says it
	const hint = $derived.by(() => {
		if (props.editor.tool !== 'dimension') return null;
		if (dimension.placed) return 'Type the size, or the text to print such as $a$, then press Enter; Esc leaves it';
		if (dimension.measured?.kind === 'length')
			return 'Move to put the dimension, then click on the empty canvas; or click a second line for their angle';
		if (dimension.measured) return 'Move to put the dimension, then click on the empty canvas';
		if (dimension.picks.length) return 'Click a second point for the distance between them';
		return 'Click a line, a point, a circle or a box to dimension it';
	});
</script>

{#if hint}
	<CanvasPrompt text={hint} />
{/if}
