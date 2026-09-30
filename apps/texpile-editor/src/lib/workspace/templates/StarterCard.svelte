<script lang="ts">
	// one card in the starter picker's grid
	import type { Component, Snippet } from 'svelte';

	let {
		icon: Icon,
		title,
		description,
		disabled = false,
		wide = false,
		onclick,
		oncontextmenu,
		children
	}: {
		icon: Component<{ class?: string }>;
		title: string;
		description: string;
		disabled?: boolean;
		/** spans both columns */
		wide?: boolean;
		onclick: () => void;
		oncontextmenu?: (e: MouseEvent) => void;
		/** drawn over the card's top right corner, outside the button (a menu trigger) */
		children?: Snippet;
	} = $props();
</script>

<div class="relative {wide ? 'sm:col-span-2' : ''}">
	<button
		class="border-surface-200-800 hover:border-primary-500 hover:bg-surface-100-900 rounded-container flex h-full w-full flex-col gap-1 border p-3 text-left transition-colors disabled:opacity-50"
		{disabled}
		{onclick}
		{oncontextmenu}
	>
		<span class="flex items-center gap-2 font-medium {children ? 'pr-6' : ''}"
			><Icon class="text-primary-ink size-4 shrink-0" /><span class="cap-center">{title}</span></span
		>
		<span class="text-muted text-xs">{description}</span>
	</button>
	{@render children?.()}
</div>
