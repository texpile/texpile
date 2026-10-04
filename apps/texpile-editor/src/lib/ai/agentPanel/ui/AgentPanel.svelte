<script lang="ts">
	// The Agent tab: the conversation, the question waiting on the reader, and the prompt box. The
	// conversation lives in agentSession, so leaving the tab keeps it
	import { activeFilePath, workspaceRoot } from '$lib/workspace/workspaceStore';
	import { pathLabels } from '$lib/workspace/scm/ui/changes/pathLabels';
	import { agentSession, openAgentSession, restartAgentSession, shownAgent } from '../agentSession.svelte';
	import { chatBlocks } from '../agentItems';
	import { runningAgentName, signInCommand } from '../agentNames';
	import { LoaderCircle } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import AgentMessage from './conversation/AgentMessage.svelte';
	import AgentImagePreview from './AgentImagePreview.svelte';
	import AgentThought from './conversation/AgentThought.svelte';
	import AgentPlan from './conversation/AgentPlan.svelte';
	import AgentSteps from './conversation/AgentSteps.svelte';
	import AgentChanges from './conversation/AgentChanges.svelte';
	import AgentQuestion from './AgentQuestion.svelte';
	import AgentPromptBox from './box/AgentPromptBox.svelte';
	import AgentNotice from './notice/AgentNotice.svelte';
	import AgentNoticeBar from './notice/AgentNoticeBar.svelte';
	import AgentUnavailable from './notice/AgentUnavailable.svelte';
	import { agentUnavailable } from '../agentAvailability';

	type Props = { onOpenTerminal: () => void };
	const props: Props = $props();

	const root = $derived(workspaceRoot.current);
	const agent = $derived(runningAgentName(shownAgent(), agentSession.name));
	const blocks = $derived(chatBlocks(agentSession.items));
	const labels = $derived(pathLabels(root ?? ''));
	const live = $derived(agentSession.state === 'ready' || agentSession.state === 'working');
	// that the turn is still going, where nothing else says so: a question waiting, or a step still running, says it already
	const last = $derived(agentSession.items.at(-1));
	const quiet = $derived(
		agentSession.state === 'working' &&
			!agentSession.asks.length &&
			!(last?.kind === 'tool' && (last.status === 'pending' || last.status === 'in_progress'))
	);
	const notice = $derived({
		state: agentSession.state,
		agent,
		signIn: signInCommand(shownAgent()),
		program: agentSession.program,
		detail: agentSession.detail,
		onOpenTerminal: props.onOpenTerminal,
		onRetry: () => void restartAgentSession()
	});

	const blocked = $derived(agentUnavailable());

	// another folder in this window is another conversation
	$effect(() => {
		if (root && !blocked) void openAgentSession(root);
	});
</script>

<div class="bg-surface-50-950 flex h-full flex-col">
	{#if blocked}
		<AgentUnavailable reason={blocked} />
	{:else}
		{@render conversation()}
	{/if}
</div>
<AgentImagePreview />

{#snippet conversation()}
	{#if agentSession.items.length || live}
		<!-- column-reverse keeps the view on the newest message as the turn grows, with no scrolling code. The gutter on
		     both sides keeps the column centered where the box below it is, with the scrollbar or without -->
		<div class="flex min-h-0 flex-1 [scrollbar-gutter:stable_both-edges] flex-col-reverse overflow-y-auto pt-2 pb-5">
			<!-- one readable column for the conversation, the question and the box, centered however wide the dock is -->
			<div class="mx-auto flex w-full max-w-3xl flex-col gap-2 px-3">
				{#if !agentSession.items.length}<p class="text-muted text-sm">{m.agent_panel_empty({ agent })}</p>{/if}
				{#each blocks as block (block.id)}
					{#if block.kind === 'steps'}
						<AgentSteps tools={block.tools} {labels} />
					{:else if block.kind === 'thought'}
						<AgentThought text={block.text} />
					{:else if block.kind === 'plan'}
						<AgentPlan entries={block.entries} />
					{:else if block.kind === 'changes'}
						<AgentChanges files={block.files} {agent} {labels} />
					{:else}
						<AgentMessage
							kind={block.kind}
							text={block.text}
							attached={block.kind === 'user' ? block.attached : null}
							images={block.kind === 'user' ? block.images : undefined}
						/>
					{/if}
				{/each}
				{#if quiet}
					<p class="text-muted flex items-center gap-1.5 text-xs">
						<LoaderCircle class="size-3.5 animate-spin" /><span class="cap-center">{m.agent_panel_working()}</span>
					</p>
				{/if}
			</div>
		</div>
	{/if}
	{#if live}
		<div class="mx-auto w-full max-w-3xl">
			{#if agentSession.asks[0]}
				<AgentQuestion ask={agentSession.asks[0]} {agent} onAnswer={(id, optionId) => agentSession.answer(id, optionId)} />
			{/if}
			<AgentPromptBox
				{agent}
				working={agentSession.state === 'working'}
				file={activeFilePath.current}
				config={agentSession.config}
				commands={agentSession.commands}
				takesSelection={agentSession.takesSelection}
				takesImages={agentSession.takesImages}
				onSend={(text, attached, images) => void agentSession.send(text, attached, images)}
				onStop={() => agentSession.cancel()}
				onConfig={(id, value) => agentSession.setConfig(id, value)}
			/>
		</div>
	{:else if agentSession.items.length}
		<!-- under a conversation, a row where the box was rather than a second screen below the first -->
		<div class="mx-auto w-full max-w-3xl"><AgentNoticeBar {...notice} /></div>
	{:else}
		<AgentNotice {...notice} />
	{/if}
{/snippet}
