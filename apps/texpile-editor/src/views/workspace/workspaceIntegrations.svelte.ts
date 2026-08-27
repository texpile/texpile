// The workspace's outward integrations: the MCP command surface and window-state cache,
// shared-session handlers, cross-file project intel, the label/bibitem registries, editor
// file access + graphics resolution, Zotero citations, and source-control actions.
import { untrack } from 'svelte';
import { publishWindowState } from '$lib/workspace/mcpPublish';
import { attachMcpCommands } from '$lib/workspace/mcpCommands';
import { attachSessionHandlers } from '$lib/collab/workspaceSession';
import { DocRegistries } from '$lib/workspace/docRegistries.svelte';
import { ScmActions } from '$lib/workspace/scmActions.svelte';
import { gitignoreLines } from '$lib/workspace/buildArtifacts';
import { refreshProjectIntel } from '$lib/workspace/projectIntel';
import { bibPathsFrom } from '$lib/collab/compileIntelBridge';
import { flattenPaths } from '$lib/workspace/refUpdate';
import { setGraphicResolver } from '$lib/languages/latex/intellisense/hover';
import { graphicCandidateUrls, graphicSearchDirs } from '$lib/editor/visual/graphicsCandidates';
import { setEditorFileAccess, setEditorGraphicDirs } from '$lib/editor/visual/fileAccess';
import { insertCitationFromZotero, zoteroAvailable } from '$lib/zotero/insertFromZotero';
import { libraryAvailable, libraryStore } from '$lib/library/libraryStore.svelte';
import { libraryPicker } from '$lib/library/libraryPickerState.svelte';
import { libraryManager } from '$lib/library/libraryManagerState.svelte';
import { compileLog } from '$lib/stores/compileLogStore';
import { pdfStore } from '$lib/stores/pdfStore';
import { filePathStore } from '$lib/stores/editorStore';
import { references } from '$lib/workspace/citations';
import { tabs } from '$lib/workspace/tabs.svelte';
import {
	workspaceRoot,
	texFiles,
	fileTree,
	activeFilePath,
	activeCompare,
	isDirty,
	mainFile,
	setLastFile,
	effectiveCompileFormat
} from '$lib/workspace/workspaceStore';
import { settings } from '$lib/settings';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import type { EditSession } from '$lib/collab/editSession';
import type { CompilePipeline } from '$lib/workspace/compilePipeline.svelte';
import type { CompileSettings } from '$lib/workspace/compileSettings.svelte';
import type { TypstPreviewController } from '$lib/languages/typst/preview/previewController.svelte';
import type { CommentsController } from '$lib/workspace/commentsController.svelte';
import type { WorkspaceDoc } from './workspaceDoc.svelte';
import type { WorkspaceNav } from './workspaceNav.svelte';
import type { WorkspaceFiles } from './workspaceFiles.svelte';
import type { WorkspaceCompileState } from './workspaceCompileState.svelte';
import type { WorkspaceEditFlow } from './workspaceEditFlow.svelte';

type IntegrationDeps = {
	provider: WorkspaceProvider;
	session: () => EditSession;
	guest: () => boolean;
	wsdoc: WorkspaceDoc;
	editFlow: () => WorkspaceEditFlow;
	nav: () => WorkspaceNav;
	files: () => WorkspaceFiles;
	cc: () => WorkspaceCompileState;
	compiler: () => CompilePipeline;
	typstPreview: () => TypstPreviewController;
	compileSettings: () => CompileSettings;
	commentsCtl: CommentsController;
	setDockView: (v: 'terminal' | 'problems' | 'comments') => void;
};

export class WorkspaceIntegrations {
	// label and bibitem registries live in lib/workspace/docRegistries.svelte.ts
	readonly registries: DocRegistries;
	// source control ops live in lib/workspace/scmActions.svelte.ts; the panel is presentational.
	readonly scm: ScmActions;

	constructor(private d: IntegrationDeps) {
		const { wsdoc } = d;
		const { doc, modes } = wsdoc;
		// the personal library backs the @ picker and citation completion, so it loads with the
		// workspace rather than on the first picker open (a one-file read; load() is idempotent)
		if (libraryAvailable()) void libraryStore.load();
		this.registries = new DocRegistries({
			getSource: () => doc.texSource,
			captureHistory: (text) => modes.history.capture(text)
		});
		this.scm = new ScmActions({
			getLoadedPath: () => doc.path,
			discardPendingSave: () => d.editFlow().saver.discard(),
			deleteEntry: (p) => d.provider.remove(p),
			refreshTree: () => d.files().refreshTree(),
			loadFile: (path) => d.wsdoc.loadFile(path),
			captureDiffSnapshot: () => void d.wsdoc.diff.snapshot(),
			isDiffMode: () => !!activeCompare.current,
			openCompareTab: (path, compare) => {
				const key = tabs.openCompare(path, compare);
				d.editFlow().activateTab(tabs.find(key) ?? { path, compare });
			},
			ignoreLines: () => gitignoreLines(effectiveCompileFormat(mainFile.current)),
			writeText: (p, content) => d.provider.writeText(p, content),
			readTextIfPresent: async (p) => {
				try {
					return await d.provider.readText(p);
				} catch {
					return null; // no .gitignore yet: this is the first one
				}
			}
		});

		// Keep main's cache of what this window shows current, for the MCP get_editor_state tool.
		// The dependencies have to be named HERE: buildWindowState reads everything untracked,
		// deliberately. Tracking modes.mode alone froze the cache: set_main_file left mainFile null
		// for the rest of the session, and `dirty` went stale after an edit. publishWindowState
		// de-dupes identical payloads, so this costs nothing.
		$effect(() => {
			void mainFile.current;
			void activeFilePath.current;
			void isDirty.current;
			void settings.current;
			void tabs.list;
			publishWindowState(modes.mode);
		});
		// the MCP tools that need this window: get_unsaved / get_diagnostics answer here, and the
		// steer commands (open_file, show_diff, set_view_mode) run through the same paths the UI uses
		$effect(() =>
			attachMcpCommands({
				getLoadedPath: () => doc.path,
				getBuffer: () => doc.buffer,
				openFile: (abs) => {
					activeFilePath.current = abs;
				},
				openFileAtLine: (abs, line) => d.nav().openFileAtLine(abs, line),
				showDiff: () => modes.set('diff'),
				setViewMode: (mode) => modes.set(mode),
				getViewMode: () => modes.mode,
				syncToLine: (line) => d.nav().syncToLine(line),
				runCompile: () => d.compiler().runCompile(),
				setMainFile: (abs) => d.files().applyMainFile(abs),
				isCompiling: () => d.compiler().busy,
				getCompileCommand: () => d.cc().command,
				// deferred through compileSettings so an MCP change persists exactly the way the dialog's
				// Save does - folder command, global default, folder output overrides
				applyCompile: (command, outputs) => d.compileSettings().applyCommand(command, outputs)
			})
		);
		// shared session: guests can ask for a compile; leaving the workspace ends the session
		$effect(() =>
			attachSessionHandlers(d.session(), {
				runCompile: () => void d.compiler().runCompile(),
				isBusy: () => d.compiler().busy,
				refreshTree: () => void d.files().refreshTree(),
				expectedPdfPath: () => d.compiler().expectedPdfPath(),
				applyCommentEvent: (event) => void d.commentsCtl.ingest(event),
				commentLog: () => d.commentsCtl.store.serialize(),
				typstScrollForGuest: (rel, line, character) => d.typstPreview().scrollForGuest(rel, line, character)
			})
		);
		// keep the label registry, the embedded bibitem refs, and the cross-mode undo history fresh
		$effect(() => {
			void doc.texSource; // dependency: re-arm the debounce on every source change
			return this.registries.schedule();
		});
		$effect(() => this.registries.publish(this.allReferences));
		$effect(() => {
			const tree = fileTree.current;
			const root = workspaceRoot.current;
			filePathStore.current = root ? flattenPaths(tree, root) : [];
		});
		// remember the open file per folder so reopening the workspace restores it (StartView's
		// initialFile); recorded on every switch, kept when the file later disappears (existence is
		// checked at restore time)
		$effect(() => {
			const root = workspaceRoot.current;
			const path = activeFilePath.current;
			if (root && path) setLastFile(root, path);
		});
		// a new folder starts blank: the previous folder's log, PDF and macros are meaningless here
		// (the switch now flips the root before its scan, so these would otherwise linger on screen)
		$effect(() => {
			void workspaceRoot.current; // dependency: re-run per folder
			// untracked: resolveNow reads mainFile/compileConfig, and tracking those would replay
			// this whole reset (blank PDF, dock steal) on a mere main-file or live-mode change
			untrack(() => {
				compileLog.current = null;
				pdfStore.current = null; // initProject's loadExistingPdf refills it for the new folder
				wsdoc.projectMacros = '';
				d.setDockView('terminal');
				d.compiler().resetForFolder(); // any pollers still watching the previous folder's paths stand down
				d.cc().resolveNow();
			});
		});
		// cross-file intel (labels/defs/glossary/outlines/aux numbers from the OTHER project files):
		// rescan when the file list, main file, or active file changes - those are the only times the
		// non-active files' on-disk state can have moved under us (a switch flushes the previous save)
		$effect(() => {
			const texList = texFiles.current;
			const main = mainFile.current;
			const active = activeFilePath.current;
			const tree = fileTree.current;
			const root = workspaceRoot.current;
			const session = d.session();
			const guest = d.guest();
			const bibs = root ? bibPathsFrom(flattenPaths(tree, root), root) : [];
			// the .aux sits next to the log (output/aux dirs included); fall back to a main-sibling .aux.
			// untracked: expectedLogPath reads compileConfig, and a config edit alone (output dir,
			// live-mode toggle) must not trigger a full intel rescan - the deps named above cover it
			const aux =
				untrack(() => d.compiler().expectedLogPath())?.replace(/\.log$/i, '.aux') ?? (main ? main.replace(/\.tex$/i, '.aux') : null);
			// a guest has no aux on disk; the host's shared parse fills the numbers in (and re-runs
			// this when a fresh compile lands). Reading session.active also seeds the host's share
			// when a session starts against an already-compiled project.
			const live = session.active;
			const sharedAux =
				guest && session.compileIntel ? { numbers: session.compileIntel.auxNumbers, pages: session.compileIntel.auxPages } : null;
			void refreshProjectIntel(texList, bibs, guest ? null : aux, active ?? null, (p) => d.provider.readText(p), sharedAux).then(() => {
				if (live && !guest) d.cc().share();
			});
		});
		// visual-editor file access (figure previews, image paste) resolves through the provider,
		// so a guest's images come from the session blob cache and uploads go through the session.
		// \includegraphics hover preview: candidate texfile:// URLs; the tooltip's img advances past misses
		$effect(() => {
			setEditorFileAccess(
				(p) => d.provider.fileUrl(p),
				(p, blob) => d.provider.writeBinary(p, blob)
			);
			const searchOpts = () => ({ root: workspaceRoot.current, loadedPath: doc.path, source: doc.texSource });
			setGraphicResolver((rel) => graphicCandidateUrls(rel, { ...searchOpts(), fileUrl: (p) => d.provider.fileUrl(p) }));
			// the rendered image node resolves through the same directories, so a figure cannot
			// preview on hover and 403 in the document
			setEditorGraphicDirs(() => graphicSearchDirs(searchOpts()));
			return () => {
				setGraphicResolver(null);
				setEditorGraphicDirs(null);
				setEditorFileAccess(null, null);
			};
		});
	}

	get allReferences() {
		void references.current; // re-derive when the folder's .bib entries change
		return this.registries.merged;
	}

	// Zotero citations (host-only; see lib/zotero)
	// The open file's dialect must match the main's engine: the imported entries land in the
	// bibliography the MAIN file declares, so a .typ scratch file open in a LaTeX project has
	// nowhere sensible to point its citation.
	// zoteroEnabled gates every entry point (editor context menu, command palette) through this one predicate
	canZoteroCite(): boolean {
		const kind = this.d.wsdoc.doc.kind;
		return (
			settings.current.zoteroEnabled !== false &&
			!this.d.guest() &&
			zoteroAvailable() &&
			!!mainFile.current &&
			(this.d.typstPreview().mainIsTypst ? kind === 'typ' : kind === 'tex')
		);
	}

	insertZoteroCitation(): void {
		if (!this.canZoteroCite()) return;
		const { doc } = this.d.wsdoc;
		void insertCitationFromZotero({
			kind: doc.kind as 'tex' | 'typ',
			root: workspaceRoot.current ?? '',
			openDoc: () => ({ path: doc.path, text: doc.buffer })
		});
	}

	// The personal bibliography (lib/library): same gates as Zotero minus the settings toggle -
	// the library needs nothing external. Desktop-only by bridge, host-only in a shared session,
	// and the open file's dialect must match the main's engine because the entries land in the
	// bibliography the MAIN file declares.
	canCiteFromLibrary(): boolean {
		const kind = this.d.wsdoc.doc.kind;
		return (
			!this.d.guest() && libraryAvailable() && !!mainFile.current && (this.d.typstPreview().mainIsTypst ? kind === 'typ' : kind === 'tex')
		);
	}

	insertFromLibrary(): void {
		if (!this.canCiteFromLibrary()) return;
		const { doc } = this.d.wsdoc;
		libraryPicker.show({
			kind: doc.kind as 'tex' | 'typ',
			root: workspaceRoot.current ?? '',
			openDoc: () => ({ path: doc.path, text: doc.buffer })
		});
	}

	// managing the library touches only userData, so it needs no project and no main file; a
	// guest must not edit the host's personal library though
	canManageLibrary(): boolean {
		return !this.d.guest() && libraryAvailable();
	}

	openLibraryManager(): void {
		if (this.canManageLibrary()) libraryManager.show();
	}
}
