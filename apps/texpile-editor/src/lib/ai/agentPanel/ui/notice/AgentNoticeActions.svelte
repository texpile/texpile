<script lang="ts">
	// what the reader can do about it: sign in from the terminal, choose an agent, or try again
	import { RefreshCw, SquareTerminal, Settings } from '@lucide/svelte';
	import { openPreferencesAt } from '$lib/stores/dialogStore';
	import { m } from '$lib/paraglide/messages';
	import type { AgentNoticeProps } from './noticeText';

	type Props = Pick<AgentNoticeProps, 'state' | 'onOpenTerminal' | 'onRetry'>;
	const props: Props = $props();
</script>

{#if props.state === 'signed-out'}
	<button class="btn btn-sm preset-filled-primary-500" onclick={props.onOpenTerminal}
		><SquareTerminal class="size-4" />{m.agent_panel_open_terminal()}</button
	>
{:else if props.state === 'unset' || props.state === 'missing'}
	<button
		class="btn btn-sm {props.state === 'unset' ? 'preset-filled-primary-500' : 'preset-tonal'}"
		onclick={() => openPreferencesAt('ai')}><Settings class="size-4" />{m.agent_panel_open_preferences()}</button
	>
{/if}
{#if props.state !== 'no-folder' && props.state !== 'unset'}
	<button class="btn btn-sm preset-tonal" onclick={props.onRetry}><RefreshCw class="size-4" />{m.agent_panel_try_again()}</button>
{/if}
