<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import { search } from './searchState.svelte';

	let { size = 'sm' }: { size?: 'sm' | 'lg' } = $props();

	let isMac = $state(false);
	$effect(() => {
		isMac = /Mac|iPhone|iPad/.test(navigator.platform);
	});
</script>

<button
	type="button"
	onclick={() => (search.open = true)}
	class="group border-surface-200-800 bg-surface-50-950 flex w-full items-center gap-2 border text-left transition-colors {size === 'lg'
		? 'hover:border-primary-500 rounded-container px-4 py-3 shadow-sm'
		: 'hover:border-primary-500 rounded-container px-3 py-2 text-sm'}"
>
	<SearchIcon class="text-faint group-hover:text-primary-ink shrink-0 {size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'}" />
	<span class="text-faint flex-1 truncate">{'Search the docs'}</span>
	<kbd
		class="text-surface-700-300 border-surface-300-700 bg-surface-100-900 rounded-base hidden h-5 min-w-5 shrink-0 items-center justify-center border px-1.5 font-sans text-xs leading-none shadow-[0_1px_0_var(--color-surface-300-700)] sm:inline-flex"
		>{isMac ? '⌘' : 'Ctrl'} K</kbd
	>
</button>
