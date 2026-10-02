<script lang="ts">
	// Step five: the agent Refine runs and its model, then the Agent tab's
	import { settings, updateSettings } from '$lib/settings';
	import { agentBridge, isPresetAgent, PRESET_AGENTS, type PresetAgent } from '$lib/ai/selectionRefiner';
	import AgentModelChoice from '$lib/modals/window/AgentModelChoice.svelte';
	import SetupChoice from './SetupChoice.svelte';
	import AgentPanelSetup from '$lib/ai/agentPanel/ui/AgentPanelSetup.svelte';
	import { m } from '$lib/paraglide/messages';

	let installed = $state<Record<PresetAgent, boolean> | null>(null);
	void agentBridge()
		?.detect()
		.then((found) => (installed = found))
		.catch(() => undefined);

	const LABELS: Record<PresetAgent, () => string> = {
		claude: () => m.prefs_ai_agent_claude(),
		codex: () => m.prefs_ai_agent_codex(),
		agy: () => m.prefs_ai_agent_agy()
	};
	const picked = $derived(settings.current.aiAgent ?? '');

	function pick(value: PresetAgent | 'custom' | ''): void {
		updateSettings({ aiAgent: value, aiAgentModel: '' });
	}
</script>

<!-- two questions on one step, so each sits in two columns rather than scrolling -->
<p class="mb-2 flex flex-wrap items-baseline gap-x-2">
	<span class="text-sm font-medium">{m.prefs_ai_agent()}</span><span class="text-muted text-xs">{m.setup_agent_refine_note()}</span>
</p>
<div class="grid grid-cols-2 gap-2.5">
	<SetupChoice kind="radio" checked={picked === ''} label={m.prefs_ai_agent_off()} onpick={() => pick('')} />
	{#each PRESET_AGENTS as a (a)}
		<SetupChoice
			kind="radio"
			checked={picked === a}
			label={LABELS[a]()}
			aside={installed === null ? undefined : installed[a] ? m.prefs_ai_agent_installed() : m.setup_agent_not_installed()}
			disabled={installed !== null && !installed[a]}
			onpick={() => pick(a)}
		/>
	{/each}
	<SetupChoice kind="radio" checked={picked === 'custom'} label={m.prefs_ai_agent_custom()} onpick={() => pick('custom')} />
</div>

{#if isPresetAgent(picked) && installed?.[picked]}
	<div class="border-surface-200-800 mt-4 flex items-start justify-between gap-6 border-t pt-4">
		<AgentModelChoice agent={picked} />
	</div>
{/if}

{#if picked === 'custom'}
	<input
		class="input mt-2.5 text-sm"
		placeholder={m.prefs_ai_agent_command_placeholder()}
		spellcheck="false"
		value={settings.current.aiAgentCommand}
		oninput={(e) => updateSettings({ aiAgentCommand: e.currentTarget.value.trim() })}
	/>
	<p class="text-muted mt-1.5 text-xs">{m.prefs_ai_agent_command_note()}</p>
{/if}

<div class="border-surface-200-800 mt-4 border-t pt-3">
	<AgentPanelSetup />
</div>
