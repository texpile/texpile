<script lang="ts">
	import type { DockView } from '$lib/terminal/dockView';
	import VersionChangesModal from './VersionChangesModal.svelte';
	import TwoVersionsModal from './TwoVersionsModal.svelte';
	import LocalHistoryDialog from './LocalHistoryDialog.svelte';
	import { versionChanges } from '$lib/workspace/versionChanges.svelte';
	import { twoVersions } from '$lib/workspace/twoVersions.svelte';
	import { localHistoryDialog } from '$lib/workspace/localHistory/localHistoryDialog.svelte';
	import { fileMode, SINGLE_FILE_CAPS } from '$lib/workspace/fileMode.svelte';
	import { onMount, onDestroy } from 'svelte';
	import WorkspaceModals from '$lib/modals/workspace/WorkspaceModals.svelte';
	import WorkspaceMain from './WorkspaceMain.svelte';
	import WorkspaceChrome from './WorkspaceChrome.svelte';
	import GlobalSearch from '$lib/search/GlobalSearch.svelte';
	import { makeFolderReplace, makeRenameElsewhere } from './writing/workspaceReplace';
	import type { TextEdit } from '$lib/workspace/edits/textEdits';
	import TutorialConfirmModal from '$lib/modals/start/TutorialConfirmModal.svelte';
	import { tabs, tabKey } from '$lib/workspace/tabs.svelte';
	import { makeMainActions, makeChromeActions, makePaletteActions, type ActionSurfaceDeps } from './workspaceActionSurfaces';
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import { visualCollabBridge } from '$lib/collab/workspaceSession';
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import type { EditSession } from '$lib/collab/editSession';
	import SessionShareModal from '$lib/collab/SessionShareModal.svelte';
	import VisualCollab from '$lib/collab/VisualCollab.svelte';
	import {
		openGlobalSearch as openSearchPanel,
		closeGlobalSearch as closeSearchPanel,
		toggleGlobalSearch as toggleSearchPanel
	} from '$lib/workspace/editorCommands';
	import { WorkspaceComments } from './workspaceComments.svelte';
	import { wireRefiner } from './workspaceRefiner.svelte';
	import { WorkspaceFiles } from './workspaceFiles.svelte';
	import { WorkspaceDoc } from './workspaceDoc.svelte';
	import { WorkspaceEditFlow } from './workspaceEditFlow.svelte';
	import { WorkspaceIntegrations } from './workspaceIntegrations.svelte';
	import { createWorkspacePipelines } from './workspacePipelines.svelte';
	import { WorkspaceFormatting } from './workspaceFormatting.svelte';
	import { attachSourceToc, tocListOf } from './workspaceToc.svelte';
	import { startWorkspace } from './workspaceStartup';
	import { projectConfigSync as projectConfig, compileConfig } from '$lib/workspace/projectConfigSync.svelte';
	import { setPaletteActions } from '$lib/workspace/commandPalette.svelte';
	import { PaneLayout } from '$lib/workspace/paneLayout.svelte';
	import { TerminalDockState } from '$lib/workspace/terminalDockState.svelte';
	import { mark } from '$lib/debug/startupDoctor';
	import { createKeydownHandler, createCaptureKeydownHandler } from '$lib/workspace/shortcuts';
	import { editSelect } from '$lib/chrome/menuBarCommands';
	import { preferencesOpen } from '$lib/stores/dialogStore';
	import { workspaceRoot, texFiles, activeCompare, activeFilePath, mainFile } from '$lib/workspace/workspaceStore';
	import ZoteroCitationDialog from '$lib/zotero/ZoteroCitationDialog.svelte';
	import CiteByDoiDialog from '$lib/cite/CiteByDoiDialog.svelte';
	import { settings } from '$lib/settings';
	import { basename, dirname, isDesktop, searchInFolder } from '$lib/workspace/fileSystem';
	import { diskProvider } from '$lib/workspace/diskProvider';
	import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
	// the file-access seam: the host gets the disk-backed provider by default; a guest session
	// mounts this same view with a CRDT-backed one. caps gate the host-only features.
	let { provider: hostProvider = diskProvider, session = collabHost }: { provider?: WorkspaceProvider; session?: EditSession } = $props();
	const provider = $derived(fileMode.current ? { ...hostProvider, caps: SINGLE_FILE_CAPS } : hostProvider);
	// all file access flows through the provider; these thin delegates keep the existing call sites
	// (and scan's wrapped {root,...} shape) intact
	// true for the disk-backed host; false for a guest session. Gates the host-only lifecycle
	// (folder claim, terminal, main-file/macro scan, on-disk change checks) so this same view can
	// run over a shared session.
	const hostMode = $derived(!session.isGuest);
	// tree undo needs somewhere to park a deleted entry AND a way to fetch it back; only the
	// disk-backed provider has both, so a guest session records no file history at all
	const canTrash = $derived(!!provider.trash && !!provider.restore);
	// a guest session: host chrome (compile/terminal/git/file-ops/share) hidden
	const guest = $derived(session.isGuest);
	import { hasVisualMode, isRawTextKind } from '$lib/workspace/documentBuffer.svelte';

	// the open document, its parse/mode lifecycle, and the edit-persistence flow live in
	// ./workspaceDoc.svelte.ts and ./workspaceEditFlow.svelte.ts
	const wsdoc: WorkspaceDoc = new WorkspaceDoc({
		provider,
		session: () => session,
		guest: () => guest,
		visualCollab: () => visualCollab,
		saver: () => editFlow.saver,
		clearStaleGoto: (path) => nav.clearStaleGoto(path),
		startCompare: () => integrations.scm.openDiff(doc.path ?? '')
	});
	const editFlow: WorkspaceEditFlow = new WorkspaceEditFlow({ provider, session: () => session, guest: () => guest, wsdoc });
	const { doc, parser, modes, diff } = wsdoc;
	const { saver, unsaved, external } = editFlow;

	// review-comment wiring (controller + feeding effects) lives in ./workspaceComments.svelte.ts
	const commentsW = new WorkspaceComments({
		doc,
		modes,
		kind: () => kind,
		guest: () => guest,
		jumpToFileLine: (abs, line) => nav.syncJumpToFileLine(abs, line),
		parseVisual: async (text) => (await wsdoc.tryParseVisual(text)).parsed ?? null,
		flushSave: () => saver.flush()
	});
	const commentsCtl = commentsW.ctl;
	wireRefiner({ comments: commentsW, doc, modes, kind: () => kind, guest: () => guest });
	// an outside write adopted into the open file (an agent, vim) re-places its threads now, so a
	// rewritten quote badges detached at once rather than at the next mode switch
	external.onAdopted = () => void commentsW.adoptDisk();
	unsaved.onDiscard = (path) => commentsW.discarded(path);
	saver.verify = (path, content) => doc.verifyForWrite(path, content);
	saver.beforeWrite = async (path, content) => {
		await commentsW.beforeSave(path, content);
		await commentsCtl.syncAnchorsToText(path, content);
	};
	modes.beforeSwitch = () => commentsCtl.carryLive();

	const folderEmpty = $derived(texFiles.current.length === 0);

	const kind = $derived(doc.kind);
	// a guest opening a text-looking file the host shares as name only (too large / extension the
	// session doesn't sync): say so instead of rendering a silently empty editor
	const nameOnly = $derived(guest && (hasVisualMode(kind) || isRawTextKind(kind)) && session.sharedKindOf(doc.path) === 'binary');

	// live/draft mode isn't supported in a shared session: guests can't run the incremental engine,
	// they see the host's compiled PDF. Force it off while hosting (the toggle is disabled there too).
	$effect(() => {
		if (session.active && !guest && compileConfig.current.latex.liveMode) projectConfig.setLiveMode(workspaceRoot.current, false);
	});
	// tree ops, starters, folder lifecycle, main-file choice and rename repointing live in
	// ./workspaceFiles.svelte.ts
	const files = new WorkspaceFiles({
		provider,
		session: () => session,
		doc,
		modes,
		kind: () => kind,
		hostMode: () => hostMode,
		canTrash: () => canTrash,
		layout: () => layout,
		compiler: () => compiler,
		saver: () => saver,
		releaseHeldDraftCompile: () => draftCtl.trigger++,
		typstProject: () => cc.typstProject,
		commentsFileMoved: (from, to) => void commentsCtl.fileMoved(from, to),
		confirmLeaveUnsaved: () => editFlow.confirmLeaveUnsaved(),
		setProjectMacros: (macros) => (wsdoc.projectMacros = macros),
		rebuildVisual: () => wsdoc.rebuildVisualFromSource(),
		resetTerminals: () => termDock.resetForWorkspace()
	});

	onMount(() => {
		mark('workspace');
		return startWorkspace({ guest, hostMode, wsdoc, editFlow, files, cc, compiler, draftCtl, commentsCtl, layout, termDock });
	});

	let tutorialModalOpen = $state(false);

	// $state (not const) because descendants bind into these objects' fields: svelte needs an
	// assignable, reactive target to keep the ownership chain intact. Class instances are not
	// proxied by $state, so the objects themselves behave exactly as they would unwrapped.
	let layout = $state(new PaneLayout());

	// the explorer's Contents pane stays whatever is open, so the file tree above it keeps its height
	// and its scroll; this is the list it shows (workspaceToc.svelte.ts)
	const toc = $derived(tocListOf(doc, modes.mode, nameOnly));
	attachSourceToc(wsdoc);
	// dock visibility/height/shrink live in lib/workspace/terminalDockState.svelte.ts
	let termDock = $state(new TerminalDockState(() => guest));
	$effect(() => {
		termDock.available = isDesktop() && provider.caps.terminal;
	});
	/**
	 * The bottom dock is confined to the editor column rather than spanning every column.
	 *
	 * True when the user asked for it (shrink, which only means anything beside an open preview),
	 * and true whenever the preview is CLOSED - because the column its divider left behind is no
	 * longer zero-width. It holds the rail that reopens the pane, so a dock spanning to the last
	 * column now runs straight past that rail to the window edge.
	 */
	// popped out counts as "no docked pane": the rail is up and the dock must not run past it
	const dockShrunk = $derived(termDock.shrink || !layout.pdfPaneOpen || layout.pdfPopout);
	// bottom dock body: the terminal shells (always mounted) or the Problems list
	let dockView = $state<DockView>('terminal');
	// the compile-side stack (compile-command state, draft controller, typst preview, compile
	// pipeline, jump router) is built in ./workspacePipelines.svelte.ts
	const { cc, draftCtl, typstPreview, typstStream, compiler, nav } = createWorkspacePipelines({
		provider,
		session: () => session,
		guest: () => guest,
		wsdoc,
		editFlow: () => editFlow,
		files: () => files,
		layout: () => layout,
		termDock: () => termDock,
		setDockView: (v) => (dockView = v),
		openCompileModal: () => fmt.openCompileModal()
	});
	files.draftPaused = () => draftCtl.paused;

	// compile-command dialog + Format-document modal live in ./workspaceFormatting.svelte.ts
	const fmt = new WorkspaceFormatting({
		provider,
		wsdoc,
		hostMode: () => hostMode,
		cc: () => cc,
		compiler: () => compiler,
		saver: () => saver,
		mainPrompt: () => files.mainPrompt
	});

	// the visual editor's shared-session machinery (remote patches, presence) lives in
	// VisualCollab; this api hands it doc-state access, the ref carries its editor hooks
	let visualCollab = $state<{ noteLocalEdit(): void; noteFreshParse(): void; publishCursor(): void } | null>(null);
	const visualCollabApi = visualCollabBridge({
		doc,
		parser,
		parse: (text) => wsdoc.tryParseVisual(text),
		scheduleSave: (path, content) => saver.schedule(path, content)
	});
	onDestroy(() => {
		typstPreview.dispose(); // leaving the workspace must not leave a preview compiling in the server
		typstStream.dispose();
		projectConfig.reset(); // adopted compile state is per folder; the start screen holds defaults
	});
	// shared session: guests can ask for a compile; leaving the workspace ends the session
	let shareModalOpen = $state(false);

	// MCP, session handlers, project intel, registries, file access, Zotero and SCM wiring live
	// in ./workspaceIntegrations.svelte.ts
	const integrations = new WorkspaceIntegrations({
		provider,
		session: () => session,
		guest: () => guest,
		wsdoc,
		editFlow: () => editFlow,
		nav: () => nav,
		files: () => files,
		cc: () => cc,
		compiler: () => compiler,
		typstPreview: () => typstPreview,
		compileSettings: () => fmt.compileSettings,
		commentsCtl,
		setDockView: (v) => (dockView = v),
		comments: commentsW
	});
	const scm = integrations.scm;

	let globalSearchRef = $state<GlobalSearch | null>(null);
	// folder replace, and renames in the open file followed into the other files
	const replaceWiring = {
		provider: () => provider,
		doc,
		modes,
		kind: () => kind,
		parseVisual: async (text: string) => (await wsdoc.tryParseVisual(text)).parsed ?? null,
		saver: () => saver,
		history: () => (files.treeOps.undoable ? files.treeOps.history : null),
		reloadOpen: () => external.check(),
		main: () => mainFile.current,
		editedClosed: (...change: Parameters<WorkspaceComments['editClosedFile']>) => commentsW.editClosedFile(...change),
		editedOpenVisual: (before: string, after: string, edits: readonly TextEdit[]) => commentsW.editOpenVisual(before, after, edits)
	};
	const renameElsewhere = makeRenameElsewhere({ ...replaceWiring, root: () => workspaceRoot.current, search: searchInFolder });
	onMount(() => {
		function follow(kind: 'label' | 'cite') {
			return (e: Event) => {
				const { from, to } = (e as CustomEvent<{ from: string; to: string }>).detail;
				// the other files are the host's to write; a guest's rename stays in the file it made it in
				if (!guest && provider.caps.manageTree) renameElsewhere(kind, from, to);
			};
		}
		const onLabel = follow('label');
		const onCite = follow('cite');
		addEventListener('texpile:label-renamed', onLabel);
		addEventListener('texpile:citekey-renamed', onCite);
		return () => {
			removeEventListener('texpile:label-renamed', onLabel);
			removeEventListener('texpile:citekey-renamed', onCite);
		};
	});
	// Find in Files panel plumbing lives in lib/workspace/editorCommands.ts
	const searchDeps = {
		setSidebarView: (v: 'explorer' | 'search' | 'scm') => (layout.sidebarView = v),
		openSidebar: () => (layout.sidebarOpen = true),
		closeSidebar: () => (layout.sidebarOpen = false),
		isSidebarOpen: () => layout.sidebarOpen,
		isSearchVisible: () => layout.sidebarOpen && layout.sidebarView === 'search',
		isSourceMode: () => modes.mode === 'source',
		focusInput: (seed?: string) => globalSearchRef?.focusInput(seed)
	};

	// the three callback surfaces live in ./workspaceActionSurfaces.ts
	const actionDeps: ActionSurfaceDeps = {
		// read when an action runs, not now: the provider follows the folder (and file mode), and a
		// copy taken here kept whatever it was while the window was still starting
		get provider() {
			return provider;
		},
		wsdoc,
		editFlow: () => editFlow,
		files: () => files,
		fmt,
		integrations,
		commentsCtl,
		cc,
		draftCtl,
		typstPreview,
		compiler,
		nav,
		termDock: () => termDock,
		layout: () => layout,
		guest: () => guest,
		visualCollab: () => visualCollab,
		setDockView: (v) => (dockView = v),
		getDockView: () => dockView,
		setShareModalOpen: (open) => (shareModalOpen = open),
		setTutorialModalOpen: (open) => (tutorialModalOpen = open),
		openGlobalSearch: () => void openSearchPanel(searchDeps),
		closeGlobalSearch: () => void closeSearchPanel(searchDeps),
		replaceInFolder: makeFolderReplace(replaceWiring)
	};
	const actions = makeMainActions(actionDeps);
	const chromeActions = makeChromeActions(actionDeps);

	// the Ctrl+K palette. Registered rather than passed down: it reaches roughly a dozen of these
	// actions, and threading that through WorkspaceChrome and WorkspaceMain to a dialog would touch
	// four files per command. Cleared on destroy so a keystroke after the workspace closed is inert.
	onMount(() => {
		setPaletteActions(makePaletteActions(actionDeps));
		return () => setPaletteActions(null);
	});

	const uiZoomPercent = $derived(Math.round((settings.current.uiZoom ?? 1) * 100));
	// shortcut table + UI zoom live in lib/workspace/shortcuts.ts
	const onKeydown = createKeydownHandler({
		closeTab: (t) => editFlow.closeTab(t),
		reopenTab: () => editFlow.reopenTab(),
		isGuest: () => guest,
		save: () => wsdoc.save(),
		toggleGlobalSearch: () => void toggleSearchPanel(searchDeps),
		terminalAvailable: () => termDock.available,
		isCompiling: () => compiler.compiling,
		runCompile: () => compiler.runCompile(),
		stopCompile: () => compiler.stopCompile(),
		openPreferences: () => (preferencesOpen.current = true),
		openFolder: () => void (hostMode && files.folder.open()),
		stepDocumentHistory: (direction) => editSelect(direction)
	});
	const onKeydownCapture = createCaptureKeydownHandler({ openSourceControl: () => chromeActions.openSourceControl() });
</script>

<svelte:window onkeydown={onKeydown} onkeydowncapture={onKeydownCapture} />
<!-- file - folder - app (VS Code's order); the folder segment tells windows apart in the taskbar -->
<svelte:head
	><title
		>{workspaceRoot.current
			? `${doc.path ? `${basename(doc.path)} - ` : ''}${basename(workspaceRoot.current)} - Texpile`
			: 'Texpile'}</title
	></svelte:head
>

<!-- clip, not hidden: hidden is still a scroll container, and the editors' scrollIntoView walks
     every ancestor with a scroll range. A few px of overflow anywhere in the shell let it scroll the
     whole app up by that much, once, with nothing to scroll it back -->
<div class="flex h-screen flex-col overflow-clip">
	<WorkspaceChrome
		bind:layout
		bind:termDock
		{compiler}
		{scm}
		treeOps={files.treeOps}
		{guest}
		{toc}
		menu={{
			disabled: !doc.path,
			fileKind: kind,
			// an image is written next to the document, so a workspace that takes no tree writes has
			// nowhere to put one however good the path looks
			imageDir: provider.caps.manageTree && doc.path && hasVisualMode(kind) ? dirname(doc.path) : undefined,
			// never a guest: a guest is IN someone's session, not in a position to open one
			shareable: isDesktop() && !guest && provider.caps.share,
			hostMode,
			canManageTree: provider.caps.manageTree,
			canFormat: fmt.canFormatDoc(),
			uiZoomPercent,
			typstProject: cc.typstProject
		}}
		actions={chromeActions}
		pendingCommand={projectConfig.pending}
		bind:fileTreeRef={files.fileTreeRef}
		bind:globalSearchRef
	>
		<WorkspaceMain
			{doc}
			{modes}
			{layout}
			{diff}
			{parser}
			{termDock}
			{compiler}
			{saver}
			{session}
			{guest}
			{kind}
			{nameOnly}
			{folderEmpty}
			{dockShrunk}
			draft={draftCtl}
			typstPreviewHost={typstPreview.host}
			typstPreviewWanted={typstPreview.wanted}
			mainIsTypst={typstPreview.mainIsTypst}
			guestTypstOffered={guest && collabGuest.typstPreviewOffered}
			mainUnset={typstPreview.mainUnset}
			onPickMain={() => void files.mainPrompt.prompt()}
			panes={{
				openTabs: tabs.list,
				// activeFilePath, not doc.path, which the strip sits unselected behind for a whole read
				activeTabKey: activeFilePath.current ? tabKey({ path: activeFilePath.current, compare: activeCompare.current ?? undefined }) : null,
				previewTab: tabs.preview,
				applyingStarter: files.starters.applying,
				allReferences: integrations.allReferences,
				changeBaseline: integrations.changeBaseline.text,
				sourceGotoLine: nav.sourceGotoLine,
				sourceDiagnostics: cc.sourceDiagnostics,
				fileUrl: (p: string) => provider.fileUrl(p),
				cwd: workspaceRoot.current ?? '',
				comments: commentsCtl.threads,
				commentGhosts: commentsCtl.ghosts,
				commentFile: commentsCtl.activeFile,
				commandPending: !!projectConfig.pending,
				commentsOrphaned: commentsCtl.orphaned,
				commentsWeak: commentsCtl.weak,
				commentsNotVisible: commentsCtl.notVisible,
				commentFilesPresent: commentsW.filesPresent,
				commentSelected: commentsCtl.selected,
				commentRanges: commentsCtl.ranges,
				commentPending: commentsCtl.pending,
				zoteroCite: integrations.canZoteroCite(),
				doiCite: integrations.canCiteByDoi()
			}}
			{actions}
			{commentsCtl}
			bind:dockView
			bind:pdfPaneRef={nav.pdfPaneRef}
		/>
	</WorkspaceChrome>

	<ZoteroCitationDialog />
	<CiteByDoiDialog />
	{#if versionChanges.entry && workspaceRoot.current}
		<VersionChangesModal entry={versionChanges.entry} root={workspaceRoot.current} />
	{/if}
	{#if twoVersions.current}
		<TwoVersionsModal versions={twoVersions.current} />
	{/if}
	{#if localHistoryDialog.view && workspaceRoot.current}
		{#key localHistoryDialog.view}
			<LocalHistoryDialog root={workspaceRoot.current} view={localHistoryDialog.view} />
		{/key}
	{/if}

	<WorkspaceModals
		bind:mainPrompt={files.mainPrompt}
		{unsaved}
		{external}
		bind:compileSettings={fmt.compileSettings}
		bind:formatModalOpen={fmt.formatModalOpen}
		formatTool={kind === 'typ' ? 'typstyle' : 'latexindent'}
		formatting={fmt.formatting}
		pendingRefUpdate={files.pendingRefUpdate}
		onSaveCompile={(thenRun) => fmt.saveCompileCommand(thenRun)}
		onRunCompile={compiler.runCompile}
		onFormat={() => void fmt.runFormatNow()}
		onResolveConflict={(c) => external.resolve(c)}
		onKeepRefs={() => (files.pendingRefUpdate = null)}
		onApplyRefs={() => void files.applyPendingRefUpdate()}
	/>
</div>

<TutorialConfirmModal bind:open={tutorialModalOpen} onConfirm={(root) => void files.folder.openTutorial(root)} />
{#if !guest}
	<SessionShareModal bind:open={shareModalOpen} root={workspaceRoot.current} onBeforeStart={() => saver.flushAndWait()} />
{/if}
{#if session.active}
	<VisualCollab bind:this={visualCollab} {session} path={doc.path} {kind} viewMode={modes.mode} api={visualCollabApi} />
{/if}
