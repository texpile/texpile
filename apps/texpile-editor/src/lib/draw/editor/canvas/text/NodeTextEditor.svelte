<script lang="ts">
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import { editedNodeBox, nodeTextPlace } from './nodeTextPlace';
	import { dropEmptyText, isMultiline, previewSelectedText, readSelectedText, writeSelectedText } from '../../state/selection/nodeText';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const box = $derived(editedNodeBox(props.editor));
	const place = $derived(nodeTextPlace(props.editor, box));
	const initial = $derived(box ? (readSelectedText(props.editor) ?? '') : '');
	let draft = $state('');
	let problem = $state<string | null>(null);

	function begin(el: HTMLTextAreaElement) {
		draft = initial;
		// eslint-disable-next-line no-param-reassign -- the value binding lands after this, and would undo the select
		el.value = initial;
		el.focus();
		el.select();
	}

	function finish(leaving: boolean) {
		if (!props.editor.editingText) return;
		if (draft !== initial && !writeSelectedText(props.editor, draft)) {
			problem = props.editor.language.textProblem(draft);
			if (!leaving) return;
			previewSelectedText(props.editor, null);
		}
		props.editor.editingText = false;
		dropEmptyText(props.editor);
	}

	// Escape commits, as in Excalidraw; Enter is a new line in a node and the end of a cell's or a branch's one line
	function onkeydown(e: KeyboardEvent) {
		e.stopPropagation();
		const commits = e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !isMultiline(props.editor)));
		if (!commits) return;
		e.preventDefault();
		finish(false);
	}
</script>

{#if place}
	<textarea
		class="border-primary-500 bg-surface-50-950 rounded-base absolute z-10 -translate-x-1/2 resize-none border px-1.5 py-1 text-center font-mono text-sm shadow-lg outline-none {problem
			? 'border-error-500'
			: ''}"
		style:left="{place.cx}px"
		style:top="{place.top}px"
		style:min-width="{place.w}px"
		style:field-sizing="content"
		rows={Math.max(1, draft.split('\n').length)}
		cols={1}
		aria-label="Text on the canvas"
		aria-invalid={!!problem}
		value={draft}
		oninput={(e) => {
			draft = e.currentTarget.value;
			problem = null;
			previewSelectedText(props.editor, draft);
		}}
		{onkeydown}
		onblur={() => finish(true)}
		onpointerdown={(e) => e.stopPropagation()}
		{@attach begin}></textarea>
{/if}
