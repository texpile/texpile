// The workspace's three callback surfaces: the editor-column actions WorkspaceMain hands
// down, the chrome actions the menu bar and sidebar get, and the Ctrl+K palette commands.
import { tabs, tabKey, type Tab } from '$lib/workspace/tabs.svelte';
import { collabGuest } from '$lib/collab/guestStore.svelte';
import { normSyncPath } from '$lib/workspace/syncTexNav';
import { projectConfigSync as projectConfig } from '$lib/workspace/projectConfigSync.svelte';
import { uiZoomIn, uiZoomOut, uiZoomReset } from '$lib/workspace/shortcuts';
import { workspaceRoot, activeCompare } from '$lib/workspace/workspaceStore';
import { refreshGitStatus, refreshGitHistory } from '$lib/workspace/gitStore';
import { preferencesOpen } from '$lib/stores/dialogStore';
import { isDesktop, revealItem, type TreeEntry } from '$lib/workspace/fileSystem';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import type { CommentsController } from '$lib/workspace/commentsController.svelte';
import type { TerminalDockState } from '$lib/workspace/terminalDockState.svelte';
import type { PaneLayout } from '$lib/workspace/paneLayout.svelte';
import type { DraftController } from '$lib/draft/draftController.svelte';
import type { TypstPreviewController } from '$lib/languages/typst/preview/previewController.svelte';
import type { CompilePipeline } from '$lib/workspace/compilePipeline.svelte';
import type { WorkspaceNav } from './workspaceNav.svelte';
import type { WorkspaceDoc } from './workspaceDoc.svelte';
import type { WorkspaceEditFlow } from './workspaceEditFlow.svelte';
import type { WorkspaceFiles } from './workspaceFiles.svelte';
import type { WorkspaceFormatting } from './workspaceFormatting.svelte';
import type { WorkspaceIntegrations } from './workspaceIntegrations.svelte';
import type { WorkspaceCompileState } from './workspaceCompileState.svelte';
import type { Starter, ImportedFile } from '$lib/workspace/starters';
import type { CommentMessage, CommentThread } from '$lib/comments/log';
import type { CommentAnchor } from '$lib/comments/anchor';
import type { Node as PMNode } from 'prosemirror-model';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

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
	setDockView: (v: 'terminal' | 'problems' | 'comments') => void;
	setShareModalOpen: (open: boolean) => void;
	setTutorialModalOpen: (open: boolean) => void;
	openGlobalSearch: () => void;
	closeGlobalSearch: () => void;
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

/** the callback surface WorkspaceMain hands down to the topbar / editor / preview / dock */
export function makeMainActions(d: ActionSurfaceDeps) {
	return {
		// "Comment" on a selection: reveal the dock's Comments tab with a composer for it. The thread
		// is not written until the first message, so an abandoned composer leaves nothing behind.
		beginComment: (from: number, to: number) => {
			d.commentsCtl.beginAdd(from, to);
			d.setDockView('comments');
			d.termDock().show();
		},
		// same gesture from the visual editor, which brings its own anchor (see beginAddAnchored)
		beginCommentAnchored: (anchor: CommentAnchor | null) => {
			d.commentsCtl.beginAddAnchored(anchor);
			if (!d.commentsCtl.pending) return; // nothing to compose (no file, or an empty anchor)
			d.setDockView('comments');
			d.termDock().show();
		},
		// The visual editor's placement report. Goes through the controller rather than straight onto
		// the set, because this is also the only moment anyone can observe visual placement - so it is
		// what gets recorded to the log for the files nobody has open. Cleared on leaving visual.
		visualCommentsPlaced: (lost: string[]) => {
			const file = d.commentsCtl.activeFile;
			if (file) void d.commentsCtl.recordHidden(file, new Set(lost));
		},
		/**
		 * A thread was clicked in the editor.
		 *
		 * From the gutter this opens the panel: that mark exists for no other reason than to point at
		 * a comment, so clicking it means "show me it". From source PROSE it only selects - someone
		 * working in their own document happened to land on commented text, and taking over the dock
		 * for that would throw away whatever terminal they were reading; the gutter is right there
		 * for the deliberate gesture. The visual editor HAS no gutter, so its highlight is the only
		 * affordance pointing at the thread and a click on it opens the panel too.
		 */
		selectComment: (id: string, from: 'text' | 'gutter' | 'visual') => {
			const ctl = d.commentsCtl;
			ctl.selected = id;
			if (from === 'text') return;
			d.setDockView('comments');
			d.termDock().show();
		},
		submitComment: (body: string) => void d.commentsCtl.commitAdd(body),
		cancelComment: () => d.commentsCtl.cancelAdd(),
		openComment: (t: CommentThread) => d.commentsCtl.open(t),
		replyToComment: (t: CommentThread, body: string) => void d.commentsCtl.reply(t, body),
		resolveComment: (t: CommentThread, resolved: boolean) => void d.commentsCtl.setResolved(t, resolved),
		deleteComment: (t: CommentThread) => void d.commentsCtl.remove(t),
		editCommentMessage: (msg: CommentMessage, body: string) => void d.commentsCtl.editMessage(msg, body),
		deleteCommentMessage: (t: CommentThread, msg: CommentMessage) => void d.commentsCtl.removeMessage(t, msg),
		setViewMode: (mode: 'visual' | 'source' | 'diff') => d.wsdoc.modes.set(mode),
		syncForward: () => d.nav.syncForward(),
		pauseDraft: () => d.draftCtl.pause(),
		onCaretMove: (line: number, character: number) => d.typstPreview.onCaretMove(line, character),
		onSaveTypstPdf: () => d.typstPreview.savePdf(),
		resumeDraft: () => void d.draftCtl.resume(),
		requestCompile: () => {
			collabGuest.requestCompile();
			toaster.info({ title: m.session_compile_requested(), duration: 2500 });
		},
		openCompileModal: () => d.fmt.openCompileModal(),
		showProblems: () => {
			d.termDock().show();
			d.setDockView('problems');
		},
		showComments: () => {
			d.termDock().show();
			d.setDockView('comments');
		},
		insertZoteroCitation: () => d.integrations.insertZoteroCitation(),
		insertLibraryCitation: () => d.integrations.insertFromLibrary(),
		openLibraryManager: () => d.integrations.openLibraryManager(),
		save: () => d.wsdoc.save(),
		activateTab: (t: Tab) => d.editFlow().activateTab(t),
		closeTab: (t: Tab) => d.editFlow().closeTab(t),
		keepTab: (t: Tab) => tabs.keep(tabKey(t)),
		useSource: () => d.wsdoc.modes.set('source'),
		pickStarter: (s: Starter) => d.files().starters.pick(s),
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
		historyStep: (dir: 'undo' | 'redo') => d.wsdoc.modes.historyStep(dir),
		jumpToFile: (name: string) => d.nav.jumpToInclude(name),
		openFileAt: (file: string, line: number, selectText?: string) => d.nav.openFileAtLine(file, line, selectText),
		refreshDiff: () => void toastAfter(m.wsview_toast_diff_refreshed(), () => void d.wsdoc.diff.snapshot()),
		// leaving a comparison is closing its tab: it is a thing you opened, not a mode you are in
		exitDiff: () => {
			const path = d.wsdoc.doc.path;
			if (path) d.editFlow().closeTab({ path, compare: activeCompare.current ?? undefined });
		},
		onPdfDoubleClick: (page: number, x: number, y: number, selectText?: string) => d.nav.onPdfDoubleClick(page, x, y, selectText),
		onInverseSync: (file: string, line: number, selectText?: string) => d.nav.openFileAtLine(normSyncPath(file), line, selectText),
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

/** the callback surface WorkspaceChrome hands to the menu bar and sidebar */
export function makeChromeActions(d: ActionSurfaceDeps) {
	return {
		// the project's compile command, accepted for this folder on this machine. Here rather than
		// in the main actions because its banner is window-wide chrome now, not part of the editor column.
		acceptProjectCommand: () => {
			projectConfig.accept();
			d.cc.resolveNow();
		},
		newFileOfType: (ext?: string) => d.files().newFileOfType(ext),
		openFolder: (path?: string) => void d.files().folder.open(path),
		closeWorkspace: () => void d.files().folder.close(),
		save: () => d.wsdoc.save(),
		openShare: () => d.setShareModalOpen(true),
		openCompileModal: () => d.fmt.openCompileModal(),
		newTerminal: () => d.termDock().newTerminal(),
		toggleTerminal: () => d.termDock().toggle(),
		openFormatModal: () => d.fmt.openFormatModal(),
		openTutorial: () => d.setTutorialModalOpen(true),
		insertLibraryCitation: () => d.integrations.insertFromLibrary(),
		uiZoomIn,
		uiZoomOut,
		uiZoomReset,
		refreshTree: () => void toastAfter(m.wsview_toast_tree_refreshed(), () => d.files().refreshTree()),
		openGlobalSearch: () => void d.openGlobalSearch(),
		closeGlobalSearch: () => void d.closeGlobalSearch(),
		openFileAt: (file: string, line: number, selectText?: string) => d.nav.openFileAtLine(file, line, selectText),
		openEntry: (entry: TreeEntry) => d.files().openEntry(entry),
		// the main file is a property of the project, so it goes in .texpile/config.json with the rest
		setMain: (entry: TreeEntry) => void d.files().toggleMainFile(entry.path),
		revealEntry: (entry: TreeEntry) => void revealItem(entry.path),
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
		canSearch: () => d.provider.caps.search,
		canFormat: () => d.fmt.canFormatDoc(),
		formatTool: () => (d.wsdoc.doc.kind === 'typ' ? 'typstyle' : 'latexindent') as 'typstyle' | 'latexindent',
		canGit: () => d.provider.caps.git,
		openFile: (abs: string) => d.editFlow().activateTab({ path: abs }),
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
		// same condition the app-icon menu uses: desktop only, and never for a guest
		openShareSession: isDesktop() && !d.guest() ? () => d.setShareModalOpen(true) : undefined,
		newFile: (ext?: string) => d.files().newFileOfType(ext),
		openFolder: () => void d.files().folder.open(),
		refreshTree: () => void d.files().refreshTree(),
		openTypstPreview: () => d.typstPreview.enable(),
		isTypstProject: () => d.cc.typstProject,
		canZoteroCite: () => d.integrations.canZoteroCite(),
		insertZoteroCitation: () => d.integrations.insertZoteroCitation(),
		canLibraryCite: () => d.integrations.canCiteFromLibrary(),
		insertLibraryCitation: () => d.integrations.insertFromLibrary(),
		canManageLibrary: () => d.integrations.canManageLibrary(),
		openLibraryManager: () => d.integrations.openLibraryManager()
	};
}
