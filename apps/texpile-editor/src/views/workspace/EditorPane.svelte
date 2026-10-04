<script lang="ts">
	// The editor column: the mode toolbar on top and, under it, whichever surface the open file
	// needs (starter picker, diff, source, visual, bib, pdf, image). Chooses the surface; the
	// state behind it all lives in WorkspaceView.
	import { fileMode } from '$lib/workspace/fileMode.svelte';
	import { Loader2, CircleAlert, FileWarning, Info } from '@lucide/svelte';
	import TypstMissingBar from '$lib/languages/typst/TypstMissingBar.svelte';
	import EditorNotice from '$lib/components/EditorNotice.svelte';
	import ConflictNotice from './ConflictNotice.svelte';
	import { isTexpileManaged } from '$lib/comments/managed';
	import SearchBar from '$lib/editor/visual/SearchBar.svelte';
	import DiffPane from './diff/DiffPane.svelte';
	import VisualCompareBar from './VisualCompareBar.svelte';
	import VersionHistoryPanel from './history/VersionHistoryPanel.svelte';
	import VersionHistoryButtons from './history/VersionHistoryButtons.svelte';
	import { LOCAL_REF } from '$lib/workspace/localHistory/localHistory.svelte';
	import NewDocumentStart from './NewDocumentStart.svelte';
	import SourceEditor from '$lib/editor/source/SourceEditor.svelte';
	import BibManager from '$lib/editor/visual/bib/BibManager.svelte';
	import PDFViewer from '$lib/preview/PDFViewer.svelte';
	import VisualLoading from '$lib/editor/visual/VisualLoading.svelte';
	import { mark } from '$lib/debug/startupDoctor';
	import { warmEditor } from '$lib/warmup';
	import { basename } from '$lib/workspace/fileSystem';
	import { activeFilePath, isDirty } from '$lib/workspace/workspaceStore';
	import { editorViewStore } from '$lib/stores/editorStore';
	import { restoreVisualPosition } from '$lib/workspace/visualPositions';
	import { noteVisualMount, visualMounted } from '$lib/workspace/visualMountGuard';
	import type { Node as PMNode } from 'prosemirror-model';
	import { openWorkspaceLink } from '$lib/workspace/openWorkspaceLink';
	import TabBar from './TabBar.svelte';
	import EditorToolbarStrip from './EditorToolbarStrip.svelte';
	import VisualEditorHost from './VisualEditorHost.svelte';
	import CommentRail from '$lib/comments/rail/CommentRail.svelte';
	import { attachVisualDiffOutsideComposition } from '$lib/editor/visual/diff/attachVisualDiff';
	import { untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	import type { EditorPaneProps } from './editorPaneProps';

	let {
		loadedPath,
		openTabs,
		activeTabKey,
		compare,
		previewTab,
		onActivateTab,
		onCloseTab,
		onKeepTab,
		onTabMenu,
		kind,
		nameOnly = false,
		viewMode: requestedViewMode,
		session,
		folderEmpty,
		loadError,
		fileDeleted = false,
		encodingIssue = null,
		conflicted = false,
		conflictsLeft = 0,
		conflictStray = false,
		changeBaseline = null,
		onLeaveConflicts,
		binaryWarning = null,
		onOpenAsText,
		applyingStarter,
		texSource,
		sourceMap,
		regionParser = null,
		rawContent,
		visualDoc,
		parseProgress = null,
		onUseSource,
		docMeta,
		allReferences,
		sourceGotoLine,
		sourceScrollAnchor,
		sourceDiagnostics,
		diffOriginal,
		diffModified,
		diffLayout,
		diffLoading,
		diffError,
		diffHasHead,
		diffCompareRef,
		diffVersionDoc,
		diffVersionPreamble,
		diffVersionUnavailable,
		fileUrl,
		onPickStarter,
		onBlankStarter,
		onImportStarter,
		onTexInput,
		onRawInput,
		onVisualChange,
		onVisualSelection,
		onEditFrontmatter,
		onSyncToPdf,
		onHistoryBoundary,
		onJumpToFile,
		onOpenFileAt,
		onJumpToLabel,
		onJumpToDefinition,
		onCaretMove,
		commentRanges = [],
		commentThreads = [],
		selectedComment = null,
		onAddComment,
		onSetViewMode,
		onInsertCitation,
		onCiteByDoi,
		onAddCommentAnchored,
		onCommentsPlaced,
		commentPendingActive = false,
		onSelectComment,
		onToggleDiffLayout,
		onRefreshDiff,
		commentsCtl
	}: EditorPaneProps = $props();

	let scroller = $state<HTMLElement | null>(null);

	// remounts the source editor when the file or the session's view of it changes
	const sourceKey = $derived(`${loadedPath}:${session.active}:${session.manifestRev}`);

	// Building the visual editor's node views is one long synchronous block - seconds on a large
	// paper - and it does NOT happen when <LatexEditorView> mounts. That component's onMount awaits a
	// dynamic import first, so the browser paints (the title appears, the editor area is still
	// empty), and only then does ProseMirror construct and freeze the thread. So mounting is not the
	// signal; LatexEditorView reports the real one through onReady.
	//
	// Keeping the loading bar rendered until then puts it on screen during that import-await paint,
	// and whatever was last painted stays up through the block that follows.
	//
	// Tracked per path rather than as a plain boolean so opening another file resets it for free.
	let readyFor = $state<string | null>(null);
	const editorReady = $derived(!!loadedPath && readyFor === loadedPath);

	/** Rendered for the whole build, but it holds itself invisible until the wait is real (see
	 * lateReveal.ts), so a fast build never flashes a bar. Deliberately not a size threshold: that
	 * would bake in an assumption about how fast the machine is, and suppress the bar on a slow CPU
	 * exactly where the wait is worst. */
	const showRenderBar = $derived(!editorReady);

	/** kinds that have a visual (ProseMirror) surface */
	const structured = $derived(kind === 'tex' || kind === 'md' || kind === 'typ');

	const viewMode = $derived(requestedViewMode === 'visual' && (encodingIssue || conflicted) ? 'source' : requestedViewMode);

	/** kinds edited as raw text, which is every text file that is not one of those */
	const rawText = $derived(kind === 'text' || (kind === 'bib' && (viewMode === 'source' || session.isGuest)));

	/** a .bib's own view draws none of these, so it says they are there instead */
	const bibSuggested = $derived(commentThreads.filter((t) => !t.resolved && t.restore !== undefined).length);

	/** independent of viewMode, which says whether the diff is rendered or in source */
	const comparing = $derived(!!compare);

	/** the file and copy Version History shows: the tab's own file, set with its comparison, not loadedPath, which follows a
	 *  beat later; with that the copy was looked for among the last file's copies, taken as deleted, and the tab left */
	const history = $derived(
		compare?.hash.startsWith(LOCAL_REF) && activeFilePath.current ? { path: activeFilePath.current, hash: compare.hash } : null
	);

	/** the working side IS the file, so it takes the editor's own handler - split the same way
	 *  DiffMode's getWorkingText splits it */
	const onDiffInput = $derived(structured ? onTexInput : onRawInput);

	/** md link tooltip Open: real schemes go to the browser, in-doc anchors are swallowed (no
	 * anchor targets yet), anything path-like opens in the workspace. */
	function onMdLink(href: string): boolean {
		return openWorkspaceLink(href, onJumpToFile);
	}
	/** the visual editor is wanted, whether or not it has been built yet */
	const visualPending = $derived(loadedPath && structured && viewMode === 'visual');

	/** unmarked otherwise reads as a version nothing has changed since */
	const versionParsing = $derived(comparing && viewMode === 'visual' && structured && !diffVersionDoc && !diffVersionUnavailable);

	/**
	 * UNTRACKED, and this matters: the apply dispatches into the editor, whose plugins write the
	 * runes this effect reads, so a tracked apply spins until Svelte's depth guard trips.
	 *
	 * Gated on composing: redrawing decorations under a live IME composition kills it - invisibly
	 * on Windows, visibly on macOS - and retrying beats dropping the attach.
	 */
	$effect(() => {
		const view = editorViewStore.current;
		const wanted = comparing && viewMode === 'visual' && structured && diffVersionDoc ? { oldDoc: diffVersionDoc } : null;
		if (view) return untrack(() => attachVisualDiffOutsideComposition(view, wanted));
	});

	// noted before a file's first build, forgotten in onVisualReady: a build that takes the renderer
	// down leaves the note behind, and the next open of that file goes to Source (visualMountGuard).
	// Keyed on the doc, not the path: the path switches a beat before the new doc arrives, and the
	// old doc under the new path is not a build
	let notedDoc: PMNode | null = null;
	$effect.pre(() => {
		if (!visualDoc || !loadedPath || !structured || viewMode !== 'visual' || readyFor === loadedPath || visualDoc === notedDoc) return;
		notedDoc = visualDoc;
		noteVisualMount(loadedPath);
	});

	/** a callback, not an effect: it dispatches a selection an effect would re-enter on */
	function onVisualReady(): void {
		mark('editor-ready');
		warmEditor();
		readyFor = loadedPath;
		if (loadedPath) visualMounted(loadedPath);
		const v = editorViewStore.current;
		if (!v || !loadedPath || session.collabFor(loadedPath)) return;
		restoreVisualPosition(v, loadedPath, texSource, sourceMap);
	}

	// a shared file steps only through its own history: the workspace one swaps in a whole local snapshot, which would
	// write over everyone else's edits. still consumed, so the browser's own undo never runs
	function stepHistoryUnlessShared(dir: 'undo' | 'redo'): boolean {
		return session.collabFor(loadedPath) ? true : onHistoryBoundary(dir);
	}
</script>

<div class="flex min-h-0 min-w-0 flex-col" style="grid-column: 1; grid-row: 2">
	{#if !fileMode.current}
		<TabBar
			tabs={openTabs}
			activeKey={activeTabKey}
			dirty={isDirty.current && !session.isGuest}
			previewKey={previewTab}
			onActivate={onActivateTab}
			onClose={onCloseTab}
			onKeep={onKeepTab}
			onContextMenu={onTabMenu}
		/>
	{/if}
	{#if loadedPath && structured && !comparing && (viewMode === 'source' || visualDoc)}
		<EditorToolbarStrip {kind} mode={viewMode === 'visual' ? 'visual' : 'source'} />
	{/if}
	<!-- not in diff mode: DiffPane carries its own, and both rendered gave two stacked banners -->
	{#if loadedPath && !comparing && isTexpileManaged(loadedPath)}
		<!-- Above the editor, not in it: .texpile is hidden from the tree, so anyone who has this
		     open reached it deliberately from Source Control and deserves the warning before they
		     touch it. One short line everywhere a managed file appears - the same sentence as the
		     SCM badge tooltip and the diff bar, so the notice reads as one voice. -->
		<EditorNotice icon={Info} tone="info" title="{m.vcs_texpile_managed()}." note={m.texpile_managed_note()} />
	{/if}
	{#if loadedPath && encodingIssue}
		<EditorNotice icon={CircleAlert} tone="warning" title="{m.wsview_read_only()}." note={encodingIssue} />
	{/if}
	<!-- a guest's Typst runs on the host's tinymist, and a lone file runs none: no language server, no compile -->
	{#if loadedPath && kind === 'typ' && !session.isGuest && !fileMode.current && !comparing}
		<TypstMissingBar />
	{/if}
	{#if loadedPath && conflicted && !comparing}
		<ConflictNotice left={conflictsLeft} stray={conflictStray} onLeave={structured ? onLeaveConflicts : undefined} />
	{/if}
	<!-- the buffer is now the only copy, so it stays on screen; what a save will do is spelled out
	     because it recreates the old name rather than following the rename -->
	{#if loadedPath && fileDeleted && !comparing}
		<EditorNotice icon={CircleAlert} tone="warning" title="{m.wsview_file_deleted_title()}." note={m.wsview_file_deleted_note()} />
	{/if}
	{#snippet historyButtons()}
		{#if history}<VersionHistoryButtons path={history.path} hash={history.hash} />{/if}
	{/snippet}
	<div class="flex min-h-0 min-w-0 flex-1">
		<div class="flex min-h-0 min-w-0 flex-1 flex-col">
			{#if loadedPath && comparing && viewMode === 'visual' && structured}
				<VisualCompareBar
					{compare}
					{fileDeleted}
					{versionParsing}
					versionUnavailable={diffVersionUnavailable}
					sourceOnly={diffVersionPreamble !== null && !!docMeta && diffVersionPreamble !== docMeta.preamble}
					onRefresh={onRefreshDiff}
					actions={historyButtons}
				/>
			{/if}
			<!-- relative anchors the floating find bar; it sits outside the scroller so it doesn't scroll away -->
			<div class="relative min-h-0 min-w-0 flex-1">
				{#if loadedPath && structured && viewMode === 'visual' && visualDoc && !comparing}
					<SearchBar />
				{/if}
				<!-- scroll-inset-r keeps this scrollbar clear of the lozenge on the preview divider. NOT in diff
		     mode or for a .pdf: those are panes, not documents - each fills the height, scrolls inside
		     itself and draws its own full-width bar, so the 3px showed up as a gap between that bar
		     and the divider. Each wears the inset on its own scroller instead. -->
				<div
					bind:this={scroller}
					class="group/pane h-full w-full overflow-auto {structured && viewMode === 'visual' && !comparing
						? '[scrollbar-gutter:stable]'
						: ''} {comparing || kind === 'pdf' ? '' : 'scroll-inset-r'}"
				>
					{#if folderEmpty && !activeFilePath.current}
						<NewDocumentStart onPick={onPickStarter} onBlank={onBlankStarter} onImport={onImportStarter} busy={applyingStarter} />
					{:else if loadError}
						<div class="text-error-ink mx-auto mt-12 flex max-w-md flex-col items-center gap-2 text-center">
							<CircleAlert class="size-8" />
							<p class="text-sm">{loadError}</p>
						</div>
					{:else if binaryWarning}
						<div class="text-muted mx-auto mt-12 flex max-w-md flex-col items-center gap-3 text-center">
							<FileWarning class="size-8" />
							<p class="text-sm">{m.wsview_binary_warning_body()}</p>
							<button type="button" class="btn btn-sm preset-tonal" onclick={() => onOpenAsText?.(binaryWarning.path)}>
								{m.wsview_binary_open_anyway()}
							</button>
						</div>
					{:else if loadedPath && nameOnly}
						<div class="text-muted mt-12 text-center text-sm">
							{m.wsview_shared_name_only({ name: basename(loadedPath) })}
						</div>
					{:else if loadedPath && comparing && (viewMode === 'source' || !structured) && (structured || kind === 'bib' || kind === 'text')}
						<DiffPane
							filename={loadedPath}
							original={diffOriginal}
							modified={diffModified}
							layout={diffLayout}
							loading={diffLoading}
							error={diffError}
							hasHead={diffHasHead}
							compareRef={diffCompareRef}
							{fileDeleted}
							readOnly={!!session.collabFor(loadedPath) || fileDeleted}
							onModifiedInput={onDiffInput}
							onToggleLayout={onToggleDiffLayout}
							onRefresh={onRefreshDiff}
							actions={historyButtons}
						/>
					{:else if loadedPath && structured && viewMode === 'source'}
						<div class="flex h-full">
							<div class="isolate h-full min-w-0 flex-1">
								{#key sourceKey}
									<SourceEditor
										docPath={loadedPath}
										value={texSource}
										{changeBaseline}
										onInput={onTexInput}
										readOnly={!!encodingIssue}
										gotoLine={sourceGotoLine}
										{onSyncToPdf}
										initialScrollPos={sourceScrollAnchor}
										onHistoryBoundary={stepHistoryUnlessShared}
										diagnostics={kind === 'typ' ? undefined : sourceDiagnostics}
										{onJumpToFile}
										{onOpenFileAt}
										{onCaretMove}
										collab={session.collabFor(loadedPath)}
										{commentRanges}
										{selectedComment}
										{onAddComment}
										{onInsertCitation}
										{onCiteByDoi}
										{onSelectComment}
									/>
								{/key}
							</div>
							{#if commentsCtl}
								<CommentRail ctl={commentsCtl} threads={commentThreads} mode="source" onSelect={(id) => onSelectComment?.(id)} />
							{/if}
						</div>
					{:else if loadedPath && structured && visualDoc}
						<div class="flex min-h-full items-stretch">
							<div class="isolate min-w-0 flex-1">
								<!-- deliberately NOT keyed on the file: it takes the next document via docSwap -->
								<VisualEditorHost
									{kind}
									{loadedPath}
									{visualDoc}
									{docMeta}
									{texSource}
									{allReferences}
									{showRenderBar}
									{onVisualChange}
									{onVisualSelection}
									onHistoryBoundary={stepHistoryUnlessShared}
									{onVisualReady}
									{onMdLink}
									{onEditFrontmatter}
									{commentRanges}
									{sourceMap}
									{regionParser}
									{selectedComment}
									{onSelectComment}
									{onAddCommentAnchored}
									{onInsertCitation}
									{onCiteByDoi}
									{onJumpToLabel}
									{onJumpToDefinition}
									{onCommentsPlaced}
									{commentPendingActive}
								/>
							</div>
							{#if commentsCtl}
								<CommentRail ctl={commentsCtl} threads={commentThreads} mode="visual" {scroller} onSelect={(id) => onSelectComment?.(id)} />
							{/if}
						</div>
					{:else if visualPending}
						<!-- doc not here yet: the parse runs in a worker and fills this in when it lands -->
						<VisualLoading phase={parseProgress} format={kind} sizeBytes={texSource.length} {onUseSource} />
					{:else if loadedPath && rawText}
						<!-- .typ no longer lands here: it is structured now (typSchema), so its source mode
				     is the texSource branch above, which carries onCaretMove/onSyncToPdf for the
				     Typst preview's follow and "Show in preview" -->
						<!-- guests always co-edit .bib through the Y-bound source editor; BibManager isn't
				     CRDT-bound and would desync or clobber remote edits -->
						<!-- the rail and the comment props are what make suggest mode real here: without them an
				     edit in suggesting mode still stages a suggestion, drawn nowhere -->
						<div class="flex h-full">
							<div class="isolate h-full min-w-0 flex-1">
								{#key sourceKey}
									<SourceEditor
										docPath={loadedPath}
										value={rawContent}
										{changeBaseline}
										onInput={onRawInput}
										readOnly={!!encodingIssue}
										filename={loadedPath}
										gotoLine={sourceGotoLine}
										collab={session.collabFor(loadedPath)}
										{commentRanges}
										{selectedComment}
										{onAddComment}
										{onSelectComment}
									/>
								{/key}
							</div>
							{#if commentsCtl}
								<CommentRail ctl={commentsCtl} threads={commentThreads} mode="source" onSelect={(id) => onSelectComment?.(id)} />
							{/if}
						</div>
					{:else if loadedPath && kind === 'bib'}
						{#key loadedPath}
							<BibManager value={rawContent} onInput={onRawInput} suggested={bibSuggested} onShowSource={() => onSetViewMode?.('source')} />
						{/key}
					{:else if loadedPath && kind === 'pdf'}
						<!-- a .pdf opened directly: its own src, independent of the compile-output pane -->
						<div class="h-full w-full">
							<PDFViewer src={fileUrl(loadedPath)} filename={basename(loadedPath)} placement="file" />
						</div>
					{:else if loadedPath && kind === 'image'}
						<div class="flex h-full items-center justify-center p-8">
							<img src={fileUrl(loadedPath)} alt={basename(loadedPath)} class="max-h-full max-w-full object-contain" />
						</div>
					{:else if loadedPath && kind === 'binary'}
						<div class="text-muted mt-12 text-center text-sm">
							{m.wsview_binary_file_note({ name: basename(loadedPath) })}
						</div>
					{:else if activeFilePath.current}
						<!-- shown while the visual parse runs; fades in late so a fast parse never strobes a spinner -->
						<div class="text-muted reveal-late mt-12 flex items-center justify-center gap-2 text-sm">
							<Loader2 class="size-4 animate-spin" />
							{m.wsview_opening()}
						</div>
					{:else}
						<div class="text-muted mt-12 text-center text-sm">{m.wsview_select_file_prompt()}</div>
					{/if}
				</div>
			</div>
		</div>
		{#if history}
			<VersionHistoryPanel path={history.path} hash={history.hash} />
		{/if}
	</div>
</div>
