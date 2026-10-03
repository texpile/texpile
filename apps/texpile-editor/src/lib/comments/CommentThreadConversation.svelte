<script lang="ts">
	// The open half of a panel row: the thread's messages, per-message edit, and the reply box.
	import { tip } from '$lib/components/tooltip.svelte';
	import { Trash2, Pencil } from '@lucide/svelte';
	import InitialAvatar from '$lib/components/InitialAvatar.svelte';
	import type { Snippet } from 'svelte';
	import type { CommentMessage, CommentThread } from '$lib/comments/log';
	import { formatChange, isSuggestion, shownWords, suggestionKind } from '$lib/comments/suggest';
	import { suggestionLabel } from '$lib/comments/suggestionLabel';
	import { regionParserForPath } from '$lib/comments/regionParser';
	import { m } from '$lib/paraglide/messages';

	let {
		thread,
		fileGone,
		lost,
		hidden,
		unsure = false,
		partial = false,
		dense = false,
		onReply,
		onEditMessage,
		onDeleteMessage,
		onAttach,
		footer
	}: {
		thread: CommentThread;
		fileGone: boolean;
		lost: boolean;
		hidden: boolean;
		/** placed, but the words around the quote changed; see CommentsPanel's weak */
		unsure?: boolean;
		partial?: boolean;
		dense?: boolean;
		onReply: (thread: CommentThread, body: string) => Promise<string | null> | void;
		onEditMessage: (message: CommentMessage, body: string) => void;
		onDeleteMessage: (thread: CommentThread, message: CommentMessage) => void;
		onAttach?: (thread: CommentThread) => void;
		footer?: Snippet;
	} = $props();

	let draft = $state('');
	let editing = $state<string | null>(null);
	let editDraft = $state('');

	function saveEdit(msg: CommentMessage) {
		const body = editDraft.trim();
		editing = null;
		if (body) onEditMessage(msg, body);
	}

	async function submit() {
		const body = draft.trim();
		if (!body) return;
		draft = '';
		// not sent, as when the name it needed was not given: the reply goes back in the box, unless more was typed
		if ((await onReply(thread, body)) === null && !draft) draft = body;
	}
</script>

<!-- max-w: the dock is as wide as the editor, and a conversation set in a column
     that wide is unreadable. Prose wants a measure, not the space available -->
{#snippet change(quote: string, restore: string)}
	{@const kind = suggestionKind(quote, restore)}
	{@const format = formatChange(quote, restore, regionParserForPath(thread.file))}
	<p class="leading-snug">
		<span class="font-semibold">{suggestionLabel(thread.file, quote, restore)}</span>
		{#if format}
			<span class="text-muted line-clamp-3 italic">{format.words.replaceAll('￼', '…')}</span>
		{:else}
			<span class="text-muted line-clamp-3 italic">{shownWords(kind === 'insert' ? quote : restore)}</span>
			{#if kind === 'replace'}
				<span>{m.comments_suggest_replace_with()}</span>
				<span class="text-muted line-clamp-3 italic">{shownWords(quote)}</span>
			{/if}
		{/if}
	</p>
{/snippet}

<div class="space-y-2 break-words {dense ? '' : 'max-w-2xl px-2 pt-1 pb-3 pl-7'}">
	{#if fileGone}
		<p class="text-warning-ink">{m.comments_file_gone()}</p>
	{:else if lost && isSuggestion(thread)}
		<p class="text-warning-ink">{m.comments_suggest_lost()}</p>
	{:else if lost}
		<p class="text-warning-ink">{m.comments_orphaned()}</p>
		{#if onAttach}
			<button class="btn btn-xs preset-tonal" onclick={() => onAttach(thread)}>{m.comments_attach_selection()}</button>
		{/if}
	{:else if unsure}
		<p class="text-warning-ink">{m.comments_weak()}</p>
	{:else if hidden}
		<p class="text-muted">{isSuggestion(thread) ? m.comments_suggest_not_in_view() : m.comments_not_in_view()}</p>
	{:else if partial}
		<p class="text-muted">{m.comments_suggest_partial()}</p>
	{/if}
	{#each thread.messages as msg, i (msg.id)}
		<div class="group/msg flex items-start gap-2 leading-snug">
			<InitialAvatar name={msg.by} class="mt-0.5 size-5 text-[10px]" />
			<div class="min-w-0 flex-1">
				<span class="text-muted font-medium">{msg.by}</span>
				{#if msg.editedAt}
					<!-- so nobody is quoted saying something they later rewrote -->
					<span class="text-muted italic">({m.comments_edited()})</span>
				{/if}
				{#if editing === msg.id}
					<textarea
						class="textarea rounded-container mt-1 w-full resize-none py-1 text-xs"
						rows="2"
						bind:value={editDraft}
						onkeydown={(e) => {
							if (e.isComposing) return;
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
					{#if i === 0 && isSuggestion(thread)}
						{@render change(thread.anchor.quote, thread.restore ?? '')}
						{#if thread.decision}
							<p class="text-muted">
								{thread.decision === 'accepted'
									? m.comments_suggest_accepted()
									: thread.decision === 'rejected'
										? m.comments_suggest_rejected()
										: m.comments_suggest_closed()}
							</p>
						{/if}
					{/if}
					{#if msg.body}<p class="whitespace-pre-wrap">{msg.body}</p>{/if}
				{/if}
			</div>
			{#if editing !== msg.id}
				<div class="flex shrink-0 items-center gap-0.5 opacity-0 group-hover/msg:opacity-100">
					<button
						class="btn-icon btn-icon-xs hover:preset-tonal"
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
						class="btn-icon btn-icon-xs hover:preset-tonal hover:text-error-ink"
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
	<div class="space-y-1.5 {dense ? '' : 'pl-7'}">
		<div class="flex items-start gap-1">
			<textarea
				class="textarea min-w-0 flex-1 resize-none py-1 text-xs {draft.trim() ? 'min-h-14' : 'h-7 min-h-0'} rounded-container"
				rows="1"
				placeholder={m.comments_reply_placeholder()}
				bind:value={draft}
				onkeydown={(e) => {
					// Enter sends, Shift+Enter breaks the line: a review reply is one or two
					// sentences, so reaching for a button every time is the wrong default
					if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
						e.preventDefault();
						submit();
					}
				}}></textarea>
			{#if footer}{@render footer()}{/if}
		</div>
		{#if draft.trim()}
			<button class="btn btn-xs preset-filled-primary-500" onclick={submit}>
				{m.comments_reply()}
			</button>
		{/if}
	</div>
</div>
