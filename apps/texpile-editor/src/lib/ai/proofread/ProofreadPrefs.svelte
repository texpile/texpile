<script lang="ts">
	// Preferences › Spelling & Grammar: proofreading with AI and what it may do
	import { settings, updateSettings } from '$lib/settings';
	import { m } from '$lib/paraglide/messages';
	import PrefsSwitchRow from '$lib/modals/window/rows/PrefsSwitchRow.svelte';
	import { setGrammarRule } from '$lib/editor/spellcheck/config/spellcheckConfig';
	import { ruleIsOn } from '$lib/editor/spellcheck/config/grammarRules';
	import { AI_RULES } from '$lib/editor/spellcheck/review/reviewMerge';
	import { proofreadStatus } from './proofreadStatus.svelte';
	import { agentOffered } from '$lib/ai/agent/aiAgent.svelte';
	import { openPreferencesAt } from '$lib/stores/dialogStore';

	const on = $derived(settings.current.proofreadAi);
	const wording = $derived(ruleIsOn(AI_RULES.wording, settings.current.grammarRules ?? {}));
</script>

{#if !settings.current.aiOff}
	<PrefsSwitchRow id="ai-proofread" checked={on} onChange={(v) => updateSettings({ proofreadAi: v })} />

	{#if on && !agentOffered()}
		<p class="text-muted pb-3 text-xs leading-relaxed">
			{m.prefs_proofread_needs_agent()}
			<button type="button" class="anchor" onclick={() => openPreferencesAt('ai')}>{m.prefs_proofread_open_agent()}</button>
		</p>
	{/if}
	{#if on}
		<div class="pl-4">
			<PrefsSwitchRow
				id="ai-proofread-wording"
				checked={wording}
				onChange={(v) => setGrammarRule(AI_RULES.wording, v ? undefined : false)}
			/>
			<PrefsSwitchRow
				id="ai-proofread-terms"
				checked={settings.current.proofreadAddTerms}
				onChange={(v) => updateSettings({ proofreadAddTerms: v })}
			/>
			{#if proofreadStatus.lastError}
				<div class="border-surface-200-800 border-b py-3">
					<p class="text-warning-ink text-xs leading-relaxed [overflow-wrap:anywhere]">
						{m.prefs_proofread_failed({ error: proofreadStatus.lastError })}
					</p>
				</div>
			{/if}
		</div>
	{/if}
{/if}
