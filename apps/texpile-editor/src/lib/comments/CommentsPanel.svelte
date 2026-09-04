<script lang="ts">
	// The Comments tab in the bottom dock: every review thread in the workspace, newest activity
	// first, with replies inline.
	//
	// This is the "overview" half of a review panel - the flat list you scan and jump from. The
	// in-context half is the gutter dot and the highlight in the editor. Splitting them that way is
	// what lets comments exist at all in a layout that already spends its width on the preview: a
	// list wants horizontal room, which the dock has and a 230px rail beside the editor does not.
	import { tip } from '$lib/components/tooltip.svelte';
	import { MessageSquare, Check, Trash2, Unlink, EyeOff, FileX } from '@lucide/svelte';
	import CommentThreadConversation from './CommentThreadConversation.svelte';
	import type { CommentMessage, CommentThread } from '$lib/comments/log';
	import { m } from '$lib/paraglide/messages';

	let {
		threads,
		activeFile = null,
		orphaned = new Set<string>(),
		weak = new Set<string>(),
		notVisible = new Set<string>(),
		filesPresent = null,
		selected = null,
		pending = null,
		onOpen,
		onReply,
		onResolve,
		onDelete,
		onEditMessage = () => {},
		onDeleteMessage = () => {},
		onSubmitPending = () => {},
		onCancelPending = () => {}
	}: {
		threads: CommentThread[];
		/** workspace-relative path of the open file, for the "this file only" filter */
		activeFile?: string | null;
		/** threads on the ACTIVE file whose quote no longer appears in it; unknown for other files */
		orphaned?: Set<string>;
		/** placed on the active file, but the words around the quote changed; if the sentence
		 * repeats in the file the highlight may be on the other copy, so the reader should look */
		weak?: Set<string>;
		/** placed in the file but not drawable in the CURRENT view (visual mode, quote is markup);
		 * distinct from orphaned - switching to source brings these back */
		notVisible?: Set<string>;
		/** every workspace-relative file path that exists, or null for "unknown, draw no badges".
		 * Threads deliberately SURVIVE their file's deletion (undo brings both back), so the panel
		 * has to say the file is gone rather than present a dead link. */
		filesPresent?: Set<string> | null;
		selected?: string | null;
		/** a selection waiting for its first message; not a thread until one is written */
		pending?: { quote: string } | null;
		onOpen: (thread: CommentThread) => void;
		onReply: (thread: CommentThread, body: string) => void;
		onResolve: (thread: CommentThread, resolved: boolean) => void;
		onDelete: (thread: CommentThread) => void;
		/** one message rather than the whole thread */
		onEditMessage?: (message: CommentMessage, body: string) => void;
		onDeleteMessage?: (thread: CommentThread, message: CommentMessage) => void;
		onSubmitPending?: (body: string) => void;
		onCancelPending?: () => void;
	} = $props();

	let thisFileOnly = $state(false);
	let showResolved = $state(false);
	let expanded = $state<string | null>(null);
	let newDraft = $state('');
	let composer = $state<HTMLTextAreaElement | null>(null);
	let list = $state<HTMLDivElement | null>(null);

	/**
	 * Follow a selection made outside this panel - clicking a highlight in the editor.
	 *
	 * Keyed on `selected` CHANGING, not on it being set: reacting to the value itself would
	 * re-expand a thread the moment you collapsed it, since collapsing does not deselect.
	 */
	let lastSelected: string | null = null;
	$effect(() => {
		const id = selected;
		if (id === lastSelected) return;
		lastSelected = id;
		if (!id) return;
		expanded = id;
		// after the row has expanded, or it scrolls to where the row used to end
		requestAnimationFrame(() => list?.querySelector(`[data-thread="${id}"]`)?.scrollIntoView({ block: 'nearest' }));
	});

	// the reader asked for this from the editor, so the caret should already be here; nothing else
	// in the dock takes focus on its own
	$effect(() => {
		if (pending) composer?.focus();
	});

	const shown = $derived(
		threads
			.filter((t) => (showResolved || !t.resolved) && (!thisFileOnly || t.file === activeFile))
			// most recent activity first: a thread someone just replied to is the one you want
			.toSorted((a, b) => (last(b) ?? '').localeCompare(last(a) ?? ''))
	);
	const openCount = $derived(threads.filter((t) => !t.resolved).length);

	function last(t: CommentThread) {
		return t.messages.at(-1)?.at;
	}

	/**
	 * A quote is a raw slice of source, so it arrives with its newlines and indentation intact and
	 * renders as a ragged multi-line block. Collapsed to one line it reads as a label, which is all
	 * it is here - the document is where you go to see it in context.
	 */
	function oneLine(s: string, max = 90) {
		const flat = s.replace(/\s+/g, ' ').trim();
		return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
	}

	function toggle(thread: CommentThread) {
		expanded = expanded === thread.id ? null : thread.id;
		onOpen(thread);
	}
</script>

<div class="flex h-full min-h-0 flex-col text-xs">
	<div class="border-surface-200-800 flex h-7 shrink-0 items-center gap-3 border-b px-2">
		<span class="text-muted">{m.comments_open_count({ count: openCount })}</span>
		<label class="text-muted ml-auto flex cursor-pointer items-center gap-1.5">
			<input type="checkbox" class="checkbox scale-75" bind:checked={thisFileOnly} />
			{m.comments_this_file()}
		</label>
		<label class="text-muted flex cursor-pointer items-center gap-1.5">
			<input type="checkbox" class="checkbox scale-75" bind:checked={showResolved} />
			{m.comments_show_resolved()}
		</label>
	</div>
	<div bind:this={list} class="min-h-0 flex-1 overflow-y-auto">
		{#if pending}
			<div class="border-surface-200-800 bg-surface-scrim max-w-2xl space-y-2 border-b p-2">
				<span class="text-muted block truncate font-mono" use:tip={pending.quote}>{oneLine(pending.quote)}</span>
				<textarea
					bind:this={composer}
					class="textarea min-h-8 w-full text-xs rounded-container"
					rows="2"
					placeholder={m.comments_reply_placeholder()}
					bind:value={newDraft}
					onkeydown={(e) => {
						if (e.key === 'Escape') {
							newDraft = '';
							onCancelPending();
						} else if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault();
							if (!newDraft.trim()) return;
							onSubmitPending(newDraft.trim());
							newDraft = '';
						}
					}}></textarea>
				<div class="flex items-center gap-1">
					<button
						class="btn btn-xs preset-filled-primary-500"
						disabled={!newDraft.trim()}
						onclick={() => {
							onSubmitPending(newDraft.trim());
							newDraft = '';
						}}
					>
						{m.comments_add()}
					</button>
					<button
						class="btn btn-xs hover:preset-tonal"
						onclick={() => {
							newDraft = '';
							onCancelPending();
						}}
					>
						{m.comments_cancel()}
					</button>
				</div>
			</div>
		{/if}
		{#if shown.length === 0 && !pending}
			<div class="text-muted flex flex-1 items-center gap-2 p-4">
				<MessageSquare class="size-4 shrink-0" />
				{threads.length === 0 ? m.comments_empty() : m.comments_empty_file()}
			</div>
		{:else}
			{#each shown as thread (thread.id)}
				{@const isOpen = expanded === thread.id}
				{@const fileGone = filesPresent !== null && !filesPresent.has(thread.file)}
				{@const lost = !fileGone && orphaned.has(thread.id)}
				{@const hidden = !fileGone && !lost && notVisible.has(thread.id)}
				{@const unsure = !fileGone && !lost && !hidden && weak.has(thread.id)}
				<div data-thread={thread.id} class="border-surface-wash border-b last:border-b-0 {selected === thread.id ? 'bg-surface-tint' : ''}">
					<!-- the summary and the thread actions are SIBLINGS: a button cannot contain a button,
					     and Resolve/Delete belong on the header rather than under the reply box, where
					     they read as things you do to your reply -->
					<div class="hover:bg-surface-wash group flex items-start">
						<button
							class="flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5 text-left"
							onclick={() => toggle(thread)}
							aria-expanded={isOpen}
						>
							{#if thread.resolved}
								<Check class="text-success-ink mt-0.5 size-3.5 shrink-0" />
							{:else if fileGone}
								<FileX class="text-warning-ink mt-0.5 size-3.5 shrink-0" />
							{:else if lost}
								<Unlink class="text-warning-ink mt-0.5 size-3.5 shrink-0" />
							{:else if hidden}
								<EyeOff class="text-muted mt-0.5 size-3.5 shrink-0" />
							{:else}
								<MessageSquare class="text-primary-ink mt-0.5 size-3.5 shrink-0" />
							{/if}
							<span class="min-w-0 flex-1">
								<!-- the quote first: it is what tells you which comment this is, faster than the
								     body does, and it is the only part that ties the row to the document -->
								<span class="text-muted block truncate font-mono" use:tip={thread.anchor.quote}>{oneLine(thread.anchor.quote)}</span>
								<!-- the body preview goes when the thread opens: the messages below start with
								     this same text, and showing both made every thread look like it had a
								     duplicate first reply -->
								{#if !isOpen}
									<span class="block truncate" use:tip={thread.messages[0]?.body}>{thread.messages[0]?.body}</span>
								{/if}
							</span>
							<!-- one centred cluster: the row is items-start (the quote block can be two lines),
							     so loose trailing spans each top-align on their own - and a 10px badge box is
							     shorter than the filename's line, which floated "Detached" above main.tex -->
							<span class="flex shrink-0 items-center gap-1.5">
								{#if thread.messages.length > 1 && !isOpen}
									<span class="badge preset-tonal-surface px-1 py-0 text-[10px]">{thread.messages.length}</span>
								{/if}
								{#if fileGone}
									<span class="badge preset-tonal-warning px-1 py-0 text-[10px]">{m.comments_file_gone_badge()}</span>
								{:else if lost}
									<span class="badge preset-tonal-warning px-1 py-0 text-[10px]">{m.comments_orphaned_badge()}</span>
								{:else if hidden}
									<!-- neutral, not warning: nothing is wrong, the comment just lives in markup the
									     visual editor renders rather than shows -->
									<span class="badge preset-tonal-surface px-1 py-0 text-[10px]">{m.comments_not_in_view_badge()}</span>
								{:else if unsure}
									<span class="badge preset-tonal-warning px-1 py-0 text-[10px]">{m.comments_weak_badge()}</span>
								{/if}
								<span class="text-muted font-mono">{thread.file}</span>
							</span>
						</button>
						<!-- icon-only, and only on hover or while open: Resolve and Delete are one click from
						     destroying somebody's thread, so they should not sit lit up on every row -->
						<div class="flex shrink-0 items-center gap-0.5 py-1.5 pr-2 {isOpen ? '' : 'opacity-0 group-hover:opacity-100'}">
							<button
								class="btn-icon btn-icon-xs hover:preset-tonal"
								use:tip={thread.resolved ? m.comments_reopen() : m.comments_resolve()}
								aria-label={thread.resolved ? m.comments_reopen() : m.comments_resolve()}
								onclick={() => onResolve(thread, !thread.resolved)}
							>
								<Check class="size-3.5" />
							</button>
							<button
								class="btn-icon btn-icon-xs hover:preset-tonal hover:text-error-ink"
								use:tip={m.comments_delete()}
								aria-label={m.comments_delete()}
								onclick={() => onDelete(thread)}
							>
								<Trash2 class="size-3.5" />
							</button>
						</div>
					</div>
					{#if isOpen}
						<CommentThreadConversation {thread} {fileGone} {lost} {hidden} {unsure} {onReply} {onEditMessage} {onDeleteMessage} />
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>
