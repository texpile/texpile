<script lang="ts">
	import type { FigureEditorState } from '../state/editorState.svelte';
	import ObjectRow from './ObjectRow.svelte';
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

<div
	class="group/tree scroll-inset-r min-h-0 overflow-x-auto overflow-y-auto p-1.5 outline-none"
	style="flex: 1 1 0%"
	role="tree"
	aria-label="Objects"
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
		<p class="text-faint px-1.5 text-xs">Each shape drawn is listed here, in the order {props.editor.language.name} draws it.</p>
	{/each}
</div>
