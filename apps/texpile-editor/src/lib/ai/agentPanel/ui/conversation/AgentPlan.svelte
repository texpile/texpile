<script lang="ts">
	// The agent's to-do list for the turn, as it sends it
	import { Check, Circle } from '@lucide/svelte';
	import type { PlanEntry } from '../../agentPanel.types';

	type Props = { entries: PlanEntry[] };
	const props: Props = $props();
</script>

<ul class="text-sm">
	{#each props.entries as entry, i (i)}
		<li class="flex items-center gap-2 {entry.status === 'completed' ? 'text-muted' : ''}">
			{#if entry.status === 'completed'}
				<Check class="text-success-ink size-3.5 shrink-0" />
			{:else}
				<Circle class="size-3.5 shrink-0 {entry.status === 'in_progress' ? 'text-primary-ink' : 'text-muted'}" />
			{/if}
			<span class="cap-center min-w-0 truncate">{entry.content}</span>
		</li>
	{/each}
</ul>
