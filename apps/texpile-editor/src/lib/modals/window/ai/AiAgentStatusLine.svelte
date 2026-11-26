<script lang="ts">
	// Under Agent: whether the agent picked can run, and Test agent to make sure it answers
	import { agentName, agentOffered, chosenAgent } from '$lib/ai/agent/aiAgent.svelte';
	import { agentLabel } from '$lib/ai/agent/aiAgents';
	import { agentTest } from './agentTest.svelte';
	import { m } from '$lib/paraglide/messages';

	const chosen = $derived(chosenAgent());
	const ready = $derived(agentOffered());
	// a custom agent goes by the program its command runs
	const name = $derived(ready === 'custom' ? agentName(ready) : ready ? agentLabel(ready) : '');
	const test = $derived(agentTest.current?.agent === ready ? agentTest.current : null);
</script>

{#snippet testLink(label: string)}
	<button type="button" class="anchor" onclick={() => ready && void agentTest.run(ready)}>{label}</button>
{/snippet}

<p class="text-muted mt-1 text-xs leading-relaxed [overflow-wrap:anywhere]">
	{#if ready && test?.phase === 'running'}
		{m.prefs_ai_testing({ agent: name })}
	{:else if ready && test?.phase === 'passed'}
		<span class="text-success-ink">{m.prefs_ai_test_passed({ agent: name, seconds: test.seconds })}</span>
		{@render testLink(m.prefs_ai_test_again())}
	{:else if ready && test?.phase === 'failed'}
		<span class="text-warning-ink">{m.prefs_ai_test_failed({ agent: name, error: test.error })}</span>
		{@render testLink(m.prefs_ai_test_again())}
	{:else if ready}
		{m.prefs_ai_status_ready({ agent: name })}
		{@render testLink(m.prefs_ai_test())}
	{:else if chosen === 'custom'}
		{m.prefs_ai_status_command()}
	{:else if chosen}
		<span class="text-warning-ink">{m.prefs_ai_agent_elsewhere({ agent: agentLabel(chosen) })}</span>
	{/if}
</p>
