<script lang="ts">
	import { untrack } from 'svelte';
	import { chipSourceEditor, type ChipSourceEditor, type ChipSourceEditorOptions } from './chipSourceEditor';
	import * as Panel from './panel';

	// heading: the LaTeX or Typst title over the field
	type Props = Omit<ChipSourceEditorOptions, 'text'> & { source: string; heading?: boolean };

	const props: Props = $props();

	let editor: ChipSourceEditor | null = null;

	function attachEditor(parent: HTMLElement) {
		editor = untrack(() => chipSourceEditor(parent, { ...props, text: props.source }));
		return () => {
			editor?.view.destroy();
			editor = null;
		};
	}

	// an undo or a setting changed the chip under the field
	$effect(() => editor?.setText(props.source));
</script>

<div class="flex flex-col gap-2">
	{#if props.heading !== false}
		<Panel.Header title={props.language === 'typst' ? 'Typst' : 'LaTeX'} />
	{/if}
	<div class="border-surface-300-700 rounded-base focus-within:border-primary-500 overflow-hidden border" {@attach attachEditor}></div>
</div>
