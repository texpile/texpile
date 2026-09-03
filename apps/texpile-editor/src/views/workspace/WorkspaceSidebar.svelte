<script lang="ts">
	// The left sidebar: folder header + explorer / source-control / find-in-files, with the file
	// tree and (in explorer) a resizable table-of-contents. Presentational — logic stays in the view.
	import { tip } from '$lib/components/tooltip.svelte';
	import FileTree from '$lib/filetree/FileTree.svelte';
	import GlobalSearch from '$lib/search/GlobalSearch.svelte';
	import SourceControlPanel from '$lib/workspace/SourceControlPanel.svelte';
	import TableOfContents from './TableOfContents.svelte';
	import { workspaceRoot, fileTree, activeFilePath, mainFile } from '$lib/workspace/workspaceStore';
	import {
		isGitRepo,
		gitBranch,
		gitTracking,
		gitAhead,
		gitChanges,
		gitStatusMap,
		gitHistory,
		gitHistoryError,
		gitHistoryHasMore,
		refreshGitHistory,
		showMoreGitHistory
	} from '$lib/workspace/gitStore';
	import { basename, type TreeEntry } from '$lib/workspace/fileSystem';
	import type { FileHistory } from '$lib/workspace/fileHistory.svelte';
	import type { GitStatusEntry, GitLogEntry, GitFileChange } from '$lib/workspace/git';
	import { m } from '$lib/paraglide/messages';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { FilePlus, FolderPlus, RefreshCw, GitBranch, Search, MoreHorizontal } from '@lucide/svelte';

	type Props = {
		width: number;
		guest: boolean;
		modLabel: string;
		view: 'explorer' | 'scm' | 'search';
		scmBusy: boolean;
		showToc: boolean;
		tocFraction: number;
		/** the source control panel's own split: the timeline's share of it */
		historyFraction: number;
		scmSplitEl?: HTMLDivElement;
		viewMode: 'visual' | 'source' | 'diff';
		fileTreeRef?: { newAtRoot: (type: 'file' | 'dir' | 'include', defaultName?: string) => void; isEditing: () => boolean };
		globalSearchRef?: GlobalSearch | null;
		splitEl?: HTMLDivElement;
		onRefreshTree: () => void;
		onOpenGlobalSearch: () => void;
		onCloseGlobalSearch: () => void;
		onOpenFileAt: (file: string, line: number, selectText?: string) => void;
		onOpenEntry: (entry: TreeEntry) => void;
		onCreate: (parentDir: string, name: string, type: 'file' | 'dir' | 'include') => void;
		/** the compile target is Typst: the tree's New Include creates a .typ fragment */
		typstProject?: boolean;
		onRename: (entry: TreeEntry, newName: string) => void;
		onDelete: (entries: TreeEntry[]) => void;
		onMove: (entries: TreeEntry[], targetDir: string) => void;
		onImport: (items: { relPath: string; file: globalThis.File }[], targetDir: string) => void;
		onCopyIn: (paths: string[], targetDir: string) => void;
		onSetMain: (entry: TreeEntry) => void;
		onReveal: (entry: TreeEntry) => void;
		/** the file tree's own undo/redo stack, kept separate from the editor's text history. */
		fileHistory: FileHistory | null;
		onStartTocResize: (e: MouseEvent) => void;
		onResizeTocByKey: (e: KeyboardEvent) => void;
		onStartHistoryResize: (e: MouseEvent) => void;
		onResizeHistoryByKey: (e: KeyboardEvent) => void;
		onRefreshGit: () => void;
		scmInit: () => void;
		scmDiscard: (changes: GitStatusEntry[]) => void;
		scmCommit: (message: string, paths: string[]) => Promise<boolean>;
		scmRestore: (entry: GitLogEntry) => void;
		scmIgnoreArtifacts: () => void;
		scmUpload: () => void;
		scmCompare: (entry: GitLogEntry, path: string) => void;
		scmChangesSince: (hash: string) => Promise<GitFileChange[]>;
		scmOpenDiff: (path: string) => void;
	};
	let {
		width,
		guest,
		modLabel,
		view = $bindable(),
		scmBusy,
		showToc,
		tocFraction,
		historyFraction,
		scmSplitEl = $bindable(),
		viewMode,
		fileTreeRef = $bindable(),
		globalSearchRef = $bindable(),
		splitEl = $bindable(),
		onRefreshTree,
		onOpenGlobalSearch,
		onCloseGlobalSearch,
		onOpenFileAt,
		onOpenEntry,
		onCreate,
		typstProject = false,
		onRename,
		onDelete,
		onMove,
		onImport,
		onCopyIn,
		onSetMain,
		onReveal,
		fileHistory,
		onStartTocResize,
		onResizeTocByKey,
		onStartHistoryResize,
		onResizeHistoryByKey,
		onRefreshGit,
		scmInit,
		scmDiscard,
		scmCommit,
		scmRestore,
		scmIgnoreArtifacts,
		scmUpload,
		scmCompare,
		scmChangesSince,
		scmOpenDiff
	}: Props = $props();

	// The timeline loads when the panel is opened rather than on every tree refresh: status is cheap
	// and runs constantly, `git log` is not and only changes when a version is saved. Commits and
	// restores refresh it themselves, so this covers opening the panel and commits made elsewhere.
	$effect(() => {
		if (view !== 'scm' || !isGitRepo.current) return;
		void refreshGitHistory(workspaceRoot.current);
	});

	// One list, rendered either as a header icon or as a menu row, so the two can never drift apart.
	// `active` is the view-toggle state the icon shows as a tint.
	type SidebarAction = { key: string; icon: typeof FilePlus; label: string; title?: string; active?: boolean; run: () => void };

	/**
	 * The plain actions, in the order they give way to the "..." menu (last one goes first).
	 *
	 * Explorer only, because all three act on the file TREE: fileTreeRef is bound inside the
	 * explorer branch, so in History or Find they were wired to undefined and did nothing at all,
	 * while the tree refresh sat directly above the History panel's own refresh looking like a
	 * duplicate of it. The view toggles below stay put, since those are navigation.
	 */
	const collapsible = $derived<SidebarAction[]>(
		view !== 'explorer'
			? []
			: [
					{ key: 'new-file', icon: FilePlus, label: m.wsview_new_file_title(), run: () => fileTreeRef?.newAtRoot('file') },
					{ key: 'new-folder', icon: FolderPlus, label: m.wsview_new_folder_title(), run: () => fileTreeRef?.newAtRoot('dir') },
					{ key: 'refresh', icon: RefreshCw, label: m.wsview_refresh_tree_title(), run: onRefreshTree }
				]
	);

	// The view toggles hold their place at every width: each one carries state, and a tint inside a
	// closed menu is a state you cannot see. A guest has neither.
	const pinned = $derived<SidebarAction[]>(
		guest
			? []
			: [
					{
						key: 'scm',
						icon: GitBranch,
						label: m.wsview_source_control(),
						active: view === 'scm',
						run: () => (view = view === 'scm' ? 'explorer' : 'scm')
					},
					{
						key: 'search',
						icon: Search,
						label: m.wsview_find_in_files(),
						title: m.wsview_find_in_files_title({ combo: `${modLabel}+Shift+F` }),
						active: view === 'search',
						run: () => (view === 'search' ? (view = 'explorer') : onOpenGlobalSearch())
					}
				]
	);

	/** one btn-icon-xs plus its gap */
	const ACTION_PX = 28;
	/** the name truncates down to this stub before any icon is allowed to collapse */
	const NAME_MIN_PX = 24;

	// px-3 both sides, the gap-2 after the name, and the pinned toggles, which never yield their room
	const collapsibleRoom = $derived(Math.max(0, width - 24 - 8 - NAME_MIN_PX - pinned.length * ACTION_PX));
	/** how many stay as icons; the rest collapse into "...", which costs a slot of its own */
	const inlineCount = $derived(
		collapsible.length * ACTION_PX <= collapsibleRoom
			? collapsible.length
			: Math.max(0, Math.floor((collapsibleRoom - ACTION_PX) / ACTION_PX))
	);
	const inlineActions = $derived(collapsible.slice(0, inlineCount));
	const menuActions = $derived(collapsible.slice(inlineCount));

	let actionsOpen = $state(false);
	function runAction(fn: () => void) {
		actionsOpen = false;
		fn();
	}
</script>

<!-- Escape leaves the Source Control / Find-in-files views and returns to the file tree, the same way
     it dismisses the tree's own context menu. Skipped while a text field has focus, so Escape in the
     commit message or the search box is not a trapdoor out of the panel you are typing into. -->
<svelte:window
	onkeydown={(e) => {
		if (e.key !== 'Escape' || view === 'explorer') return;
		const el = document.activeElement;
		if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement | null)?.isContentEditable) return;
		e.preventDefault();
		if (view === 'search') onCloseGlobalSearch();
		view = 'explorer';
	}}
/>

<!-- no border-r: the splitter beside it draws its own 1px, and a border as well read as two -->
<aside class="bg-surface-50-950 flex shrink-0 flex-col" style="width: {width}px">
	<!-- shrink-0: h-12 sets a height, it does not defend one. A flex child shrinks below its height
	     whenever the column overflows, so any view below that asks for more room than is left takes
	     it out of this row - and a title bar that changes height as you switch views reads as the
	     whole layout twitching. -->
	<div class="border-surface-200-800 flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3">
		<!-- min-w-0: the name is what gives up room as the sidebar narrows, truncating to a stub before
		     any action is allowed to collapse into the menu -->
		<span class="min-w-0 truncate text-sm font-semibold" use:tip={workspaceRoot.current ?? ''}>
			{workspaceRoot.current ? basename(workspaceRoot.current) : m.wsview_no_folder()}
		</span>
		<div class="flex shrink-0 items-center gap-1">
			{#each inlineActions as action (action.key)}
				{@const Icon = action.icon}
				<button
					class="btn-icon btn-icon-xs {action.active ? 'text-primary-ink' : 'hover:preset-tonal'}"
					use:tip={action.title ?? action.label}
					aria-label={action.label}
					onclick={action.run}
				>
					<Icon class="size-4" />
				</button>
			{/each}

			{#if menuActions.length > 0}
				<Popover
					open={actionsOpen}
					onOpenChange={(e) => (actionsOpen = e.open)}
					positioning={{ placement: 'bottom-end', offset: { mainAxis: 2 } }}
					autoFocus={false}
				>
					<Popover.Trigger class="btn-icon btn-icon-xs hover:preset-tonal" aria-label={m.wsview_more_actions()}>
						{#snippet element(attrs)}
							<button {...attrs} use:tip={m.wsview_more_actions()}><MoreHorizontal class="size-4" /></button>
						{/snippet}
					</Popover.Trigger>
					<Portal>
						<Popover.Positioner class="z-floating-ui">
							<Popover.Content class="card bg-surface-50-950 border-surface-300-700 min-w-[200px] border shadow-lg">
								<div class="py-1">
									{#each menuActions as action (action.key)}
										{@const Icon = action.icon}
										<button
											type="button"
											class="hover:preset-tonal flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
											class:preset-tonal-primary={action.active}
											use:tip={action.title ?? action.label}
											onclick={() => runAction(action.run)}
										>
											<Icon class="size-4 shrink-0" />
											{action.label}
										</button>
									{/each}
								</div>
							</Popover.Content>
						</Popover.Positioner>
					</Portal>
				</Popover>
			{/if}

			<!-- after the menu, so the toggles keep the same two slots at the right edge whatever collapses -->
			{#each pinned as action (action.key)}
				{@const Icon = action.icon}
				<button
					class="btn-icon btn-icon-xs {action.active ? 'text-primary-ink' : 'hover:preset-tonal'}"
					use:tip={action.title ?? action.label}
					aria-label={action.label}
					onclick={action.run}
				>
					<Icon class="size-4" />
				</button>
			{/each}
		</div>
	</div>
	{#if view === 'search'}
		<GlobalSearch bind:this={globalSearchRef} root={workspaceRoot.current ?? ''} onOpen={onOpenFileAt} onClose={onCloseGlobalSearch} />
	{:else if view === 'scm'}
		<!-- the panel owns its own scrolling: it is two regions with a splitter between them, each
		     scrolling on its own, and an outer scroller here would fight both -->
		<div class="min-h-0 flex-1">
			<SourceControlPanel
				root={workspaceRoot.current ?? ''}
				isRepo={isGitRepo.current}
				branch={gitBranch.current}
				tracking={gitTracking.current}
				ahead={gitAhead.current}
				changes={gitChanges.current}
				history={gitHistory.current}
				historyError={gitHistoryError.current}
				historyHasMore={gitHistoryHasMore.current}
				onShowMoreHistory={() => void showMoreGitHistory(workspaceRoot.current)}
				busy={scmBusy}
				onInit={scmInit}
				onDiscard={scmDiscard}
				onCommit={scmCommit}
				onRestore={scmRestore}
				onIgnoreArtifacts={scmIgnoreArtifacts}
				onCompare={scmCompare}
				onLoadChanges={scmChangesSince}
				onOpenDiff={scmOpenDiff}
				onRefresh={onRefreshGit}
				onUpload={scmUpload}
				{historyFraction}
				bind:splitEl={scmSplitEl}
				{onStartHistoryResize}
				{onResizeHistoryByKey}
			/>
		</div>
	{:else}
		<div class="flex min-h-0 flex-1 flex-col" bind:this={splitEl}>
			<!-- overflow-x-auto pairs with the tree's min-w-max: long names scroll, they are never trimmed -->
			<div
				class="scroll-inset-r min-h-0 overflow-x-auto overflow-y-auto p-1.5"
				style={showToc ? `flex: ${1 - tocFraction} 1 0%` : 'flex: 1 1 0%'}
			>
				<FileTree
					bind:this={fileTreeRef}
					tree={fileTree.current}
					rootPath={workspaceRoot.current ?? ''}
					activePath={activeFilePath.current}
					mainPath={mainFile.current}
					gitStatus={gitStatusMap.current}
					onOpen={onOpenEntry}
					{onCreate}
					{typstProject}
					{onRename}
					{onDelete}
					{onMove}
					{onImport}
					{onCopyIn}
					onSetMain={guest ? undefined : onSetMain}
					onReveal={guest ? undefined : onReveal}
					history={guest ? null : fileHistory}
				/>
			</div>
			{#if showToc}
				<!-- arrow keys resize when focused: the WAI-ARIA window-splitter pattern (role=separator + tabindex) -->
				<!-- eslint-disable-next-line svelte/valid-compile -->
				<div
					class="hover:bg-primary-500/40 active:bg-primary-500/60 relative z-20 -my-[3px] h-1.5 shrink-0 cursor-row-resize bg-transparent transition-colors"
					onmousedown={onStartTocResize}
					onkeydown={onResizeTocByKey}
					role="separator"
					aria-orientation="horizontal"
					aria-label={m.wsview_resize_toc_aria()}
					tabindex="0"
				></div>
				<!-- scroll-inset-r moves the scrollbar in, not the box: the border-t still reaches the divider -->
				<div class="border-surface-200-800 scroll-inset-r min-h-0 overflow-y-auto border-t p-2" style="flex: {tocFraction} 1 0%">
					<TableOfContents mode={viewMode === 'source' ? 'source' : 'visual'} onOpenFile={onOpenFileAt} />
				</div>
			{/if}
		</div>
	{/if}
</aside>
