<script lang="ts">
	// The open half of a panel row: the thread's messages, per-message edit, and the reply box.
	import { tip } from '$lib/components/tooltip.svelte';
	import { Trash2, Pencil } from '@lucide/svelte';
	import InitialAvatar from '$lib/components/InitialAvatar.svelte';
	import type { CommentMessage, CommentThread } from '$lib/comments/log';
	import { m } from '$lib/paraglide/messages';

	let {
		thread,
		fileGone,
		lost,
		hidden,
		onReply,
		onEditMessage,
		onDeleteMessage
	}: {
		thread: CommentThread;
		fileGone: boolean;
		lost: boolean;
		hidden: boolean;
		onReply: (thread: CommentThread, body: string) => void;
		onEditMessage: (message: CommentMessage, body: string) => void;
		onDeleteMessage: (thread: CommentThread, message: CommentMessage) => void;
	} = $props();

	let draft = $state('');
	let editing = $state<string | null>(null);
	let editDraft = $state('');

	function saveEdit(msg: CommentMessage) {
		const body = editDraft.trim();
		editing = null;
		if (body) onEditMessage(msg, body);
	}

	function submit() {
		const body = draft.trim();
		if (!body) return;
		draft = '';
		onReply(thread, body);
	}
</script>

<!-- max-w: the dock is as wide as the editor, and a conversation set in a column
     that wide is unreadable. Prose wants a measure, not the space available -->
<div class="max-w-2xl space-y-2 px-2 pt-1 pb-3 pl-7">
	{#if fileGone}
		<p class="text-warning-600-400">{m.comments_file_gone()}</p>
	{:else if lost}
		<p class="text-warning-600-400">{m.comments_orphaned()}</p>
	{:else if hidden}
		<p class="text-surface-500-400">{m.comments_not_in_view()}</p>
	{/if}
	{#each thread.messages as msg (msg.id)}
		<div class="group/msg flex items-start gap-2 leading-snug">
			<InitialAvatar name={msg.by} class="mt-0.5 size-5 text-[10px]" />
			<div class="min-w-0 flex-1">
				<span class="text-surface-500-400 font-medium">{msg.by}</span>
				{#if msg.editedAt}
					<!-- so nobody is quoted saying something they later rewrote -->
					<span class="text-surface-500-400 italic">({m.comments_edited()})</span>
				{/if}
				{#if editing === msg.id}
					<textarea
						class="textarea mt-1 w-full resize-none py-1 text-xs"
						rows="2"
						bind:value={editDraft}
						onkeydown={(e) => {
							if (e.key === 'Escape') editing = null;
							else if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								saveEdit(msg);
							}
						}}></textarea>
					<div class="mt-1 flex items-center gap-1">
						<button class="btn btn-xs preset-filled-primary-500" disabled={!editDraft.trim()} onclick={() => saveEdit(msg)}>
							{m.comments_save()}
						</button>
						<button class="btn btn-xs hover:preset-tonal" onclick={() => (editing = null)}>{m.comments_cancel()}</button>
					</div>
				{:else}
					<p class="whitespace-pre-wrap">{msg.body}</p>
				{/if}
			</div>
			{#if editing !== msg.id}
				<div class="flex shrink-0 items-center gap-0.5 opacity-0 group-hover/msg:opacity-100">
					<button
						class="hover:preset-tonal rounded-base p-1"
						use:tip={m.comments_edit()}
						aria-label={m.comments_edit()}
						onclick={() => {
							editing = msg.id;
							editDraft = msg.body;
						}}
					>
						<Pencil class="size-3" />
					</button>
					<button
						class="hover:preset-tonal-error rounded-base p-1"
						use:tip={m.comments_delete_message()}
						aria-label={m.comments_delete_message()}
						onclick={() => onDeleteMessage(thread, msg)}
					>
						<Trash2 class="size-3" />
					</button>
				</div>
			{/if}
		</div>
	{/each}
	<!-- One line at rest, growing only once there is something in it, and the Reply
	     button appears with the text. An empty box three rows tall under every thread
	     was most of what made this panel feel like a form. pl-7 lines it up with the
	     message bodies, past their avatars. -->
	<div class="space-y-1.5 pl-7">
		<textarea
			class="textarea w-full resize-none py-1 text-xs {draft.trim() ? 'min-h-14' : 'min-h-0 h-7'}"
			rows="1"
			placeholder={m.comments_reply_placeholder()}
			bind:value={draft}
			onkeydown={(e) => {
				// Enter sends, Shift+Enter breaks the line: a review reply is one or two
				// sentences, so reaching for a button every time is the wrong default
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					submit();
				}
			}}></textarea>
		{#if draft.trim()}
			<button class="btn btn-xs preset-filled-primary-500" onclick={submit}>
				{m.comments_reply()}
			</button>
		{/if}
	</div>
</div>
