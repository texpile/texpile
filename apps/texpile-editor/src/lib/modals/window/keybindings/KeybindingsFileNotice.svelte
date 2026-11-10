<script lang="ts">
	import { userKeybindings } from '$lib/keybindings/keybindings.svelte';
	import type { KeybindingProblem } from '$lib/keybindings/resolver/keybindingRules';
	import { m } from '$lib/paraglide/messages';

	const user = $derived(userKeybindings());

	function describe(p: KeybindingProblem): string {
		const n = p.index + 1;
		if (p.kind === 'notObject') return m.keybindings_problem_not_object({ n });
		if (p.kind === 'noCommand') return m.keybindings_problem_no_command({ n });
		if (p.kind === 'badKey') return m.keybindings_problem_bad_key({ n, key: p.key });
		return m.keybindings_problem_bad_when({ n, message: p.message });
	}
</script>

{#if user.unreadable}
	<p class="text-warning-ink text-xs leading-relaxed">{m.keybindings_unreadable()}</p>
{:else if user.problems.length}
	<div class="text-warning-ink text-xs leading-relaxed">
		<p>{user.problems.length === 1 ? m.keybindings_problems_one() : m.keybindings_problems_other({ count: user.problems.length })}</p>
		<ul class="mt-1 list-disc pl-4">
			{#each user.problems as problem (problem.index)}<li>{describe(problem)}</li>{/each}
		</ul>
	</div>
{/if}
