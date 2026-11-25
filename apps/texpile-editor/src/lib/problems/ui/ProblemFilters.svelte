<script lang="ts">
	import { problemsView } from '../problemsStore.svelte';
	import { PROBLEM_FILTERS } from '../problemTypes';
	import { PROBLEM_LOOKS } from './problemLooks';

	// Boxes only once a compile reports one, as its checkbox was
	const filters = $derived(PROBLEM_FILTERS.filter((f) => f !== 'box' || problemsView.counts.box > 0));
</script>

<div class="flex flex-wrap items-center gap-1">
	{#each filters as filter (filter)}
		{@const look = PROBLEM_LOOKS[filter]}
		{@const on = !problemsView.hidden.has(filter)}
		<button
			class="chip hover:bg-surface-wash {on ? '' : 'text-muted'} [--chip-size:var(--text-xs)]"
			aria-pressed={on}
			onclick={() => problemsView.toggle(filter)}
		>
			<look.icon class="text-muted size-3.5" />
			<span class="cap-center">{look.name()} {problemsView.counts[filter]}</span>
		</button>
	{/each}
</div>
