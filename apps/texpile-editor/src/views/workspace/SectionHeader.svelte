<script lang="ts">
	// A collapsible section title in the explorer's lower pane, as VS Code's Outline and Timeline
	// headers: the chevron and the name toggle it, and its actions sit at the end.
	import type { Snippet } from 'svelte';
	import { ChevronRight, ChevronDown } from '@lucide/svelte';

	let { title, collapsed, onToggle, actions }: { title: string; collapsed: boolean; onToggle: () => void; actions?: Snippet } = $props();
</script>

<div class="group flex items-center gap-1">
	<button
		type="button"
		class="text-faint flex min-w-0 flex-1 items-center gap-0.5 py-0.5 text-left text-xs font-semibold tracking-wide uppercase"
		aria-expanded={!collapsed}
		onclick={onToggle}
	>
		{#if collapsed}<ChevronRight class="size-3.5 shrink-0" />{:else}<ChevronDown class="size-3.5 shrink-0" />{/if}
		<span class="cap-center truncate">{title}</span>
	</button>
	{#if actions && !collapsed}{@render actions()}{/if}
</div>
