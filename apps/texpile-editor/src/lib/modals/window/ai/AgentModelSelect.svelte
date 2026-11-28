<script lang="ts">
	// One task's model, from the list the agent gave
	import { ChevronDown } from '@lucide/svelte';
	import MenuDropdown from '$lib/menus/MenuDropdown.svelte';
	import { settings, updateSettings } from '$lib/settings';
	import { modelChoices } from '$lib/ai/agent/agentModels';
	import { modelOf } from '$lib/ai/agent/aiAgent.svelte';
	import type { AgentModel } from '$lib/ai/agent/agentBridge';
	import type { AiAgent, ModelTask } from '$lib/ai/agent/aiAgents';
	import { m } from '$lib/paraglide/messages';

	type Props = { agent: AiAgent; task: ModelTask; models: AgentModel[]; label: string };
	const props: Props = $props();
	const chosen = $derived(modelOf(props.agent, props.task));
	const choices = $derived(modelChoices(props.models, chosen, m.prefs_ai_model_default()));
	const groups = $derived([
		{ options: choices.map((x) => ({ value: x.id, label: x.name, note: x.description || undefined, checked: x.id === chosen })) }
	]);
	const shown = $derived(choices.find((x) => x.id === chosen)?.name ?? chosen);

	function pick(id: string): void {
		const all = settings.current.agentModels;
		updateSettings({ agentModels: { ...all, [props.agent]: { ...all[props.agent], [props.task]: id } } });
	}
</script>

<MenuDropdown {groups} placement="bottom-end" onSelect={pick}>
	{#snippet trigger(attrs)}
		<button
			{...attrs}
			class="btn preset-outlined-surface-200-800 bg-surface-50-950 hover:preset-tonal w-72 justify-between gap-2 text-sm"
			aria-label={props.label}
		>
			<span class="cap-center truncate">{shown}</span>
			<ChevronDown class="text-muted size-4 shrink-0" />
		</button>
	{/snippet}
</MenuDropdown>
