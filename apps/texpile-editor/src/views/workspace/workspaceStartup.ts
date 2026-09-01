// The workspace's mount sequence: folder claim, per-folder state binds, layout restores, the
// window listeners and the before-close guard. Returns the teardown for onMount.
import { navigate } from '$lib/router.svelte';
import { tabs } from '$lib/workspace/tabs.svelte';
import { docPositions } from '$lib/workspace/docPositions';
import { initSpellcheckConfig } from '$lib/editor/spellcheck/spellcheckConfig';
import { attachWindowListeners, attachCloseGuard } from '$lib/workspace/workspaceMount';
import { projectConfigSync as projectConfig } from '$lib/workspace/projectConfigSync.svelte';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { claimWorkspace, purgeUndoBackups } from '$lib/workspace/fileSystem';
import type { PaneLayout } from '$lib/workspace/paneLayout.svelte';
import type { TerminalDockState } from '$lib/workspace/terminalDockState.svelte';
import type { CommentsController } from '$lib/workspace/commentsController.svelte';
import type { CompilePipeline } from '$lib/workspace/compilePipeline.svelte';
import type { DraftController } from '$lib/draft/draftController.svelte';
import type { WorkspaceDoc } from './workspaceDoc.svelte';
import type { WorkspaceEditFlow } from './workspaceEditFlow.svelte';
import type { WorkspaceFiles } from './workspaceFiles.svelte';
import type { WorkspaceCompileState } from './workspaceCompileState.svelte';

type StartupDeps = {
	guest: boolean;
	hostMode: boolean;
	wsdoc: WorkspaceDoc;
	editFlow: WorkspaceEditFlow;
	files: WorkspaceFiles;
	cc: WorkspaceCompileState;
	compiler: CompilePipeline;
	draftCtl: DraftController;
	commentsCtl: CommentsController;
	layout: PaneLayout;
	termDock: TerminalDockState;
};

/** no folder open (e.g. hard navigation): sends the user back to the start screen */
export function startWorkspace(d: StartupDeps): (() => void) | undefined {
	const { wsdoc, editFlow, files, layout, termDock, hostMode, guest } = d;
	const { doc, modes, diff } = wsdoc;
	const { saver, unsaved } = editFlow;
	const root = workspaceRoot.current;
	if (!root) {
		navigate('/');
		return;
	}
	// register as this folder's window (covers reloads); a lost claim means another window
	// already owns the folder - that window was focused, this one goes back to Start.
	// a guest session owns no folder, so it neither claims nor sets up a terminal/main file.
	if (hostMode) {
		void claimWorkspace(root).then((c) => {
			if (!c.ok && workspaceRoot.current === root) {
				workspaceRoot.current = null;
				navigate('/');
			}
		});
		files.mainPrompt.resolve(root); // storage first, before anything can want a compile
		// Nothing can reach the last session's undo backups: the stack is memory-only, so they
		// became unreachable when the window closed. Purging on open (rather than on close) also
		// means they outlive a crash, and the files themselves are in the recycle bin regardless.
		void purgeUndoBackups(root).catch(() => {});
		void files.folder.initProject(root);
	}
	tabs.bind(root, hostMode); // restore this folder's open tabs (guests start fresh)
	docPositions.bind(root, hostMode); // and where the caret was in each of them
	if (guest) layout.pdfPaneOpen = true; // guests land with the host's PDF visible
	files.loadRefs(root);
	void files.refreshTree();
	initSpellcheckConfig(); // seed editorConfigStore so the spell-check toggle works

	layout.restore(); // loadExistingPdf refills the preview if it was open last
	termDock.restore();
	modes.restore();
	diff.restoreLayout();

	function reloadReferences() {
		const r = workspaceRoot.current;
		if (r) void files.loadRefs(r);
	}
	const detachListeners = attachWindowListeners({
		refreshTree: () => void files.refreshTree(),
		reloadReferences,
		isHost: () => hostMode,
		checkExternalChange: () => void editFlow.external.check(),
		runCompile: () => d.compiler.runCompile(),
		onWindowResize: layout.reclampPdf,
		reloadProjectState: () => {
			// both live in .texpile/ and both are committed, so both arrive by pull
			void d.commentsCtl.refresh();
			void projectConfig.refresh(guest ? null : workspaceRoot.current).then(() => {
				d.cc.resolveNow();
			});
		}
	});
	const offBeforeClose = attachCloseGuard({
		promptIsOpen: () => !!unsaved.prompt,
		canCloseSilently: () => editFlow.autosaveActive() || !doc.path || saver.pending?.path !== doc.path,
		flushSaves: () => saver.flushAndWait(),
		confirmLeaveUnsaved: () => editFlow.confirmLeaveUnsaved()
	});
	return () => {
		offBeforeClose?.();
		detachListeners();
		d.compiler.dispose();
		saver.cancelTimer();
		d.draftCtl.dispose();
	};
}
