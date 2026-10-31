<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import CanvasPrompt from '../notices/CanvasPrompt.svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const dimension = $derived(props.editor.dimension);
	// what the next click does, as CAD's prompt line says it
	const hint = $derived.by(() => {
		if (props.editor.tool !== 'dimension') return null;
		if (dimension.placed) return m.figure_dimension_hint_typed();
		if (dimension.measured?.kind === 'length') return m.figure_dimension_hint_line();
		if (dimension.measured) return m.figure_dimension_hint_place();
		if (dimension.picks.length) return m.figure_dimension_hint_second();
		return m.figure_dimension_hint_pick();
	});
</script>

{#if hint}
	<CanvasPrompt text={hint} />
{/if}
