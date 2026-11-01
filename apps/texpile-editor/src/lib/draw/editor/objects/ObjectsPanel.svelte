<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { arrangeActions } from './arrangeActions';
	import ObjectRow from './ObjectRow.svelte';
	import ObjectsHeaderActions from './ObjectsHeaderActions.svelte';
	import { ObjectsDrag } from './objectsDrag.svelte';
	import { ObjectsList } from './objectsList.svelte';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const drag = $derived(new ObjectsDrag(props.editor));
	const list = $derived(new ObjectsList(props.editor));

	function onkeydown(e: KeyboardEvent) {
		if (list.handleKey(e)) e.preventDefault();
	}
</script>

{#if list.rows.length}
	<aside
		class="bg-surface-50-950 border-surface-200-800 rounded-container pointer-events-auto flex max-h-[40vh] shrink-0 flex-col overflow-hidden border shadow-lg"
		data-own-scroll
	>
		<div class="border-surface-200-800 flex h-9 shrink-0 items-center justify-between gap-3 border-b pr-1.5 pl-3">
			<span class="text-sm font-semibold">{m.figure_objects()}</span>
			<ObjectsHeaderActions actions={arrangeActions(props.editor)} />
		</div>
		<div
			class="group/tree min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1.5 outline-none"
			role="tree"
			aria-label={m.figure_objects()}
			aria-multiselectable="true"
			tabindex="0"
			{onkeydown}
		>
			{#each list.rows as row (row.st.i)}
				<ObjectRow
					editor={props.editor}
					{row}
					{drag}
					foldable={list.foldable}
					renaming={list.renaming === row.st.i}
					onpick={(e) => list.selectRow(e, row.st.i)}
					onstartrename={() => (list.renaming = row.st.i)}
					onrename={(label) => list.finishRename(row.st.i, label)}
					ontoggle={() => list.toggleFolded(row.st.i)}
				/>
			{:else}
				<p class="text-faint px-1.5 text-xs">{m.figure_objects_empty({ engine: props.editor.language.name })}</p>
			{/each}
		</div>
	</aside>
{/if}
