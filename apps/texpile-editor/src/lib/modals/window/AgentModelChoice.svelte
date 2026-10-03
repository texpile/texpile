<script lang="ts">
	// The Model row for a preset agent Refine runs, listing what the agent itself says it offers
	import { LoaderCircle } from '@lucide/svelte';
	import { settings, updateSettings } from '$lib/settings';
	import { agentModels, modelChoices } from '$lib/ai/agentModels';
	import { agentName, type PresetAgent } from '$lib/ai/selectionRefiner';
	import { modelOf } from '$lib/ai/refineAgents.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = { agent: PresetAgent };
	const props: Props = $props();
	const chosen = $derived(modelOf(props.agent));
	const list = $derived(agentModels(props.agent));
	const name = $derived(agentName(props.agent));

	function pick(id: string): void {
		updateSettings({ aiAgentModels: { ...settings.current.aiAgentModels, [props.agent]: id } });
	}
</script>

{#snippet label(hint: string, error = false)}
	<div class="min-w-0">
		<div class="text-sm font-medium">{m.prefs_ai_model_of({ agent: name })}</div>
		<p class="mt-1 text-xs leading-relaxed [overflow-wrap:anywhere] {error ? 'text-error-ink' : 'text-muted'}">{hint}</p>
	</div>
{/snippet}

{#await list}
	{@render label(m.prefs_ai_model_loading({ agent: name }))}
	<div class="flex h-7 min-w-32 shrink-0 items-center px-1.5"><LoaderCircle class="text-muted size-4 animate-spin" /></div>
{:then result}
	{@const models = modelChoices(result.ok ? result.models : [], chosen, m.prefs_ai_model_default())}
	{@const picked = models.find((x) => x.id === chosen)}
	{#if result.ok}
		{@render label(picked?.description || m.prefs_ai_model_note({ agent: name }))}
	{:else}
		{@render label(m.prefs_ai_model_failed({ agent: name, error: result.error }), true)}
	{/if}
	<!-- a dropdown, not a list: an agent can offer a dozen models. The chosen one's note is under the row's name -->
	<select
		class="select w-auto min-w-32 shrink-0 text-sm"
		aria-label={m.prefs_ai_model_of({ agent: name })}
		value={chosen}
		onchange={(e) => pick(e.currentTarget.value)}
	>
		{#each models as x (x.id)}
			<option value={x.id}>{x.name}</option>
		{/each}
	</select>
{/await}
