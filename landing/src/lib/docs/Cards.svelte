<script lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime';
	import OsLogo from '$lib/comp/OsLogo.svelte';
	import type { CardItem } from './blocks';
	import { ICONS } from './icons';

	let { items }: { items: CardItem[] } = $props();

	const OS = ['windows', 'apple', 'linux'] as const;
	type Os = (typeof OS)[number];
	const isOs = (icon: string): icon is Os => (OS as readonly string[]).includes(icon);

	const iconFor = (name: string) => {
		const icon = ICONS[name];
		if (!icon) throw new Error(`no icon named "${name}"`);
		return icon;
	};
</script>

<div class="not-prose my-6 grid gap-4 {items.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}">
	{#each items as item (item.href)}
		<a
			href={localizeHref(item.href)}
			class="border-surface-200-800 hover:border-primary-500 group rounded-container flex flex-col border p-5 transition-colors"
		>
			{#if item.icon}
				<span class="preset-tonal-primary text-primary-ink rounded-base mb-3 flex h-9 w-9 items-center justify-center">
					{#if isOs(item.icon)}
						<OsLogo os={item.icon} class="h-4.5 w-4.5" />
					{:else}
						{@const Icon = iconFor(item.icon)}
						<Icon class="h-4.5 w-4.5" />
					{/if}
				</span>
			{/if}
			<span class="text-surface-900 group-hover:text-primary-ink font-semibold">{item.title}</span>
			<span class="text-muted mt-1.5 text-sm leading-relaxed">{item.blurb}</span>
		</a>
	{/each}
</div>
