// The workspace's outward integrations: the MCP command surface and window-state cache,
// shared-session handlers, cross-file project intel, the label/bibitem registries, editor
// file access + graphics resolution, Zotero citations, and source-control actions.
import { fileMode } from '$lib/workspace/fileMode.svelte';
import { untrack } from 'svelte';
import { publishWindowState } from '$lib/workspace/mcpPublish';
import { attachMcpCommands } from '$lib/workspace/mcpCommands';
import { attachSessionHandlers } from '$lib/collab/workspaceSession';
import { DocRegistries } from '$lib/workspace/docRegistries.svelte';
import { ScmActions } from '$lib/workspace/scm/actions/scmActions.svelte';
import { ChangeBaseline } from '$lib/workspace/changeBaseline.svelte';
import { gitHead, gitHeldBack, gitOperation, gitTracking, isGitRepo } from '$lib/workspace/scm/gitStore';
import { canSwitchBranch } from '$lib/workspace/scm/branches/gitBranches';
import { gitignoreLines } from '$lib/workspace/buildArtifacts';
import { provideScmHandlers } from '$lib/workspace/scm/actions/scmHandlers.svelte';
import { ScmFetch } from '$lib/workspace/scm/remote/scmFetch.svelte';
import { AutoCheck } from '$lib/workspace/scm/actions/scmAutoCheck.svelte';
import { LocalHistoryActions, provideLocalHistoryActions } from '$lib/workspace/localHistory/localHistoryActions.svelte';
import { addLocalHistory } from '$lib/workspace/localHistory/localHistory.svelte';
import { joinPath } from '$lib/workspace/fileSystem';
import { refreshProjectIntel } from '$lib/workspace/projectIntel';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { trailingDebounce } from '$lib/trailingDebounce';
import { mathMacrosFor } from '$lib/editor/source/extensions/math-preview/userMacros';
import { setMathMacros } from '$lib/editor/visual/extensions/mathlivebridge/mathMacros.svelte';
import { retypesetStaticMath } from '$lib/editor/visual/extensions/mathlivebridge/mathStatic';
import { bibPathsFrom } from '$lib/collab/compileIntelBridge';
import { flattenPaths } from '$lib/workspace/refUpdate';
import { setGraphicResolver } from '$lib/languages/latex/intellisense/hover';
import { graphicCandidateUrls, graphicSearchDirs } from '$lib/editor/visual/graphicsCandidates';
import { setEditorFileAccess, setEditorGraphicDirs } from '$lib/editor/visual/fileAccess';
import { insertCitationFromZotero, zoteroAvailable, type ZoteroInsertDeps } from '$lib/zotero/insertFromZotero';
import { doiLookupAvailable } from '$lib/cite/citeByDoi';
import { citeByDoi as citeByDoiDialog } from '$lib/cite/citeByDoiState.svelte';
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
	openFile,
	isDirty,
	mainFile,
	setLastFile,
	effectiveCompileFormat,
	savedSuggesting
} from '$lib/workspace/workspaceStore';
import { suggesting } from '$lib/comments/activeSuggestions.svelte';
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
	// source control ops live in lib/workspace/scm/actions/scmActions.svelte.ts; the panel is presentational.
	readonly scm: ScmActions;
	/** the open file in the last saved version, for the source editor's change bars */
	readonly changeBaseline = new ChangeBaseline();

	constructor(private d: IntegrationDeps) {
		const { wsdoc } = d;
		const { doc, modes } = wsdoc;
		this.registries = new DocRegistries({
			getSource: () => doc.texSource,
			captureHistory: (text) => modes.history.capture(text)
		});
		this.scm = new ScmActions({
			getLoadedPath: () => doc.path,
			discardPendingSave: () => d.editFlow().saver.discard(),
			detachPendingSave: () => d.editFlow().saver.detach(),
			hasPendingSave: () => !!d.editFlow().saver.pending,
			flushPendingSave: () => d.editFlow().saver.flushAndWait(),
			// the Trash where there is one: a file never saved as a version has no other copy anywhere
			trashEntry: async (p) => {
				const root = workspaceRoot.current;
				if (!d.provider.trash || !root) return 'kept';
				return (await d.provider.trash(p, root, true)).kept ? 'kept' : 'trashed';
			},
			removeEntry: async (p) => {
				await d.provider.remove(p);
			},
			refreshTree: () => d.files().refreshTree(),
			loadFile: (path) => d.wsdoc.loadFile(path),
			captureDiffSnapshot: () => void d.wsdoc.diff.snapshot(),
			isDiffMode: () => !!activeCompare.current,
			openCompareTab: (path, compare) => {
				const key = tabs.openCompare(path, compare);
				d.editFlow().activateTab(tabs.find(key) ?? { path, compare });
			},
			openAtLine: (path, line) => d.nav().showSourceLine(path, line),
			settleConflicts: () => {
				if (d.wsdoc.doc.leaveConflicts() && modes.mode === 'visual') d.wsdoc.rebuildVisualFromSource();
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

		// what the panel's rows, its branch bar and the palette ask of Source Control, while this workspace is open
		// the Timeline's Local History commands, with the same hands on the editor Source Control has
		const history = new LocalHistoryActions({
			getLoadedPath: () => doc.path,
			flushPendingSave: () => d.editFlow().saver.flushAndWait(),
			whenSaved: () => d.editFlow().saver.whenIdle(),
			detachPendingSave: () => d.editFlow().saver.detach(),
			readTextIfPresent: async (p) => {
				try {
					return await d.provider.readText(p);
				} catch {
					return null;
				}
			},
			writeText: (p, content) => d.provider.writeText(p, content),
			loadFile: (path) => d.wsdoc.loadFile(path),
			openCompareTab: (path, compare) => {
				const key = tabs.openCompare(path, compare);
				d.editFlow().activateTab(tabs.find(key) ?? { path, compare });
			}
		});
		$effect(() => provideLocalHistoryActions(history));
		const fetcher = new ScmFetch(this.scm);
		// co-authors' new versions, looked for every few minutes while this project is open
		const autoCheck = new AutoCheck({ isBusy: () => this.scm.busy, sync: () => void this.scm.sync() });
		$effect(() => {
			// again for each folder opened in this window: checked soon after it opens, as the first
			// was, with nothing the last one announced counted against it
			void workspaceRoot.current;
			autoCheck.start();
			return autoCheck.stop;
		});
		$effect(() =>
			provideScmHandlers({
				ignore: (paths) => void this.scm.ignoreFiles(paths),
				checkForNew: () => void fetcher.checkForNew(),
				compare: (path) => this.scm.openDiff(path),
				hasUpstream: () => !!gitTracking.current,
				keepSide: (path, side) => void this.scm.combine.keepSide(path, side),
				chooseWhole: (path, choose) => void this.scm.combine.chooseWhole(path, choose),
				// not a repository above the folder the author has not agreed to use: its branches are not this project's
				canSwitchBranch: () => isGitRepo.current && !gitHeldBack.current && canSwitchBranch(),
				listBranches: () => this.scm.branches.list(),
				switchBranch: (name) => void this.scm.branches.switchTo(name)
			})
		);

		// again whenever HEAD moves: the file's last saved version is then a different one; when a
		// merge starts or ends, since a file being combined has no marks; and when the author chooses
		// to use a repository above the folder, whose HEAD may be the one already read
		$effect(() => {
			const path = doc.path;
			void gitHead.current;
			void isGitRepo.current;
			void gitOperation.current;
			void gitHeldBack.current;
			untrack(() => void this.changeBaseline.load(path));
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
				openFile,
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
				applyCompile: (command, outputs) => d.compileSettings().applyCommand(command, outputs),
				comments: {
					comments: d.commentsCtl,
					getLoadedPath: () => doc.path,
					getBuffer: () => doc.buffer,
					adoptDiskChange: () => d.editFlow().external.check()
				}
			})
		);
		// shared session: guests can ask for a compile; leaving the workspace ends the session
		$effect(() =>
			attachSessionHandlers(d.session(), {
				runCompile: () => void d.compiler().runCompile(),
				isBusy: () => d.compiler().busy,
				refreshTree: () => void d.files().refreshTree(),
				expectedPdfPath: () => d.compiler().expectedPdfPath(),
				recordGuestEdit: (rel, before, after, edit) => d.commentsCtl.remoteEdit(rel, before, after, edit),
				beforeGuestWrite: async (rel, content) => {
					await d.commentsCtl.beforeRemoteWrite(rel, content);
					// what the session writes for guests, kept like a save of the host's own: a guest's edits to a
					// file the host never opens would otherwise have no copy at all
					const root = workspaceRoot.current;
					if (root) void addLocalHistory(joinPath(root, rel), content, 'shared');
				},
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
			if (root && path && !fileMode.current) setLastFile(root, path);
		});
		// a new folder starts blank: the previous folder's log, PDF and macros are meaningless here
		// (the switch now flips the root before its scan, so these would otherwise linger on screen)
		$effect(() => {
			const root = workspaceRoot.current; // dependency: re-run per folder
			void fileMode.current; // and when a lone file takes over a folder already open in this window
			// untracked: resolveNow reads mainFile/compileConfig, and tracking those would replay
			// this whole reset (blank PDF, dock steal) on a mere main-file or live-mode change
			untrack(() => {
				suggesting.current = !!root && savedSuggesting(root);
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
			// tracked: a finished compile rewrites the .aux, and the \ref chips read their numbers
			// from it. Without this they would show the previous compile's numbering until the file
			// list happened to change.
			void d.compiler().runsFinished;
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
				guest && session.compileIntel
					? {
							numbers: session.compileIntel.auxNumbers,
							pages: session.compileIntel.auxPages,
							kinds: session.compileIntel.auxKinds,
							titles: session.compileIntel.auxTitles
						}
					: null;
			if (fileMode.current) return;
			void refreshProjectIntel(texList, bibs, guest ? null : aux, active ?? null, (p) => d.provider.readText(p), sharedAux).then(() => {
				if (live && !guest) d.cc().share();
			});
		});
		// the document's own \newcommand definitions, so the visual editor's maths renders them
		// instead of showing the macro name. Debounced and change-checked: the scan is over the
		// whole file, and a real change re-typesets every equation on screen.
		const refreshMathMacros = trailingDebounce(400, (source: string) => {
			if (setMathMacros(mathMacrosFor(source))) retypesetStaticMath();
		});
		$effect(() => {
			// both sources the dictionary merges: this file's definitions and the other files'
			const source = doc.texSource;
			void projectIntelStore.current;
			refreshMathMacros(source);
			return () => refreshMathMacros.cancel();
		});
		// visual-editor file access (figure previews, image paste) resolves through the provider,
		// so a guest's images come from the session blob cache and uploads go through the session.
		// \includegraphics hover preview: candidate texfile:// URLs; the tooltip's img advances past misses
		$effect(() => {
			setEditorFileAccess(
				(p) => d.provider.fileUrl(p),
				(p, blob) => d.provider.writeBinary(p, blob)
			);
			function searchOpts() {
				return { root: workspaceRoot.current, loadedPath: doc.path, source: doc.texSource };
			}
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
		void insertCitationFromZotero(this.citeDeps());
	}

	// Cite by DOI (see lib/cite): the Zotero gate without Zotero - the entry lands in the same
	// bibliography, so the open file must still be written in the main's language.
	// citeByDoiEnabled gates every entry point through this one predicate, as zoteroEnabled does
	canCiteByDoi(): boolean {
		const kind = this.d.wsdoc.doc.kind;
		return (
			settings.current.citeByDoiEnabled !== false &&
			!this.d.guest() &&
			doiLookupAvailable() &&
			!!mainFile.current &&
			(this.d.typstPreview().mainIsTypst ? kind === 'typ' : kind === 'tex')
		);
	}

	citeByDoi(): void {
		if (this.canCiteByDoi()) citeByDoiDialog.show(this.citeDeps());
	}

	private citeDeps(): ZoteroInsertDeps {
		const { doc } = this.d.wsdoc;
		return {
			kind: doc.kind as 'tex' | 'typ',
			root: workspaceRoot.current ?? '',
			openDoc: () => ({ path: doc.path, text: doc.buffer })
		};
	}
}
