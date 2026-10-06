<script lang="ts">
	// The per-dialect format toolbar over the editor: the visual one or the source one,
	// matching the mounted editor's dialect.
	import LatexToolbar from '$lib/languages/latex/visual/LatexToolbar.svelte';
	import LatexSourceToolbar from '$lib/languages/latex/source/LatexSourceToolbar.svelte';
	import MarkdownToolbar from '$lib/languages/markdown/visual/MarkdownToolbar.svelte';
	import MarkdownSourceToolbar from '$lib/languages/markdown/source/MarkdownSourceToolbar.svelte';
	import TypstToolbar from '$lib/languages/typst/visual/toolbar/TypstToolbar.svelte';
	import TypstSourceToolbar from '$lib/languages/typst/source/TypstSourceToolbar.svelte';
	import type { FileKind } from '$lib/workspace/documentBuffer.svelte';

	/** inert: a parked editor group's, drawn so the editor under it stays put, but taking no clicks */
	let { kind, mode, inert = false }: { kind: FileKind; mode: 'visual' | 'source'; inert?: boolean } = $props();
</script>

<div class="border-surface-200-800 @container relative z-20 flex min-h-10 items-center overflow-clip border-b px-2" {inert}>
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
