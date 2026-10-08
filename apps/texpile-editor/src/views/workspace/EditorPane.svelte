<script lang="ts">
	// The editor column: the mode toolbar on top and, under it, whichever surface the open file
	// needs (starter picker, diff, source, visual, bib, pdf, image). Chooses the surface; the
	// state behind it all lives in WorkspaceView.
	import { fileMode } from '$lib/workspace/fileMode.svelte';
	import { Loader2 } from '@lucide/svelte';
	import EditorNotices from './EditorNotices.svelte';
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
	import { visualMountNote } from '$lib/workspace/visualMountNote.svelte';
	import { openWorkspaceLink } from '$lib/workspace/openWorkspaceLink';
	import EditorPaneHead from './pane/EditorPaneHead.svelte';
	import FloatingFormatBar from './pane/FloatingFormatBar.svelte';
	import { heldVisualDoc } from './pane/heldVisualDoc.svelte';
	import UnreadableFileNote from './pane/UnreadableFileNote.svelte';
	import { slotDrag } from '$lib/workspace/groups/slotDrag.svelte';
	import { formatToolbarOf } from './pane/formatToolbar';
	import VisualEditorHost from './VisualEditorHost.svelte';
	import CommentRail from '$lib/comments/rail/CommentRail.svelte';
	import { attachVisualDiffOutsideComposition } from '$lib/editor/visual/diff/attachVisualDiff';
	import { untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { sourceEditorKey } from './pane/sourceEditorKey';
	import type { EditorPaneProps } from './editorPaneProps';

	let {
		parked = false,
		single = false,
		onCountWords,
		onPickMain,
		emptyNote,
		groupId,
		onDropTab,
		onDropFiles,
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
	const sourceKey = $derived(sourceEditorKey(session, loadedPath));

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

	/** the visual editor is wanted, whether or not it has been built yet */
	const visualPending = $derived(loadedPath && structured && viewMode === 'visual');
	const held = heldVisualDoc(() => ({ loadedPath, visualDoc, docMeta, texSource, sourceMap, pending: !!visualPending }));
	const shownDoc = $derived(held.current?.visualDoc ?? null);
	const formatBar = $derived(
		formatToolbarOf({ loadedPath, kind, viewMode: requestedViewMode, encodingIssue, conflicted, compare, visualDoc: shownDoc })
	);

	/** the file and copy Version History shows: the tab's own file, set with its comparison, not loadedPath, which follows a
	 *  beat later; with that the copy was looked for among the last file's copies, taken as deleted, and the tab left */
	const history = $derived(
		compare?.hash.startsWith(LOCAL_REF) && activeFilePath.current ? { path: activeFilePath.current, hash: compare.hash } : null
	);

	/** the working side IS the file, so it takes the editor's own handler - split the same way
	 *  DiffMode's getWorkingText splits it */
	const onDiffInput = $derived(structured ? onTexInput : onRawInput);

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
		const view = parked ? null : editorViewStore.current;
		const wanted = comparing && viewMode === 'visual' && structured && diffVersionDoc ? { oldDoc: diffVersionDoc } : null;
		if (view) return untrack(() => attachVisualDiffOutsideComposition(view, wanted));
	});

	// a build that takes the renderer down leaves its note, and that file next opens in Source (visualMountGuard)
	const mountNote = visualMountNote({
		doc: () => visualDoc ?? null,
		path: () => loadedPath,
		building: () => structured && viewMode === 'visual' && readyFor !== loadedPath
	});
	// a parked group's editor already shows its file; going live on it builds nothing, so nothing is noted
	$effect.pre(() => {
		if (parked && loadedPath) readyFor = loadedPath;
	});

	/** a callback, not an effect: it dispatches a selection an effect would re-enter on */
	function onVisualReady(): void {
		mark('editor-ready');
		warmEditor();
		readyFor = loadedPath;
		mountNote.ready(loadedPath);
		// a parked group's editor is not the store's, and it keeps where it was
		if (parked) return;
		const v = editorViewStore.current;
		if (!v || !loadedPath || session.active) return;
		restoreVisualPosition(v, loadedPath, texSource, sourceMap);
	}
</script>

<div class="flex min-h-0 min-w-0 flex-1 flex-col" class:floating-bar-room={!!formatBar}>
	<EditorPaneHead
		strip={fileMode.current || single
			? null
			: {
					tabs: openTabs,
					activeKey: activeTabKey,
					dirty: isDirty.current && !session.isGuest && !parked,
					previewKey: previewTab,
					onActivate: onActivateTab,
					onClose: onCloseTab,
					onKeep: onKeepTab,
					onContextMenu: onTabMenu,
					groupFocused: !parked,
					groupId,
					onDropTab,
					onDropFiles
				}}
		controls={{ loadedPath, kind, viewMode, encodingIssue, conflicted, guest: session.isGuest, parked, groupId, onSetViewMode }}
	/>
	<EditorNotices
		{loadedPath}
		{comparing}
		{encodingIssue}
		{kind}
		guest={session.isGuest}
		{conflicted}
		{conflictsLeft}
		{conflictStray}
		onLeaveConflicts={structured ? onLeaveConflicts : undefined}
		{fileDeleted}
	/>
	{#snippet historyButtons()}
		{#if history}<VersionHistoryButtons path={history.path} hash={history.hash} />{/if}
	{/snippet}
	<div class="relative flex min-h-0 min-w-0 flex-1">
		{#if formatBar}
			<FloatingFormatBar {formatBar} {onCountWords} {onPickMain} shown={!parked} />
		{/if}
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
				{#if loadedPath && structured && viewMode === 'visual' && visualDoc && !comparing && !parked}
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
					{#if folderEmpty && !activeFilePath.current && !parked}
						<NewDocumentStart onPick={onPickStarter} onBlank={onBlankStarter} onImport={onImportStarter} busy={applyingStarter} />
					{:else if loadError || binaryWarning}
						<UnreadableFileNote {loadError} {binaryWarning} {onOpenAsText} />
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
							readOnly={session.active || fileDeleted || parked}
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
										live={!parked}
									/>
								{/key}
							</div>
							{#if commentsCtl}
								<CommentRail ctl={commentsCtl} threads={commentThreads} mode="source" {scroller} onSelect={(id) => onSelectComment?.(id)} />
							{/if}
						</div>
					{:else if structured && held.current}
						<div class="flex min-h-full items-stretch">
							<div class="isolate min-w-0 flex-1">
								<!-- deliberately NOT keyed on the file: it takes the next document via docSwap -->
								<VisualEditorHost
									{kind}
									{...held.current}
									commentRanges={held.own ? commentRanges : []}
									live={held.own && !parked}
									{allReferences}
									{showRenderBar}
									{onVisualChange}
									{onVisualSelection}
									{onVisualReady}
									onMdLink={(href: string) => openWorkspaceLink(href, onJumpToFile)}
									{onEditFrontmatter}
									{regionParser}
									{selectedComment}
									{onSelectComment}
									{onAddCommentAnchored}
									{onInsertCitation}
									{onCiteByDoi}
									{onSyncToPdf}
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
										live={!parked}
									/>
								{/key}
							</div>
							{#if commentsCtl}
								<CommentRail ctl={commentsCtl} threads={commentThreads} mode="source" {scroller} onSelect={(id) => onSelectComment?.(id)} />
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
					{:else if activeFilePath.current && !parked}
						<!-- shown while the visual parse runs; fades in late so a fast parse never strobes a spinner -->
						<div class="text-muted reveal-late mt-12 flex items-center justify-center gap-2 text-sm">
							<Loader2 class="size-4 animate-spin" />
							{m.wsview_opening()}
						</div>
					{:else}
						<div class="text-muted mt-12 text-center text-sm">{emptyNote ?? m.wsview_select_file_prompt()}</div>
					{/if}
				</div>
				{#if slotDrag.current && groupId !== undefined}
					<!-- VS Code's drop overlay: a dragged tab is the group's to take, so the editor under it draws no drop cursor and takes no drop -->
					<div class="absolute inset-0 z-50"></div>
				{/if}
			</div>
		</div>
		{#if history && !parked}
			<VersionHistoryPanel path={history.path} hash={history.hash} />
		{/if}
	</div>
</div>
