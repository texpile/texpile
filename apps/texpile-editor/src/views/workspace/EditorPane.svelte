<script lang="ts">
	// The editor column: the mode toolbar on top and, under it, whichever surface the open file
	// needs (starter picker, diff, source, visual, bib, pdf, image). Chooses the surface; the
	// state behind it all lives in WorkspaceView.
	import { Loader2, CircleAlert, Info, GitCompare, RefreshCw, X } from '@lucide/svelte';
	import { isTexpileManaged } from '$lib/comments/managed';
	import SearchBar from '$lib/editor/visual/SearchBar.svelte';
	import StarterPicker from '$lib/workspace/StarterPicker.svelte';
	import DiffPane from './DiffPane.svelte';
	import SourceEditor from '$lib/editor/source/SourceEditor.svelte';
	import BibManager from '$lib/editor/visual/bib/BibManager.svelte';
	import PDFViewer from '$lib/preview/PDFViewer.svelte';
	import VisualLoading from '$lib/editor/visual/VisualLoading.svelte';
	import { basename } from '$lib/workspace/fileSystem';
	import { activeFilePath, isDirty } from '$lib/workspace/workspaceStore';
	import { editorViewStore } from '$lib/stores/editorStore';
	import { restoreVisualPosition } from '$lib/workspace/visualPositions';
	import { openWorkspaceLink } from '$lib/workspace/openWorkspaceLink';
	import { stripFor } from '$lib/languages/markdown/visual/sourceMap';
	import { bodyOffsetOf } from '$lib/workspace/latexRoundtrip';
	import TabBar from './TabBar.svelte';
	import EditorToolbarStrip from './EditorToolbarStrip.svelte';
	import VisualEditorHost from './VisualEditorHost.svelte';
	import { attachVisualDiff } from '$lib/editor/visual/diff/attachVisualDiff';
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
		kind,
		nameOnly = false,
		viewMode,
		session,
		folderEmpty,
		loadError,
		fileDeleted = false,
		applyingStarter,
		texSource,
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
		onCaretMove,
		commentRanges = [],
		commentThreads = [],
		selectedComment = null,
		onAddComment,
		onInsertCitation,
		onInsertLibraryCitation,
		onAddCommentAnchored,
		onCommentsPlaced,
		commentPendingActive = false,
		onSelectComment,
		onToggleDiffLayout,
		onRefreshDiff,
		onExitDiff
	}: EditorPaneProps = $props();

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

	/** which starter tab is open, so the blurb above the grid names the extension it is offering.
	 *  Deliberately not persisted - it is a view of the templates, not a setting. */
	let starterLang = $state<'latex' | 'typst'>('latex');

	/** Rendered for the whole build, but it holds itself invisible for the first 300 ms through a CSS
	 * animation delay (see VisualLoading), so a fast build never flashes a bar. Deliberately not a
	 * size threshold: that would bake in an assumption about how fast the machine is, and suppress
	 * the bar on a slow CPU exactly where the wait is worst. */
	const showRenderBar = $derived(!editorReady);

	/** kinds that have a visual (ProseMirror) surface */
	const structured = $derived(kind === 'tex' || kind === 'md' || kind === 'typ');

	/** independent of viewMode, which says whether the diff is rendered or in source */
	const comparing = $derived(!!compare);

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
		if (!view) return;
		const apply = () => untrack(() => attachVisualDiff(view, wanted));
		if (!view.composing) {
			apply();
			return;
		}
		view.dom.addEventListener('compositionend', apply, { once: true });
		return () => view.dom.removeEventListener('compositionend', apply);
	});

	/** ProseMirror is built: put the caret back where this file was left. A one-shot callback rather
	 *  than an effect, so it cannot re-enter - the editor is built exactly once per file. */
	function onVisualReady(): void {
		readyFor = loadedPath;
		const v = editorViewStore.current;
		if (!v || !loadedPath || session.collabFor(loadedPath)) return;
		restoreVisualPosition(v, loadedPath, texSource, docMeta ? bodyOffsetOf(docMeta) : 0, stripFor(kind));
	}
</script>

<div class="flex min-h-0 min-w-0 flex-col" style="grid-column: 1; grid-row: 2">
	<TabBar
		tabs={openTabs}
		activeKey={activeTabKey}
		dirty={isDirty.current && !session.isGuest}
		previewKey={previewTab}
		onActivate={onActivateTab}
		onClose={onCloseTab}
		onKeep={onKeepTab}
	/>
	{#if loadedPath && structured && !comparing && (viewMode === 'source' || visualDoc)}
		<EditorToolbarStrip {kind} mode={viewMode === 'visual' ? 'visual' : 'source'} />
	{/if}
	<!-- not in diff mode: DiffPane carries its own, and both rendered gave two stacked banners -->
	{#if loadedPath && !comparing && isTexpileManaged(loadedPath)}
		<!-- Above the editor, not in it: .texpile is hidden from the tree, so anyone who has this
		     open reached it deliberately from Source Control and deserves the warning before they
		     touch it. One short line everywhere a managed file appears - the same sentence as the
		     SCM badge tooltip and the diff bar, so the notice reads as one voice. -->
		<!-- 40px is the app's bar height - the PDF, editor and draft toolbars are all min-h-10, border
		     included - so this reads as another piece of chrome rather than prose shoving the document
		     down. -->
		<div
			class="border-surface-200-800 bg-surface-100-900 text-surface-600-300 flex min-h-10 shrink-0 items-center gap-2 border-b px-3 text-xs"
			title={m.texpile_managed_note()}
		>
			<Info class="text-primary-500 size-3.5 shrink-0" />
			<p class="min-w-0 truncate"><span class="font-medium">{m.vcs_texpile_managed()}.</span> {m.texpile_managed_note()}</p>
		</div>
	{/if}
	{#if loadedPath && comparing && viewMode === 'visual' && structured}
		<div
			class="bg-surface-100-900 text-surface-600-300 border-surface-200-800 flex min-h-10 shrink-0 items-center gap-2 border-b px-3 text-xs"
		>
			<GitCompare class="size-3.5 shrink-0" />
			<span class="font-medium">{m.wsview_diff_heading()}</span>
			{#if compare}<span class="text-surface-500 min-w-0 truncate" title={compare.hash}>· {compare.subject}</span>{/if}
			<!-- What it cannot show, said out loud: an unmarked document otherwise reads as "nothing
			     changed". No count - the number would be of source runs, which nothing on screen shows. -->
			{#if fileDeleted}
				<span class="text-surface-500 min-w-0 truncate">· {m.wsview_diff_file_deleted()}</span>
			{:else if versionParsing}
				<!-- the same "nothing below 300ms" rule the editor's own loading bar follows, done with
				     an animation delay so a parse that lands quickly never flashes anything -->
				<span class="text-surface-500 note-late min-w-0 truncate">· {m.wsview_diff_finding_changes()}</span>
			{:else if diffVersionUnavailable}
				<span class="text-surface-500 min-w-0 truncate">· {m.wsview_diff_version_unparsed()}</span>
			{:else if diffVersionPreamble !== null && docMeta && diffVersionPreamble !== docMeta.preamble}
				<span class="text-surface-500 min-w-0 truncate">· {m.wsview_diff_source_only()}</span>
			{/if}
			<div class="ml-auto flex shrink-0 items-center gap-1">
				<button
					class="hover:preset-tonal rounded p-0.5"
					onclick={onRefreshDiff}
					title={m.wsview_refresh_diff()}
					aria-label={m.wsview_refresh_diff()}
				>
					<RefreshCw class="size-3.5" />
				</button>
				<button
					class="hover:preset-tonal-primary rounded p-0.5"
					onclick={onExitDiff}
					title={m.wsview_back_to_editor_title()}
					aria-label={m.wsview_close_label()}
				>
					<X class="size-3.5" />
				</button>
			</div>
		</div>
	{/if}
	<!-- relative anchors the floating find bar; it sits outside the scroller so it doesn't scroll away -->
	<div class="relative min-h-0 min-w-0 flex-1">
		{#if loadedPath && structured && viewMode === 'visual' && visualDoc && !comparing}
			<SearchBar />
		{/if}
		<!-- scroll-inset-r keeps this scrollbar clear of the lozenge on the preview divider. NOT in diff
		     mode: DiffPane is a pane, not a document - it fills the height, scrolls inside itself and
		     draws its own full-width bars, so the 3px showed up as a gap between every one of those
		     bars and the divider. It wears the inset on its own scroller instead. -->
		<div class="h-full w-full overflow-auto {comparing ? '' : 'scroll-inset-r'}">
			{#if folderEmpty && !activeFilePath.current}
				<div class="mx-auto mt-16 max-w-xl px-6">
					<div class="text-center">
						<h2 class="text-lg font-semibold">{m.wsview_start_new_doc_heading()}</h2>
						<p class="text-surface-500 mt-1 text-sm">
							<!-- follows the open tab: telling someone reading the Typst templates that this folder
							     has no .tex files in it is true and useless -->
							{m.wsview_start_new_doc_desc_pre()} <code>{starterLang === 'typst' ? '.typ' : '.tex'}</code>
							{m.wsview_start_new_doc_desc_post()}
						</p>
					</div>
					<div class="mt-6">
						<StarterPicker
							onPick={onPickStarter}
							onBlank={onBlankStarter}
							onImport={onImportStarter}
							busy={applyingStarter}
							bind:lang={starterLang}
						/>
					</div>
				</div>
			{:else if loadError}
				<div class="text-error-600 mx-auto mt-12 flex max-w-md flex-col items-center gap-2 text-center">
					<CircleAlert class="size-8" />
					<p class="text-sm">{loadError}</p>
				</div>
			{:else if loadedPath && nameOnly}
				<div class="text-surface-500 mt-12 text-center text-sm">
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
					onExit={onExitDiff}
				/>
			{:else if loadedPath && structured && viewMode === 'source'}
				{#key sourceKey}
					<SourceEditor
						docPath={loadedPath}
						value={texSource}
						onInput={onTexInput}
						gotoLine={sourceGotoLine}
						{onSyncToPdf}
						initialScrollPos={sourceScrollAnchor}
						{onHistoryBoundary}
						diagnostics={kind === 'typ' ? undefined : sourceDiagnostics}
						{onJumpToFile}
						{onOpenFileAt}
						{onCaretMove}
						collab={session.collabFor(loadedPath)}
						{commentRanges}
						{selectedComment}
						{onAddComment}
						{onInsertCitation}
						{onInsertLibraryCitation}
						{onSelectComment}
					/>
				{/key}
			{:else if loadedPath && structured && visualDoc}
				{#key loadedPath}
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
						{onHistoryBoundary}
						{onVisualReady}
						{onMdLink}
						{onEditFrontmatter}
						{commentThreads}
						{selectedComment}
						{onSelectComment}
						{onAddCommentAnchored}
						{onInsertCitation}
						{onInsertLibraryCitation}
						{onCommentsPlaced}
						{commentPendingActive}
					/>
				{/key}
			{:else if visualPending}
				<!-- doc not here yet: the parse runs in a worker and fills this in when it lands -->
				<VisualLoading phase={parseProgress} sizeBytes={texSource.length} {onUseSource} />
			{:else if loadedPath && kind === 'bib' && (viewMode === 'source' || session.isGuest)}
				<!-- guests always co-edit .bib through the Y-bound source editor; BibManager isn't
				     CRDT-bound and would desync or clobber remote edits -->
				{#key sourceKey}
					<SourceEditor
						docPath={loadedPath}
						value={rawContent}
						onInput={onRawInput}
						filename={loadedPath}
						gotoLine={sourceGotoLine}
						collab={session.collabFor(loadedPath)}
					/>
				{/key}
			{:else if loadedPath && kind === 'bib'}
				{#key loadedPath}
					<BibManager value={rawContent} onInput={onRawInput} />
				{/key}
			{:else if loadedPath && kind === 'text'}
				<!-- .typ no longer lands here: it is structured now (typSchema), so its source mode
				     is the texSource branch above, which carries onCaretMove/onSyncToPdf for the
				     Typst preview's follow and "Show in preview" -->
				{#key sourceKey}
					<SourceEditor
						docPath={loadedPath}
						value={rawContent}
						onInput={onRawInput}
						filename={loadedPath}
						gotoLine={sourceGotoLine}
						collab={session.collabFor(loadedPath)}
					/>
				{/key}
			{:else if loadedPath && kind === 'pdf'}
				<!-- a .pdf opened directly: its own src, independent of the compile-output pane -->
				<div class="h-full w-full">
					<PDFViewer src={fileUrl(loadedPath)} filename={basename(loadedPath)} />
				</div>
			{:else if loadedPath && kind === 'image'}
				<div class="flex h-full items-center justify-center p-8">
					<img src={fileUrl(loadedPath)} alt={basename(loadedPath)} class="max-h-full max-w-full object-contain" />
				</div>
			{:else if loadedPath && kind === 'binary'}
				<div class="text-surface-500 mt-12 text-center text-sm">
					{m.wsview_binary_file_note({ name: basename(loadedPath) })}
				</div>
			{:else if activeFilePath.current}
				<!-- shown while the visual parse runs; fades in late so a fast parse never strobes a spinner -->
				<div class="text-surface-500 spinner-late mt-12 flex items-center justify-center gap-2 text-sm">
					<Loader2 class="size-4 animate-spin" />
					{m.wsview_opening()}
				</div>
			{:else}
				<div class="text-surface-500 mt-12 text-center text-sm">{m.wsview_select_file_prompt()}</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.spinner-late {
		opacity: 0;
		animation: spinner-late-in 0.2s ease 0.15s forwards;
	}
	/* 300ms, matching VisualLoading's first step: most parses finish inside it and should show
	   nothing at all. An animation delay rather than a timer, so nothing has to be armed or cleared. */
	.note-late {
		opacity: 0;
		animation: spinner-late-in 0.2s ease 0.3s forwards;
	}
	@keyframes spinner-late-in {
		to {
			opacity: 1;
		}
	}
</style>
