<script lang="ts">
	// The dock's controls for the Agent tab: the agent, which Preferences picks, an earlier chat, and a fresh one. The
	// one icon in the strip is here, as the terminal's is on the shell picker
	import { Bot, Plus } from '@lucide/svelte';
	import AgentChatPicker from './AgentChatPicker.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { openPreferencesAt } from '$lib/stores/dialogStore';
	import { runningAgentName } from '$lib/ai/agent/aiAgents';
	import { agentSession, restartAgentSession, shownAgent } from '../../agentSession.svelte';
	import { m } from '$lib/paraglide/messages';

	/** where the agent cannot run: the controls stay, grayed, as the tab does */
	type Props = { disabled?: boolean };
	const props: Props = $props();

	const current = $derived(shownAgent());
</script>

<button
	class="hover:preset-tonal rounded-base flex max-w-40 items-center gap-1.5 px-2 py-1 disabled:opacity-50 disabled:hover:bg-transparent"
	disabled={props.disabled}
	use:tip={m.agent_panel_change_agent()}
	onclick={() => openPreferencesAt('ai')}
>
	<Bot class="size-3.5 shrink-0" />
	<!-- drops out first when the dock narrows, as the shell name does: the icon still says what it is -->
	<span class="truncate font-medium @max-[30rem]:hidden"
		>{current ? runningAgentName(current, agentSession.name) : m.agent_panel_choose()}</span
	>
</button>
<AgentChatPicker />
<button
	class="btn-icon btn-icon-xs hover:preset-tonal"
	disabled={props.disabled}
	use:tip={m.agent_panel_new_chat()}
	aria-label={m.agent_panel_new_chat()}
	onclick={() => void restartAgentSession()}
>
	<Plus class="size-3.5" />
</button>
