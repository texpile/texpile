<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import { ignoreProblem } from '../ignoredProblems';
	import { agentFixOffered, fixWithAgent } from '../agentFix';
	import type { Problem } from '../problemTypes';
	import { PROBLEM_LOOKS } from './problemLooks';

	type Props = {
		problem: Problem;
		onJump: (file: string, line: number, words?: string) => void;
		onShowAgent: () => void;
	};
	const props: Props = $props();
	const { problem, onJump, onShowAgent } = $derived(props);

	const look = $derived(PROBLEM_LOOKS[problem.filter]);
	const file = $derived(problem.outside ? null : problem.file);
	// the words, where the message leaves them out
	const quoted = $derived(
		problem.words && problem.words.length <= 40 && !problem.message.includes(problem.words) ? `"${problem.words}"` : null
	);
</script>

<div class="group hover:preset-tonal flex w-full items-start gap-2 px-2 py-1">
	<button
		class="flex min-w-0 flex-1 items-start gap-2 text-left {file ? 'cursor-pointer' : 'cursor-default'}"
		onclick={() => file && onJump(file, problem.line ?? 1, problem.words)}
	>
		<look.icon class="{look.ink} mt-0.5 size-3.5 shrink-0" />
		<span class="min-w-0 flex-1">
			<span class="block truncate" use:tip={problem.message}>
				{problem.message}
				{#if quoted}<span class="text-muted">{quoted}</span>{/if}
			</span>
			{#if problem.hint}
				<span class="text-muted block truncate" use:tip={problem.hint}>{problem.hint}</span>
			{/if}
		</span>
	</button>
	<div class="hidden shrink-0 items-center gap-1 group-focus-within:flex group-hover:flex">
		{#if problem.fix}
			{@const fix = problem.fix}
			<button class="btn btn-sm preset-tonal h-5 px-2" use:tip={fix.label} onclick={() => void fix.apply()}>{m.problems_fix()}</button>
		{/if}
		{#if file && agentFixOffered()}
			<button class="btn btn-sm preset-tonal h-5 px-2" onclick={() => void fixWithAgent(problem, onShowAgent)}
				>{m.problems_fix_agent()}</button
			>
		{/if}
		{#if problem.ignoreKey}
			{@const key = problem.ignoreKey}
			<button class="btn btn-sm preset-tonal h-5 px-2" onclick={() => ignoreProblem(key)}>{m.problems_ignore()}</button>
		{/if}
	</div>
	{#if problem.source}
		<span class="badge preset-tonal-surface shrink-0 px-1 py-0 text-[10px]">{problem.source}</span>
	{/if}
	{#if problem.line}
		<span class="text-muted shrink-0 font-mono">{m.problems_line({ line: problem.line })}</span>
	{/if}
</div>
