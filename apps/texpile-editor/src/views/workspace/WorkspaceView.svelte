<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import WorkspaceModals from '$lib/modals/workspace/WorkspaceModals.svelte';
	import WorkspaceMain from './WorkspaceMain.svelte';
	import WorkspaceChrome from './WorkspaceChrome.svelte';
	import GlobalSearch from '$lib/search/GlobalSearch.svelte';
	import TutorialConfirmModal from '$lib/modals/start/TutorialConfirmModal.svelte';
	import { tabs, tabKey } from '$lib/workspace/tabs.svelte';
	import { makeMainActions, makeChromeActions, makePaletteActions, type ActionSurfaceDeps } from './workspaceActionSurfaces';
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import { visualCollabBridge } from '$lib/collab/workspaceSession';
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import type { EditSession } from '$lib/collab/editSession';
	import SessionShareModal from '$lib/collab/SessionShareModal.svelte';
	import VisualCollab from '$lib/collab/VisualCollab.svelte';
	import { openGlobalSearch as openSearchPanel, closeGlobalSearch as closeSearchPanel } from '$lib/workspace/editorCommands';
	import { WorkspaceComments } from './workspaceComments.svelte';
	import { WorkspaceFiles } from './workspaceFiles.svelte';
	import { WorkspaceDoc } from './workspaceDoc.svelte';
	import { WorkspaceEditFlow } from './workspaceEditFlow.svelte';
	import { WorkspaceIntegrations } from './workspaceIntegrations.svelte';
	import { createWorkspacePipelines } from './workspacePipelines.svelte';
	import { WorkspaceFormatting } from './workspaceFormatting.svelte';
	import { attachSourceToc } from './workspaceToc.svelte';
	import { startWorkspace } from './workspaceStartup';
	import { projectConfigSync as projectConfig, compileConfig } from '$lib/workspace/projectConfigSync.svelte';
	import { setPaletteActions } from '$lib/workspace/commandPalette.svelte';
	import { PaneLayout } from '$lib/workspace/paneLayout.svelte';
	import { TerminalDockState } from '$lib/workspace/terminalDockState.svelte';
	import { createKeydownHandler } from '$lib/workspace/shortcuts';
	import { workspaceRoot, texFiles, activeCompare } from '$lib/workspace/workspaceStore';
	import ZoteroCitationDialog from '$lib/zotero/ZoteroCitationDialog.svelte';
	import LibraryPickerDialog from '$lib/library/LibraryPickerDialog.svelte';
	import LibraryManagerDialog from '$lib/library/LibraryManagerDialog.svelte';
	import { settings } from '$lib/settings';
	import { basename, dirname, isDesktop } from '$lib/workspace/fileSystem';
	import { diskProvider } from '$lib/workspace/diskProvider';
	import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
	// the file-access seam: the host gets the disk-backed provider by default; a guest session
	// mounts this same view with a CRDT-backed one. caps gate the host-only features.
	let { provider = diskProvider, session = collabHost }: { provider?: WorkspaceProvider; session?: EditSession } = $props();
	// all file access flows through the provider; these thin delegates keep the existing call sites
	// (and scan's wrapped {root,...} shape) intact
	// true for the disk-backed host; false for a read-only guest session. Gates the host-only
	// lifecycle (folder claim, terminal, main-file/macro scan, on-disk change checks) so this same
	// view can run over a shared session.
	const hostMode = $derived(provider.caps.manageTree);
	// tree undo needs somewhere to park a deleted entry AND a way to fetch it back; only the
	// disk-backed provider has both, so a guest session records no file history at all
	const canTrash = $derived(!!provider.trash && !!provider.restore);
	// a guest session: host chrome (compile/terminal/git/file-ops/share) hidden
	const guest = $derived(session.isGuest);
	import { modLabel } from '$lib/platform';
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
		jumpToFileLine: (abs, line) => nav.syncJumpToFileLine(abs, line)
	});
	const commentsCtl = commentsW.ctl;

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

	onMount(() => startWorkspace({ guest, hostMode, wsdoc, editFlow, files, cc, compiler, draftCtl, commentsCtl, layout, termDock }));

	let tutorialModalOpen = $state(false);

	// $state (not const) because descendants bind into these objects' fields: svelte needs an
	// assignable, reactive target to keep the ownership chain intact. Class instances are not
	// proxied by $state, so the objects themselves behave exactly as they would unwrapped.
	let layout = $state(new PaneLayout());

	// visual TOC reads PM headings (works for md too); source-mode TOC parses raw LaTeX, tex-only
	const showToc = $derived(!!doc.path && (modes.mode === 'visual' ? hasVisualMode(kind) : modes.mode === 'source' && kind === 'tex'));
	attachSourceToc(wsdoc);
	// dock visibility/height/shrink live in lib/workspace/terminalDockState.svelte.ts
	let termDock = $state(new TerminalDockState(() => guest));
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
	let dockView = $state<'terminal' | 'problems' | 'comments'>('terminal');
	// the compile-side stack (compile-command state, draft controller, typst preview, compile
	// pipeline, jump router) is built in ./workspacePipelines.svelte.ts
	const { cc, draftCtl, typstPreview, compiler, nav } = createWorkspacePipelines({
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
		setDockView: (v) => (dockView = v)
	});
	const scm = integrations.scm;

	let globalSearchRef = $state<GlobalSearch | null>(null);
	// Find in Files panel plumbing lives in lib/workspace/editorCommands.ts
	const searchDeps = {
		setSidebarView: (v: 'explorer' | 'search' | 'scm') => (layout.sidebarView = v),
		openSidebar: () => (layout.sidebarOpen = true),
		isSourceMode: () => modes.mode === 'source',
		focusInput: (seed?: string) => globalSearchRef?.focusInput(seed)
	};

	// the three callback surfaces live in ./workspaceActionSurfaces.ts
	const actionDeps: ActionSurfaceDeps = {
		provider,
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
		setShareModalOpen: (open) => (shareModalOpen = open),
		setTutorialModalOpen: (open) => (tutorialModalOpen = open),
		openGlobalSearch: () => void openSearchPanel(searchDeps),
		closeGlobalSearch: () => void closeSearchPanel(searchDeps)
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
		getLoadedPath: () => doc.path,
		closeTab: (t) => editFlow.closeTab(t),
		isGuest: () => guest,
		save: () => wsdoc.save(),
		openGlobalSearch: () => void openSearchPanel(searchDeps),
		terminalAvailable: () => termDock.available,
		isCompiling: () => compiler.compiling,
		runCompile: () => compiler.runCompile(),
		stopCompile: () => compiler.stopCompile()
	});
</script>

<svelte:window onkeydown={onKeydown} />
<!-- file - folder - app (VS Code's order); the folder segment tells windows apart in the taskbar -->
<svelte:head
	><title
		>{workspaceRoot.current
			? `${doc.path ? `${basename(doc.path)} - ` : ''}${basename(workspaceRoot.current)} - Texpile`
			: 'Texpile'}</title
	></svelte:head
>

<div class="flex h-screen flex-col overflow-hidden">
	<WorkspaceChrome
		bind:layout
		{modes}
		bind:termDock
		{compiler}
		{scm}
		treeOps={files.treeOps}
		{guest}
		{modLabel}
		{showToc}
		menu={{
			disabled: !doc.path,
			fileKind: kind,
			// an image is written next to the document, so a workspace that takes no tree writes has
			// nowhere to put one however good the path looks
			imageDir: hostMode && doc.path && hasVisualMode(kind) ? dirname(doc.path) : undefined,
			// never a guest: a guest is IN someone's session, not in a position to open one
			shareable: isDesktop() && !guest,
			hostMode,
			canFormat: fmt.canFormatDoc(),
			uiZoomPercent,
			typstProject: cc.typstProject,
			libraryCite: integrations.canCiteFromLibrary()
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
			{modLabel}
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
				activeTabKey: doc.path ? tabKey({ path: doc.path, compare: activeCompare.current ?? undefined }) : null,
				previewTab: tabs.preview,
				applyingStarter: files.starters.applying,
				allReferences: integrations.allReferences,
				sourceGotoLine: nav.sourceGotoLine,
				sourceDiagnostics: cc.sourceDiagnostics,
				fileUrl: (p: string) => provider.fileUrl(p),
				cwd: workspaceRoot.current ?? '',
				comments: commentsCtl.threads,
				commentFile: commentsCtl.activeFile,
				commandPending: !!projectConfig.pending,
				commentsOrphaned: commentsCtl.orphaned,
				commentsNotVisible: commentsCtl.notVisible,
				commentFilesPresent: commentsW.filesPresent,
				commentSelected: commentsCtl.selected,
				commentRanges: commentsCtl.ranges,
				commentPending: commentsCtl.pending,
				zoteroCite: integrations.canZoteroCite(),
				libraryCite: integrations.canCiteFromLibrary()
			}}
			{actions}
			bind:dockView
			bind:pdfPaneRef={nav.pdfPaneRef}
		/>
	</WorkspaceChrome>

	<ZoteroCitationDialog />
	<LibraryPickerDialog />
	<LibraryManagerDialog />

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
		onUseDefaultCompile={() => fmt.useDefaultCommand()}
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
