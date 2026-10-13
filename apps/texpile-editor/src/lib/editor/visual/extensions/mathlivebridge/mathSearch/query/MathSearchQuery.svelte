<script lang="ts">
	// the search box at the top of the math search: drawn here, typed through the equation (mathSearchKeys.ts)
	import { Search } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import { mathSearch } from '../mathSearch.svelte';
	import { selectionEnd, selectionStart } from './queryBox';
	import { keepInSight } from './keepInSight';

	const box = $derived(mathSearch.box);
	const start = $derived(selectionStart(box));
	const end = $derived(selectionEnd(box));
	const caretFirst = $derived(box.head === start);
</script>

{#snippet caret()}<span class="math-search-caret" class:invisible={start !== end} use:keepInSight={box}></span>{/snippet}

<div class="border-surface-200-800 mb-1 flex items-center gap-2 border-b px-2 pt-1 pb-2">
	<Search class="text-muted size-4 shrink-0" />
	<!-- no whitespace between the parts: whitespace-pre would draw it -->
	<span class="min-w-0 flex-1 overflow-hidden whitespace-pre"
		>{box.text.slice(0, start)}{#if caretFirst}{@render caret()}{/if}<span class="bg-primary-500/30">{box.text.slice(start, end)}</span
		>{#if !caretFirst}{@render caret()}{/if}{box.text.slice(end)}{#if !box.text}<span class="text-muted">{m.mathsearch_placeholder()}</span
			>{/if}</span
	>
</div>

<style>
	/* the equation has the real caret, so this one only shows where typing goes */
	.math-search-caret {
		display: inline-block;
		width: 1px;
		height: 1.1em;
		margin-right: -1px;
		vertical-align: text-bottom;
		background: currentColor;
		animation: math-search-blink 1s steps(1) infinite;
	}
	@keyframes math-search-blink {
		50% {
			opacity: 0;
		}
	}
</style>
