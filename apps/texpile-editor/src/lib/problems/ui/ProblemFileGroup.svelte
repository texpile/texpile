<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { relativeInside } from '$lib/workspace/fileSystem';
	import type { ProblemGroup } from '../problemsStore.svelte';
	import ProblemRow from './ProblemRow.svelte';

	type Props = {
		group: ProblemGroup;
		root: string;
		onJump: (file: string, line: number, words?: string) => void;
		onShowAgent: () => void;
	};
	const props: Props = $props();
	const { group, root, onJump, onShowAgent } = $derived(props);

	const name = $derived(
		group.file
			? (relativeInside(root, group.file) ?? group.file).replace(/\\/g, '/')
			: group.outside
				? m.problems_group_outside()
				: m.problems_group_compile()
	);
</script>

<div class="text-muted flex items-center gap-2 px-6 pt-1.5 font-medium">
	<span class="cap-center min-w-0 truncate">{name}</span>
	<span class="cap-center tabular-nums">{group.problems.length}</span>
</div>
<div class="pl-4">
	{#each group.problems as problem, i (i)}
		<ProblemRow {problem} {onJump} {onShowAgent} />
	{/each}
</div>
