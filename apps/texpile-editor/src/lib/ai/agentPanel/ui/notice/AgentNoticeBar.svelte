<script lang="ts">
	// the notice under a conversation the agent cannot go on with: one row where the box was, as a question
	// waiting on the reader sits, so the chat above keeps its place
	import { CircleAlert, LoaderCircle, LogIn } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import AgentNoticeActions from './AgentNoticeActions.svelte';
	import AgentSignInCommand from './AgentSignInCommand.svelte';
	import { noticeNote, noticeTitle, type AgentNoticeProps } from './noticeText';

	const props: AgentNoticeProps = $props();
	const starting = $derived(props.state === 'starting' || props.state === 'idle');
	const title = $derived(starting ? m.agent_panel_starting({ agent: props.agent }) : noticeTitle(props));
	const note = $derived(starting ? '' : noticeNote(props));
</script>

<div class="px-3 pb-2">
	<div
		class="border-surface-300-700 bg-surface-100-900 rounded-base flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1.5 border py-1 pr-1 pl-2.5 text-sm"
	>
		{#if starting}
			<LoaderCircle class="text-muted size-4 shrink-0 animate-spin" />
		{:else if props.state === 'signed-out'}
			<LogIn class="text-muted size-4 shrink-0" />
		{:else}
			<CircleAlert class="text-muted size-4 shrink-0" />
		{/if}
		<span class="cap-center shrink-0 font-medium">{title}</span>
		{#if note}<span class="cap-center text-muted min-w-0 truncate" use:tip={note}>{note}</span>{/if}
		{#if props.state === 'signed-out' && props.signIn}<AgentSignInCommand command={props.signIn} />{/if}
		<span class="flex-1"></span>
		{#if !starting}
			<span class="flex shrink-0 gap-1">
				<AgentNoticeActions state={props.state} onOpenTerminal={props.onOpenTerminal} onRetry={props.onRetry} />
			</span>
		{/if}
	</div>
</div>
