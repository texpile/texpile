<script lang="ts">
	// the focused editor's format toolbar, floating at the top of its pane, with the word count at its right end; gone
	// while a code block in the visual editor has the caret, where no formatting applies
	import { setContext } from 'svelte';
	import { fade } from 'svelte/transition';
	import { rawEditorActiveStore } from '$lib/stores/editorStore';
	import LatexToolbar from '$lib/languages/latex/visual/LatexToolbar.svelte';
	import LatexSourceToolbar from '$lib/languages/latex/source/LatexSourceToolbar.svelte';
	import MarkdownToolbar from '$lib/languages/markdown/visual/MarkdownToolbar.svelte';
	import MarkdownSourceToolbar from '$lib/languages/markdown/source/MarkdownSourceToolbar.svelte';
	import TypstToolbar from '$lib/languages/typst/visual/toolbar/TypstToolbar.svelte';
	import TypstSourceToolbar from '$lib/languages/typst/source/TypstSourceToolbar.svelte';
	import { TOOLBAR_HOST, type ToolbarHost } from '$lib/editor/visual/toolbar/ToolbarOverflow.svelte';
	import { layout, updateLayout } from '$lib/storage/layout';
	import WordCount from '../WordCount.svelte';
	import type { FormatToolbar } from './formatToolbar';
	import type { EditorPaneProps } from '../editorPaneProps';

	type Props = {
		formatBar: FormatToolbar;
		onCountWords: EditorPaneProps['onCountWords'];
		onPickMain: EditorPaneProps['onPickMain'];
		/** the pane has focus */
		shown: boolean;
	};
	const props: Props = $props();
	const { kind, mode } = $derived(props.formatBar);

	setContext<ToolbarHost>(TOOLBAR_HOST, {
		get open() {
			return layout.current.formatBarExpanded;
		},
		toggle: () => updateLayout({ formatBarExpanded: !layout.current.formatBarExpanded }),
		trailing: wordCount
	});
</script>

{#snippet wordCount()}
	<div class="border-surface-200-800 flex shrink-0 items-center border-l pl-2 @max-[24rem]:hidden">
		<WordCount details={props.onCountWords} pickMain={props.onPickMain} />
	</div>
{/snippet}

<!-- local: a global fade kept a slot that went from the layout on the page, held there by its bar -->
{#if props.shown && !(mode === 'visual' && rawEditorActiveStore.current)}
	<div
		transition:fade={{ duration: 200 }}
		class="bg-surface-50-950 border-surface-200-800 rounded-container @container absolute top-3 left-1/2 z-20 flex w-[min(40rem,calc(100%-1.5rem))] -translate-x-1/2 items-center border px-2 py-0.5 shadow-lg"
	>
		{#if mode === 'visual'}
			{#if kind === 'md'}
				<MarkdownToolbar />
			{:else if kind === 'typ'}
				<TypstToolbar />
			{:else}
				<LatexToolbar />
			{/if}
		{:else if kind === 'md'}
			<MarkdownSourceToolbar />
		{:else if kind === 'typ'}
			<TypstSourceToolbar />
		{:else}
			<LatexSourceToolbar />
		{/if}
	</div>
{/if}
