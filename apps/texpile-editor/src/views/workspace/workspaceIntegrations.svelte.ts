// The workspace's outward integrations: the MCP command surface and window-state cache,
// shared-session handlers, cross-file project intel, the label/bibitem registries, editor
// file access + graphics resolution, Zotero citations, and source-control actions.
import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { capsOf, fileMode } from '$lib/workspace/fileMode.svelte';
import { untrack } from 'svelte';
import { publishWindowState } from '$lib/workspace/mcpPublish';
import { attachMcpCommands } from '$lib/workspace/mcpCommands';
import { attachSessionHandlers } from '$lib/collab/workspaceSession';
import { DocRegistries } from '$lib/workspace/docRegistries.svelte';
import { ScmActions } from '$lib/workspace/scm/actions/scmActions.svelte';
import { ChangeBaseline } from '$lib/workspace/changeBaseline.svelte';
import { endMerge } from '$lib/editor/source/cmConflicts';
import { gitHead, gitHeldBack, gitOperation, gitTracking, isGitRepo } from '$lib/workspace/scm/gitStore';
import { canSwitchBranch } from '$lib/workspace/scm/branches/gitBranches';
import { canCombine } from '$lib/workspace/scm/branches/gitCombine';
import { gitignoreLines } from '$lib/workspace/buildArtifacts';
import { provideScmHandlers } from '$lib/workspace/scm/actions/scmHandlers.svelte';
import { ScmFetch } from '$lib/workspace/scm/remote/scmFetch.svelte';
import { AutoCheck } from '$lib/workspace/scm/actions/scmAutoCheck.svelte';
import { LocalHistoryActions, provideLocalHistoryActions } from '$lib/workspace/localHistory/localHistoryActions.svelte';
import { provideAgentHost } from '$lib/ai/agentPanel/agentHost.svelte';
import { provideFolderSwitch } from '$lib/workspace/openWorkspace';
import { closeAgentSessionWithWorkspace } from '$lib/ai/agentPanel/agentSession.svelte';
import { refreshProjectIntel } from '$lib/workspace/projectIntel';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { trailingDebounce } from '$lib/trailingDebounce';
import { mathMacrosFor } from '$lib/editor/source/extensions/math-preview/userMacros';
import { setMathMacros } from '$lib/editor/visual/extensions/mathlivebridge/mathMacros.svelte';
import { retypesetStaticMath } from '$lib/editor/visual/extensions/mathlivebridge/mathStatic';
import { bibPathsFrom } from '$lib/collab/compileIntelBridge';
import { compileOutDir } from '$lib/workspace/compileCommand';
import { flattenPaths } from '$lib/workspace/refUpdate';
import { setGraphicResolver } from '$lib/languages/latex/intellisense/hover';
import { graphicCandidateUrls, graphicSearchDirs } from '$lib/editor/visual/graphicsCandidates';
import { setEditorFileAccess, setEditorGraphicDirs } from '$lib/editor/visual/fileAccess';
import { insertCitationFromZotero, zoteroAvailable, type ZoteroInsertDeps } from '$lib/zotero/insertFromZotero';
import { doiLookupAvailable } from '$lib/cite/citeByDoi';
import { citeByDoi as citeByDoiDialog } from '$lib/cite/citeByDoiState.svelte';
import { compileLog } from '$lib/stores/compileLogStore';
import { pdfStore } from '$lib/stores/pdfStore';
import { filePathStore, sourceCmView } from '$lib/stores/editorStore';
import { references } from '$lib/workspace/citations';
import { LiveRefChecks } from '$lib/workspace/document/liveRefChecks.svelte';
import { tabs, type CompareRef } from '$lib/workspace/tabs.svelte';
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
	effectiveCompileFormat
} from '$lib/workspace/workspaceStore';
import { resumeSuggesting } from '$lib/identity/resumeSuggesting';
import { settings } from '$lib/settings';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import type { EditSession } from '$lib/collab/editSession';
import type { CompilePipeline } from '$lib/workspace/compilePipeline.svelte';
import type { CompileSettings } from '$lib/workspace/compileSettings.svelte';
import type { TypstPreviewController } from '$lib/languages/typst/preview/previewController.svelte';
import type { CommentsController } from '$lib/workspace/commentsController.svelte';
import { localHistorySuggestions } from '$lib/workspace/localHistory/localHistorySuggestions';
import type { WorkspaceDoc } from './workspaceDoc.svelte';
import type { WorkspaceNav } from './workspaceNav.svelte';
import type { WorkspaceFiles } from './workspaceFiles.svelte';
import type { WorkspaceCompileState } from './workspaceCompileState.svelte';
import type { WorkspaceEditFlow } from './workspaceEditFlow.svelte';
import type { DockView } from '$lib/terminal/dockView';
import type { WorkspaceComments } from './workspaceComments.svelte';
import { selectedSpan } from './selectedSpan';

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
	setDockView: (v: DockView) => void;
	/** for the selection the Agent tab sends */
	comments: WorkspaceComments;
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
		/** a comparison tab opened and focused; `replacing`: the version one of that file is against now, turned to this one */
		function openCompareTab(path: string, compare: CompareRef, replacing?: string) {
			const key = replacing ? tabs.replaceCompare(path, replacing, compare) : tabs.openCompare(path, compare);
			d.editFlow().activateTab(tabs.find(key) ?? { path, compare });
		}
		this.registries = new DocRegistries({
			getSource: () => doc.texSource
		});
		this.scm = new ScmActions({
			getLoadedPath: () => doc.path,
			// what git is about to rewrite drops its unwritten edits, so the reload after it takes the disk
			discardPendingSave: () => {
				if (doc.path) d.editFlow().saver.revert(doc.path);
			},
			detachPendingSave: () => d.editFlow().saver.detach(),
			heldUnder: (paths) => d.editFlow().saver.heldUnder(paths),
			takeHeldEdit: (p) => d.editFlow().saver.take(p),
			catchUpWithDisk: () => d.editFlow().saver.syncFromDisk(),
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
			openCompareTab,
			openAtLine: (path, line) => d.nav().showSourceLine(path, line),
			settleConflicts: () => {
				if (!d.wsdoc.doc.leaveConflicts()) return;
				sourceCmView.current?.dispatch({ effects: endMerge.of(null) });
				if (modes.mode === 'visual') d.wsdoc.rebuildVisualFromSource();
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
			heldUnder: (paths) => d.editFlow().saver.heldUnder(paths),
			takeHeldEdit: (p) => d.editFlow().saver.take(p),
			catchUpWithDisk: () => d.editFlow().saver.syncFromDisk(),
			readTextIfPresent: async (p) => {
				try {
					return await d.provider.readText(p);
				} catch {
					return null;
				}
			},
			writeText: (p, content) => d.provider.writeText(p, content),
			adoptDisk: () => d.editFlow().external.check(),
			...localHistorySuggestions(d.commentsCtl.suggestions),
			openCompareTab,
			// the file in front first, so closing the comparison does not move focus to a neighbour
			leaveCompareTab: (path, hash) => {
				d.editFlow().activateTab({ path });
				d.editFlow().closeTab({ path, compare: { hash, subject: '' } });
			}
		});
		$effect(() => provideLocalHistoryActions(history));
		// what the Agent tab asks of the open workspace: a file against its text before a turn, a file opened or put back, a
		// save, the selection
		$effect(() =>
			provideAgentHost({
				openCompareTab,
				openFile: (path) => d.nav().openFileAtLine(path, 1),
				writeText: (p, content) => d.provider.writeText(p, content),
				flushPendingSave: () => d.editFlow().saver.flushAndWait(),
				selection: () => selectedSpan({ comments: d.comments, doc: d.wsdoc.doc, modes: d.wsdoc.modes, kind: () => d.wsdoc.doc.kind })
			})
		);
		// Open in Workspace from a lone file: the full folder switch, which claims the folder and sets its project up
		$effect(() => provideFolderSwitch((root, want) => d.files().folder.open(root, want)));
		// here, not in the dock: a window turning to a lone file unmounts the dock before it could stop the agent
		closeAgentSessionWithWorkspace();
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
				switchBranch: (name) => void this.scm.branches.switchTo(name),
				canFinishMerge: () => gitOperation.current === 'merge' && !gitHeldBack.current && canCombine(),
				finishMerge: () => void this.scm.combine.finish(),
				abortMerge: () => void this.scm.combine.cancel()
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
				typstScrollForGuest: (rel, line, character) => d.typstPreview().scrollForGuest(rel, line, character)
			})
		);
		// keep the label registry and the embedded bibitem refs fresh
		$effect(() => {
			void doc.texSource; // dependency: re-arm the debounce on every source change
			return this.registries.schedule();
		});
		$effect(() => this.registries.publish(this.allReferences));
		const refChecks = new LiveRefChecks({
			read: (p) => d.provider.readText(p),
			open: () => (doc.path && doc.kind === 'tex' && !activeCompare.current ? { path: doc.path, text: doc.texSource } : null),
			main: () => mainFile.current,
			root: () => workspaceRoot.current,
			files: () => filePathStore.current,
			knownKeys: () => new Set(references.current.map((r) => r.key)),
			outDir: () => compileOutDir(d.cc().command),
			readTexBib: async (name) => (await window.texpileTypst?.texBib?.(name)) ?? null
		});
		// what the other files hold moves only when a file, the main file or the open file does
		$effect(() => {
			void fileTree.current;
			void mainFile.current;
			void doc.path;
			void activeCompare.current;
			void references.current;
			void workspaceRoot.current;
			untrack(() => void refChecks.refresh());
		});
		$effect(() => {
			void doc.texSource;
			void filePathStore.current;
			return untrack(() => refChecks.schedule());
		});
		$effect(() => () => refChecks.destroy());
		$effect(() => {
			const tree = fileTree.current;
			const root = workspaceRoot.current;
			filePathStore.current = root ? flattenPaths(tree, root) : [];
		});
		// remember the focused tab per folder so reopening the workspace restores it (StartView's
		// initialFile); recorded on every switch, kept when the file later disappears (existence is
		// checked at restore time)
		$effect(() => {
			const root = workspaceRoot.current;
			const path = activeFilePath.current;
			const compare = activeCompare.current;
			// an editor in a window of its own is not where the folder reopens
			if (root && path && !fileMode.current && !untrack(() => editorGroups.focused.window)) setLastFile(root, path, compare);
		});
		// a new folder starts blank: the previous folder's log, PDF and macros are meaningless here
		// (the switch now flips the root before its scan, so these would otherwise linger on screen)
		$effect(() => {
			const root = workspaceRoot.current; // dependency: re-run per folder
			void fileMode.current; // and when a lone file takes over a folder already open in this window
			// untracked: resolveNow reads mainFile/compileConfig, and tracking those would replay
			// this whole reset (blank PDF, dock steal) on a mere main-file or live-mode change
			untrack(() => {
				resumeSuggesting(root);
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
			if (!capsOf(d.provider).project) return;
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
	// zoteroEnabled gates every entry point (editor context menu, command palette) through this one predicate
	canZoteroCite(): boolean {
		return settings.current.zoteroEnabled !== false && !this.d.guest() && zoteroAvailable() && this.citesHere();
	}

	// entries land in the main file's bibliography, so only a file in the main file's language cites
	private citesHere(): boolean {
		// a lone file has no project bibliography: the first references.bib in its folder belongs to some other paper
		if (!capsOf(this.d.provider).project) return false;
		const { kind, path } = this.d.wsdoc.doc;
		if (!path || (kind !== 'tex' && kind !== 'typ')) return false;
		return !mainFile.current || (this.d.typstPreview().mainIsTypst ? kind === 'typ' : kind === 'tex');
	}

	insertZoteroCitation(): void {
		if (this.canZoteroCite() && !this.needsMain(() => this.insertZoteroCitation())) void insertCitationFromZotero(this.citeDeps());
	}

	// the main file is usually picked at the first compile; until then a citation has nowhere to go
	private needsMain(retry: () => void): boolean {
		if (mainFile.current) return false;
		toaster.warning({
			title: m.cite_needs_main_title(),
			description: m.cite_needs_main_desc(),
			action: { label: m.wsview_pane_pick_main(), onClick: () => void this.d.files().mainPrompt.prompt(retry) }
		});
		return true;
	}

	// Cite by DOI (see lib/cite): the Zotero gate without Zotero - the entry lands in the same
	// bibliography
	canCiteByDoi(): boolean {
		return settings.current.citeByDoiEnabled !== false && !this.d.guest() && doiLookupAvailable() && this.citesHere();
	}

	citeByDoi(): void {
		if (this.canCiteByDoi() && !this.needsMain(() => this.citeByDoi())) citeByDoiDialog.show(this.citeDeps());
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
