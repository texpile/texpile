<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronDown, ChevronRight } from '@lucide/svelte';

	type Props = { title: string; detail?: string; count: number; open: boolean; onToggle: () => void; children: Snippet };
	const props: Props = $props();
	const { title, detail, count, open, onToggle, children } = $derived(props);
</script>

<section>
	<button class="hover:preset-tonal flex w-full items-center gap-1 px-1 py-1 text-left" aria-expanded={open} onclick={onToggle}>
		{#if open}
			<ChevronDown class="size-3.5 shrink-0" />
		{:else}
			<ChevronRight class="size-3.5 shrink-0" />
		{/if}
		<span class="cap-center font-semibold">{title}</span>
		{#if detail}
			<span class="cap-center text-muted min-w-0 truncate">{detail}</span>
		{/if}
		<span class="cap-center text-muted ml-auto pr-1 tabular-nums">{count}</span>
	</button>
	{#if open}
		{@render children()}
	{/if}
</section>
