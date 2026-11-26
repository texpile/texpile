<script lang="ts">
	import { LoaderCircle, Sparkles } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import type { MathSyntax } from '../mathFieldFactory';
	import type { WordsAnswer } from './mathFromWords.svelte';
	import { drawMath } from './mathPreview';

	type Props = { query: string; answer: WordsAnswer | null; syntax: MathSyntax };
	const props: Props = $props();
	const answer = $derived(props.answer);
</script>

<span class="flex h-8 w-12 shrink-0 items-center justify-center overflow-hidden text-xs">
	{#if answer?.state === 'done'}
		<span use:drawMath={{ source: answer.math, syntax: props.syntax }}></span>
	{:else if answer?.state === 'asking'}
		<LoaderCircle class="text-muted size-4 animate-spin" />
	{:else}
		<Sparkles class="text-muted size-4" />
	{/if}
</span>
<span class="flex min-w-0 flex-1 flex-col">
	<span class="truncate">{props.query}</span>
	{#if answer?.state === 'done'}
		<span class="text-muted truncate font-mono text-xs">{answer.math}</span>
	{:else if answer?.state === 'failed'}
		<span class="text-warning-ink truncate text-xs">{answer.error || m.mathsearch_words_failed()}</span>
	{:else if answer?.state === 'asking'}
		<span class="text-muted truncate text-xs">{m.mathsearch_words_asking()}</span>
	{:else}
		<span class="text-muted truncate text-xs">{m.mathsearch_words_ask()}</span>
	{/if}
</span>
