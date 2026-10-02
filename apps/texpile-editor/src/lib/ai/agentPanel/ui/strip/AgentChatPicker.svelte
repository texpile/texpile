<script lang="ts">
	// the agent's earlier chats in this folder, to open one again. Only for an agent that keeps them: Texpile keeps none
	import { History } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import MenuDropdown from '$lib/menus/MenuDropdown.svelte';
	import { m } from '$lib/paraglide/messages';
	import { agentSession } from '../../agentSession.svelte';
	import { chatMenu } from './chatMenu';

	const groups = $derived(chatMenu(agentSession.chats, agentSession.chat));
</script>

{#if agentSession.history && agentSession.chats.length}
	<MenuDropdown {groups} placement="bottom-end" onSelect={(id) => void agentSession.openChat(id)}>
		{#snippet trigger(attrs)}
			<button
				{...attrs}
				class="btn-icon btn-icon-xs hover:preset-tonal"
				disabled={agentSession.state !== 'ready'}
				use:tip={m.agent_panel_chats()}
				aria-label={m.agent_panel_chats()}
			>
				<History class="size-3.5" />
			</button>
		{/snippet}
	</MenuDropdown>
{/if}
