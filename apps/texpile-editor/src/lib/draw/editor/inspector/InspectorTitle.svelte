<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { FigureStatement } from '../figure/figureLanguage';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { renameStatement } from '../objects/arrangeCommands';

	type Props = { editor: FigureEditorState; st: FigureStatement; title: string };
	const props: Props = $props();

	const shown = $derived(props.editor.language.readLabel(props.editor.source, props.st) ?? props.title);

	let field = $state<HTMLInputElement>();

	function commit(): void {
		if (!field) return;
		const next = field.value.trim();
		if (next !== shown) renameStatement(props.editor, props.st.i, next);
		field.value = shown;
	}
</script>

<input
	bind:this={field}
	class="hover:bg-surface-200-800 focus:bg-surface-200-800 rounded-base -ml-1 h-6 min-w-0 flex-1 truncate bg-transparent px-1 text-sm font-semibold outline-none"
	value={shown}
	aria-label={m.figure_object_name()}
	spellcheck="false"
	onkeydown={(e) => {
		e.stopPropagation();
		if (e.key === 'Escape' && field) field.value = shown;
		if (e.key === 'Enter' || e.key === 'Escape') field?.blur();
	}}
	onblur={commit}
/>
