<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { Problem } from '../problemTypes';
	import ProblemRow from './ProblemRow.svelte';

	type Props = {
		problems: Problem[];
		onJump: (file: string, line: number, words?: string) => void;
		onShowAgent: () => void;
	};
	const props: Props = $props();
	const { problems, onJump, onShowAgent } = $derived(props);

	// a long paper can hold tens of thousands of findings, and drawing them all at once froze the window
	const STEP = 200;
	let limit = $state(STEP);
	const shown = $derived(problems.slice(0, limit));
	const more = $derived(Math.min(STEP, problems.length - limit));
</script>

<div class="pl-4">
	{#each shown as problem, i (i)}
		<ProblemRow {problem} {onJump} {onShowAgent} />
	{/each}
	{#if more > 0}
		<button class="btn btn-sm preset-tonal mx-2 my-1 h-6 px-2" onclick={() => (limit += STEP)}>
			<span class="cap-center">{m.problems_show_more({ count: more })}</span>
		</button>
	{/if}
</div>
