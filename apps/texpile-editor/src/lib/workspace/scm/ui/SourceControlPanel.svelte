<script lang="ts">
	// History panel, purely presentational: WorkspaceView implements the callbacks. No
	// staged/unstaged split - the tick boxes ARE the staging, so a version's scope is visible.
	import { tip } from '$lib/components/tooltip.svelte';
	import { GitBranch, RefreshCw, Check, GitCommitHorizontal, PackageX, LoaderCircle } from '@lucide/svelte';
	import ChangeList from './changes/ChangeList.svelte';
	import MergeActions from './MergeActions.svelte';
	import SyncControls from './SyncControls.svelte';
	import ProgressLine from '$lib/components/progress/ProgressLine.svelte';
	import ParentRepoGate from './gates/ParentRepoGate.svelte';
	import NoRepoGate from './gates/NoRepoGate.svelte';
	import UnsafeRepoGate from './gates/UnsafeRepoGate.svelte';
	import HistoryTimeline from './graph/HistoryTimeline.svelte';
	import { pathLabels } from './changes/pathLabels';
	import { isBuildArtifact } from '$lib/workspace/buildArtifacts';
	// what is going on in git that only the display needs: not callbacks, so read here, not passed down
	import { isConflicted, gitRunning, gitUnsafe, gitTruncated, gitHead, gitBranch } from '$lib/workspace/scm/gitStore';
	import { scmDraftFor, optIn } from '$lib/workspace/scm/actions/scmDraft.svelte';
	import type { GitStatusEntry, GitLogEntry, GitFileChange, GitOperation } from '$lib/workspace/scm/git';
	import { combo } from '$lib/chrome/shortcutText';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		root: string;
		isRepo: boolean;
		/** git is not installed at all, which "not a repository" would misdescribe */
		gitMissing?: boolean;
		onRecheckGit?: () => void;
		/** an unfinished merge, rebase, cherry-pick or revert */
		operation?: GitOperation | null;
		/** the repository starts above this folder and the author has not said to use it */
		parentRepo?: string | null;
		onUseParentRepo?: () => void;
		branch: string | null;
		/** the upstream this branch tracks; null means there is nowhere to upload to yet */
		tracking?: string | null;
		/** versions saved here that the upstream does not have */
		ahead?: number;
		/** versions the upstream has that this branch does not, as of the last fetch */
		behind?: number;
		/** at least one version exists: before the first there is nothing to publish */
		hasCommits?: boolean;
		/** HEAD is a commit, not a branch: nothing to publish or sync */
		detached?: boolean;
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
		onPublish: () => void;
		onSync: () => void;
		onIgnoreArtifacts: (() => void) | null;
		/** a file both sides changed, opened at its first marked place */
		onOpenConflict?: (path: string) => void;
		/** save the merge as a version; absent where the app cannot, and the terminal does it */
		onFinishCombine?: () => void;
		onCancelCombine?: () => void;
	};
	let {
		root,
		isRepo,
		gitMissing = false,
		onRecheckGit,
		operation = null,
		parentRepo = null,
		onUseParentRepo,
		branch,
		tracking = null,
		ahead = 0,
		behind = 0,
		hasCommits = true,
		detached = false,
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
		onPublish,
		onSync,
		onIgnoreArtifacts,
		onOpenConflict,
		onFinishCombine,
		onCancelCombine
	}: Props = $props();

	// what the author has chosen but not saved, kept outside the panel so it survives the panel
	const draft = $derived(scmDraftFor(root));

	// one implementation of how a path is written, shared by the changes and a version's files
	const labels = $derived(pathLabels(root));

	// files both sides changed, which hold conflict markers until someone chooses: never ticked,
	// never part of an ordinary version
	const conflicts = $derived(changes.filter((c) => isConflicted(c.x, c.y)));
	// what the author wrote vs what the compiler wrote
	const artifacts = $derived(changes.filter((c) => !isConflicted(c.x, c.y) && isBuildArtifact(c.path)));
	const sources = $derived(changes.filter((c) => !isConflicted(c.x, c.y) && !isBuildArtifact(c.path)));

	const selected = $derived([...sources, ...artifacts].filter((c) => draft.ticked(c)).map((c) => c.path));

	function toggle(path: string) {
		if (changes.some((c) => c.path === path && optIn(c))) {
			const on = draft.artifactsOptedIn;
			draft.artifactsOptedIn = on.includes(path) ? on.filter((p) => p !== path) : [...on, path];
			return;
		}
		const off = draft.excluded;
		draft.excluded = off.includes(path) ? off.filter((p) => p !== path) : [...off, path];
	}

	// a version saved in the middle of a merge would record it half-done, and one saved over a place
	// still marked for choosing would record the markers
	const canSave = $derived(!busy && !operation && !conflicts.some((c) => c.markers) && !!draft.message.trim() && selected.length > 0);

	async function save() {
		if (!canSave) return;
		// this folder's draft, held across the wait: a commit that ends after another folder was
		// opened must not clear that one's
		const d = draft;
		if (!(await onCommit(d.message, selected))) return;
		// what was unstaged stays unstaged, pruned to what is still listed while the list is this folder's
		d.clear(d === draft ? changes.map((c) => c.path) : undefined);
	}

	/** a merge the panel can finish or cancel itself; the rest go back to the terminal they came from */
	const combining = $derived(operation === 'merge' && !!onFinishCombine && !!onCancelCombine);
	// beside the branch, as VS Code's status bar says main (Rebasing); the tip says where to finish it
	const OPERATION: Record<GitOperation, { label: () => string; tip: () => string }> = {
		merge: { label: m.vcs_op_merge_label, tip: m.vcs_op_merge },
		rebase: { label: m.vcs_op_rebase_label, tip: m.vcs_op_rebase },
		'cherry-pick': { label: m.vcs_op_cherry_pick_label, tip: m.vcs_op_cherry_pick },
		revert: { label: m.vcs_op_revert_label, tip: m.vcs_op_revert }
	};
	const opNote = $derived(
		operation ? { label: OPERATION[operation].label(), tip: combining ? m.vcs_finish_combine_tip() : OPERATION[operation].tip() } : null
	);
	// too narrow for both: the branch name hides for the operation or Sync's counts, rather than show half a letter
	const branchFit = $derived(opNote ? '@max-[14rem]:hidden' : tracking && (ahead > 0 || behind > 0) ? '@max-[8rem]:hidden' : '');
	/** files still holding a place nobody has chosen for */
	const marked = $derived(conflicts.filter((c) => c.markers).length);

	// what a commit goes on, as VS Code names it: the branch, or with HEAD detached (git then calls
	// the branch "HEAD") the commit's short hash
	const shortHead = $derived((gitHead.current ?? '').slice(0, 7));
	const commitOn = $derived(detached ? shortHead : gitBranch.current);

	function onKeydown(e: KeyboardEvent) {
		// Ctrl+Enter alone: Ctrl+Alt+Enter is Compile, which committed the half-written message as well
		if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && !e.isComposing && e.key === 'Enter') {
			e.preventDefault();
			void save();
		}
	}
</script>

{#if gitMissing}
	<!-- "not under source control" with an Initialize button that then fails is what this used to say -->
	<div class="@container flex flex-col items-center gap-3 px-3 py-6 text-center">
		<PackageX class="text-faint size-8" />
		<p class="text-muted text-sm @max-[11rem]:text-xs">{m.vcs_git_missing()}</p>
		<!-- the app installs nothing: the page says how, for each system -->
		<a
			class="anchor text-sm @max-[11rem]:text-xs"
			href="https://texpile.com/docs/installation/git"
			target="_blank"
			rel="noopener noreferrer">{m.vcs_git_install()}</a
		>
		<button
			class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal w-full gap-1.5 whitespace-normal"
			onclick={onRecheckGit}
			disabled={busy}
		>
			<RefreshCw class="size-3.5 shrink-0 @max-[8rem]:hidden" />
			<span class="cap-center min-w-0 overflow-x-clip text-ellipsis">{m.vcs_check_again()}</span>
		</button>
	</div>
{:else if gitUnsafe.current && root}
	<UnsafeRepoGate {root} repo={gitUnsafe.current} />
{:else if !isRepo}
	<NoRepoGate {busy} {onInit} />
{:else if parentRepo}
	<ParentRepoGate repo={parentRepo} {busy} onUse={onUseParentRepo} {onInit} />
{:else}
	<div class="flex h-full min-h-0 flex-col">
		<!-- status reads stay out of gitRunning: autosave rereads status after nearly every save, and the line would flicker -->
		<ProgressLine active={busy || !!gitRunning.current} label={m.vcs_working()} />
		<!-- refresh belongs beside the branch: both are the state of the repository, and parked above
		     an unrelated heading it read as a stray duplicate of the file tree's own refresh -->
		<!-- a container, so in a narrow sidebar Sync and Publish drop their word and Refresh stays in sight -->
		<div class="text-muted @container flex h-7 shrink-0 items-center gap-1.5 px-3 text-xs">
			<!-- a label, as on master: switching is Switch branch in the command palette. Detached, git
			     calls the branch "HEAD", which says nothing; this says what it means and where the way back is -->
			<GitBranch class="size-3.5 shrink-0" />
			{#if detached}
				<span class="cap-center shrink-100 truncate font-medium {branchFit}" use:tip={m.vcs_detached_tip()}
					>{m.vcs_detached({ short: shortHead })}</span
				>
			{:else}
				<span class="cap-center shrink-100 truncate font-medium {branchFit}">{branch ?? m.vcs_no_branch()}</span>
			{/if}
			<!-- the tip is read out as well as hovered -->
			{#if opNote}
				<span class="cap-center truncate" use:tip={opNote.tip}>{opNote.label}<span class="sr-only">. {opNote.tip}</span></span>
			{/if}
			<div class="ml-auto flex shrink-0 items-center gap-1">
				<SyncControls place="header" {tracking} {ahead} {behind} {hasCommits} {detached} {branch} {operation} {busy} {onSync} {onPublish} />
				<button
					class="btn-icon btn-icon-xs hover:preset-tonal"
					use:tip={m.vcs_refresh_title()}
					aria-label={m.vcs_refresh_aria()}
					onclick={onRefresh}
				>
					<RefreshCw class="size-3.5" />
				</button>
			</div>
		</div>

		<!-- which half matters depends on what you are doing, so it is not the scrollbar's decision -->
		<div class="flex min-h-0 flex-1 flex-col" bind:this={splitEl}>
			<div class="flex min-h-0 flex-col" style="flex: 1 1 0%">
				<div class="scroll-inset-r min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] pb-2">
					{#if changes.length}
						<!-- The total, then the groups it is made of. Deliberately not a group row itself: no
						     tick box and no chevron, so a summary cannot be mistaken for what it summarises. -->
						<div class="border-surface-200-800 text-muted flex items-center gap-2 border-t px-3 py-1 text-xs">
							<span class="font-medium">{m.vcs_total_changes()}</span>
							<span class="tabular-nums">{gitTruncated.current || changes.length}</span>
						</div>
						{#if gitTruncated.current}
							<!-- gray, as Find in Files says (truncated): a limit, not something wrong -->
							<p class="text-muted px-3 py-1 text-xs" role="status">
								{m.vcs_truncated({ shown: changes.length.toLocaleString() })}
							</p>
						{/if}
						<div class="px-1.5">
							<ChangeList
								{root}
								{conflicts}
								{sources}
								{artifacts}
								{selected}
								onToggle={toggle}
								{onOpenDiff}
								{onOpenConflict}
								{onDiscard}
								{onIgnoreArtifacts}
							/>
						</div>
					{:else}
						<div class="text-muted @container mt-6 mb-2 flex flex-col items-center gap-1 px-3 text-center text-sm">
							<GitCommitHorizontal class="size-6 opacity-60" />
							<span class="@max-[11rem]:text-xs">{m.vcs_no_changes()}</span>
						</div>
						<!-- VS Code's action button: with nothing to save, what is left to do is send and receive
						     versions, or give the branch somewhere to go -->
						<SyncControls
							place="action"
							{tracking}
							{ahead}
							{behind}
							{hasCommits}
							{detached}
							{branch}
							{operation}
							{busy}
							{onSync}
							{onPublish}
						/>
					{/if}
				</div>

				<!-- outside the scroller, so what you are about to save stays in sight; while merging, Complete Merge stands here -->
				{#if combining}
					<MergeActions {marked} {busy} onFinish={() => onFinishCombine?.()} onCancel={() => onCancelCombine?.()} />
				{:else if changes.length}
					<div class="border-surface-200-800 shrink-0 space-y-2 border-t px-2 py-2">
						<textarea
							data-scm-message
							class="textarea resize-none text-sm rounded-container"
							rows="2"
							placeholder={commitOn
								? m.vcs_commit_placeholder({ combo: combo('Enter'), branch: commitOn })
								: m.vcs_commit_placeholder_nobranch({ combo: combo('Enter') })}
							bind:value={draft.message}
							onkeydown={onKeydown}></textarea>
						<button
							class="btn btn-xs preset-filled-primary-500 w-full gap-1.5"
							onclick={save}
							disabled={!canSave}
							use:tip={commitOn ? m.vcs_save_version_tip({ branch: commitOn }) : m.vcs_save_version_tip_nobranch()}
						>
							{#if gitRunning.current === 'save'}
								<LoaderCircle class="size-3.5 animate-spin" />
								<span class="cap-center">{m.vcs_running_save()}</span>
							{:else}
								<Check class="size-3.5" />
								<span class="cap-center">{m.vcs_save_version_one()}</span>
							{/if}
						</button>
					</div>
				{/if}
			</div>

			<!-- arrow keys resize when focused: the WAI-ARIA window-splitter pattern (role=separator + tabindex) -->
			<!-- eslint-disable-next-line svelte/valid-compile -->
			<div
				class="hover:bg-primary-wash active:bg-primary-flood relative z-20 -my-[3px] h-1.5 shrink-0 cursor-row-resize bg-transparent transition-colors"
				onmousedown={onStartHistoryResize}
				onkeydown={onResizeHistoryByKey}
				role="separator"
				aria-orientation="horizontal"
				aria-label={m.vcs_resize_history_aria()}
				tabindex="0"
			></div>

			<!-- whole pixels tall, as the explorer's Contents: fractional heights started every row below part-way into a pixel -->
			<div class="border-surface-200-800 flex min-h-0 flex-col border-t" style="flex: 0 1 round({historyFraction * 100}%, 1px)">
				<!-- the explorer's section heading, so the two sidebars name their parts alike -->
				<div class="text-faint shrink-0 px-3 py-1 text-xs font-semibold tracking-wide uppercase">{m.vcs_history_heading()}</div>
				<div class="scroll-inset-r min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] pb-2 pl-1.5">
					<HistoryTimeline
						{history}
						busy={busy || !!operation}
						branch={detached ? null : branch}
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
