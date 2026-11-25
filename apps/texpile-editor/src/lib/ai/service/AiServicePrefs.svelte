<script lang="ts">
	// Preferences › AI Assistant: the custom service's address, key and model
	import { settings, updateSettings } from '$lib/settings';
	import { m } from '$lib/paraglide/messages';
	import PrefsRow from '$lib/modals/window/rows/PrefsRow.svelte';
	import AiServiceField from './AiServiceField.svelte';
	import AiServiceKeyField from './AiServiceKeyField.svelte';
</script>

<PrefsRow id="ai-service" layout="block">
	{#snippet children(def)}
		<div class="text-sm font-medium">{def.label()}</div>
		<p class="text-muted mt-1 text-xs leading-relaxed">{def.note?.()}</p>
	{/snippet}
</PrefsRow>
<AiServiceField
	label={m.prefs_proofread_base_url()}
	note={m.prefs_proofread_base_url_note()}
	value={settings.current.aiServiceUrl}
	placeholder="http://localhost:11434/v1"
	onchange={(v) => updateSettings({ aiServiceUrl: v })}
/>
<AiServiceKeyField note={m.prefs_proofread_openai_key_note()} />
<AiServiceField
	label={m.prefs_proofread_model()}
	value={settings.current.aiServiceModel}
	placeholder="gemma3:4b"
	onchange={(v) => updateSettings({ aiServiceModel: v })}
/>
