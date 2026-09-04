<script lang="ts">
	// Grid placement + drag-resize around BottomDock. Stays mounted while hidden so the shells
	// survive; shrunk it sits under the editor column so the preview keeps full height.
	import BottomDock from './BottomDock.svelte';
	import type { CommentMessage, CommentThread } from '$lib/comments/log';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		visible: boolean;
		height: number;
		shrink: boolean;
		dockShrunk: boolean;
		cwd: string;
		pdfPaneOpen: boolean;
		terminalEnabled?: boolean;
		view: 'terminal' | 'problems' | 'comments';
		dock?: BottomDock;
		onStartResize: (e: MouseEvent) => void;
		onResizeByKey: (e: KeyboardEvent) => void;
		onToggleShrink: () => void;
		onClose: () => void;
		onProblemJump: (file: string, line: number, selectText?: string) => void;
		/** review threads and their actions; straight through to BottomDock's Comments tab */
		comments?: CommentThread[];
		commentFile?: string | null;
		commentsOrphaned?: Set<string>;
		/** placed, but the words around the quote changed; see CommentsPanel */
		commentsWeak?: Set<string>;
		/** placed in the file but not drawable in the current view; see CommentsPanel */
		commentsNotVisible?: Set<string>;
		/** workspace-relative paths that exist; null = unknown. See CommentsPanel's fileGone. */
		commentFilesPresent?: Set<string> | null;
		commentSelected?: string | null;
		onCommentOpen?: (thread: CommentThread) => void;
		onCommentReply?: (thread: CommentThread, body: string) => void;
		onCommentResolve?: (thread: CommentThread, resolved: boolean) => void;
		onCommentDelete?: (thread: CommentThread) => void;
		onCommentEditMessage?: (message: CommentMessage, body: string) => void;
		onCommentDeleteMessage?: (thread: CommentThread, message: CommentMessage) => void;
		commentPending?: { quote: string } | null;
		onCommentSubmitPending?: (body: string) => void;
		onCommentCancelPending?: () => void;
	};
	let {
		visible,
		height,
		shrink,
		dockShrunk,
		cwd,
		pdfPaneOpen,
		terminalEnabled = true,
		view = $bindable(),
		dock = $bindable(),
		onStartResize,
		onResizeByKey,
		onToggleShrink,
		onClose,
		onProblemJump,
		comments = [],
		commentFile = null,
		commentsOrphaned = new Set<string>(),
		commentsWeak = new Set<string>(),
		commentsNotVisible = new Set<string>(),
		commentFilesPresent = null,
		commentSelected = null,
		onCommentOpen,
		onCommentReply,
		onCommentResolve,
		onCommentDelete,
		onCommentEditMessage,
		onCommentDeleteMessage,
		commentPending = null,
		onCommentSubmitPending,
		onCommentCancelPending
	}: Props = $props();
</script>

{#if visible}
	<!-- the WAI-ARIA window-splitter pattern (role=separator + tabindex); svelte's a11y rule doesn't special-case it -->
	<!-- eslint-disable-next-line svelte/valid-compile -->
	<div
		class="hover:bg-primary-wash active:bg-primary-flood relative z-20 -my-[3px] h-1.5 shrink-0 cursor-row-resize bg-transparent transition-colors"
		style="grid-row: 3; grid-column: {dockShrunk ? '1' : '1 / -1'}"
		onmousedown={onStartResize}
		onkeydown={onResizeByKey}
		role="separator"
		aria-orientation="horizontal"
		aria-label={m.wsview_resize_terminal_aria()}
		tabindex="0"
	></div>
{/if}
<section
	class="border-surface-200-800 flex shrink-0 flex-col border-t"
	style={`${visible ? `height: ${height}px` : 'display: none'}; grid-row: 4; grid-column: ${dockShrunk ? '1' : '1 / -1'}`}
>
	<BottomDock
		bind:this={dock}
		bind:view
		{cwd}
		{pdfPaneOpen}
		{shrink}
		{terminalEnabled}
		{onToggleShrink}
		{onClose}
		{onProblemJump}
		{comments}
		{commentFile}
		{commentsOrphaned}
		{commentsWeak}
		{commentsNotVisible}
		{commentFilesPresent}
		{commentSelected}
		{onCommentOpen}
		{onCommentReply}
		{onCommentResolve}
		{onCommentDelete}
		{onCommentEditMessage}
		{onCommentDeleteMessage}
		{commentPending}
		{onCommentSubmitPending}
		{onCommentCancelPending}
	/>
</section>
