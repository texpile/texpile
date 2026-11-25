<script lang="ts">
	import { settings, updateSettings } from '$lib/settings';
	import { m } from '$lib/paraglide/messages';
</script>

<input
	class="input mt-2 w-64 font-mono text-xs"
	spellcheck="false"
	aria-label={m.prefs_ai_agent_command()}
	placeholder={m.prefs_ai_agent_command_placeholder()}
	value={settings.current.agentCommand}
	onchange={(e) => updateSettings({ agentCommand: e.currentTarget.value.trim() })}
/>
