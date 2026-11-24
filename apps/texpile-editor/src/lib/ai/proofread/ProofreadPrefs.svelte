<script lang="ts">
	// Preferences › AI: proofreading with a model, the service it goes through, and its wording suggestions
	import { settings, updateSettings } from '$lib/settings';
	import { m } from '$lib/paraglide/messages';
	import PrefsRow from '$lib/modals/window/rows/PrefsRow.svelte';
	import PrefsSwitchRow from '$lib/modals/window/rows/PrefsSwitchRow.svelte';
	import CheckChoiceList from '$lib/modals/window/CheckChoiceList.svelte';
	import { refineAgentsTicked } from '$lib/ai/refineAgents.svelte';
	import { agentName } from '$lib/ai/selectionRefiner';
	import { setGrammarRule } from '$lib/editor/spellcheck/config/spellcheckConfig';
	import { ruleIsOn } from '$lib/editor/spellcheck/config/grammarRules';
	import { AI_RULES } from '$lib/editor/spellcheck/review/reviewMerge';
	import ProofreadField from './ProofreadField.svelte';
	import ProofreadKeyField from './ProofreadKeyField.svelte';
	import { proofreadStatus } from './proofreadStatus.svelte';

	type Service = (typeof settings.current)['proofreadWith'];

	const SERVICES: { value: Service; label: string }[] = [
		{ value: 'anthropic', label: m.prefs_proofread_anthropic() },
		{ value: 'openai', label: m.prefs_proofread_openai() },
		{ value: 'agent', label: m.prefs_proofread_agent() }
	];

	const on = $derived(settings.current.proofreadAi);
	const service = $derived(settings.current.proofreadWith);
	const agent = $derived(refineAgentsTicked()[0]);
	const wording = $derived(ruleIsOn(AI_RULES.wording, settings.current.grammarRules ?? {}));
</script>

<PrefsSwitchRow id="ai-proofread" checked={on} onChange={(v) => updateSettings({ proofreadAi: v })} />

{#if on}
	<PrefsRow id="ai-proofread-with">
		<CheckChoiceList
			one
			choices={SERVICES}
			values={[service]}
			label={m.prefs_proofread_with()}
			ontoggle={(v) => updateSettings({ proofreadWith: v as Service })}
		/>
	</PrefsRow>

	{#if service === 'anthropic'}
		<ProofreadKeyField provider="anthropic" note={m.prefs_proofread_anthropic_note()} />
		<ProofreadField
			label={m.prefs_proofread_model()}
			value={settings.current.proofreadAnthropicModel}
			placeholder="claude-haiku-5-5"
			onchange={(v) => updateSettings({ proofreadAnthropicModel: v })}
		/>
	{:else if service === 'openai'}
		<ProofreadField
			label={m.prefs_proofread_base_url()}
			note={m.prefs_proofread_base_url_note()}
			value={settings.current.proofreadOpenAiUrl}
			placeholder="https://api.openai.com/v1"
			onchange={(v) => updateSettings({ proofreadOpenAiUrl: v })}
		/>
		<ProofreadKeyField provider="openai" note={m.prefs_proofread_openai_key_note()} />
		<ProofreadField
			label={m.prefs_proofread_model()}
			value={settings.current.proofreadOpenAiModel}
			placeholder="gpt-5-mini"
			onchange={(v) => updateSettings({ proofreadOpenAiModel: v })}
		/>
	{:else}
		<div class="border-surface-200-800 border-b py-3">
			<p class="text-muted text-xs leading-relaxed">
				{agent ? m.prefs_proofread_agent_note({ agent: agentName(agent) }) : m.prefs_proofread_agent_missing()}
			</p>
		</div>
	{/if}

	<PrefsSwitchRow id="ai-proofread-wording" checked={wording} onChange={(v) => setGrammarRule(AI_RULES.wording, v ? undefined : false)} />
	<PrefsSwitchRow
		id="ai-proofread-terms"
		checked={settings.current.proofreadAddTerms}
		onChange={(v) => updateSettings({ proofreadAddTerms: v })}
	/>

	{#if proofreadStatus.lastError}
		<div class="border-surface-200-800 border-b py-3">
			<p class="text-error-ink text-xs leading-relaxed [overflow-wrap:anywhere]">
				{m.prefs_proofread_failed({ error: proofreadStatus.lastError })}
			</p>
		</div>
	{/if}
{/if}
