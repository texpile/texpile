<script lang="ts">
	// Preferences › AI Assistant: the service Proofread with AI sends text to, and its key and model
	import { settings, updateSettings } from '$lib/settings';
	import { m } from '$lib/paraglide/messages';
	import PrefsRow from '$lib/modals/window/rows/PrefsRow.svelte';
	import CheckChoiceList from '$lib/modals/window/CheckChoiceList.svelte';
	import { refineAgentsTicked } from '$lib/ai/refineAgents.svelte';
	import { agentName } from '$lib/ai/selectionRefiner';
	import AiServiceField from './AiServiceField.svelte';
	import AiServiceKeyField from './AiServiceKeyField.svelte';

	type Service = (typeof settings.current)['aiService'];

	const SERVICES: { value: Service; label: string }[] = [
		{ value: 'anthropic', label: m.prefs_proofread_anthropic() },
		{ value: 'openai', label: m.prefs_proofread_openai() },
		{ value: 'agent', label: m.prefs_proofread_agent() }
	];

	const service = $derived(settings.current.aiService);
	const agent = $derived(refineAgentsTicked()[0]);
</script>

<PrefsRow id="ai-service">
	<CheckChoiceList
		one
		choices={SERVICES}
		values={[service]}
		label={m.prefs_proofread_with()}
		ontoggle={(v) => updateSettings({ aiService: v as Service })}
	/>
</PrefsRow>

{#if service === 'anthropic'}
	<AiServiceKeyField provider="anthropic" note={m.prefs_proofread_anthropic_note()} />
	<AiServiceField
		label={m.prefs_proofread_model()}
		value={settings.current.aiAnthropicModel}
		placeholder="claude-haiku-5-5"
		onchange={(v) => updateSettings({ aiAnthropicModel: v })}
	/>
{:else if service === 'openai'}
	<AiServiceField
		label={m.prefs_proofread_base_url()}
		note={m.prefs_proofread_base_url_note()}
		value={settings.current.aiOpenAiUrl}
		placeholder="https://api.openai.com/v1"
		onchange={(v) => updateSettings({ aiOpenAiUrl: v })}
	/>
	<AiServiceKeyField provider="openai" note={m.prefs_proofread_openai_key_note()} />
	<AiServiceField
		label={m.prefs_proofread_model()}
		value={settings.current.aiOpenAiModel}
		placeholder="gpt-5-mini"
		onchange={(v) => updateSettings({ aiOpenAiModel: v })}
	/>
{:else}
	<div class="border-surface-200-800 border-b py-3">
		<p class="text-muted text-xs leading-relaxed">
			{agent ? m.prefs_proofread_agent_note({ agent: agentName(agent) }) : m.prefs_proofread_agent_missing()}
		</p>
	</div>
{/if}
