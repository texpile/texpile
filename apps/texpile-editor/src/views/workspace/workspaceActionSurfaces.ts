// The workspace's three callback surfaces: the editor-column actions WorkspaceMain hands
// down, the chrome actions the menu bar and sidebar get, and the Ctrl+K palette commands.
import type { ReplaceSpec } from '$lib/search/replaceInFiles';
import { startClone } from '$lib/workspace/scm/remote/cloneFlow';
import { canClone } from '$lib/workspace/scm/remote/gitClone';
import { forgetSignIns } from '$lib/workspace/forgetSignIns';
import { focusScmMessage } from '$lib/workspace/scm/actions/scmHandlers.svelte';
import { capsOf, fileMode } from '$lib/workspace/fileMode.svelte';
import { tabs, tabKey, type Tab } from '$lib/workspace/tabs.svelte';
import { collabGuest } from '$lib/collab/guestStore.svelte';
import { canKeepLocalHistory } from '$lib/workspace/localHistory/localHistory.svelte';
import { openLocalHistory, openRestoreDeleted } from '$lib/workspace/localHistory/localHistoryDialog.svelte';
import { normSyncPath } from '$lib/workspace/syncTexNav';
import { projectConfigSync as projectConfig } from '$lib/workspace/projectConfigSync.svelte';
import { uiZoomIn, uiZoomOut, uiZoomReset } from '$lib/workspace/shortcuts';
import { workspaceRoot, isDirty, activeFilePath, activeCompare, mainFile } from '$lib/workspace/workspaceStore';
import { revealInTree } from '$lib/filetree/treeReveal.svelte';
import { openTabContextMenu } from './tabContextMenu';
import { countDocumentWords } from './writing/workspaceWordCount';
import { refreshGitStatus, refreshGitHistory } from '$lib/workspace/scm/gitStore';
import { preferencesOpen } from '$lib/stores/dialogStore';
import { isDesktop, revealItem, type TreeEntry } from '$lib/workspace/fileSystem';
import { hasUnsavedUnder } from '$lib/workspace/unsavedPaths';
import { openSaveAsTemplate } from '$lib/workspace/templates/saved/templateDetails.svelte';
import { userTemplatesAvailable } from '$lib/workspace/templates/templateBridge';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import type { CommentsController } from '$lib/workspace/commentsController.svelte';
import type { TerminalDockState } from '$lib/workspace/terminalDockState.svelte';
import type { PaneLayout } from '$lib/workspace/paneLayout.svelte';
import type { DraftController } from '$lib/draft/draftController.svelte';
import type { TypstPreviewController } from '$lib/languages/typst/preview/previewController.svelte';
import { symbolPicker } from '$lib/editor/symbols/symbolPicker.svelte';
import { typstSymbolSet } from '$lib/languages/typst/symbols/typstSymbolSet';
import { latexSymbolSet } from '$lib/languages/latex/symbols/latexSymbolSet';
import { typstExport } from '$lib/languages/typst/export/dialog/typstExportState.svelte';
import type { CompilePipeline } from '$lib/workspace/compilePipeline.svelte';
import type { WorkspaceNav } from './workspaceNav.svelte';
import type { WorkspaceDoc } from './workspaceDoc.svelte';
import type { WorkspaceEditFlow } from './workspaceEditFlow.svelte';
import type { WorkspaceFiles } from './workspaceFiles.svelte';
import type { WorkspaceFormatting } from './workspaceFormatting.svelte';
import type { WorkspaceIntegrations } from './workspaceIntegrations.svelte';
import type { WorkspaceCompileState } from './workspaceCompileState.svelte';
import type { ImportedFile } from '$lib/workspace/starters';
import type { StarterChoice } from '$lib/workspace/templates/starterChoice';
import type { CommentMessage, CommentThread } from '$lib/comments/log';
import type { CommentAnchor } from '$lib/comments/anchor';
import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';
import { sourceAnchorFor } from '$lib/editor/visual/extensions/pmComments';
import type { Node as PMNode } from 'prosemirror-model';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import type { DockView } from '$lib/terminal/dockView';
import { ensureName } from '$lib/identity/ownName.svelte';

export type ActionSurfaceDeps = {
	provider: WorkspaceProvider;
	wsdoc: WorkspaceDoc;
	editFlow: () => WorkspaceEditFlow;
	files: () => WorkspaceFiles;
	fmt: WorkspaceFormatting;
	integrations: WorkspaceIntegrations;
	commentsCtl: CommentsController;
	cc: WorkspaceCompileState;
	draftCtl: DraftController;
	typstPreview: TypstPreviewController;
	compiler: CompilePipeline;
	nav: WorkspaceNav;
	termDock: () => TerminalDockState;
	layout: () => PaneLayout;
	guest: () => boolean;
	visualCollab: () => { publishCursor(): void } | null;
	setDockView: (v: DockView) => void;
	getDockView: () => DockView;
	setShareModalOpen: (open: boolean) => void;
	setTutorialModalOpen: (open: boolean) => void;
	openGlobalSearch: () => void;
	closeGlobalSearch: () => void;
	replaceInFolder: (files: string[], spec: ReplaceSpec) => Promise<void>;
};

/**
 * The refresh buttons confirm they ran.
 *
 * All three do their work silently and usually change nothing visible - the point of pressing one
 * is that you already suspect the view is stale - so there was no way to tell a working button
 * from a dead one. Only the BUTTON paths toast: the same refreshes also run on the watcher, on
 * focus and on session events, and a toast for those would be a notification every few seconds.
 */
export async function toastAfter(title: string, work: () => unknown): Promise<void> {
	await work();
	toaster.success({ title, duration: 1500 });
}

/** File > Save as template: the main file (or, with none set, the open document) is the one it opens on */
function saveAsTemplate(d: ActionSurfaceDeps): void {
	void openSaveAsTemplate(workspaceRoot.current, mainFile.current ?? d.wsdoc.doc.path, d.compiler.expectedPdfPath(), () =>
		d.editFlow().saver.flushAndWait()
	);
}

/** the callback surface WorkspaceMain hands down to the topbar / editor / preview / dock */
/** a guest has the name it joined with */
function named(d: ActionSurfaceDeps): Promise<boolean> {
	return d.guest() ? Promise.resolve(true) : ensureName(workspaceRoot.current);
}

function toggleDockPanel(d: ActionSurfaceDeps, view: 'problems' | 'comments') {
	const dock = d.termDock();
	if (dock.visible && d.getDockView() === view) {
		dock.hide();
		return;
	}
	dock.show();
	d.setDockView(view);
}

export function makeMainActions(d: ActionSurfaceDeps) {
	return {
		// a comment is signed: a name is asked for before one is begun, so nothing typed is lost to the question
		beginComment: (from: number, to: number) => void named(d).then((ok) => ok && d.commentsCtl.beginAdd(from, to)),
		// same gesture from the visual editor, which brings its own anchor (see beginAddAnchored)
		beginCommentAnchored: (anchor: CommentAnchor | null) => void named(d).then((ok) => ok && d.commentsCtl.beginAddAnchored(anchor)),
		attachCommentToSelection: (thread: CommentThread) => {
			if (d.wsdoc.modes.mode === 'visual') {
				const view = editorViewStore.current;
				const sel = view?.state.selection;
				if (view && sel && !sel.empty) {
					const anchor = sourceAnchorFor(view.state.doc, d.wsdoc.doc.sourceMap, d.wsdoc.doc.texSource, sel.from, sel.to);
					if (anchor) {
						void d.commentsCtl.reattachAnchored(thread, anchor);
						return;
					}
				}
			} else {
				const cm = sourceCmView.current;
				const sel = cm?.state.selection.main;
				if (cm && sel && !sel.empty) {
					void d.commentsCtl.reattach(thread, sel.from, sel.to);
					return;
				}
			}
			toaster.info({ title: m.comments_attach_select_first(), duration: 2500 });
		},
		// The visual editor's placement report. Goes through the controller rather than straight onto
		// the set, because this is also the only moment anyone can observe visual placement - so it is
		// what gets recorded to the log for the files nobody has open. Cleared on leaving visual.
		visualCommentsPlaced: (lost: string[]) => {
			const file = d.commentsCtl.activeFile;
			if (file) void d.commentsCtl.recordHidden(file, new Set(lost));
		},
		selectComment: (id: string) => {
			// eslint-disable-next-line no-param-reassign -- the deps hand over the live controllers this surface drives
			d.commentsCtl.selected = id;
		},
		openComment: (t: CommentThread) => d.commentsCtl.open(t),
		replyToComment: (t: CommentThread, body: string) => d.commentsCtl.reply(t, body),
		resolveComment: (t: CommentThread, resolved: boolean) => void d.commentsCtl.setResolved(t, resolved),
		editCommentMessage: (msg: CommentMessage, body: string) => void d.commentsCtl.editMessage(msg, body),
		deleteCommentMessage: (t: CommentThread, msg: CommentMessage) => void d.commentsCtl.removeMessage(t, msg),
		setViewMode: (mode: 'visual' | 'source' | 'diff') => d.wsdoc.modes.set(mode),
		syncForward: () => d.nav.syncForward(),
		pauseDraft: () => d.draftCtl.pause(),
		onCaretMove: (line: number, character: number) => d.typstPreview.onCaretMove(line, character),
		resumeDraft: () => void d.draftCtl.resume(),
		requestCompile: () => {
			collabGuest.requestCompile();
			toaster.info({ title: m.session_compile_requested(), duration: 2500 });
		},
		openCompileModal: () => d.fmt.openCompileModal(),
		// the badges toggle: a second click on the panel already showing closes the dock
		showProblems: () => toggleDockPanel(d, 'problems'),
		showComments: () => toggleDockPanel(d, 'comments'),
		insertZoteroCitation: () => d.integrations.insertZoteroCitation(),
		citeByDoi: () => d.integrations.citeByDoi(),
		countWords: () => countDocumentWords(d.wsdoc.doc, d.provider),
		save: () => d.wsdoc.save(),
		activateTab: (t: Tab) => d.editFlow().activateTab(t),
		closeTab: (t: Tab) => d.editFlow().closeTab(t),
		keepTab: (t: Tab) => tabs.keep(tabKey(t)),
		tabMenu: (t: Tab, e: MouseEvent) => {
			const path = activeFilePath.current;
			openTabContextMenu(e, t, {
				tabs: tabs.list,
				active: path ? { path, compare: activeCompare.current ?? undefined } : null,
				dirty: isDirty.current && !d.guest(),
				preview: tabs.preview,
				root: workspaceRoot.current,
				close: (x) => d.editFlow().closeTab(x),
				keep: (x) => tabs.keep(tabKey(x)),
				reveal: isDesktop() && !d.guest() ? (p) => void revealItem(p) : undefined,
				localHistory: !d.guest() && canKeepLocalHistory() ? (p) => openLocalHistory(p) : undefined,
				showInTree: (p) => {
					d.layout().setSidebarOpen(true);
					// eslint-disable-next-line no-param-reassign -- the deps hand over the live controllers this surface drives
					d.layout().sidebarView = 'explorer';
					revealInTree(p);
				}
			});
		},
		useSource: () => d.wsdoc.modes.set('source'),
		leaveConflicts: () => d.wsdoc.modes.set('visual'),
		openAsText: (path: string) => d.wsdoc.openAsText(path),
		pickStarter: (choice: StarterChoice) => d.files().starters.pick(choice),
		newTexFile: () => d.files().starters.newTexFile(),
		importStarter: (imported: ImportedFile[]) => d.files().starters.importFiles(imported),
		onTexInput: (v: string) => d.wsdoc.doc.onTexInput(v),
		onRawInput: (v: string) => d.wsdoc.doc.onRawInput(v),
		onVisualChange: (node: PMNode) => d.wsdoc.doc.onVisualChange(node),
		onVisualSelection: () => {
			d.visualCollab()?.publishCursor();
			// visual-mode preview follow; gated here too so no timer churn outside typ+follow
			if (d.wsdoc.doc.kind === 'typ') d.typstPreview.onVisualCaretMove();
		},
		onEditFrontmatter: (kind: string, inner: string) => d.wsdoc.doc.editFrontmatter(kind, inner),
		syncToPdf: (line: number) => d.nav.syncToLine(line),
		jumpToFile: (name: string) => d.nav.jumpToInclude(name),
		openFileAt: (file: string, line: number, selectText?: string) => d.nav.openFileAtLine(file, line, selectText),
		jumpToLabel: (name: string) => d.nav.jumpToLabel(name),
		jumpToDefinition: (name: string) => d.nav.jumpToDefinition(name),
		refreshDiff: () => void toastAfter(m.wsview_toast_diff_refreshed(), () => void d.wsdoc.diff.snapshot()),
		onPdfDoubleClick: (page: number, x: number, y: number, selectText?: string) => d.nav.onPdfDoubleClick(page, x, y, selectText),
		onInverseSync: (file: string, line: number, selectText?: string) => d.nav.syncJumpToFileLine(normSyncPath(file), line, selectText),
		onPreviewSettled: d.draftCtl.runDecision,
		// Live mode's compile has its own log, and the normal pipeline never sees it -- that one
		// polls the .log of the user's compile command, which does not run in live mode. quiet: a
		// draft compile fires whenever typing pauses, so it may fill the Problems list but must
		// never yank the dock open mid-sentence. The topbar's error badge is the signal.
		onPreviewDiagnostics: async (logPath: string) => {
			// A compile that never reached the engine (lualatex not on PATH) leaves no log to read,
			// and publishLogDiagnostics would throw on the missing file. That case is exactly the one
			// the preview's own banner exists for, so there is nothing to add here.
			const s = await d.provider.stat(logPath);
			if (!s.exists) return;
			// the log's OWN mtime, not now(): updatedAt is what tells a reader how old this parse is,
			// and stamping it with the read time made a day-old log look freshly written
			await d.compiler.publishLogDiagnostics(logPath, s.mtimeMs, true, null);
		},
		toggleTerminalShrink: () => d.termDock().toggleShrink(),
		toggleTerminal: () => d.termDock().toggle()
	};
}

/** VS Code's Ctrl+Shift+G: the Source Control panel, with the keyboard in its message box. Not for
 *  a session guest, or a workspace without git, which the sidebar shows no Source Control for */
function openSourceControl(d: ActionSurfaceDeps): void {
	if (d.guest() || !d.provider.caps.git) return;
	d.layout().setSidebarOpen(true);
	// eslint-disable-next-line no-param-reassign -- the deps hand over the live controllers this surface drives
	d.layout().sidebarView = 'scm';
	focusScmMessage();
}

/** the callback surface WorkspaceChrome hands to the menu bar and sidebar */
export function makeChromeActions(d: ActionSurfaceDeps) {
	return {
		openSourceControl: () => openSourceControl(d),
		// the project's compile command, accepted for this folder on this machine. Here rather than
		// in the main actions because its banner is window-wide chrome now, not part of the editor column.
		acceptProjectCommand: () => {
			projectConfig.accept();
			d.cc.resolveNow();
		},
		newFileOfType: (ext?: string) => d.files().newFileOfType(ext),
		openFolder: (path?: string) => void d.files().folder.open(path),
		// the clone opens here the way Open Folder does, unsaved-work checks and all
		cloneRepository: () => void startClone((path) => d.files().folder.open(path)),
		localHistory: () => {
			const path = activeFilePath.current;
			if (path) openLocalHistory(path);
		},
		restoreDeleted: () => {
			const root = workspaceRoot.current;
			if (root) openRestoreDeleted(root);
		},
		closeWorkspace: () => void d.files().folder.close(),
		save: () => d.wsdoc.save(),
		openShare: () => d.setShareModalOpen(true),
		openCompileModal: () => d.fmt.openCompileModal(),
		newTerminal: () => d.termDock().newTerminal(),
		toggleTerminal: () => d.termDock().toggle(),
		openFormatModal: () => d.fmt.openFormatModal(),
		openTutorial: () => d.setTutorialModalOpen(true),
		saveAsTemplate: () => saveAsTemplate(d),
		uiZoomIn,
		uiZoomOut,
		uiZoomReset,
		refreshTree: () => void toastAfter(m.wsview_toast_tree_refreshed(), () => d.files().refreshTree()),
		openGlobalSearch: () => void d.openGlobalSearch(),
		closeGlobalSearch: () => void d.closeGlobalSearch(),
		replaceInFolder: (files: string[], spec: ReplaceSpec) => d.replaceInFolder(files, spec),
		openFileAt: (file: string, line: number, selectText?: string) => d.nav.openFileAtLine(file, line, selectText),
		openEntry: (entry: TreeEntry) => d.files().openEntry(entry),
		// the main file is a property of the project, so it goes in .texpile/config.json with the rest
		setMain: (entry: TreeEntry) => void d.files().toggleMainFile(entry.path),
		revealEntry: (entry: TreeEntry) => void revealItem(entry.path),
		// the file tree asks before deleting something whose edits exist only here
		hasUnsaved: (path: string) =>
			hasUnsavedUnder(path, {
				loaded: d.wsdoc.doc.path,
				dirty: isDirty.current,
				pending: d.editFlow().saver.pending?.path ?? null
			}),
		refreshGit: () =>
			void toastAfter(m.wsview_toast_git_refreshed(), async () => {
				await refreshGitStatus(workspaceRoot.current);
				await refreshGitHistory(workspaceRoot.current);
			})
	};
}

/** the Ctrl+K palette's command surface (registered on mount, cleared on destroy) */
export function makePaletteActions(d: ActionSurfaceDeps) {
	return {
		openSourceControl: () => openSourceControl(d),
		save: () => d.wsdoc.save(),
		runCompile: () => d.compiler.runCompile(),
		stopCompile: () => d.compiler.stopCompile(),
		isCompiling: () => d.compiler.compiling,
		// caps.compile, not !guest: being a guest is why the toolchain is absent today, not what
		// is absent. The other gates below read the capability, so this one does too.
		compileAvailable: () => d.termDock().available && d.provider.caps.compile,
		setViewMode: (mode: 'visual' | 'source' | 'diff') => d.wsdoc.modes.set(mode),
		getViewMode: () => d.wsdoc.modes.mode,
		hasFile: () => !!d.wsdoc.doc.path,
		canManageTree: () => d.provider.caps.manageTree,
		isHostWorkspace: () => !d.guest(),
		isProject: () => capsOf(d.provider).project,
		canSearch: () => d.provider.caps.search,
		canFormat: () => d.fmt.canFormatDoc(),
		formatTool: () => (d.wsdoc.doc.kind === 'typ' ? 'typstyle' : 'latexindent') as 'typstyle' | 'latexindent',
		canGit: () => d.provider.caps.git,
		openFile: (abs: string) => d.editFlow().activateTab({ path: abs }),
		hasSidebar: () => !fileMode.current,
		toggleSidebar: () => d.layout().toggleSidebar(),
		sidebarOpen: () => d.layout().sidebarOpen,
		toggleTerminal: () => d.termDock().toggle(),
		terminalVisible: () => d.termDock().visible,
		terminalAvailable: () => d.termDock().available,
		newTerminal: () => d.termDock().newTerminal(),
		openCompileModal: () => d.fmt.openCompileModal(),
		openFormatModal: () => d.fmt.openFormatModal(),
		openGlobalSearch: () => void d.openGlobalSearch(),
		openPreferences: () => {
			preferencesOpen.current = true;
		},
		// same condition the app-icon menu uses: desktop only, never for a guest, and never a lone file's folder.
		// Getters: the palette asks when it opens, and a window can turn to a lone file before then
		get openShareSession() {
			return isDesktop() && !d.guest() && capsOf(d.provider).share ? () => d.setShareModalOpen(true) : undefined;
		},
		newFile: (ext?: string) => d.files().newFileOfType(ext),
		// the host's own folder, in the desktop app, where the templates folder is
		get saveAsTemplate() {
			return userTemplatesAvailable() && !d.guest() && capsOf(d.provider).project ? () => saveAsTemplate(d) : undefined;
		},
		openFolder: () => void d.files().folder.open(),
		cloneRepository: canClone() ? () => void startClone((path) => d.files().folder.open(path)) : undefined,
		forgetSignIns: canClone() ? () => void forgetSignIns() : undefined,
		refreshTree: () => void d.files().refreshTree(),
		openTypstPreview: () => d.typstPreview.enable(),
		isTypstProject: () => d.cc.typstProject,
		canExportTypst: () => typstExport.available,
		exportTypst: () => typstExport.show(),
		canZoteroCite: () => d.integrations.canZoteroCite(),
		insertZoteroCitation: () => d.integrations.insertZoteroCitation(),
		canCiteByDoi: () => d.integrations.canCiteByDoi(),
		citeByDoi: () => d.integrations.citeByDoi(),
		canInsertSymbol: () => (d.wsdoc.doc.kind === 'typ' || d.wsdoc.doc.kind === 'tex') && !activeCompare.current,
		insertSymbol: () => void (d.wsdoc.doc.kind === 'tex' ? symbolPicker.show(latexSymbolSet) : symbolPicker.show(typstSymbolSet))
	};
}
