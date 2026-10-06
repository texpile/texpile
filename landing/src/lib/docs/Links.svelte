<script lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import type { LinkItem } from './blocks';

	let { items }: { items: LinkItem[] } = $props();
</script>

<div class="not-prose my-6 flex flex-wrap gap-x-6 gap-y-2">
	{#each items as item (item.href)}
		<a
			href={localizeHref(item.href)}
			target={item.external ? '_blank' : undefined}
			rel={item.external ? 'noopener noreferrer' : undefined}
			class="text-primary-ink hover:text-primary-ink inline-flex items-center gap-1.5 font-medium transition-colors"
		>
			{item.label}
			<ArrowRight class="h-4 w-4" />
		</a>
	{/each}
</div>
