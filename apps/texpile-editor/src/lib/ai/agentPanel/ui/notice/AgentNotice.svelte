<script lang="ts">
	// What stands in for the conversation when there is none to have: the agent is starting, not signed
	// in, not installed, not chosen, or stopped. Signing in happens in the agent's own program, never here
	import { LoaderCircle, LogIn } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import AgentNoticeActions from './AgentNoticeActions.svelte';
	import AgentSignInCommand from './AgentSignInCommand.svelte';
	import { noticeNote, noticeTitle, type AgentNoticeProps } from './noticeText';

	const props: AgentNoticeProps = $props();
	const title = $derived(noticeTitle(props));
	const note = $derived(noticeNote(props));
</script>

<div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
	{#if props.state === 'starting' || props.state === 'idle'}
		<LoaderCircle class="text-muted size-5 animate-spin" />
		<p class="text-muted text-sm">{m.agent_panel_starting({ agent: props.agent })}</p>
	{:else}
		{#if props.state === 'signed-out'}<LogIn class="text-muted size-5" />{/if}
		<p class="text-sm font-semibold">{title}</p>
		{#if note}<p class="text-muted max-w-md text-xs leading-relaxed [overflow-wrap:anywhere]">{note}</p>{/if}
		{#if props.state === 'signed-out' && props.signIn}<AgentSignInCommand command={props.signIn} />{/if}
		<div class="mt-2 flex gap-1.5">
			<AgentNoticeActions state={props.state} onOpenTerminal={props.onOpenTerminal} onRetry={props.onRetry} />
		</div>
	{/if}
</div>
