<script lang="ts">
	// One task's model, from the list the agent gave
	import { settings, updateSettings } from '$lib/settings';
	import { tip } from '$lib/components/tooltip.svelte';
	import { modelChoices } from '$lib/ai/agent/agentModels';
	import { modelOf } from '$lib/ai/agent/aiAgent.svelte';
	import type { AgentModel } from '$lib/ai/agent/agentBridge';
	import type { AiAgent, ModelTask } from '$lib/ai/agent/aiAgents';
	import { m } from '$lib/paraglide/messages';

	type Props = { agent: AiAgent; task: ModelTask; models: AgentModel[]; label: string; hint?: string };
	const props: Props = $props();
	const chosen = $derived(modelOf(props.agent, props.task));
	const choices = $derived(modelChoices(props.models, chosen, m.prefs_ai_model_default()));

	function pick(id: string): void {
		const all = settings.current.agentModels;
		updateSettings({ agentModels: { ...all, [props.agent]: { ...all[props.agent], [props.task]: id } } });
	}
</script>

<!-- a dropdown: an agent can offer a dozen models, OpenCode hundreds -->
<select
	class="select w-auto max-w-48 min-w-32 shrink-0 text-sm"
	aria-label={props.label}
	use:tip={props.hint}
	value={chosen}
	onchange={(e) => pick(e.currentTarget.value)}
>
	{#each choices as x (x.id)}
		<option value={x.id}>{x.name}</option>
	{/each}
</select>
