<script lang="ts">
	// the title bar's way to the Agent tab, there only where the agent can run: a bar button is never grayed
	import { Sparkles } from '@lucide/svelte';
	import DockTabCount from '$lib/terminal/DockTabCount.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { withKeyLabel } from '$lib/keybindings/keybindings.svelte';
	import { m } from '$lib/paraglide/messages';
	import { agentUnavailable } from '../agentAvailability';
	import { panelTabOff } from '../agentOffer.svelte';
	import { agentSession } from '../agentSession.svelte';

	type Props = { class: string; onOpen: () => void };
	const props: Props = $props();
</script>

{#if !panelTabOff() && !agentUnavailable()}
	<button
		class="{props.class} gap-1"
		onclick={props.onOpen}
		use:tip={withKeyLabel((combo) => `${m.agent_panel_tab()} (${combo})`, 'view.agent')}
		aria-label={m.agent_panel_tab()}
	>
		<span class="flex h-[1lh] items-center"><Sparkles class="size-3.5" /></span>
		<!-- the tab's count: the agent is waiting on an answer -->
		{#if agentSession.asks.length > 0}
			<DockTabCount count={agentSession.asks.length} tone="warning" />
		{/if}
	</button>
{/if}
