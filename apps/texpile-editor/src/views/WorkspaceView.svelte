<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { navigate } from '$lib/router.svelte';
	import WorkspaceModals from '$lib/editor/comp/WorkspaceModals.svelte';
	import WorkspaceMain from '$lib/editor/comp/WorkspaceMain.svelte';
	import WorkspaceChrome from '$lib/editor/comp/WorkspaceChrome.svelte';
	import { type RefUpdate } from '$lib/editor/comp/RefUpdateModal.svelte';
	import { compileLog } from '$lib/stores/compileLogStore';
	import {
		shareCompileState as shareHostCompileState,
		bibPathsFrom,
		guestCompileLog,
		guestDiagnosticsFor,
		hostDiagnosticsFor
	} from '$lib/collab/compileIntelBridge';
	import DraftView from '$lib/draft/DraftView.svelte';
	import GlobalSearch from '$lib/editor/comp/GlobalSearch.svelte';
	import TutorialConfirmModal from '$lib/editor/comp/TutorialConfirmModal.svelte';
	import type { Starter, ImportedFile } from '$lib/workspace/starters';
	import { StarterActions } from '$lib/workspace/starterActions.svelte';
	import { editorViewStore } from '$lib/stores/editorStore';
	import { tabs } from '$lib/workspace/tabs.svelte';
	import { SyncTexNav, sessionRelativeTarget, needsActivate, normSyncPath } from '$lib/workspace/syncTexNav';
	import { sourceTocStore } from '$lib/editor/extensions/tableofcontents/tocStore';
	import { parseOutlineRaw, assembleProjectOutline } from '$lib/editor/extensions/tableofcontents/latexHeadings';
	import { refreshProjectIntel } from '$lib/workspace/projectIntel';
	import { projectIntelStore } from '$lib/stores/projectIntel';
	import { setGraphicResolver } from '$lib/editor/extensions/intellisense/hover';
	import { graphicCandidateUrls } from '$lib/editor/graphicsCandidates';
	import { setEditorFileAccess } from '$lib/editor/fileAccess';
	import { initSpellcheckConfig } from '$lib/editor/extensions/spellcheck/spellcheckConfig';
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import { visualCollabBridge, attachSessionHandlers } from '$lib/collab/workspaceSession';
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import type { EditSession } from '$lib/collab/editSession';
	import SessionShareModal from '$lib/collab/SessionShareModal.svelte';
	import VisualCollab from '$lib/collab/VisualCollab.svelte';
	import { references, loadReferences } from '$lib/workspace/citations';
	import { DocRegistries } from '$lib/workspace/docRegistries.svelte';
	import { filePathStore } from '$lib/stores/editorStore';
	import { trailingDebounce } from '$lib/trailingDebounce';
	import {
		openGlobalSearch as openSearchPanel,
		closeGlobalSearch as closeSearchPanel,
		runFormat,
		insertIncludeAtCursor,
		jumpToInclude as jumpToIncludeTarget
	} from '$lib/workspace/editorCommands';
	import { DiffMode } from '$lib/workspace/diffMode.svelte';
	import { attachWindowListeners, attachCloseGuard } from '$lib/workspace/workspaceMount';
	import { ViewModeSwitch } from '$lib/workspace/viewModeSwitch.svelte';
	import { PaneLayout } from '$lib/workspace/paneLayout.svelte';
	import { TerminalDockState } from '$lib/workspace/terminalDockState.svelte';
	import { CompileSettings } from '$lib/workspace/compileSettings.svelte';
	import { ExternalChangeWatcher } from '$lib/workspace/externalChange.svelte';
	import { FolderLifecycle } from '$lib/workspace/folderLifecycle';
	import { UnsavedGuard } from '$lib/workspace/unsavedGuard.svelte';
	import { DraftDispatcher } from '$lib/draft/draftDispatcher';
	import { createKeydownHandler, uiZoomIn, uiZoomOut, uiZoomReset } from '$lib/workspace/shortcuts';
	import { MainFilePrompt } from '$lib/workspace/mainFilePrompt.svelte';
	import { scanRenamedRefs, applyRefUpdate, flattenPaths } from '$lib/workspace/refUpdate';
	import {
		workspaceRoot,
		texFiles,
		fileTree,
		activeFilePath,
		isDirty,
		mainFile,
		setMainFile,
		setLastFile
	} from '$lib/workspace/workspaceStore';
	import { refreshGitStatus } from '$lib/workspace/gitStore';
	import { refreshTree as refreshTreeState } from '$lib/workspace/treeRefresh';
	import { ScmActions } from '$lib/workspace/scmActions.svelte';
	import { SavePipeline } from '$lib/workspace/savePipeline.svelte';
	import { CompilePipeline, resolveCompileCommand, relFromRoot } from '$lib/workspace/compilePipeline.svelte';
	import { TreeOps } from '$lib/workspace/treeOps';
	import { settings, loadSettings, updateSettings } from '$lib/settings';
	import { detectMainFile, gatherProjectMacros } from '$lib/workspace/project';
	import { basename, dirname, claimWorkspace, isDesktop, samePath, native, type TreeEntry } from '$lib/workspace/fileSystem';
	import { diskProvider } from '$lib/workspace/diskProvider';
	import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
	// the file-access seam: the host gets the disk-backed provider by default; a guest session
	// mounts this same view with a CRDT-backed one. caps gate the host-only features.
	let { provider = diskProvider, session = collabHost }: { provider?: WorkspaceProvider; session?: EditSession } = $props();
	// all file access flows through the provider; these thin delegates keep the existing call sites
	// (and scan's wrapped {root,...} shape) intact
	const readTextFile = (p: string) => provider.readText(p);
	const writeTextFile = (p: string, content: string) => provider.writeText(p, content);
	const writeBinaryFile = (p: string, data: Blob) => provider.writeBinary(p, data);
	const statFile = (p: string) => provider.stat(p);
	const fileUrl = (p: string) => provider.fileUrl(p);
	const createEntry = (p: string, type: 'file' | 'dir', content = '') => provider.create(p, type, content);
	const deleteEntry = (p: string) => provider.remove(p);
	const renameEntry = (from: string, to: string) => provider.rename(from, to);
	const copyEntry = (from: string, to: string) => provider.copy(from, to);
	const formatLatexDocument = (p: string, text: string) => provider.format!(p, text);
	const scanTexFiles = async (root: string) => ({ root, files: await provider.scanTexFiles(root) });
	// citations read through the provider too, so guest sessions resolve \cite keys from the shared doc
	const loadRefs = (root: string) => loadReferences(root, { scan: (r, e) => provider.scanFiles(r, e), read: readTextFile });
	// true for the disk-backed host; false for a read-only guest session. Gates the host-only
	// lifecycle (folder claim, terminal, main-file/macro scan, on-disk change checks) so this same
	// view can run over a shared session.
	const hostMode = $derived(provider.caps.manageTree);
	// a guest session: host chrome (compile/terminal/git/file-ops/share) hidden
	const guest = $derived(session.isGuest);
	// guests never enter diff (no disk/git to diff against); visual is fine, it runs on the
	// shared Y.Text like everything else
	$effect(() => {
		if (guest && modes.mode === 'diff') modes.mode = 'source';
	});
	// guests: resolve the main file + cross-file macro context from the shared doc (the host-only
	// initProject never runs for them), re-gathered when the shared file set changes, so visual
	// parses see the project's custom macro signatures and can't mis-serialize a guest edit
	$effect(() => {
		if (!guest || !session.active) return;
		void session.manifestRev;
		const root = get(workspaceRoot);
		if (!root) return;
		void (async () => {
			try {
				const files = await provider.scanTexFiles(root);
				const main = await detectMainFile(files, provider.readText);
				const macros = main ? await gatherProjectMacros(main, root, provider.readText) : '';
				if (macros === projectMacros) return;
				projectMacros = macros;
				// signatures changed: a doc parsed without them is stale, re-derive the open one
				parser.lastParsedSource = '';
				if (doc.path && kind === 'tex' && modes.mode === 'visual') rebuildVisualFromSource();
			} catch {
				projectMacros = '';
			}
		})();
	});
	import { modLabel } from '$lib/platform';
	import { DocumentBuffer, fileKind } from '$lib/workspace/documentBuffer.svelte';
	import { FileOpener } from '$lib/workspace/fileOpener';
	import { VisualParser, type ParseFailure } from '$lib/workspace/visualParse.svelte';
	import type { Node as PMNode } from 'prosemirror-model';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { m } from '$lib/paraglide/messages';

	// single source of truth for a .tex file: its raw text (doc.texSource), the whole file. the visual
	// editor is a view over it: entry parses into doc.visualDoc + doc.docMeta, every visual edit serializes
	// straight back into doc.texSource, and source mode binds to it directly. no rival copy can drift.
	// mirror to the global store so menuBarCommands can route Insert/Format;
	// diff is read-only, so routing it as source is harmless
	$effect(() => modes.syncStore());

	// diff view (read-only): committed HEAD vs the live buffer, snapshotted (not bound)
	// on entry / file switch / manual refresh so it never re-diffs per keystroke
	// worker parse + sequencing live in lib/workspace/visualParse.svelte.ts
	const parser = new VisualParser(() => projectMacros);
	const tryParseVisual = (text: string) => parser.parse(text);

	// the open file's buffers and edit handlers live in lib/workspace/documentBuffer.svelte.ts
	const doc = new DocumentBuffer({
		scheduleSave: (path, content) => saver.schedule(path, content),
		discardQueuedSave: () => saver.discard(),
		writeNow: (path, content) => void saver.enqueue(path, content, true),
		rebuildVisual: () => rebuildVisualFromSource(),
		isVisualMode: () => modes.mode === 'visual',
		noteLocalEdit: () => visualCollab?.noteLocalEdit(),
		clearPendingAnchor: () => (modes.pendingVisualAnchor = null)
	});

	// view mode, scroll anchors and cross-mode history live in lib/workspace/viewModeSwitch.svelte.ts
	const modes = new ViewModeSwitch({
		getKind: () => kind,
		getLoadedPath: () => doc.path,
		getSource: () => doc.texSource,
		setSource: (t) => (doc.texSource = t),
		getDocMeta: () => doc.docMeta,
		getLastParsedSource: () => parser.lastParsedSource,
		rebuildVisual: () => rebuildVisualFromSource(),
		captureDiffSnapshot: () => void captureDiffSnapshot(),
		scheduleSave: (path, text) => saver.schedule(path, text)
	});
	const sourceHistory = modes.history;
	const setViewMode = (mode: 'visual' | 'source' | 'diff') => modes.set(mode);
	const exitDiff = () => modes.exitDiff();
	const workspaceHistoryStep = (dir: 'undo' | 'redo') => modes.historyStep(dir);
	// the doc.visualDoc dep re-fires this when an async re-parse lands (the doc swap itself is untracked)
	$effect(() => {
		void $editorViewStore;
		void doc.visualDoc;
		void modes.pendingVisualAnchor;
		void modes.mode;
		modes.tryResolvePendingAnchor();
	});

	// HEAD-vs-working-copy view; state and snapshotting live in lib/workspace/diffMode.svelte.ts
	const diff = new DiffMode({
		getLoadedPath: () => doc.path,
		getWorkingText: () => (kind === 'tex' ? doc.texSource : doc.rawContent)
	});
	const captureDiffSnapshot = () => diff.snapshot();
	// macro-defining text from the main file's include chain, fed to the parser (see workspace/project.ts)
	let projectMacros = $state('');
	const folderEmpty = $derived($texFiles.length === 0);
	// lets the header's New file/folder buttons trigger the tree's inline create input
	let fileTreeRef = $state<{ newAtRoot: (type: 'file' | 'dir' | 'include', defaultName?: string) => void; isEditing: () => boolean }>();

	const kind = $derived(doc.kind);
	// a guest opening a text-looking file the host shares as name only (too large / extension the
	// session doesn't sync): say so instead of rendering a silently empty editor
	const nameOnly = $derived(guest && (kind === 'tex' || kind === 'bib' || kind === 'text') && session.sharedKindOf(doc.path) === 'binary');

	// shared session: a file the host holds in a NON-Y-bound editor is host-exclusive (guests go
	// read-only), else concurrent guest edits to that file's Y.Text would be clobbered. Source mode
	// (tex/bib/text) is Y-bound and co-edits freely; visual tex consumes remote edits through the
	// re-parse patcher (runRemotePatch below), so only bib held in BibManager still locks.
	function hostHoldsExclusively(k: string, mode: string, path: string | null): boolean {
		if (!path) return false;
		return k === 'bib' && mode !== 'source';
	}
	$effect(() => {
		if (!session.active) return;
		session.setVisualLock(hostHoldsExclusively(kind, modes.mode, doc.path) ? doc.path : null);
	});
	// live/draft mode isn't supported in a shared session: guests can't run the incremental engine,
	// they see the host's compiled PDF. Force it off while hosting (the toggle is disabled there too).
	$effect(() => {
		if (session.active && !guest && $settings.draftMode) updateSettings({ draftMode: false });
	});

	// starter templates + file import live in lib/workspace/starterActions.svelte.ts
	const starters = new StarterActions({
		loadRefs,
		refreshTree: () => refreshTree(),
		createEntry: (root, name, type) => treeOps.create(root, name, type)
	});
	const pickStarter = (s: Starter) => starters.pick(s);
	const importStarterFiles = (files: ImportedFile[]) => starters.importFiles(files);
	const newTexFile = () => starters.newTexFile();
	// File menu "New": inline create in the tree, pre-named for the chosen type
	function newFileOfType(ext?: string) {
		layout.sidebarOpen = true;
		fileTreeRef?.newAtRoot('file', starters.newFileName(ext));
	}

	// no folder open (e.g. hard navigation): send the user back to the start screen
	onMount(() => {
		const root = get(workspaceRoot);
		if (!root) {
			navigate('/');
			return;
		}
		// register as this folder's window (covers reloads); a lost claim means another window
		// already owns the folder - that window was focused, this one goes back to Start.
		// a guest session owns no folder, so it neither claims nor sets up a terminal/main file.
		if (hostMode) {
			void claimWorkspace(root).then((c) => {
				if (!c.ok && get(workspaceRoot) === root) {
					workspaceRoot.set(null);
					navigate('/');
				}
			});
			resolveMainConfirm(root); // storage first, before anything can want a compile
			void initProject(root);
		}
		tabs.bind(root, hostMode); // restore this folder's open tabs (guests start fresh)
		termDock.available = isDesktop() && hostMode; // client-only; set here so SSR/CSR agree
		if (guest) layout.pdfPaneOpen = true; // guests land with the host's PDF visible
		loadRefs(root);
		refreshTree();
		initSpellcheckConfig(); // seed editorConfigStore so the spell-check toggle works

		loadSettings().then((s) => {
			layout.restore(s); // loadExistingPdf refills the preview if it was open last
			compileCommand = resolveCompileCommand(get(workspaceRoot), s.compileCommand ?? '');
			termDock.restore(s);
		});
		modes.restore();
		diff.restoreLayout();

		const reloadReferences = () => {
			const r = get(workspaceRoot);
			if (r) void loadRefs(r);
		};
		const detachListeners = attachWindowListeners({
			refreshTree: () => void refreshTree(),
			reloadReferences,
			isHost: () => hostMode,
			checkExternalChange: () => void checkExternalChange(),
			runCompile: () => compiler.runCompile(),
			onWindowResize: layout.reclampPdf
		});
		const offBeforeClose = attachCloseGuard({
			promptIsOpen: () => !!unsaved.prompt,
			canCloseSilently: () => autosaveActive() || !doc.path || saver.pending?.path !== doc.path,
			flushSaves: () => saver.flushAndWait(),
			confirmLeaveUnsaved
		});
		return () => {
			offBeforeClose?.();
			detachListeners();
			compiler.dispose();
			saver.cancelTimer();
			deferredSourceToc.cancel();
			draftDispatcher.cancel();
		};
	});

	// every file that opens gains a tab (file tree, SyncTeX jumps, include links, restores)
	$effect(() => {
		const p = $activeFilePath;
		if (p) tabs.noteOpened(p);
	});

	function activateTab(path: string) {
		activeFilePath.set(path);
	}
	// closing the active tab activates its neighbor; the load effect runs the usual save guards.
	// When that guard will prompt, the tab must survive until the dialog resolves (the store
	// reverts to it meanwhile), so the removal is deferred to the held-switch resolution.
	let pendingTabClose: string | null = null;
	function closeTab(path: string) {
		const active = get(activeFilePath);
		if (active && samePath(active, path)) {
			if (!autosaveActive() && saver.pending && samePath(saver.pending.path, path)) pendingTabClose = path;
			activeFilePath.set(tabs.neighborOf(path));
			if (pendingTabClose) return;
		}
		tabs.close(path);
	}

	// tree rescan + manifest sync + git refresh live in lib/workspace/treeRefresh.ts
	const refreshTree = () =>
		refreshTreeState({
			provider,
			session,
			isEditingTree: () => !!fileTreeRef?.isEditing?.()
		});

	// the shared file set changes under a guest whenever the host adds, renames or deletes a file.
	// The provider exposes a watch hook for exactly this; without it the tree only ever reflected
	// what was there at join time.
	onMount(() => provider.watch?.(() => void refreshTree()));

	function openEntry(entry: TreeEntry) {
		if (entry.type !== 'file') return;
		activeFilePath.set(entry.path);
	}

	const folder = new FolderLifecycle({
		scanTexFiles,
		confirmLeaveUnsaved: () => confirmLeaveUnsaved(),
		flushSaves: () => saver.flush(),
		flushSavesAndWait: () => saver.flushAndWait(),
		sessionActive: () => session.active,
		endSession: () => session.end(),
		hostMode: () => hostMode,
		refreshTree,
		loadRefs,
		resolveMainConfirm: (root) => resolveMainConfirm(root),
		setMainConfirmed: (v) => (mainPrompt.confirmed = v),
		loadExistingPdf: () => void compiler.loadExistingPdf(),
		setProjectMacros: (macros) => (projectMacros = macros),
		resetTerminals: () => resetTerminalsForWorkspace()
	});
	const openFolderFromMenu = (path?: string) => folder.open(path);
	const closeWorkspace = () => folder.close();
	const openTutorial = (root: string) => folder.openTutorial(root);
	const initProject = (root: string) => folder.initProject(root);
	let tutorialModalOpen = $state(false);

	// persist the new main file, re-gather macros, and re-derive the open visual doc from
	// doc.texSource so the newly resolved command signatures take effect immediately
	async function applyMainFile(path: string) {
		const root = get(workspaceRoot);
		if (!root) return;
		const next = $mainFile && samePath($mainFile, path) ? null : path; // click the current main again to clear
		setMainFile(root, next);
		mainPrompt.confirmed = true; // an explicit choice (set or clear) settles the first-compile question
		void compiler.loadExistingPdf(); // the main file changed â†’ its expected PDF did too
		projectMacros = next ? await gatherProjectMacros(next, root) : '';
		if (get(workspaceRoot) !== root) return;
		if (doc.path && kind === 'tex' && modes.mode === 'visual') rebuildVisualFromSource();
	}

	// create/rename/delete/move/import/copy live in lib/workspace/treeOps.ts
	const treeOps = new TreeOps({
		create: createEntry,
		remove: deleteEntry,
		rename: renameEntry,
		copy: copyEntry,
		writeBinary: writeBinaryFile,
		stat: statFile,
		refreshTree,
		loadRefs,
		// source-mode users write their own preamble (the editor's ghost offers the skeleton);
		// visual mode has no ghost and no way to write a preamble, so it gets one up front
		wantsStarter: () => modes.lastEditMode !== 'source',
		insertIncludeAtCursor: (path) => doInsertInclude(path),
		afterRename: (oldPath, newPath) => void afterRename(oldPath, newPath),
		retargetPendingSave: (from, to) => saver.retarget(from, to),
		discardPendingSave: () => saver.discard()
	});

	// $state (not const) because descendants bind into these objects' fields: svelte needs an
	// assignable, reactive target to keep the ownership chain intact. Class instances are not
	// proxied by $state, so the objects themselves behave exactly as they would unwrapped.
	let layout = $state(new PaneLayout());

	const showToc = $derived(!!doc.path && kind === 'tex' && (modes.mode === 'visual' || modes.mode === 'source'));
	// source mode has no ProseMirror plugin to feed the outline, so parse headings from the raw
	// .tex; \input fragments pre-scanned into projectIntel merge into one numbered project outline.
	// debounced (display-only) and reading state LIVE at fire time, so typing never pays the parse.
	const deferredSourceToc = trailingDebounce<void>(300, () => {
		if (kind !== 'tex' || modes.mode !== 'source') return;
		sourceTocStore.set(
			assembleProjectOutline(
				parseOutlineRaw(doc.texSource),
				doc.path,
				doc.path ? dirname(doc.path) : null,
				get(workspaceRoot),
				get(projectIntelStore).outlines
			)
		);
	});
	$effect(() => {
		void doc.texSource;
		void $projectIntelStore;
		if (kind === 'tex' && modes.mode === 'source') deferredSourceToc();
	});
	// dock visibility/height/shrink live in lib/workspace/terminalDockState.svelte.ts
	let termDock = $state(new TerminalDockState(() => guest));
	const showTerminal = () => termDock.show();
	const toggleTerminal = () => termDock.toggle();
	const toggleTerminalShrink = () => termDock.toggleShrink();
	const resetTerminalsForWorkspace = () => termDock.resetForWorkspace();
	const newTerminalFromMenu = () => termDock.newTerminal();

	let compileCommand = $state(''); // the compile command; {main} expands to the main file's path
	let formatModalOpen = $state(false);
	let formatting = $state(false);
	// PDF preview pane; opens automatically once a compile writes a fresh PDF
	const dockShrunk = $derived(termDock.shrink && layout.pdfPaneOpen);
	// bottom dock body: the terminal shells (always mounted) or the Problems list
	let dockView = $state<'terminal' | 'problems'>('terminal');
	// Draft mode: bump to trigger a DraftView recompile; the derived root/main feed it.
	let draftTrigger = $state(0);
	let draftRoot = $derived($workspaceRoot ?? '');
	let draftMainRel = $derived.by(() => {
		if (mainPrompt.confirmed !== true) return ''; // hold the first live compile until the main file is confirmed
		const target = $mainFile ?? doc.path;
		return $workspaceRoot && target ? relFromRoot(target, $workspaceRoot) : '';
	});

	// First-compile main-file confirmation. Overleaf never shows the concept, so a silent
	// guess confuses people coming from it: multi-file folders with no explicitly chosen
	// main ask ONCE, with the detected file preselected; confirming persists it exactly
	// like the file tree's "Set as main file" (star badge included).
	// Tri-state: null = unresolved for the current folder; the modal never auto-opens on
	// null, so it can't flash while initProject is still scanning. Storage is consulted
	// SYNCHRONOUSLY on folder open (resolveMainConfirm) - a folder with a saved choice is
	// confirmed before the first render.
	let mainPrompt = $state(
		new MainFilePrompt({
			loadExistingPdf: () => void compiler.loadExistingPdf(),
			setProjectMacros: (macros) => (projectMacros = macros),
			releaseHeldDraftCompile: () => draftTrigger++
		})
	);
	const resolveMainConfirm = (root: string | null) => mainPrompt.resolve(root);
	const openMainConfirm = (then?: () => void) => mainPrompt.prompt(then);
	// live mode compiles on its own as soon as the pane is open; surface the question then.
	// Strictly `=== false`: null means initProject is still resolving, never a modal.
	$effect(() => {
		const wants = $settings.draftMode && layout.pdfPaneOpen && !draftPaused && !!$workspaceRoot && $texFiles.length > 1;
		if (wants && mainPrompt.confirmed === false && !mainPrompt.open) void mainPrompt.prompt();
	});
	// Draft mode live preview: ONE decision point per edit (the spec's "decide when to
	// incrementally compile vs recompile"). Diff against the last-compiled source: if exactly
	// one prose paragraph changed, patch it INSTANTLY (no debounce -- DraftView.instantPatch
	// coalesces via its own in-flight guard, so continuous typing streams patches at the
	// daemon's pace rather than only updating when you pause). Any structural change debounces
	// a full recompile. Only while the preview pane is open; the compile reads from disk.
	let draftRef = $state<DraftView | null>(null);
	// per-edit patch-vs-recompile decision lives in lib/draft/draftDispatcher.ts
	const draftDispatcher = new DraftDispatcher({
		getSource: () => doc.texSource,
		getLoadedPath: () => doc.path,
		isActive: () => $settings.draftMode && layout.pdfPaneOpen && !!doc.path && !draftPaused,
		flushSaves: () => saver.flushAndWait(),
		triggerFullCompile: () => draftTrigger++,
		getTarget: () => draftRef
	});
	const runDraftDecision = () => draftDispatcher.run();

	// Stop the warm engine when draft mode is off, no preview is open, or the folder changed
	// -- otherwise it keeps a lualatex process (100-300MB with a heavy preamble) alive for the
	// whole session. It re-warms in ~1.5s on the next compile. draftStop is a no-op if no
	// daemon is running, so it's safe to call eagerly.
	let daemonActive = false;
	let daemonRoot: string | null = null;
	$effect(() => {
		const active = $settings.draftMode && layout.pdfPaneOpen && !draftPaused;
		const root = $workspaceRoot;
		if (daemonActive && (!active || root !== daemonRoot)) native()?.draftStop?.();
		daemonActive = active;
		daemonRoot = root;
	});

	// signal reads inside runDraftDecision are tracked through this synchronous call
	$effect(() => {
		runDraftDecision();
	});
	// Draft mode leans on the on-disk file staying current: the full compile reads from disk,
	// Live mode and hosting a session both need current-on-disk content (the draft engine writes
	// nothing until a recompile; a session's host is the persistence authority). So autosave is
	// forced effectively on in both, WITHOUT changing the user's setting (it reverts on exit).
	// The Preferences toggle shows this as forced+disabled.
	function autosaveActive(): boolean {
		const s = get(settings);
		return s.autosave !== false || s.draftMode || (session.active && !guest);
	}

	// a new folder's diagnostics start blank, the previous folder's log is meaningless here
	$effect(() => {
		const root = $workspaceRoot;
		compileLog.set(null);
		dockView = 'terminal';
		compiler.resetForFolder(); // any pollers still watching the previous folder's paths stand down
		compileCommand = resolveCompileCommand(root, get(settings).compileCommand);
	});
	// guests: surface the host's shared compile diagnostics through the same Problems UI the
	// host has (the raw log never crosses the wire; this rebuilds the parsed shape from intel)
	// guests: surface the host's shared compile diagnostics through the same Problems UI the host
	// has (see lib/collab/compileIntelBridge.ts)
	$effect(() => {
		if (!guest) return;
		compileLog.set(guestCompileLog(session.compileIntel, Date.now()));
	});

	// last compile's problems for the file open in source mode
	const sourceDiagnostics = $derived.by(() =>
		guest ? guestDiagnosticsFor(session.compileIntel, doc.path) : hostDiagnosticsFor($compileLog, $workspaceRoot, doc.path)
	);

	// ref to the compile-pane PDF viewer, for SyncTeX forward search
	let pdfPaneRef = $state<{ scrollToPosition: (page: number, x: number, y: number, w?: number, h?: number) => void }>();
	// a SyncTeX-inverse / Find-in-Files jump. the token distinguishes repeat jumps to the same line
	// so the editor re-fires; selectText is the word double-clicked in the PDF, anchored on to
	// correct for line drift (see SourceEditor's gotoLine effect)
	let sourceGotoLine = $state<{ line: number; token: number; selectText?: string } | undefined>(undefined);
	let gotoToken = 0;

	// compile / terminal / PDF-watch orchestration lives in lib/workspace/compilePipeline.svelte.ts
	const compiler = new CompilePipeline({
		getLoadedPath: () => doc.path,
		getCompileCommand: () => compileCommand,
		terminalAvailable: () => termDock.available,
		mainConfirmed: () => mainPrompt.confirmed,
		getSession: () => session,
		getDock: () => termDock.dock,
		stat: statFile,
		readText: readTextFile,
		create: createEntry,
		fileUrl,
		flushSaves: () => saver.flushAndWait(),
		refreshTree,
		showTerminal,
		setDockView: (v) => (dockView = v),
		setPdfPaneOpen: (open: boolean) => layout.setPdfPaneOpen(open),
		openCompileModal: () => openCompileModal(),
		openMainConfirm: (then) => void openMainConfirm(then),
		runDraftCompile,
		shareCompileState: () => shareCompileState()
	});
	// Draft mode: preview via the incremental per-page engine instead of the terminal
	// command. Saves first (so the compile sees the buffer), opens the preview pane, and
	// bumps the trigger; DraftView runs the actual lualatex draft compile + per-page render.
	// Draft engine pause: keeps the last preview on screen but stops the warm lualatex and all
	// live dispatch. The Compile button doubles as the draft status (live / paused).
	let draftPaused = $state(false);
	function pauseDraft() {
		draftPaused = true; // the daemon-stop effect sees inactive and kills the engine
	}
	async function resumeDraft() {
		draftPaused = false;
		await runDraftCompile(); // re-sync (content may have drifted while paused) + re-warm
	}

	async function runDraftCompile() {
		if (!draftRoot || !draftMainRel) {
			openCompileModal();
			return;
		}
		draftPaused = false; // compiling implies live (covers the keyboard-shortcut path)
		await saver.flushAndWait();
		draftDispatcher.adoptCurrentAsBaseline(); // the live-edit effect must not recompile this same source
		layout.setPdfPaneOpen(true);
		draftTrigger++;
	}

	// share the current pdf + log once when we start hosting (see CompilePipeline.shareExistingOutputs)
	let outputsSharedForSession = false;
	$effect(() => {
		if (session.active && !session.isGuest) {
			if (!outputsSharedForSession) {
				outputsSharedForSession = true;
				void compiler.shareExistingOutputs();
			}
		} else {
			outputsSharedForSession = false;
		}
	});
	// not a guest (solo or host): if the folder already has a .log from a previous compile, load its
	// problems on open so they show without a recompile. Re-runs as the command + main file resolve
	// (they fix the log path); a real compile that fills the log first wins.
	let existingLogLoadedFor: string | null = null;
	$effect(() => {
		const root = $workspaceRoot;
		void compileCommand; // dep: the log path depends on the resolved command
		void $mainFile; // dep: and on the detected main file
		if (guest || !root) {
			existingLogLoadedFor = null;
			return;
		}
		if (existingLogLoadedFor === root) return;
		untrack(() => {
			if (get(compileLog)) {
				existingLogLoadedFor = root; // a compile already populated it
				return;
			}
			const logPath = compiler.expectedLogPath();
			if (!logPath) return; // command / main file not resolved yet; a later run retries
			existingLogLoadedFor = root;
			void (async () => {
				const s = await statFile(logPath);
				if (s.exists && s.size > 0 && get(workspaceRoot) === root && !get(compileLog)) {
					await compiler.publishLogDiagnostics(logPath, s.mtimeMs, true);
				}
			})();
		});
	});
	// open/close the PDF pane and remember the choice so a reload restores it
	function jumpPdf(page: number, x: number, y: number, w: number, h: number, tries = 0) {
		if (pdfPaneRef) {
			pdfPaneRef.scrollToPosition(page, x, y, w, h);
			return;
		}
		if (tries < 30) setTimeout(() => jumpPdf(page, x, y, w, h, tries + 1), 30); // wait for the pane to mount
	}
	// open a file in source mode and jump to a 1-based line (SyncTeX inverse + Find-in-Files)
	function openFileAtLine(file: string, line: number, selectText?: string) {
		const target = sessionRelativeTarget(file, guest);
		modes.mode = 'source';
		localStorage.setItem('texpile:viewMode', 'source');
		sourceGotoLine = { line, token: ++gotoToken, selectText };
		if (needsActivate(target)) activeFilePath.set(target);
	}
	// forward/inverse SyncTeX resolution lives in lib/workspace/syncTexNav.ts
	const syncTex = new SyncTexNav({
		isGuest: () => guest,
		getLoadedPath: () => doc.path,
		isTex: () => kind === 'tex',
		getDraftRoot: () => draftRoot,
		expectedPdfPath: () => compiler.expectedPdfPath(),
		setPdfPaneOpen: (open: boolean) => layout.setPdfPaneOpen(open),
		scrollPdfTo: jumpPdf,
		syncDraftTo: (page, x, y, w, h) => draftRef?.syncTo(page, x, y, w, h),
		openFileAtLine
	});
	const syncForwardLine = (line: number) => syncTex.forwardToLine(line);
	const syncForward = () => syncTex.forwardFromCursor();
	const onPdfDoubleClick = (page: number, x: number, y: number, selectText?: string) => syncTex.inverseFromClick(page, x, y, selectText);

	// compile-command dialog state lives in lib/workspace/compileSettings.svelte.ts
	let compileSettings = $state(
		new CompileSettings(
			() => compileCommand,
			(c) => (compileCommand = c),
			() => compiler.runCompile()
		)
	);
	const openCompileModal = () => compileSettings.open();
	const saveCompileCommand = (thenRun: boolean) => compileSettings.save(thenRun);
	const useDefaultCommand = () => compileSettings.useDefault();

	function openFormatModal() {
		if (!doc.path || kind !== 'tex') return;
		formatModalOpen = true;
	}
	const doRunFormat = () => {
		formatModalOpen = false;
		return runFormat({
			getLoadedPath: () => doc.path,
			getSource: () => doc.texSource,
			getEol: () => doc.eol,
			flushSaves: () => saver.flushAndWait(),
			format: formatLatexDocument,
			applyFormatted: (text) => doc.replaceSource(text, { dirty: true }),
			setBusy: (b) => (formatting = b)
		});
	};
	const doInsertInclude = (newFilePath: string) => insertIncludeAtCursor(newFilePath, doc.path, modes.mode === 'visual');

	// label and bibitem registries live in lib/workspace/docRegistries.svelte.ts
	const registries = new DocRegistries({
		getSource: () => doc.texSource,
		captureHistory: (text) => sourceHistory.capture(text)
	});
	const allReferences = $derived.by(() => {
		void $references; // re-derive when the folder's .bib entries change
		return registries.merged;
	});
	$effect(() => registries.publish(allReferences));

	$effect(() => {
		const tree = $fileTree;
		const root = $workspaceRoot;
		filePathStore.set(root ? flattenPaths(tree, root) : []);
	});

	// after a rename/move, find \includegraphics/\input across the project's .tex files
	// that pointed at the file (AST-based) and offer to repoint them
	let pendingRefUpdate = $state<RefUpdate | null>(null);

	const refUpdateDeps = {
		getLoadedPath: () => doc.path,
		getSourceText: () => doc.texSource,
		setSourceText: (t: string) => (doc.texSource = t),
		readText: readTextFile,
		writeText: writeTextFile,
		onActiveFileEdited: () => {
			if (modes.mode === 'visual') rebuildVisualFromSource();
			isDirty.set(true);
			saver.schedule(doc.path, doc.texSource);
		}
	};
	async function afterRename(oldPath: string, newPath: string) {
		pendingRefUpdate = await scanRenamedRefs(oldPath, newPath, refUpdateDeps);
	}
	async function doApplyRefUpdate() {
		const u = pendingRefUpdate;
		pendingRefUpdate = null;
		if (u) await applyRefUpdate(u, refUpdateDeps);
	}

	// remember the open file per folder so reopening the workspace restores it (StartView's
	// initialFile); recorded on every switch, kept when the file later disappears (existence is
	// checked at restore time)
	$effect(() => {
		const root = $workspaceRoot;
		const path = $activeFilePath;
		if (root && path) setLastFile(root, path);
	});

	// cross-file intel (labels/defs/glossary/outlines/aux numbers from the OTHER project files):
	// rescan when the file list, main file, or active file changes — those are the only times the
	// non-active files' on-disk state can have moved under us (a switch flushes the previous save)
	$effect(() => {
		const files = $texFiles;
		const main = $mainFile;
		const active = $activeFilePath;
		const tree = $fileTree;
		const root = $workspaceRoot;
		const bibs = root ? bibPathsFrom(flattenPaths(tree, root), root) : [];
		// the .aux sits next to the log (output/aux dirs included); fall back to a main-sibling .aux
		const aux = compiler.expectedLogPath()?.replace(/\.log$/i, '.aux') ?? (main ? main.replace(/\.tex$/i, '.aux') : null);
		// a guest has no aux on disk; the host's shared parse fills the numbers in (and re-runs
		// this when a fresh compile lands). Reading session.active also seeds the host's share
		// when a session starts against an already-compiled project.
		const live = session.active;
		const sharedAux =
			guest && session.compileIntel ? { numbers: session.compileIntel.auxNumbers, pages: session.compileIntel.auxPages } : null;
		void refreshProjectIntel(files, bibs, guest ? null : aux, active ?? null, readTextFile, sharedAux).then(() => {
			if (live && !guest) shareCompileState();
		});
	});

	const shareCompileState = () => shareHostCompileState(session, guest);

	// \includegraphics hover preview: candidate texfile:// URLs (current dir, root, and any
	// \graphicspath dirs, adding raster extensions when the path has none); the tooltip's img
	// advances past misses
	// the visual editor's shared-session machinery (remote patches, presence) lives in
	// VisualCollab; this api hands it doc-state access, the ref carries its editor hooks
	let visualCollab = $state<{ noteLocalEdit(): void; noteFreshParse(): void; publishCursor(): void } | null>(null);
	const visualCollabApi = visualCollabBridge({
		doc,
		parser,
		parse: (text) => tryParseVisual(text),
		scheduleSave: (path, content) => saver.schedule(path, content)
	});

	// visual-editor file access (figure previews, image paste) resolves through the provider,
	// so a guest's images come from the session blob cache and uploads go through the session
	setEditorFileAccess(
		(p) => provider.fileUrl(p),
		(p, data) => provider.writeBinary(p, data)
	);
	setGraphicResolver((rel) =>
		graphicCandidateUrls(rel, { root: get(workspaceRoot), loadedPath: doc.path, source: doc.texSource, fileUrl })
	);
	onDestroy(() => {
		setGraphicResolver(null);
		setEditorFileAccess(null, null);
	});

	// shared session: guests can ask for a compile; leaving the workspace ends the session
	let shareModalOpen = $state(false);
	onMount(() =>
		attachSessionHandlers(session, {
			runCompile: () => void compiler.runCompile(),
			refreshTree: () => void refreshTree(),
			expectedPdfPath: () => compiler.expectedPdfPath()
		})
	);

	// F12 on an \input{...} target: resolve like LaTeX would (current dir, then root, .tex added)
	const jumpToInclude = (name: string) => jumpToIncludeTarget(name, doc.path, statFile);
	// keep the label registry, the embedded bibitem refs, and the cross-mode undo history fresh
	$effect(() => {
		void doc.texSource; // dependency: re-arm the debounce on every source change
		return registries.schedule();
	});

	// unsaved-edit gate for both file switches and workspace-level exits; see lib/workspace/unsavedGuard.svelte.ts
	const unsaved = new UnsavedGuard({
		saver: () => saver,
		getLoadedPath: () => doc.path,
		getEol: () => doc.eol,
		autosaveActive,
		takePendingTabClose: () => {
			const p = pendingTabClose;
			pendingTabClose = null;
			return p;
		},
		clearPendingTabClose: () => (pendingTabClose = null)
	});
	const confirmLeaveUnsaved = () => unsaved.confirmLeave();

	// load the active file whenever it changes. Everything but the store read is untracked, so
	// this runs exactly once per path change (doc.path updating mid-load must not re-fire it).
	$effect(() => {
		const path = $activeFilePath;
		untrack(() => {
			// a workspace-level prompt (folder switch / close / window close) detached the pending
			// edit, so the guard below can't see it: park ALL file switches until it resolves, or a
			// Ctrl+Tab under the modal reattaches the edit against the wrong file
			if (unsaved.parksAllSwitches) {
				if (path !== doc.path) activeFilePath.set(doc.path);
				return;
			}
			// while the dialog is up, keep the UI parked on the outgoing file; remember the newest
			// destination (Ctrl+Tab still works under the modal) and resolve it after the answer
			if (unsaved.held) {
				if (path !== doc.path) {
					unsaved.held.target = path;
					activeFilePath.set(doc.path);
				}
				return;
			}
			// autosave off: the outgoing file's edit wasn't auto-written, so ask BEFORE switching.
			if (unsaved.needsPromptFor(path)) {
				unsaved.beginFileSwitch(path);
				return;
			}
			saver.flush(); // persist the outgoing file's queued edit before tearing down its buffers
			doc.loadError = null;
			// the outgoing file stays on screen until loadFile has the new one ready: clearing here
			// first is what made every switch blink through the "Opening…" placeholder
			if (path) loadFile(path);
			else closeOpenFile();
		});
	});

	/** drop the open file's buffers AND the per-file view state that must not leak into the next file */
	function closeOpenFile() {
		doc.close();
		clearPerFileViewState();
		sourceHistory.disable();
	}

	/** anchors are keyed to the outgoing file's text; a new file must never inherit them */
	function clearPerFileViewState() {
		modes.sourceScrollAnchor = null;
		modes.pendingVisualAnchor = null;
	}

	// opening the active file into the buffers lives in lib/workspace/fileOpener.ts
	const opener = new FileOpener({
		doc,
		parser,
		readText: readTextFile,
		whenIdle: () => saver.whenIdle(),
		isVisualMode: () => modes.mode === 'visual',
		isSourceMode: () => modes.mode === 'source',
		isDiffMode: () => modes.mode === 'diff',
		claimVisualLock: (path) => {
			if (session.active) session.setVisualLock(hostHoldsExclusively(fileKind(path), modes.mode, path) ? path : null);
		},
		beforeOpen: (path) => session.beforeOpen(path),
		parse: (text) => tryParseVisual(text),
		fallbackToSource,
		resetHistory: (text) => sourceHistory.reset(text),
		disableHistory: () => sourceHistory.disable(),
		clearPerFileViewState,
		captureDiffSnapshot: () => void captureDiffSnapshot(),
		closeOpenFile: () => closeOpenFile()
	});
	const loadFile = (path: string) => opener.open(path);

	// on-disk change detection + conflict resolution live in lib/workspace/externalChange.svelte.ts
	const external = new ExternalChangeWatcher({
		getLoadedPath: () => doc.path,
		isTextual: () => kind === 'tex' || kind === 'text' || kind === 'bib',
		isTex: () => kind === 'tex',
		whenIdle: () => saver.whenIdle(),
		readText: readTextFile,
		getDiskBaseline: () => doc.diskBaseline,
		setDiskBaseline: (t) => (doc.diskBaseline = t),
		getBuffer: () => (kind === 'tex' ? doc.texSource : doc.rawContent),
		setTexSource: (t) => (doc.texSource = t),
		setRawContent: (t) => (doc.rawContent = t),
		setEol: (e) => (doc.eol = e),
		rebuildVisual: rebuildVisualFromSource,
		discardQueuedSave: () => saver.discard(),
		sessionEdit: (path, content) => session.edit(path, content),
		saveNow: () => save()
	});
	const checkExternalChange = () => external.check();
	const resolveConflict = (choice: 'reload' | 'keep') => external.resolve(choice);

	// debounced autosave + serial write chain live in lib/workspace/savePipeline.svelte.ts
	const saver = new SavePipeline({
		sessionEdit: (path, content) => session.edit(path, content),
		isGuest: () => guest,
		autosaveActive,
		writeText: writeTextFile,
		getEol: () => doc.eol,
		getLoadedPath: () => doc.path,
		getLiveContent: () => (kind === 'tex' ? doc.texSource : doc.rawContent),
		setDiskBaseline: (content) => (doc.diskBaseline = content),
		setDirty: (dirty) => isDirty.set(dirty)
	});

	const onChange = (node: PMNode) => doc.onVisualChange(node);
	const editPreambleFrontmatter = (kind: string, inner: string) => doc.editFrontmatter(kind, inner);
	const onTexInput = (v: string) => doc.onTexInput(v);
	const onRawInput = (v: string) => doc.onRawInput(v);

	// source control ops live in lib/workspace/scmActions.svelte.ts; the panel is presentational.
	const scm = new ScmActions({
		getLoadedPath: () => doc.path,
		discardPendingSave: () => saver.discard(),
		deleteEntry,
		refreshTree,
		loadFile,
		captureDiffSnapshot: () => void captureDiffSnapshot(),
		isDiffMode: () => modes.mode === 'diff',
		enterDiffMode: () => (modes.mode = 'diff')
	});

	function fallbackToSource(failure: ParseFailure): void {
		modes.mode = 'source';
		doc.visualDoc = null;
		modes.pendingVisualAnchor = null; // never re-anchor a later visual entry off this failed switch
		if (failure.tooComplex) {
			toaster.warning({
				title: m.wsview_toast_too_complex_title(),
				description: m.wsview_toast_too_complex_desc({ count: failure.tooComplex.toLocaleString() })
			});
		} else if (failure.timeout) {
			toaster.warning({ title: m.wsview_toast_file_too_large_title() });
		} else {
			toaster.error({ title: m.wsview_toast_parse_failed_title(), description: failure.message });
		}
	}

	function rebuildVisualFromSource(): void {
		// fast path: source unchanged since the last successful parse, keep the mounted PM view
		if (doc.texSource === parser.lastParsedSource && doc.visualDoc) return;

		const mySeq = parser.nextSequence();
		void tryParseVisual(doc.texSource).then((o) => {
			if (!parser.isCurrent(mySeq)) return; // superseded
			if (o.failure) return fallbackToSource(o.failure);
			if (!o.parsed) return;
			doc.adoptParsed(o.parsed);
			// quirk: this records the CURRENT doc.texSource, which may be post-edit text if the user
			// typed while the parse was in flight. harmless: onChange clears the anchor on edits.
			parser.lastParsedSource = doc.texSource;
			visualCollab?.noteFreshParse(); // a full re-parse stamped everything fresh
			// EditorView reacts to the new localValue and swaps state on the existing instance: no remount, no flicker
		});
	}

	// manual save (Ctrl/Cmd+S or the Save button); autosave handles the rest
	const save = () => doc.save();

	let globalSearchRef = $state<GlobalSearch | null>(null);
	// Find in Files panel plumbing lives in lib/workspace/editorCommands.ts
	const searchDeps = {
		setSidebarView: (v: 'explorer' | 'search' | 'scm') => (layout.sidebarView = v),
		openSidebar: () => (layout.sidebarOpen = true),
		isSourceMode: () => modes.mode === 'source',
		focusInput: (seed?: string) => globalSearchRef?.focusInput(seed)
	};
	const openGlobalSearch = () => openSearchPanel(searchDeps);
	const closeGlobalSearch = () => closeSearchPanel(searchDeps);

	// the callback surface WorkspaceMain hands down to the topbar / editor / preview / dock
	const actions = {
		setViewMode,
		syncForward,
		pauseDraft: () => pauseDraft(),
		resumeDraft: () => void resumeDraft(),
		requestCompile: () => {
			collabGuest.requestCompile();
			toaster.info({ title: m.session_compile_requested(), duration: 2500 });
		},
		openCompileModal: () => openCompileModal(),
		showProblems: () => {
			showTerminal();
			dockView = 'problems';
		},
		save: () => save(),
		activateTab,
		closeTab,
		useSource: () => setViewMode('source'),
		pickStarter,
		newTexFile,
		importStarter: importStarterFiles,
		onTexInput,
		onRawInput,
		onVisualChange: onChange,
		onVisualSelection: () => visualCollab?.publishCursor(),
		onEditFrontmatter: editPreambleFrontmatter,
		syncToPdf: syncForwardLine,
		historyStep: workspaceHistoryStep,
		jumpToFile: jumpToInclude,
		openFileAt: openFileAtLine,
		refreshDiff: captureDiffSnapshot,
		exitDiff,
		onPdfDoubleClick,
		onInverseSync: (file: string, line: number, selectText?: string) => openFileAtLine(normSyncPath(file), line, selectText),
		onPreviewSettled: runDraftDecision,
		toggleTerminalShrink,
		toggleTerminal
	};

	// the callback surface WorkspaceChrome hands to the menu bar and sidebar
	const chromeActions = {
		newFileOfType: (ext?: string) => newFileOfType(ext),
		openFolder: openFolderFromMenu,
		closeWorkspace,
		save: () => save(),
		openShare: () => (shareModalOpen = true),
		openCompileModal: () => openCompileModal(),
		newTerminal: newTerminalFromMenu,
		toggleTerminal,
		openFormatModal,
		openTutorial: () => (tutorialModalOpen = true),
		uiZoomIn,
		uiZoomOut,
		uiZoomReset,
		refreshTree: () => void refreshTree(),
		openGlobalSearch: () => void openGlobalSearch(),
		closeGlobalSearch: () => void closeGlobalSearch(),
		openFileAt: openFileAtLine,
		openEntry,
		setMain: (entry: TreeEntry) => void applyMainFile(entry.path),
		refreshGit: () => refreshGitStatus(get(workspaceRoot))
	};

	const uiZoomPercent = $derived(Math.round(($settings.uiZoom ?? 1) * 100));
	// shortcut table + UI zoom live in lib/workspace/shortcuts.ts
	const onKeydown = createKeydownHandler({
		getLoadedPath: () => doc.path,
		closeTab,
		isGuest: () => guest,
		save,
		openGlobalSearch: () => void openGlobalSearch(),
		terminalAvailable: () => termDock.available,
		isCompiling: () => compiler.compiling,
		runCompile: () => compiler.runCompile(),
		stopCompile: () => compiler.stopCompile()
	});
</script>

<svelte:window onkeydown={onKeydown} />
<!-- file - folder - app (VS Code's order); the folder segment tells windows apart in the taskbar -->
<svelte:head
	><title>{$workspaceRoot ? `${doc.path ? `${basename(doc.path)} - ` : ''}${basename($workspaceRoot)} - Texpile` : 'Texpile'}</title
	></svelte:head
>

<div class="flex h-screen flex-col overflow-hidden">
	<WorkspaceChrome
		bind:layout
		{modes}
		bind:termDock
		{compiler}
		{scm}
		{treeOps}
		{guest}
		{modLabel}
		{showToc}
		menu={{
			disabled: !doc.path,
			imageDir: doc.path && kind === 'tex' ? dirname(doc.path) : undefined,
			shareable: isDesktop(),
			uiZoomPercent
		}}
		actions={chromeActions}
		bind:fileTreeRef
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
			draft={{ root: draftRoot, mainRel: draftMainRel, trigger: draftTrigger, paused: draftPaused }}
			panes={{
				openTabs: tabs.list,
				applyingStarter: starters.applying,
				allReferences,
				sourceGotoLine,
				sourceDiagnostics,
				fileUrl,
				cwd: $workspaceRoot ?? ''
			}}
			{actions}
			bind:dockView
			bind:pdfPaneRef
			bind:draftRef
		/>
	</WorkspaceChrome>

	<WorkspaceModals
		bind:mainPrompt
		{unsaved}
		{external}
		bind:compileSettings
		bind:formatModalOpen
		{formatting}
		{pendingRefUpdate}
		onSaveCompile={saveCompileCommand}
		onUseDefaultCompile={useDefaultCommand}
		onRunCompile={compiler.runCompile}
		onFormat={doRunFormat}
		onResolveConflict={resolveConflict}
		onKeepRefs={() => (pendingRefUpdate = null)}
		onApplyRefs={doApplyRefUpdate}
	/>
</div>

<TutorialConfirmModal bind:open={tutorialModalOpen} onConfirm={openTutorial} />
{#if !guest}
	<SessionShareModal bind:open={shareModalOpen} root={$workspaceRoot} onBeforeStart={() => saver.flushAndWait()} />
{/if}
{#if session.active}
	<VisualCollab bind:this={visualCollab} {session} path={doc.path} {kind} viewMode={modes.mode} api={visualCollabApi} />
{/if}
