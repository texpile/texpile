<script lang="ts">
	// Git-diff view: the status/controls strip above DiffPanel.
	import { tip } from '$lib/components/tooltip.svelte';
	import { RefreshCw, GitCompare, Info, Columns2, Rows2, ChevronUp, ChevronDown } from '@lucide/svelte';
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

	// null compareRef means the last saved version, and it still has to be named: the heading no
	// longer says which version this is measured against
	const versionLabel = $derived(compareRef?.subject ?? m.vcs_last_version());
	let panel = $state<DiffPanel>();
</script>

<div class="flex h-full flex-col">
	<!-- min-h-10 is the app's bar height, shared with the PDF, editor and draft toolbars: this sits
	     level with the PDF toolbar across the split instead of a few pixels short of it. Its rule is an
	     inset shadow, not a border, as under the editor's top bar: a border leaves 39px inside, and the
	     icon centred in that starts half a pixel down, where it and its label round apart -->
	<div
		class="bg-surface-100-900 text-muted flex min-h-10 shrink-0 items-center gap-2 px-3 text-xs shadow-[inset_0_-1px_0_var(--color-surface-200-800)]"
	>
		<GitCompare class="size-3.5 shrink-0" />
		<span class="cap-center font-medium">{m.wsview_diff_since()}</span>
		<!-- naming the version matters more than the word "diff" once this can point at any of them -->
		{#if compareRef}
			<span class="cap-center text-muted min-w-0 truncate" use:tip={compareRef.hash}>· {versionLabel}</span>
		{:else}
			<span class="cap-center text-muted min-w-0 truncate">· {versionLabel}</span>
		{/if}
		{#if fileDeleted}<span class="cap-center text-muted">· {m.wsview_diff_file_deleted()}</span>
			<!-- a git read of a local file is usually well under the threshold, and announcing it only
		     to take it away again is the flash the rule exists to prevent -->
		{:else if loading}<span class="cap-center text-muted reveal-late">· {m.wsview_diff_loading()}</span>
		{:else if error}<span class="cap-center text-error-ink truncate">· {error}</span>
		{:else if !hasHead}<span class="cap-center text-muted">· {m.wsview_diff_new_file()}</span>{/if}
		<div class="ml-auto flex shrink-0 items-center gap-1">
			<!-- through the changes, as Alt+F5 and Shift+Alt+F5 do from inside the comparison -->
			<button
				class="btn-icon btn-icon-xs hover:preset-tonal"
				onclick={() => panel?.step(-1)}
				use:tip={m.wsview_diff_previous()}
				aria-label={m.wsview_diff_previous()}
			>
				<ChevronUp class="size-3.5" />
			</button>
			<button
				class="btn-icon btn-icon-xs hover:preset-tonal"
				onclick={() => panel?.step(1)}
				use:tip={m.wsview_diff_next()}
				aria-label={m.wsview_diff_next()}
			>
				<ChevronDown class="size-3.5" />
			</button>
			<button
				class="btn-icon btn-icon-xs hover:preset-tonal"
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
				class="btn-icon btn-icon-xs hover:preset-tonal"
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
			class="text-muted flex min-h-10 shrink-0 items-center gap-2 px-3 text-xs shadow-[inset_0_-1px_0_var(--color-surface-200-800)]"
			use:tip={m.texpile_managed_note()}
		>
			<Info class="text-primary-ink size-3.5 shrink-0" />
			<p class="cap-center min-w-0 truncate"><span class="font-medium">{m.vcs_texpile_managed()}.</span> {m.texpile_managed_note()}</p>
		</div>
	{/if}
	<!-- the inset lives here rather than on EditorPane's scroller: only the diff BODY needs to keep
	     its scrollbar off the divider lozenge, and the bars above must still reach it -->
	<div class="scroll-inset-r min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
		{#key filename}
			<DiffPanel bind:this={panel} {filename} {original} {modified} {layout} {loading} {readOnly} {onModifiedInput} />
		{/key}
	</div>
</div>
