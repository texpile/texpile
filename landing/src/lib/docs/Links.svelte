<script lang="ts">
	import { ArrowRight } from '@lucide/svelte';
	import type { LinkItem } from './blocks';

	let { items }: { items: LinkItem[] } = $props();
</script>

<div class="not-prose my-6 flex flex-wrap gap-x-6 gap-y-2">
	{#each items as item (item.href)}
		<a
			href={item.href}
			target={item.external ? '_blank' : undefined}
			rel={item.external ? 'noopener noreferrer' : undefined}
			class="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1.5 font-medium transition-colors"
		>
			{item.label}
			<ArrowRight class="h-4 w-4" />
		</a>
	{/each}
</div>
