<script lang="ts">
	// Git-diff view: the status/controls strip above DiffPanel.
	import { tip } from '$lib/components/tooltip.svelte';
	import { RefreshCw, GitCompare, Info, Columns2, Rows2 } from '@lucide/svelte';
	import { isTexpileManaged } from '$lib/comments/managed';
	import DiffPanel from './DiffPanel.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		filename: string;
		original: string;
		modified: string;
		layout: 'unified' | 'split';
		loading: boolean;
		error: string | null;
		hasHead: boolean;
		/** the version being compared against; null means the last saved one */
		compareRef?: { hash: string; subject: string } | null;
		/** the working copy is gone: the version is shown against nothing */
		fileDeleted?: boolean;
		/** nothing may be written back: the file is being co-edited, and this pane is not CRDT-bound */
		readOnly?: boolean;
		/** edits to the working side, routed to the buffer's own input handler */
		onModifiedInput?: (value: string) => void;
		onToggleLayout: () => void;
		onRefresh: () => void;
	};
	let {
		filename,
		original,
		modified,
		layout,
		loading,
		error,
		hasHead,
		compareRef = null,
		fileDeleted = false,
		readOnly = false,
		onModifiedInput,
		onToggleLayout,
		onRefresh
	}: Props = $props();
</script>

<div class="flex h-full flex-col">
	<!-- min-h-10 is the app's bar height, shared with the PDF, editor and draft toolbars: this sits
	     level with the PDF toolbar across the split instead of a few pixels short of it -->
	<div class="bg-surface-100-900 text-muted border-surface-200-800 flex min-h-10 shrink-0 items-center gap-2 border-b px-3 text-xs">
		<GitCompare class="size-3.5 shrink-0" />
		<span class="font-medium">{m.wsview_diff_heading()}</span>
		<!-- naming the version matters more than the word "diff" once this can point at any of them -->
		{#if compareRef}
			<span class="text-muted min-w-0 truncate" use:tip={compareRef.hash}>· {compareRef.subject}</span>
		{/if}
		{#if fileDeleted}<span class="text-muted">· {m.wsview_diff_file_deleted()}</span>
			<!-- a git read of a local file is usually well under the threshold, and announcing it only
		     to take it away again is the flash the rule exists to prevent -->
		{:else if loading}<span class="text-muted reveal-late">· {m.wsview_diff_loading()}</span>
		{:else if error}<span class="text-error-500 truncate">· {error}</span>
		{:else if !hasHead}<span class="text-muted">· {m.wsview_diff_new_file()}</span>{/if}
		<div class="ml-auto flex shrink-0 items-center gap-1">
			<button
				class="hover:preset-tonal rounded-base p-0.5"
				onclick={onRefresh}
				use:tip={m.wsview_refresh_diff()}
				aria-label={m.wsview_refresh_diff()}
			>
				<RefreshCw class="size-3.5" />
			</button>
			<!-- icon, like Refresh beside it: the label was the longest thing in this bar and the first
			     to crowd it in a narrow editor column. Shows what you switch TO - two columns for
			     side-by-side, stacked rows for inline - with the wording kept on the tooltip. -->
			<button
				class="hover:preset-tonal rounded-base p-0.5"
				onclick={onToggleLayout}
				use:tip={layout === 'unified' ? m.wsview_switch_to_side_by_side() : m.wsview_switch_to_inline()}
				aria-label={layout === 'unified' ? m.wsview_side_by_side_label() : m.wsview_inline_label()}
			>
				{#if layout === 'unified'}<Columns2 class="size-3.5" />{:else}<Rows2 class="size-3.5" />{/if}
			</button>
		</div>
	</div>
	{#if isTexpileManaged(filename)}
		<!-- before the diff, not after: a wall of JSONL with no explanation is a file you delete.
		     .texpile is hidden from the tree, so this and the Source Control row are the only two
		     places anyone ever meets it. -->
		<!-- same 40px bar as the editor's, so meeting this file in a diff and meeting it in the editor
		     look like the same notice -->
		<div
			class="border-surface-200-800 text-muted flex min-h-10 shrink-0 items-center gap-2 border-b px-3 text-xs"
			use:tip={m.texpile_managed_note()}
		>
			<Info class="text-primary-500 size-3.5 shrink-0" />
			<p class="min-w-0 truncate"><span class="font-medium">{m.vcs_texpile_managed()}.</span> {m.texpile_managed_note()}</p>
		</div>
	{/if}
	<!-- the inset lives here rather than on EditorPane's scroller: only the diff BODY needs to keep
	     its scrollbar off the divider lozenge, and the bars above must still reach it -->
	<div class="scroll-inset-r min-h-0 flex-1 overflow-auto">
		{#key filename}
			<DiffPanel {filename} {original} {modified} {layout} {loading} {readOnly} {onModifiedInput} />
		{/key}
	</div>
</div>
