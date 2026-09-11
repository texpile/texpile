<script lang="ts">
	// One thread in the margin, always the whole of it: every message and the reply box, the same
	import { tip } from '$lib/components/tooltip.svelte';
	import { Check } from '@lucide/svelte';
	import CommentThreadConversation from '$lib/comments/CommentThreadConversation.svelte';
	import type { CommentMessage, CommentThread } from '$lib/comments/log';
	import { sized } from './sized';
	import { m } from '$lib/paraglide/messages';

	let {
		thread,
		selected,
		unsure = false,
		hovered = false,
		top,
		onSelect,
		onResolve,
		onReply,
		onEditMessage,
		onDeleteMessage,
		onSize
	}: {
		thread: CommentThread;
		selected: boolean;
		unsure?: boolean;
		hovered?: boolean;
		top: number;
		onSelect: () => void;
		onResolve: () => void;
		onReply: (thread: CommentThread, body: string) => void;
		onEditMessage: (message: CommentMessage, body: string) => void;
		onDeleteMessage: (thread: CommentThread, message: CommentMessage) => void;
		onSize: (height: number) => void;
	} = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div
	class="comment-card bg-surface-50-950 border-surface-200-800 border text-xs rounded-container {selected
		? 'comment-card-selected'
		: ''} {hovered ? 'comment-card-hovered' : ''}"
	style="top: {top}px"
	data-thread={thread.id}
	use:sized={onSize}
	onclick={(e) => {
		if ((e.target as HTMLElement).closest('button, textarea, input, a')) return;
		onSelect();
	}}
>
	<CommentThreadConversation
		dense
		{thread}
		fileGone={false}
		lost={false}
		hidden={false}
		{unsure}
		{onReply}
		{onEditMessage}
		{onDeleteMessage}
	>
		{#snippet footer()}
			<button
				class="text-muted hover:preset-tonal flex h-7 w-7 shrink-0 items-center justify-center rounded-base"
				use:tip={m.comments_resolve()}
				aria-label={m.comments_resolve()}
				onclick={onResolve}
			>
				<Check class="size-4" />
			</button>
		{/snippet}
	</CommentThreadConversation>
</div>
