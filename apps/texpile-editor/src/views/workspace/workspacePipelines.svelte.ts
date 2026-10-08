// Constructs the compile-side pipeline stack in one place: the compile-command state, draft
// mode's controller, the Typst live preview, the compile pipeline, and the jump/sync router.
import { fileMode } from '$lib/workspace/fileMode.svelte';
import { DraftController } from '$lib/draft/draftController.svelte';
import { TypstPreviewController } from '$lib/languages/typst/preview/previewController.svelte';
import { TypstDocumentStream } from '$lib/languages/typst/intellisense/typstDocumentStream';
import { typstExport } from '$lib/languages/typst/export/dialog/typstExportState.svelte';
import { CompilePipeline } from '$lib/workspace/compilePipeline.svelte';
import { projectConfigSync as projectConfig, compileConfig } from '$lib/workspace/projectConfigSync.svelte';
import { texFiles, mainFile, workspaceRoot } from '$lib/workspace/workspaceStore';
import { settings } from '$lib/settings';
import { WorkspaceCompileState } from './workspaceCompileState.svelte';
import { WorkspaceNav } from './workspaceNav.svelte';
import type { WorkspaceDoc } from './workspaceDoc.svelte';
import type { WorkspaceEditFlow } from './workspaceEditFlow.svelte';
import type { WorkspaceFiles } from './workspaceFiles.svelte';
import type { PaneLayout } from '$lib/workspace/paneLayout.svelte';
import type { TerminalDockState } from '$lib/workspace/terminalDockState.svelte';
import type { EditSession } from '$lib/collab/editSession';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';

type PipelineDeps = {
	provider: WorkspaceProvider;
	session: () => EditSession;
	guest: () => boolean;
	wsdoc: WorkspaceDoc;
	editFlow: () => WorkspaceEditFlow;
	files: () => WorkspaceFiles;
	layout: () => PaneLayout;
	termDock: () => TerminalDockState;
	openCompileModal: () => void;
};

export function createWorkspacePipelines(d: PipelineDeps) {
	const { doc, modes } = d.wsdoc;
	function statFile(p: string) {
		return d.provider.stat(p);
	}

	// the resolved compile command and its follower effects live in ./workspaceCompileState.svelte.ts
	const cc: WorkspaceCompileState = new WorkspaceCompileState({
		doc,
		guest: d.guest,
		session: d.session,
		compiler: () => compiler,
		typstPreview: () => typstPreview,
		statFile
	});
	// Draft mode, whole: root/main derivation, triggers, pause, the per-edit dispatcher, and
	// the engine lifecycle live in the controller; the preview chain gets this ONE object.
	const draftCtl: DraftController = new DraftController({
		compileCommand: () => cc.command,
		// hold the first live compile until the main file is confirmed
		mainConfirmed: () => d.files().mainPrompt.confirmed === true,
		pdfPaneOpen: () => !fileMode.current && d.layout().pdfPaneOpen,
		setPdfPaneOpen: (open) => d.layout().setPdfPaneOpen(open),
		openCompileModal: d.openCompileModal,
		getSource: () => doc.texSource,
		getLoadedPath: () => doc.path,
		flushSaves: () => d.editFlow().saver.flushAndWait()
	});
	// the Typst live preview, whole: task lifecycle, caret follow, forward sync, the guest
	// stream relay, and its Problems feed live in languages/typst/preview/previewController.svelte.ts
	// (Typst's Preview does NOT go dark while hosting, unlike draft mode: the preview's data
	// plane is relayed to guests over the session - see collab/previewRelay.svelte.ts.)
	const typstPreview: TypstPreviewController = new TypstPreviewController({
		getGuest: d.guest,
		getMainFile: () => mainFile.current,
		getPreviewSwitchOn: () => compileConfig.current.typst.preview,
		getTexFileCount: () => texFiles.current.length,
		getPaneOpen: () => d.layout().pdfPaneOpen,
		setPaneOpen: (open) => d.layout().setPdfPaneOpen(open),
		setPreviewSwitch: (root, on) => projectConfig.setTypstPreview(root, on),
		getDocPath: () => doc.path,
		getFollow: () => settings.current.typstPreviewFollow === true,
		getVisualCaretSourcePos: (): { line: number; character: number } | null => nav.visualCaretSourcePos(),
		syncJumpToFileLine: (file: string, line: number, column?: number) => nav.syncJumpToFileLine(file, line, undefined, column)
	});
	// tinymist's copy of the open .typ, which is what the preview renders, kept equal to the buffer
	// in the visual editor too. A guest's file is on the host's server, kept by the host
	const typstStream = new TypstDocumentStream({
		getRoot: () => workspaceRoot.current,
		getOpenTypstFile: () => (!d.guest() && doc.kind === 'typ' && !doc.binaryWarning ? doc.path : null),
		getText: () => doc.texSource
	});
	// the Export dialog (languages/typst/export) saves and refreshes through this workspace while it
	// is up; a guest has no tinymist of its own to export with
	$effect(() => {
		if (d.guest()) return;
		typstExport.connect({ flushSaves: () => d.editFlow().saver.flushAndWait(), refreshTree: () => void d.files().refreshTree() });
		return () => typstExport.connect(null);
	});
	// compile / terminal / PDF-watch orchestration lives in lib/workspace/compilePipeline.svelte.ts
	const compiler: CompilePipeline = new CompilePipeline({
		getLoadedPath: () => doc.path,
		getCompileCommand: () => cc.command,
		terminalAvailable: () => d.termDock().available,
		mainConfirmed: () => d.files().mainPrompt.confirmed,
		commandPending: () => !!projectConfig.pending,
		getSession: d.session,
		getDock: () => d.termDock().dock,
		stat: statFile,
		readText: (p) => d.provider.readText(p),
		create: (p: string, type: 'file' | 'dir') => d.provider.create(p, type, ''),
		fileUrl: (p) => d.provider.fileUrl(p),
		flushSaves: () => d.editFlow().saver.flushAndWait(),
		refreshTree: () => d.files().refreshTree(),
		mountDock: () => d.termDock().mountHidden(),
		setPdfPaneOpen: (open: boolean) => d.layout().setPdfPaneOpen(open),
		openCompileModal: d.openCompileModal,
		openMainConfirm: (then) => void d.files().mainPrompt.prompt(then),
		fileExists: async (p) => (await d.provider.stat(p)).exists,
		clearMainFile: () => void d.files().applyMainFile(null),
		// the Compile button doubles as the draft status (live / paused)
		runDraftCompile: () => draftCtl.compile(),
		openTypstPreview: () => typstPreview.enable(),
		shareCompileState: () => cc.share()
	});
	// every jump route (SyncTeX forward/inverse, visual caret mapping, include targets, the PDF
	// pane scroll plumbing) lives in ./workspaceNav.svelte.ts
	const nav: WorkspaceNav = new WorkspaceNav({
		doc,
		modes,
		kind: () => doc.kind,
		guest: d.guest,
		setPdfPaneOpen: (open) => d.layout().setPdfPaneOpen(open),
		getDraftRoot: () => draftCtl.root,
		syncDraftTo: (page, x, y, w, h) => draftCtl.view?.syncTo(page, x, y, w, h),
		expectedPdfPath: () => compiler.expectedPdfPath(),
		typstSyncForward: () => typstPreview.syncForward(),
		typstSyncToLine: (line) => typstPreview.syncToLine(line),
		statFile
	});
	return { cc, draftCtl, typstPreview, typstStream, compiler, nav };
}
