<script lang="ts">
	import { BookOpen, Hash, Heading, Image, Table } from '@lucide/svelte';
	import type { ReferenceItem } from './referenceManagerPlugin';

	let {
		items = [],
		selectedIndex = 0,
		onSelect,
		query = ''
	}: {
		items: ReferenceItem[];
		selectedIndex: number;
		onSelect: (item: ReferenceItem) => void;
		query?: string;
	} = $props();

	function getIcon(type: string) {
		switch (type) {
			case 'bibliography':
				return BookOpen;
			case 'equation':
				return Hash;
			case 'figure':
				return Image;
			case 'table':
				return Table;
			case 'section':
				return Heading;
			default:
				return BookOpen;
		}
	}
</script>

<div class="card bg-surface-50-950 border-surface-300-700 max-h-80 w-96 overflow-hidden border shadow-lg">
	<div class="max-h-80 overflow-y-auto">
		{#if items.length === 0}
			<div class="text-muted p-4 text-center text-sm">
				{#if query}
					No references found for "{query}"
				{:else}
					No references available
				{/if}
			</div>
		{:else}
			<div class="py-1">
				{#each items as item, index (item.id)}
					{@const IconComponent = getIcon(item.type)}
					<button
						type="button"
						class="flex w-full items-start gap-3 px-4 py-2 text-left {index === selectedIndex
							? 'preset-tonal-primary'
							: 'hover:preset-tonal-primary'}"
						onclick={() => onSelect(item)}
						onmousedown={(e) => e.preventDefault()}
					>
						<IconComponent class="mt-0.5 h-4 w-4 flex-shrink-0" />
						<div class="min-w-0 flex-1">
							<div class="truncate text-sm font-medium">
								{item.displayText}
							</div>
							{#if item.subtitle}
								<div class="mt-0.5 truncate text-xs opacity-60">
									{item.subtitle}
								</div>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
