<script lang="ts">
	// the title bar's way to the Agent tab: gone when the agent is turned off, grayed where it cannot run (the tab says why)
	import { Bot } from '@lucide/svelte';
	import DockTabCount from '$lib/terminal/DockTabCount.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { withKeyLabel } from '$lib/keybindings/keybindings.svelte';
	import { m } from '$lib/paraglide/messages';
	import { agentUnavailable } from '../agentAvailability';
	import { panelTabOff } from '../agentOffer.svelte';
	import { agentSession } from '../agentSession.svelte';

	type Props = { class: string; onOpen: () => void };
	const props: Props = $props();

	const blocked = $derived(agentUnavailable());
	const label = $derived(
		blocked === 'host'
			? m.agent_panel_only_host()
			: blocked === 'desktop'
				? m.agent_panel_only_desktop()
				: withKeyLabel((combo) => `${m.agent_panel_tab()} (${combo})`, 'view.agent')
	);
</script>

{#if !panelTabOff()}
	<button class="{props.class} gap-1" class:text-muted={!!blocked} onclick={props.onOpen} use:tip={label} aria-label={m.agent_panel_tab()}>
		<span class="flex h-[1lh] items-center"><Bot class="size-3.5" /></span>
		<!-- the tab's count: the agent is waiting on an answer -->
		{#if agentSession.asks.length > 0}
			<DockTabCount count={agentSession.asks.length} tone="warning" />
		{/if}
	</button>
{/if}
