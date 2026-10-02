<script lang="ts">
	// the grammar rules that are off, each with its switch; one turned back on keeps its row
	import { tip } from '$lib/components/tooltip.svelte';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { settings } from '$lib/settings';
	import { QUIET_RULES, ruleIsOn, ruleName, SPELLING_RULE } from '$lib/editor/spellcheck/config/grammarRules';
	import { setGrammarRule } from '$lib/editor/spellcheck/config/spellcheckConfig';
	import { lintDescriptions } from '$lib/editor/spellcheck/linter';
	import { m } from '$lib/paraglide/messages';

	const choices = $derived(settings.current.grammarRules ?? {});
	const rules = $derived(
		[...new Set([...QUIET_RULES, ...Object.keys(choices)])]
			.filter((r) => r !== SPELLING_RULE)
			.sort((a, b) => ruleName(a).localeCompare(ruleName(b)))
	);

	let descriptions = $state<Record<string, string>>({});
	lintDescriptions()
		.then((d) => (descriptions = d))
		.catch(() => undefined);
</script>

<div class="border-surface-200-800 border-b py-4 last:border-b-0">
	<div class="text-sm font-medium">{m.prefs_grammar_rules()}</div>
	<ul class="mt-2">
		{#each rules as rule (rule)}
			<li class="flex items-center justify-between gap-6 py-1">
				<span class="min-w-0 truncate text-sm" use:tip={descriptions[rule] ?? ''}>{ruleName(rule)}</span>
				<Switch checked={ruleIsOn(rule, choices)} onCheckedChange={(d) => setGrammarRule(rule, d.checked)}>
					<Switch.Control><Switch.Thumb /></Switch.Control>
					<Switch.HiddenInput aria-label={ruleName(rule)} />
				</Switch>
			</li>
		{/each}
	</ul>
</div>
