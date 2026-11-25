<script lang="ts">
	// Under the agent list: whether the agent picked can run, and Test agent to make sure it answers
	import { settings } from '$lib/settings';
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

<div class="py-2 text-xs leading-relaxed">
	{#if ready}
		<p class="text-muted">
			{m.prefs_ai_status_ready({ agent: name })}
			<button class="anchor" disabled={test?.phase === 'running'} onclick={() => void agentTest.run(ready)}>{m.prefs_ai_test()}</button>
		</p>
		{#if test?.phase === 'running'}
			<p class="text-muted mt-1">{m.prefs_ai_testing({ agent: name })}</p>
		{:else if test?.phase === 'passed'}
			<p class="text-success-ink mt-1">{m.prefs_ai_test_passed({ agent: name, seconds: test.seconds })}</p>
		{:else if test?.phase === 'failed'}
			<p class="text-error-ink mt-1 [overflow-wrap:anywhere]">{m.prefs_ai_test_failed({ agent: name, error: test.error })}</p>
		{/if}
	{:else if chosen === 'custom'}
		<p class="text-muted">{m.prefs_ai_status_command()}</p>
	{:else if chosen}
		<p class="text-warning-ink">{m.prefs_ai_agent_elsewhere({ agent: agentLabel(chosen) })}</p>
	{:else if !settings.current.aiOff}
		<p class="text-muted">{m.prefs_ai_status_none()}</p>
	{/if}
</div>
