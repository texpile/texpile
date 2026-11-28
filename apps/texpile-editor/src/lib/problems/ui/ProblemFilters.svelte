<script lang="ts">
	import { problemsView } from '../problemsStore.svelte';
	import { PROBLEM_FILTERS } from '../problemTypes';
	import { PROBLEM_LOOKS } from './problemLooks';

	// Boxes only once a compile reports one, as its checkbox was
	const filters = $derived(PROBLEM_FILTERS.filter((f) => f !== 'box' || problemsView.counts.box > 0));
</script>

<div class="flex flex-wrap items-center gap-1.5">
	{#each filters as filter (filter)}
		{@const look = PROBLEM_LOOKS[filter]}
		{@const on = !problemsView.hidden.has(filter)}
		<button
			class="btn btn-sm h-6 gap-1.5 px-2 text-xs {on ? 'preset-tonal' : 'preset-outlined-surface-200-800 hover:preset-tonal text-muted'}"
			aria-pressed={on}
			onclick={() => problemsView.toggle(filter)}
		>
			<look.icon class="size-3.5 {on ? look.ink : ''}" />
			<span class="cap-center">{look.name()} {problemsView.counts[filter]}</span>
		</button>
	{/each}
</div>
