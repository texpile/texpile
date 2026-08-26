<script lang="ts">
	// History panel, purely presentational: WorkspaceView implements the callbacks. No
	// staged/unstaged split - the tick boxes ARE the staging, so a version's scope is visible.
	import { GitBranch, RefreshCw, Check, GitCommitHorizontal, ArrowUp } from '@lucide/svelte';
	import ChangeList from './history/ChangeList.svelte';
	import HistoryTimeline from './history/HistoryTimeline.svelte';
	import { pathLabels } from './history/pathLabels';
	import { isBuildArtifact } from '$lib/workspace/buildArtifacts';
	import type { GitStatusEntry, GitLogEntry, GitFileChange } from '$lib/workspace/git';
	import { modLabel } from '$lib/platform';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		root: string;
		isRepo: boolean;
		branch: string | null;
		/** the upstream this branch tracks; null means there is nowhere to upload to */
		tracking?: string | null;
		/** versions saved here that the upstream does not have */
		ahead?: number;
		changes: GitStatusEntry[];
		history: GitLogEntry[];
		/** could not be read at all, as against having nothing in it */
		historyError?: string | null;
		/** the history runs past what was fetched */
		historyHasMore?: boolean;
		onShowMoreHistory?: () => void;
		busy?: boolean;
		onInit: () => void;
		onDiscard: (changes: GitStatusEntry[]) => void;
		onCommit: (message: string, paths: string[]) => Promise<boolean>;
		onRestore: (entry: GitLogEntry) => void;
		onCompare: (entry: GitLogEntry, path: string) => void;
		/** what differs between a version and the working copy, read when that version is opened */
		onLoadChanges: (hash: string) => Promise<GitFileChange[]>;
		/** the timeline's share of the panel (0..1) */
		historyFraction: number;
		splitEl?: HTMLDivElement;
		onStartHistoryResize: (e: MouseEvent) => void;
		onResizeHistoryByKey: (e: KeyboardEvent) => void;
		onOpenDiff: (path: string) => void;
		onRefresh: () => void;
		onUpload: () => void;
		onIgnoreArtifacts: (() => void) | null;
	};
	let {
		root,
		isRepo,
		branch,
		tracking = null,
		ahead = 0,
		changes,
		history,
		historyError = null,
		historyHasMore = false,
		onShowMoreHistory,
		busy = false,
		onInit,
		onDiscard,
		onCommit,
		onRestore,
		onCompare,
		onLoadChanges,
		historyFraction,
		splitEl = $bindable(),
		onStartHistoryResize,
		onResizeHistoryByKey,
		onOpenDiff,
		onRefresh,
		onUpload,
		onIgnoreArtifacts
	}: Props = $props();

	let message = $state('');

	// one implementation of how a path is written, shared by the changes and a version's files
	const labels = $derived(pathLabels(root));

	// what the author wrote vs what the compiler wrote
	const artifacts = $derived(changes.filter((c) => isBuildArtifact(c.path)));
	const sources = $derived(changes.filter((c) => !isBuildArtifact(c.path)));

	/** Paths the user has UNticked. Exclusions rather than inclusions, so a file that changes while
	 *  the panel is open joins the next version by default instead of being silently left out. */
	let excluded = $state<string[]>([]);
	// build output starts unticked without being "excluded by the user": it is off by default and
	// stays off through a refresh, but ticking one is remembered rather than undone on the next scan
	let artifactsOptedIn = $state<string[]>([]);

	const selected = $derived([
		...sources.filter((c) => !excluded.includes(c.path)).map((c) => c.path),
		...artifacts.filter((c) => artifactsOptedIn.includes(c.path)).map((c) => c.path)
	]);

	function toggle(path: string) {
		if (artifacts.some((a) => a.path === path)) {
			artifactsOptedIn = artifactsOptedIn.includes(path) ? artifactsOptedIn.filter((p) => p !== path) : [...artifactsOptedIn, path];
			return;
		}
		excluded = excluded.includes(path) ? excluded.filter((p) => p !== path) : [...excluded, path];
	}

	async function save() {
		if (!message.trim() || selected.length === 0) return;
		if (await onCommit(message, selected)) {
			message = '';
			excluded = [];
			artifactsOptedIn = [];
		}
	}
	function onKeydown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
			e.preventDefault();
			void save();
		}
	}
</script>

{#if !isRepo}
	<div class="flex flex-col items-center gap-3 p-6 text-center">
		<GitBranch class="text-surface-400 size-8" />
		<p class="text-surface-500 text-sm">{m.vcs_not_a_repo()}</p>
		<button class="btn btn-xs preset-filled-primary-500 gap-1.5" onclick={onInit} disabled={busy}>
			<GitBranch class="size-4" />
			{m.vcs_init_repo()}
		</button>
	</div>
{:else}
	<div class="flex h-full min-h-0 flex-col">
		<!-- refresh belongs beside the branch: both are the state of the repository, and parked above
		     an unrelated heading it read as a stray duplicate of the file tree's own refresh -->
		<div class="text-surface-600-300 flex h-7 shrink-0 items-center gap-1.5 px-3 text-xs">
			<GitBranch class="size-3.5 shrink-0" />
			<span class="truncate font-medium">{branch ?? m.vcs_no_branch()}</span>
			<div class="ml-auto flex shrink-0 items-center gap-1">
				<!-- Only with an upstream to send to, and only with something to send. The count is of
				     local refs, so it is exact without a fetch; there is deliberately no "behind", which
				     would be as old as a fetch nothing here runs. -->
				{#if tracking && ahead > 0}
					<button
						class="hover:preset-tonal flex items-center gap-0.5 rounded px-1 py-0.5 disabled:opacity-50"
						title={ahead === 1 ? m.vcs_upload_one() : m.vcs_upload_count({ count: ahead })}
						aria-label={m.vcs_upload_aria()}
						onclick={onUpload}
						disabled={busy}
					>
						<ArrowUp class="size-3.5" />
						<span class="tabular-nums">{ahead}</span>
					</button>
				{/if}
				<button
					class="hover:preset-tonal rounded p-0.5"
					title={m.vcs_refresh_title()}
					aria-label={m.vcs_refresh_aria()}
					onclick={onRefresh}
				>
					<RefreshCw class="size-3.5" />
				</button>
			</div>
		</div>

		<!-- which half matters depends on what you are doing, so it is not the scrollbar's decision -->
		<div class="flex min-h-0 flex-1 flex-col" bind:this={splitEl}>
			<div class="flex min-h-0 flex-col" style="flex: {1 - historyFraction} 1 0%">
				<div class="scroll-inset-r min-h-0 flex-1 overflow-y-auto pb-2">
					{#if changes.length}
						<!-- The total, then the groups it is made of. Deliberately not a group row itself: no
						     tick box and no chevron, so a summary cannot be mistaken for what it summarises. -->
						<div class="border-surface-200-800 text-surface-500 flex items-center gap-2 border-t px-3 py-1 text-xs">
							<span class="font-medium">{m.vcs_total_changes()}</span>
							<span class="tabular-nums">{changes.length}</span>
						</div>
						<div class="px-1.5">
							<ChangeList {root} {sources} {artifacts} {selected} onToggle={toggle} {onOpenDiff} {onDiscard} {onIgnoreArtifacts} />
						</div>
					{:else}
						<div class="text-surface-500 mt-6 mb-2 flex flex-col items-center gap-1 text-center text-sm">
							<GitCommitHorizontal class="size-6 opacity-60" />
							{m.vcs_no_changes()}
						</div>
					{/if}
				</div>

				<!-- outside the scroller: what you are about to save must not scroll away from its list -->
				{#if changes.length}
					<div class="border-surface-200-800 shrink-0 space-y-2 border-t px-2 py-2">
						<textarea
							class="input resize-none text-sm"
							rows="2"
							placeholder={m.vcs_save_placeholder()}
							title={m.vcs_commit_placeholder({ modLabel })}
							bind:value={message}
							onkeydown={onKeydown}></textarea>
						<button
							class="btn btn-xs preset-filled-primary-500 w-full gap-1.5"
							onclick={save}
							disabled={busy || !message.trim() || selected.length === 0}
						>
							<Check class="size-4" />
							{selected.length === 1 ? m.vcs_save_version_one() : m.vcs_save_version_count({ count: selected.length })}
						</button>
					</div>
				{/if}
			</div>

			<!-- arrow keys resize when focused: the WAI-ARIA window-splitter pattern (role=separator + tabindex) -->
			<!-- eslint-disable-next-line svelte/valid-compile -->
			<div
				class="hover:bg-primary-500/40 active:bg-primary-500/60 relative z-20 -my-[3px] h-1.5 shrink-0 cursor-row-resize bg-transparent transition-colors"
				onmousedown={onStartHistoryResize}
				onkeydown={onResizeHistoryByKey}
				role="separator"
				aria-orientation="horizontal"
				aria-label={m.vcs_resize_history_aria()}
				tabindex="0"
			></div>

			<div class="border-surface-200-800 flex min-h-0 flex-col border-t" style="flex: {historyFraction} 1 0%">
				<div class="text-surface-500 shrink-0 px-2 py-1 text-sm">{m.vcs_history_heading()}</div>
				<div class="scroll-inset-r min-h-0 flex-1 overflow-y-auto pb-2">
					<HistoryTimeline
						{history}
						{busy}
						{branch}
						error={historyError}
						hasMore={historyHasMore}
						onShowMore={onShowMoreHistory}
						{onLoadChanges}
						{onCompare}
						{onRestore}
						baseName={labels.baseName}
						dirName={labels.dirName}
					/>
				</div>
			</div>
		</div>
	</div>
{/if}
