<script lang="ts">
	import { onMount, onDestroy, tick, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { browser } from '$lib/runtime';
	import { navigate } from '$lib/router.svelte';
	import TerminalDock from '$lib/editor/comp/TerminalDock.svelte';
	import EditorTopbar from '$lib/editor/comp/EditorTopbar.svelte';
	import WorkspaceSidebar from '$lib/editor/comp/WorkspaceSidebar.svelte';
	import PreviewPane from '$lib/editor/comp/PreviewPane.svelte';
	import EditorPane from '$lib/editor/comp/EditorPane.svelte';
	import CompileCommandModal from '$lib/editor/comp/CompileCommandModal.svelte';
	import MainFileModal from '$lib/editor/comp/MainFileModal.svelte';
	import FormatModal from '$lib/editor/comp/FormatModal.svelte';
	import ConflictModal from '$lib/editor/comp/ConflictModal.svelte';
	import SaveBeforeSwitchModal from '$lib/editor/comp/SaveBeforeSwitchModal.svelte';
	import RefUpdateModal, { type RefUpdate } from '$lib/editor/comp/RefUpdateModal.svelte';
	import { compileLog, resolveLogPath } from '$lib/stores/compileLogStore';
	import DraftView from '$lib/draft/DraftView.svelte';
	import GlobalSearch from '$lib/editor/comp/GlobalSearch.svelte';
	import TutorialConfirmModal from '$lib/editor/comp/TutorialConfirmModal.svelte';
	import { applyStarter, applyImportedFiles, openTutorialProject, type Starter, type ImportedFile } from '$lib/workspace/starters';
	import { editorViewStore, sourceCmView, viewMode as viewModeStore } from '$lib/stores/editorStore';
	import { tabs } from '$lib/workspace/tabs.svelte';
	import { synctexForward, synctexInverse } from '$lib/workspace/synctex';
	import { sourceTocStore } from '$lib/editor/extensions/tableofcontents/tocStore';
	import { captureVisualAnchor as captureVisualAnchorAt, captureSourceAnchor, resolveVisualAnchor } from '$lib/editor/modeSwitchAnchors';
	import { parseOutlineRaw, assembleProjectOutline } from '$lib/editor/extensions/tableofcontents/latexHeadings';
	import { refreshProjectIntel } from '$lib/workspace/projectIntel';
	import { projectIntelStore } from '$lib/stores/projectIntel';
	import { setGraphicResolver } from '$lib/editor/extensions/intellisense/hover';
	import { setEditorFileAccess } from '$lib/editor/fileAccess';
	import { replacePreambleFrontmatter } from '$lib/editor/extensions/raw-latex/frontmatterView';
	import { initSpellcheckConfig } from '$lib/editor/extensions/spellcheck/spellcheckConfig';
	import WorkspaceMenuBar from '$lib/editor/comp/WorkspaceMenuBar.svelte';
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import type { EditSession } from '$lib/collab/editSession';
	import SessionShareModal from '$lib/collab/SessionShareModal.svelte';
	import VisualCollab from '$lib/collab/VisualCollab.svelte';
	import GuestBar from '$lib/collab/GuestBar.svelte';
	import { references, loadReferences, bibItemsToReferences, type BibLaTeXReference } from '$lib/workspace/citations';
	import { labelStore, referenceStore, filePathStore } from '$lib/stores/editorStore';
	import { extractDocRefsAsync } from '$lib/latex-parser/labelsClient';
	import { trailingDebounce } from '$lib/trailingDebounce';
	import { createSourceHistory } from '$lib/workspace/sourceHistory';
	import { countFileRefs, replaceFileRefs } from '$lib/latex-parser/filerefs';
	import {
		workspaceRoot,
		texFiles,
		fileTree,
		activeFilePath,
		isDirty,
		mainFile,
		savedMainFile,
		setMainFile,
		setLastFile,
		setFolderCompileCommand,
		savedCompileOutputs,
		setCompileOutputs
	} from '$lib/workspace/workspaceStore';
	import { addRecentFolder } from '$lib/workspace/workspaceStore';
	import { refreshGitStatus, isGitRepo, takeNoGitHint } from '$lib/workspace/gitStore';
	import { gitShowHead } from '$lib/workspace/git';
	import { ScmActions } from '$lib/workspace/scmActions.svelte';
	import { SavePipeline } from '$lib/workspace/savePipeline.svelte';
	import { CompilePipeline, resolveCompileCommand, relFromRoot } from '$lib/workspace/compilePipeline.svelte';
	import { TreeOps } from '$lib/workspace/treeOps';
	import { settings, loadSettings, updateSettings, DEFAULT_COMPILE_COMMAND } from '$lib/settings';
	import { detectMainFile, findDocRoots, gatherProjectMacros } from '$lib/workspace/project';
	import {
		basename,
		dirname,
		joinPath,
		pickFolder,
		claimWorkspace,
		releaseWorkspace,
		relativeTo,
		isDesktop,
		samePath,
		detectEol,
		toLf,
		fromLf,
		native,
		freeName,
		type Eol,
		type TreeEntry,
		type TexFile
	} from '$lib/workspace/fileSystem';
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
	const scanTree = async (root: string) => ({ root, children: await provider.scanTree(root) });
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
		if (guest && viewMode === 'diff') viewMode = 'source';
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
				lastParsedSource = '';
				if (loadedPath && kind === 'tex' && viewMode === 'visual') rebuildVisualFromSource();
			} catch {
				projectMacros = '';
			}
		})();
	});
	import { modLabel } from '$lib/platform';
	import { serializeLatexFile, bodyOffsetOf, type ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
	import { parseLatexFileAsync, PARSE_TIMEOUT } from '$lib/workspace/latexParserClient';
	import type { Node as PMNode } from 'prosemirror-model';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { m } from '$lib/paraglide/messages';

	let loadedPath = $state<string | null>(null);
	let loadError = $state<string | null>(null);

	let rawContent = $state(''); // non-.tex text files edit this directly

	// single source of truth for a .tex file: its raw text (texSource), the whole file. the visual
	// editor is a view over it: entry parses into visualDoc + docMeta, every visual edit serializes
	// straight back into texSource, and source mode binds to it directly. no rival copy can drift.
	let viewMode = $state<'visual' | 'source' | 'diff'>('visual');
	// mirror to the global store so menuBarCommands can route Insert/Format;
	// diff is read-only, so routing it as source is harmless
	$effect(() => viewModeStore.set(viewMode === 'diff' ? 'source' : viewMode));

	// diff view (read-only): committed HEAD vs the live buffer, snapshotted (not bound)
	// on entry / file switch / manual refresh so it never re-diffs per keystroke
	let diffOriginal = $state(''); // HEAD content ('' when the file has no committed baseline)
	let diffModified = $state(''); // the working buffer at snapshot time
	let diffLoading = $state(false);
	let diffError = $state<string | null>(null);
	let diffHasHead = $state(true);
	let diffLayout = $state<'unified' | 'split'>('unified');
	// the editable view to return to when leaving Diff (there's no tab manager)
	let lastEditMode = $state<'visual' | 'source'>('visual');
	let texSource = $state('');
	let docMeta = $state<Pick<ParsedLatexFile, 'preamble' | 'postamble' | 'hadDocumentEnv'> | null>(null);
	let visualDoc = $state<PMNode | null>(null);
	// the editor's current body doc; needed to re-serialize texSource when an inline
	// preamble-frontmatter field rewrites the preamble without touching the body
	let lastDoc = $state<PMNode | null>(null);
	// macro-defining text from the main file's include chain, fed to the parser (see workspace/project.ts)
	let projectMacros = $state('');
	// the open file's original line ending, re-applied on save so a CRLF file isn't rewritten to LF
	let docEol = $state<Eol>('\n');
	// LF-normalized on-disk content; if the file changes underneath unsaved edits, we prompt
	let diskBaseline = $state('');
	let conflict = $state<{ path: string; disk: string; eol: Eol } | null>(null);
	const folderEmpty = $derived($texFiles.length === 0);
	// lets the header's New file/folder buttons trigger the tree's inline create input
	let fileTreeRef = $state<{ newAtRoot: (type: 'file' | 'dir' | 'include', defaultName?: string) => void; isEditing: () => boolean }>();

	const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i;
	const BINARY_EXT = /\.(pdf|zip|gz|tar|otf|ttf|woff2?|eot|docx?|pptx?|xlsx?|bin)$/i;
	function fileKind(path: string | null): 'tex' | 'bib' | 'pdf' | 'image' | 'binary' | 'text' | null {
		if (!path) return null;
		const p = path.toLowerCase();
		if (p.endsWith('.tex')) return 'tex';
		if (p.endsWith('.bib')) return 'bib';
		if (p.endsWith('.pdf')) return 'pdf'; // viewable (svelte-pdf-view); must precede the binary check
		if (IMAGE_EXT.test(path)) return 'image';
		if (BINARY_EXT.test(path)) return 'binary';
		return 'text';
	}
	const kind = $derived(fileKind(loadedPath));
	// a guest opening a text-looking file the host shares as name only (too large / extension the
	// session doesn't sync): say so instead of rendering a silently empty editor
	const nameOnly = $derived(
		guest && (kind === 'tex' || kind === 'bib' || kind === 'text') && session.sharedKindOf(loadedPath) === 'binary'
	);

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
		session.setVisualLock(hostHoldsExclusively(kind, viewMode, loadedPath) ? loadedPath : null);
	});
	// live/draft mode isn't supported in a shared session: guests can't run the incremental engine,
	// they see the host's compiled PDF. Force it off while hosting (the toggle is disabled there too).
	$effect(() => {
		if (session.active && !guest && $settings.draftMode) updateSettings({ draftMode: false });
	});

	let applyingStarter = $state(false);
	async function pickStarter(s: Starter) {
		const root = get(workspaceRoot);
		if (!root || applyingStarter) return;
		applyingStarter = true;
		try {
			const mainPath = await applyStarter(root, s);
			setMainFile(root, mainPath);
			await loadRefs(root); // the starter may include references.bib; reload so its \cite keys resolve
			await refreshTree();
			activeFilePath.set(mainPath);
		} catch (e) {
			toaster.error({ title: m.wsview_toast_starter_create_failed_title(), description: e instanceof Error ? e.message : String(e) });
		} finally {
			applyingStarter = false;
		}
	}

	async function importStarterFiles(files: ImportedFile[]) {
		const root = get(workspaceRoot);
		if (!root || applyingStarter) return;
		applyingStarter = true;
		try {
			const mainPath = await applyImportedFiles(root, files);
			await loadRefs(root); // imported .bib -> resolve its \cite keys
			await refreshTree();
			if (mainPath) {
				setMainFile(root, mainPath);
				activeFilePath.set(mainPath);
			}
		} catch (e) {
			toaster.error({ title: m.wsview_toast_import_failed_title(), description: e instanceof Error ? e.message : String(e) });
		} finally {
			applyingStarter = false;
		}
	}

	// File menu "New": inline create in the tree, pre-named for the chosen type
	function newFileOfType(ext?: string) {
		const names: Record<string, string> = { tex: 'untitled.tex', bib: 'references.bib', cls: 'untitled.cls', sty: 'mystyle.sty' };
		const rootNames = get(fileTree).map((e) => e.name);
		const defaultName = ext ? freeName(names[ext] ?? `untitled.${ext}`, rootNames) : '';
		sidebarOpen = true;
		fileTreeRef?.newAtRoot('file', defaultName);
	}

	async function newTexFile() {
		const root = get(workspaceRoot);
		if (!root) return;
		await treeOps.create(
			root,
			freeName(
				'main.tex',
				get(fileTree).map((e) => e.name)
			),
			'file'
		);
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
		terminalAvailable = isDesktop() && hostMode; // client-only; set here so SSR/CSR agree
		if (guest) pdfPaneOpen = true; // guests land with the host's PDF visible
		loadRefs(root);
		refreshTree();
		initSpellcheckConfig(); // seed editorConfigStore so the spell-check toggle works

		loadSettings().then((s) => {
			if (s.sidebarWidth >= 180 && s.sidebarWidth <= 600) sidebarWidth = s.sidebarWidth;
			sidebarOpen = s.sidebarOpen;
			if (s.tocFraction >= 0.1 && s.tocFraction <= 0.9) tocFraction = s.tocFraction;
			// PDF pane width is saved as a fraction of the window, clamped so a
			// wide-screen size can't squeeze the editor out in a small window
			if (browser && typeof window !== 'undefined') {
				const frac = parseFloat(localStorage.getItem(PDF_FRACTION_KEY) ?? '');
				pdfPaneWidth = clampPdf((frac > 0 && frac < 1 ? frac : 0.4) * window.innerWidth);
			}
			pdfPaneOpen = s.pdfPaneOpen; // reopen the preview if it was open last (loadExistingPdf fills it)
			compileCommand = resolveCompileCommand(get(workspaceRoot), s.compileCommand ?? '');
			if (s.terminalHeight >= 120 && s.terminalHeight <= 700) terminalHeight = s.terminalHeight;
			if (terminalAvailable && s.terminalVisible) {
				terminalMounted = true; // BottomDock creates its first shell on mount
				terminalVisible = true;
			}
		});
		if (localStorage.getItem('texpile:viewMode') === 'source') {
			viewMode = 'source';
			lastEditMode = 'source';
		}
		if (localStorage.getItem('texpile:diffLayout') === 'split') diffLayout = 'split';
		if (localStorage.getItem('texpile:terminalShrink') === '1') terminalShrink = true;

		// the tree is a snapshot: rescan on window focus and on the fs-changed event dispatched by
		// internal writes. any on-disk change also rescans references so \cite autocompletion and
		// the citation nodes see fresh keys immediately.
		const reloadReferences = () => {
			const root = get(workspaceRoot);
			if (root) void loadRefs(root);
		};
		const onFocus = () => {
			refreshTree();
			if (hostMode) void checkExternalChange(); // guests have no on-disk copy to diff against
			reloadReferences();
		};
		const onFsChanged = () => {
			refreshTree();
			reloadReferences();
		};
		const onCompile = () => compiler.runCompile();
		// re-clamp the PDF pane when the window shrinks so it can't squeeze the editor out
		const onResize = () => {
			pdfPaneWidth = clampPdf(pdfPaneWidth);
		};
		window.addEventListener('focus', onFocus);
		window.addEventListener('texpile:fs-changed', onFsChanged);
		window.addEventListener('compile', onCompile);
		window.addEventListener('resize', onResize);
		// window close is held by main until we answer (2s backstop for a hung renderer). fast
		// path: flush the autosave debounce and proceed. autosave off with a pending edit: the
		// modal can outlive the hold, so release the close NOW and re-issue it after the answer.
		const offBeforeClose = native()?.onBeforeClose?.(async () => {
			// a prompt is already up (ours or the file-switch guard's): its detached edit is
			// invisible to saver.pending, so the fast path below would destroy it. Just refuse.
			if (saveSwitchPrompt) {
				native()?.closeDecision?.(false);
				return;
			}
			if (autosaveActive() || !loadedPath || saver.pending?.path !== loadedPath) {
				await saver.flushAndWait();
				native()?.closeDecision?.(true);
				return;
			}
			native()?.closeDecision?.(false);
			if (await confirmLeaveUnsaved()) {
				await saver.flushAndWait();
				window.close(); // pending is settled, so this pass takes the fast path
			}
		});
		return () => {
			offBeforeClose?.();
			window.removeEventListener('focus', onFocus);
			window.removeEventListener('texpile:fs-changed', onFsChanged);
			window.removeEventListener('compile', onCompile);
			window.removeEventListener('resize', onResize);
			compiler.dispose();
			saver.cancelTimer();
			deferredSourceToc.cancel();
			if (draftEditTimer) clearTimeout(draftEditTimer);
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

	const flatFiles = (es: TreeEntry[]): string[] => es.flatMap((e) => (e.type === 'dir' ? flatFiles(e.children ?? []) : [e.path]));

	async function refreshTree() {
		const root = get(workspaceRoot);
		if (!root) return;
		// don't rebuild while the user is typing a name in the tree (a refresh would tear
		// the inline input down mid-edit); it re-scans after they commit
		if (fileTreeRef?.isEditing?.()) return;
		try {
			// one traversal when the provider can (disk); guests fall back to the two reads
			if (provider.scanTreeAndFiles) {
				const { children, files } = await provider.scanTreeAndFiles(root);
				fileTree.set(children);
				tabs.prune(flatFiles(children)); // tabs for files that vanished (remote deletes, external rm)
				texFiles.set(files);
			} else {
				const { children } = await scanTree(root);
				fileTree.set(children);
				tabs.prune(flatFiles(children));
				const { files } = await scanTexFiles(root);
				texFiles.set(files);
			}
		} catch (e) {
			console.error('Failed to read folder tree:', e);
		}
		// shared session: the manifest mirrors the tree, same single call-site trick
		void session.syncTree();
		// git refresh is non-blocking and never throws; this single call-site
		// covers every refreshTree() trigger for free. Guests have no disk and no repo, and this
		// now runs on every manifest change, so don't spawn git per remote file op.
		if (!provider.caps.git) return;
		void refreshGitStatus(root).then(({ missingGit }) => {
			if (missingGit && takeNoGitHint()) {
				toaster.warning({ title: m.wsview_toast_no_git_title(), description: m.wsview_toast_no_git_desc() });
			}
		});
	}

	// the shared file set changes under a guest whenever the host adds, renames or deletes a file.
	// The provider exposes a watch hook for exactly this; without it the tree only ever reflected
	// what was there at join time.
	onMount(() => provider.watch?.(() => void refreshTree()));

	function openEntry(entry: TreeEntry) {
		if (entry.type !== 'file') return;
		activeFilePath.set(entry.path);
	}

	// re-init the workspace in place: swap the root, rescan, re-derive the project, load its first
	// file. the unsaved-edit guard and flush run BEFORE any store flips, so Cancel really cancels
	// and no effect can record the old folder's file under the new root.
	async function openFolderFromMenu(path?: string) {
		const root = path ?? (await pickFolder());
		if (!root) return;
		const prevRoot = get(workspaceRoot);
		try {
			// already open in another window: that window was focused, this one stays put.
			// claim BEFORE the unsaved prompt so a doomed switch never asks the user to discard.
			if (!(await claimWorkspace(root)).ok) return;
			if (!(await confirmLeaveUnsaved())) {
				if (prevRoot) void claimWorkspace(prevRoot); // Cancel: restore this window's claim
				return;
			}
			// a shared session is tied to THIS folder's doc; swapping the root would leave it sharing
			// the old folder invisibly, so end it before the swap
			if (session.active && root !== prevRoot) await session.end();
			const { files } = await scanTexFiles(root);
			resolveMainConfirm(root); // before the stores flip, so the modal effect can't see a stale state
			saver.flush(); // autosave-on: persist the outgoing folder's queued edit before the swap
			activeFilePath.set(null); // detach the old file so nothing re-tabs it under the new root
			workspaceRoot.set(root);
			tabs.bind(root, hostMode); // rebind before refreshTree's prune, so tabs persist under the NEW root
			texFiles.set(files);
			addRecentFolder(root);
			updateSettings({ lastFolder: root });
			await refreshTree();
			await initProject(root);
			loadRefs(root);
			activeFilePath.set(files[0]?.path ?? null);
			// the open shells were spawned in the previous folder; respawn them in the new one
			if (root !== prevRoot) resetTerminalsForWorkspace();
		} catch (e) {
			console.error('Failed to open folder:', e);
		}
	}

	// clears the in-memory workspace and returns to the Start screen. Doesn't touch the persisted
	// `lastFolder` setting, so relaunching the app still reopens where you left off - this only
	// affects the current session's view.
	async function closeWorkspace() {
		if (!(await confirmLeaveUnsaved())) return; // autosave off: Save/Discard/Cancel instead of a silent force-write
		await saver.flushAndWait();
		resolveMainConfirm(null);
		releaseWorkspace(); // frees the folder so another window may open it
		workspaceRoot.set(null);
		texFiles.set([]);
		fileTree.set([]);
		activeFilePath.set(null);
		mainFile.set(null);
		isDirty.set(false);
		tabs.bind(null, false); // never leave the store bound persistable to a released root
		navigate('/');
	}

	// TutorialConfirmModal has the user pick an empty folder and confirm first; this only runs after
	async function openTutorial(pickedRoot: string) {
		try {
			const { root, mainFile } = await openTutorialProject(pickedRoot);
			await openFolderFromMenu(root);
			setMainFile(root, mainFile);
			mainConfirmed = true; // the starter picked the main; no first-compile question
			activeFilePath.set(mainFile); // openFolderFromMenu opens files[0] (alphabetical), not the main file
		} catch (e) {
			toaster.error({ title: m.wsview_toast_tutorial_failed_title(), description: e instanceof Error ? e.message : String(e) });
		}
	}
	let tutorialModalOpen = $state(false);

	// resolve the main file (persisted choice if it still exists, else auto-detect) and gather
	// its cross-file macros. runs once on folder open, before any file is loaded.
	async function initProject(root: string) {
		let files: TexFile[] = [];
		try {
			files = (await scanTexFiles(root)).files;
		} catch {
			/* leave files empty */
		}
		const saved = savedMainFile(root);
		const main = saved && files.some((f) => samePath(f.path, saved)) ? saved : await detectMainFile(files);
		if (get(workspaceRoot) !== root) return; // folder changed under us
		// a folder whose main file was never explicitly chosen asks once before the first
		// compile (single-file folders have nothing to choose)
		mainConfirmed = files.length <= 1 || !!(saved && files.some((f) => samePath(f.path, saved)));
		mainFile.set(main);
		void compiler.loadExistingPdf(); // show an already-compiled PDF for this folder without a recompile
		projectMacros = main ? await gatherProjectMacros(main, root) : '';
	}

	// persist the new main file, re-gather macros, and re-derive the open visual doc from
	// texSource so the newly resolved command signatures take effect immediately
	async function applyMainFile(path: string) {
		const root = get(workspaceRoot);
		if (!root) return;
		const next = $mainFile && samePath($mainFile, path) ? null : path; // click the current main again to clear
		setMainFile(root, next);
		mainConfirmed = true; // an explicit choice (set or clear) settles the first-compile question
		void compiler.loadExistingPdf(); // the main file changed â†’ its expected PDF did too
		projectMacros = next ? await gatherProjectMacros(next, root) : '';
		if (get(workspaceRoot) !== root) return;
		if (loadedPath && kind === 'tex' && viewMode === 'visual') rebuildVisualFromSource();
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
		wantsStarter: () => lastEditMode !== 'source',
		insertIncludeAtCursor: (path) => insertIncludeAtCursor(path),
		afterRename: (oldPath, newPath) => void afterRename(oldPath, newPath),
		retargetPendingSave: (from, to) => saver.retarget(from, to),
		discardPendingSave: () => saver.discard()
	});

	let sidebarWidth = $state(256);
	let sidebarOpen = $state(true);
	// one sidebar view at a time (VS Code activity-bar style); toggling an icon swaps back to the explorer
	let sidebarView = $state<'explorer' | 'search' | 'scm'>('explorer');
	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
		updateSettings({ sidebarOpen });
	}
	function startResize(e: MouseEvent) {
		e.preventDefault();
		const startX = e.clientX;
		const startW = sidebarWidth;
		const onMove = (ev: MouseEvent) => {
			sidebarWidth = Math.min(600, Math.max(180, startW + ev.clientX - startX));
		};
		const onUp = () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			updateSettings({ sidebarWidth }); // persist once the resize gesture ends
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}
	// keyboard equivalent of the drag handle (Left/Right nudges 16px)
	function resizeSidebarByKey(e: KeyboardEvent) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		sidebarWidth = Math.min(600, Math.max(180, sidebarWidth + (e.key === 'ArrowRight' ? 16 : -16)));
		updateSettings({ sidebarWidth });
	}

	const showToc = $derived(!!loadedPath && kind === 'tex' && (viewMode === 'visual' || viewMode === 'source'));
	// source mode has no ProseMirror plugin to feed the outline, so parse headings from the raw
	// .tex; \input fragments pre-scanned into projectIntel merge into one numbered project outline.
	// debounced (display-only) and reading state LIVE at fire time, so typing never pays the parse.
	const deferredSourceToc = trailingDebounce<void>(300, () => {
		if (kind !== 'tex' || viewMode !== 'source') return;
		sourceTocStore.set(
			assembleProjectOutline(
				parseOutlineRaw(texSource),
				loadedPath,
				loadedPath ? dirname(loadedPath) : null,
				get(workspaceRoot),
				get(projectIntelStore).outlines
			)
		);
	});
	$effect(() => {
		void texSource;
		void $projectIntelStore;
		if (kind === 'tex' && viewMode === 'source') deferredSourceToc();
	});
	let tocFraction = $state(0.5); // TOC share of the sidebar's lower region (0..1)
	let splitEl = $state<HTMLDivElement>();
	function startTocResize(e: MouseEvent) {
		e.preventDefault();
		const rect = splitEl?.getBoundingClientRect();
		if (!rect) return;
		const onMove = (ev: MouseEvent) => {
			tocFraction = Math.min(0.9, Math.max(0.1, (rect.bottom - ev.clientY) / rect.height)); // drag up = taller TOC
		};
		const onUp = () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			updateSettings({ tocFraction });
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}
	// keyboard equivalent of the drag handle (Up/Down nudges 2%)
	function resizeTocByKey(e: KeyboardEvent) {
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		e.preventDefault();
		tocFraction = Math.min(0.9, Math.max(0.1, tocFraction + (e.key === 'ArrowUp' ? 0.02 : -0.02)));
		updateSettings({ tocFraction });
	}

	// set in onMount (not at init) so the server and the first client render agree
	let terminalAvailable = $state(false);
	let terminalVisible = $state(false);
	let terminalHeight = $state(240);
	let terminalShrink = $state(false); // dock only under the editor; the preview pane keeps full height
	let terminalMounted = $state(false); // stay mounted after first open so shells persist across toggles
	// the bottom dock (terminal + problems tabs) owns its own multi-terminal state; we hold a ref
	// to drive it (run a compile command, refit on resize, reset on folder change)
	let dock = $state<{
		runCommand(cmd: string, onDone?: (o: string) => void): void;
		reset(): void;
		refit(): void;
		focusActive(): void;
		addTerminal(): void;
		interrupt(): void;
	}>();
	let compileCommand = $state(''); // the compile command; {main} expands to the main file's path
	let compileModalOpen = $state(false);
	let compileDraft = $state('');
	// Advanced (per-folder) output-path overrides, edited in the compile modal
	let compileOutputsDraft = $state<{ pdf: string; log: string }>({ pdf: '', log: '' });
	let advancedOpen = $state(false);
	let formatModalOpen = $state(false);
	let formatting = $state(false);
	// PDF preview pane; opens automatically once a compile writes a fresh PDF
	let pdfPaneOpen = $state(false);
	let pdfPaneWidth = $state(480);
	const dockShrunk = $derived(terminalShrink && pdfPaneOpen);
	const PDF_FRACTION_KEY = 'texpile:pdfPaneFraction';
	// cap: whatever's left after the sidebar, keeping ~360px for the editor, so a big pane
	// saved on a wide screen can't squeeze the editor out in a small window
	function pdfMaxWidth(): number {
		const win = typeof window !== 'undefined' ? window.innerWidth : 1280;
		return Math.max(320, win - (sidebarOpen ? sidebarWidth : 0) - 360);
	}
	const clampPdf = (w: number) => Math.min(pdfMaxWidth(), Math.max(280, w));
	// persist as a fraction of window width so the pane stays proportional across window sizes
	function savePdfFraction() {
		if (browser && typeof window !== 'undefined') localStorage.setItem(PDF_FRACTION_KEY, String(pdfPaneWidth / window.innerWidth));
	}
	// bottom dock body: the terminal shells (always mounted) or the Problems list
	let dockView = $state<'terminal' | 'problems'>('terminal');
	// Draft mode: bump to trigger a DraftView recompile; the derived root/main feed it.
	let draftTrigger = $state(0);
	let draftRoot = $derived($workspaceRoot ?? '');
	let draftMainRel = $derived.by(() => {
		if (mainConfirmed !== true) return ''; // hold the first live compile until the main file is confirmed
		const target = $mainFile ?? loadedPath;
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
	let mainConfirmed = $state<boolean | null>(null);
	function resolveMainConfirm(root: string | null) {
		mainConfirmed = root ? (savedMainFile(root) ? true : null) : null;
	}
	let mainConfirmOpen = $state(false);
	let mainChoice = $state<string | null>(null);
	let mainDetected = $state<string | null>(null);
	let mainDocRoots = $state<Set<string>>(new Set());
	let afterMainConfirm: (() => void) | null = null;
	// stable order: detected first, then document roots, then the rest (frozen at open so
	// picking a different radio doesn't reshuffle the list)
	let mainCandidates = $derived.by(() => {
		const score = (f: TexFile) => (mainDetected && samePath(f.path, mainDetected) ? 0 : mainDocRoots.has(f.path) ? 1 : 2);
		return [...$texFiles].sort((a, b) => score(a) - score(b) || a.relPath.localeCompare(b.relPath));
	});
	async function openMainConfirm(then?: () => void) {
		const root = get(workspaceRoot);
		if (!root || mainConfirmOpen) return;
		mainConfirmOpen = true;
		afterMainConfirm = then ?? null;
		const files = get(texFiles);
		mainDetected = get(mainFile) ?? (await detectMainFile(files));
		mainChoice = mainDetected;
		mainDocRoots = await findDocRoots(files);
	}
	function finishMainConfirm() {
		mainConfirmOpen = false;
		mainConfirmed = true;
		if (get(settings).draftMode) draftTrigger++; // the held first live compile can run now
		const k = afterMainConfirm;
		afterMainConfirm = null;
		k?.();
	}
	async function confirmMainFile() {
		const root = get(workspaceRoot);
		if (!root || !mainChoice) return;
		const chosen = mainChoice;
		setMainFile(root, chosen);
		void compiler.loadExistingPdf();
		finishMainConfirm();
		projectMacros = await gatherProjectMacros(chosen, root);
	}
	// closing the prompt still settles it: persist the pre-selected (detected) file so it doesn't
	// return on every open. Nothing is locked in, the main file can be changed anytime via the file tree.
	async function dismissMainConfirm() {
		const root = get(workspaceRoot);
		const chosen = mainChoice ?? mainDetected;
		if (root && chosen) {
			setMainFile(root, chosen);
			void compiler.loadExistingPdf();
			finishMainConfirm();
			projectMacros = await gatherProjectMacros(chosen, root);
		} else {
			finishMainConfirm();
		}
	}
	// live mode compiles on its own as soon as the pane is open; surface the question then.
	// Strictly `=== false`: null means initProject is still resolving, never a modal.
	$effect(() => {
		const wants = $settings.draftMode && pdfPaneOpen && !draftPaused && !!$workspaceRoot && $texFiles.length > 1;
		if (wants && mainConfirmed === false && !mainConfirmOpen) void openMainConfirm();
	});
	// Draft mode live preview: ONE decision point per edit (the spec's "decide when to
	// incrementally compile vs recompile"). Diff against the last-compiled source: if exactly
	// one prose paragraph changed, patch it INSTANTLY (no debounce -- DraftView.instantPatch
	// coalesces via its own in-flight guard, so continuous typing streams patches at the
	// daemon's pace rather than only updating when you pause). Any structural change debounces
	// a full recompile. Only while the preview pane is open; the compile reads from disk.
	let draftRef = $state<DraftView | null>(null);
	let draftEditTimer: ReturnType<typeof setTimeout> | null = null;
	let lastDraftSrc = ''; // source at the last full draft compile; the patch baseline
	let lastDraftPath: string | null = null; // file that source belongs to

	// the decision layer + paragraph splitter live in $lib/draft/dispatch, shared with
	// the headless edit-class matrix (tests/live)
	import { decideEdit } from '$lib/draft/dispatch';

	const dev = (kind: string, detail?: unknown) => {
		const w = window as unknown as { __draftEvents?: unknown[] };
		(w.__draftEvents ||= []).push({ kind, detail, t: performance.now() });
	};

	async function fullRecompile(src: string) {
		lastDraftSrc = src;
		lastDraftPath = loadedPath;
		await saver.flushAndWait();
		draftTrigger++;
	}

	// Stop the warm engine when draft mode is off, no preview is open, or the folder changed
	// -- otherwise it keeps a lualatex process (100-300MB with a heavy preamble) alive for the
	// whole session. It re-warms in ~1.5s on the next compile. draftStop is a no-op if no
	// daemon is running, so it's safe to call eagerly.
	let daemonActive = false;
	let daemonRoot: string | null = null;
	$effect(() => {
		const active = $settings.draftMode && pdfPaneOpen && !draftPaused;
		const root = $workspaceRoot;
		if (daemonActive && (!active || root !== daemonRoot)) native()?.draftStop?.();
		daemonActive = active;
		daemonRoot = root;
	});

	// one decision point per edit; also re-invoked when a compile settles so edits typed
	// mid-compile don't wait for the next keystroke to show up
	function runDraftDecision() {
		const src = texSource;
		const active = $settings.draftMode && pdfPaneOpen && !!loadedPath && !draftPaused;
		if (draftEditTimer) {
			clearTimeout(draftEditTimer);
			draftEditTimer = null;
		}
		if (!active || src === lastDraftSrc) return;
		// path changed since the last compile (switched files): recompile, don't diff
		if (loadedPath !== lastDraftPath || !lastDraftSrc) {
			draftEditTimer = setTimeout(() => fullRecompile(src), 400);
			return;
		}
		const d = decideEdit(lastDraftSrc, src);
		const fr = get(workspaceRoot);
		const file = fr && loadedPath ? relFromRoot(loadedPath, fr) : null;
		const onRec = async () => {
			await saver.flushAndWait();
			lastDraftSrc = src;
			lastDraftPath = loadedPath;
		};
		const debounceRecompile = () => {
			draftEditTimer = setTimeout(() => fullRecompile(src), 500);
		};
		switch (d.kind) {
			case 'noop':
				// render-identical edit: no compile, no patch, just advance the baseline
				lastDraftSrc = src;
				lastDraftPath = loadedPath;
				dev('ws-noop-whitespace', {});
				return;
			case 'boundary':
				dev('ws-recompile', { reason: 'boundary-line' });
				debounceRecompile();
				return;
			case 'skip-unbalanced':
				// unrepairable mid-command state: hold the preview until the next keystroke
				dev('ws-skip-unbalanced', { line: d.line });
				return;
			case 'env-body':
				dev('ws-recompile', { reason: 'env-body:' + d.env });
				debounceRecompile();
				return;
			case 'structural': {
				// heavier change: wait for a pause before recompiling, then land the view on the
				// first diverging block. Inserts/deletes that CAN render instantly arrived here
				// as 'patch' (the merged engine typeset); there is no JS-placed splice fallback.
				dev('ws-recompile', { reason: d.reason });
				if (file && d.focus)
					draftRef?.focusAfterCompile({
						file,
						line: d.focus.line,
						endLine: d.focus.endLine,
						text: d.focus.text,
						listItem: d.focus.listItem
					});
				debounceRecompile();
				return;
			}
			case 'patch': {
				// one block changed: patch IMMEDIATELY (no debounce -- instantPatch's in-flight
				// guard coalesces bursts). The daemon typesets IN MEMORY; only an abandon needs
				// the file on disk (onRecompile saves lazily then advances the baseline).
				if (!file) return;
				if (d.transient) dev('ws-repaired', { line: d.line });
				dev('ws-dispatch', { file, line: d.line });
				draftRef?.instantPatch({
					file,
					line: d.line,
					endLine: d.endLine,
					text: d.text,
					orig: d.orig,
					transient: d.transient,
					floatInner: d.floatInner,
					listItem: d.listItem,
					cmdChanged: d.cmdChanged,
					onRecompile: onRec
				});
				return;
			}
		}
	}
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
	$effect(() => {
		if (!guest) return;
		const intel = session.compileIntel;
		if (!intel) {
			compileLog.set(null);
			return;
		}
		const entries = intel.log.map((e) => ({
			level: e.level,
			message: e.message,
			file: e.file,
			line: e.line,
			lineEnd: e.lineEnd,
			column: e.column,
			anchorText: e.anchorText,
			hint: e.hint,
			command: e.command,
			raw: e.message
		}));
		compileLog.set({
			entries,
			errors: entries.filter((e) => e.level === 'error'),
			warnings: entries.filter((e) => e.level === 'warning'),
			badboxes: entries.filter((e) => e.level === 'badbox'),
			files: [],
			status: { fatal: false, emergencyStop: false, noPages: false },
			logPath: '',
			updatedAt: Date.now()
		});
	});

	// last compile's problems for the file open in source mode; badboxes ride along
	// as "info" so they underline without alarming colors
	const sourceDiagnostics = $derived.by(() => {
		// guest: the host's shared parse (files already root-relative), same shape as below
		if (guest) {
			const shared = session.compileIntel;
			const file = loadedPath?.replace(/^session\//, '');
			if (!shared || !file) return [];
			return shared.log
				.filter((e) => e.line !== undefined && samePath(e.file, file))
				.map((e) => ({
					line: e.line!,
					lineEnd: e.lineEnd,
					severity: e.level === 'error' ? ('error' as const) : e.level === 'badbox' ? ('info' as const) : ('warning' as const),
					message: e.hint ? `${e.message}\n\n${e.hint}` : e.message,
					column: e.column,
					anchorText: e.anchorText,
					token: e.command
				}));
		}
		const log = $compileLog;
		const root = $workspaceRoot;
		const file = loadedPath;
		if (!log || !root || !file) return [];
		return log.entries
			.filter((e) => e.level !== 'info' && e.line !== undefined)
			.filter((e) => {
				const abs = resolveLogPath(root, e.file);
				return abs !== null && samePath(abs, file);
			})
			.map((e) => ({
				line: e.line!,
				lineEnd: e.lineEnd,
				severity: e.level === 'error' ? ('error' as const) : e.level === 'badbox' ? ('info' as const) : ('warning' as const),
				message: e.hint ? `${e.message}\n\n${e.hint}` : e.message,
				column: e.column,
				anchorText: e.anchorText,
				token: e.command
			}));
	});
	// ref to the compile-pane PDF viewer, for SyncTeX forward search
	let pdfPaneRef = $state<{ scrollToPosition: (page: number, x: number, y: number, w?: number, h?: number) => void }>();
	// a SyncTeX-inverse / Find-in-Files jump. the token distinguishes repeat jumps to the same line
	// so the editor re-fires; selectText is the word double-clicked in the PDF, anchored on to
	// correct for line drift (see SourceEditor's gotoLine effect)
	let sourceGotoLine = $state<{ line: number; token: number; selectText?: string } | undefined>(undefined);
	let gotoToken = 0;

	function showTerminal() {
		terminalMounted = true; // mounts BottomDock, which creates its first shell (host only)
		terminalVisible = true;
		if (!guest) updateSettings({ terminalVisible: true });
		setTimeout(() => dock?.refit(), 0);
	}
	function toggleTerminal() {
		if (terminalVisible) {
			terminalVisible = false;
			if (!guest) updateSettings({ terminalVisible: false });
		} else {
			showTerminal();
			setTimeout(() => dock?.focusActive(), 40);
		}
	}
	function toggleTerminalShrink() {
		terminalShrink = !terminalShrink;
		if (browser) localStorage.setItem('texpile:terminalShrink', terminalShrink ? '1' : '0');
	}
	// on folder change, replace the shells so they respawn in the new cwd
	function resetTerminalsForWorkspace() {
		dock?.reset();
	}
	// menu "New Terminal": open the dock (its first shell is auto-created) or add another
	function newTerminalFromMenu() {
		const wasMounted = terminalMounted;
		terminalMounted = true;
		terminalVisible = true;
		updateSettings({ terminalVisible: true });
		setTimeout(() => (wasMounted ? dock?.addTerminal() : dock?.focusActive()), 0);
	}
	function startTerminalResize(e: MouseEvent) {
		e.preventDefault();
		const startY = e.clientY;
		const startH = terminalHeight;
		const onMove = (ev: MouseEvent) => {
			terminalHeight = Math.min(700, Math.max(120, startH + (startY - ev.clientY))); // drag up = taller
			dock?.refit();
		};
		const onUp = () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			updateSettings({ terminalHeight }); // persist once the gesture ends
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}
	// keyboard equivalent of the drag handle (Up/Down nudges 16px)
	function resizeTerminalByKey(e: KeyboardEvent) {
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		e.preventDefault();
		terminalHeight = Math.min(700, Math.max(120, terminalHeight + (e.key === 'ArrowUp' ? 16 : -16))); // up = taller
		dock?.refit();
		updateSettings({ terminalHeight });
	}

	// compile / terminal / PDF-watch orchestration lives in lib/workspace/compilePipeline.svelte.ts
	const compiler = new CompilePipeline({
		getLoadedPath: () => loadedPath,
		getCompileCommand: () => compileCommand,
		terminalAvailable: () => terminalAvailable,
		mainConfirmed: () => mainConfirmed,
		getSession: () => session,
		getDock: () => dock,
		stat: statFile,
		readText: readTextFile,
		create: createEntry,
		fileUrl,
		flushSaves: () => saver.flushAndWait(),
		refreshTree,
		showTerminal,
		setDockView: (v) => (dockView = v),
		setPdfPaneOpen,
		openCompileModal,
		openMainConfirm: (then) => void openMainConfirm(then),
		runDraftCompile,
		shareCompileState
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
		lastDraftSrc = texSource; // the live-edit effect won't redundantly recompile this same source
		lastDraftPath = loadedPath;
		setPdfPaneOpen(true);
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
	function setPdfPaneOpen(open: boolean) {
		pdfPaneOpen = open;
		updateSettings({ pdfPaneOpen: open });
	}
	function togglePdfPane() {
		setPdfPaneOpen(!pdfPaneOpen);
	}
	function startPdfResize(e: MouseEvent) {
		e.preventDefault();
		const startX = e.clientX;
		const startW = pdfPaneWidth;
		const onMove = (ev: MouseEvent) => {
			pdfPaneWidth = clampPdf(startW - (ev.clientX - startX)); // drag left = wider
		};
		const onUp = () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			savePdfFraction(); // persist once the gesture ends
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}
	// keyboard equivalent of the drag handle (Left/Right nudges 16px)
	function resizePdfByKey(e: KeyboardEvent) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		pdfPaneWidth = clampPdf(pdfPaneWidth + (e.key === 'ArrowLeft' ? 16 : -16)); // left = wider
		savePdfFraction();
	}

	// SyncTeX needs the doc compiled with -synctex=1; the default command does it.
	// normalize a path from synctex to the workspace separator so it matches the open file
	function normPath(p: string): string {
		const root = get(workspaceRoot) ?? '';
		const sep = root.includes('\\') ? '\\' : '/';
		return p.replace(/[\\/]+/g, sep);
	}
	function jumpPdf(page: number, x: number, y: number, w: number, h: number, tries = 0) {
		if (pdfPaneRef) {
			pdfPaneRef.scrollToPosition(page, x, y, w, h);
			return;
		}
		if (tries < 30) setTimeout(() => jumpPdf(page, x, y, w, h, tries + 1), 30); // wait for the pane to mount
	}
	// forward: a source line -> the matching place in the PDF (scroll + flash a highlight).
	// Live mode syncs against the reconcile PDF (same layout the canvases show).
	async function syncForwardLine(line: number) {
		if (guest) {
			// the host holds the .synctex data; ask it to resolve, then scroll our PDF copy
			if (!loadedPath) return;
			const res = await collabGuest.syncForward(loadedPath, line);
			if (res) {
				setPdfPaneOpen(true);
				jumpPdf(res.page, res.x, res.y, res.w, res.h);
			}
			return;
		}
		const live = get(settings).draftMode;
		const pdf = live ? draftRoot + '/_draft/draft.pdf' : compiler.expectedPdfPath();
		if (!loadedPath || kind !== 'tex' || !pdf) return;
		const res = await synctexForward(pdf, loadedPath, line);
		console.debug('[synctex] forward', { tex: loadedPath, line, pdf, res });
		if (!res.ok) {
			toaster.error({ title: 'SyncTeX', description: res.error ?? m.wsview_toast_synctex_no_match() });
			return;
		}
		setPdfPaneOpen(true);
		// highlight the enclosing box: origin (h, v) = line-start + baseline, size (W, H). NOT (x, y),
		// the matched node's point: pairing that with W/H drew the box shifted and ~a line too low.
		if (live) draftRef?.syncTo(res.page, res.h, res.v, res.width, res.height);
		else jumpPdf(res.page, res.h, res.v, res.width, res.height);
	}
	// forward from the current cursor (the header "Sync to PDF" button)
	async function syncForward() {
		const cm = get(sourceCmView);
		if (!cm || !cm.dom.isConnected) return;
		await syncForwardLine(cm.state.doc.lineAt(cm.state.selection.main.head).number);
	}
	// open a file in source mode and jump to a 1-based line (SyncTeX inverse + Find-in-Files)
	function openFileAtLine(file: string, line: number, selectText?: string) {
		// a guest's file keys are manifest-relative, but resolved jump targets (the Problems panel
		// root-joins via resolveLogPath) arrive prefixed with the synthetic 'session' root. Strip it
		// back off, else activeFilePath -> the Y.Text binding keys on 'session/foo.tex' and opens an
		// empty buffer instead of the real shared file. No-op for host absolute paths.
		const root = get(workspaceRoot);
		const target = guest && root && file.startsWith(root + '/') ? file.slice(root.length + 1) : file;
		viewMode = 'source';
		localStorage.setItem('texpile:viewMode', 'source');
		sourceGotoLine = { line, token: ++gotoToken, selectText };
		if (!samePath(get(activeFilePath) ?? '', target)) activeFilePath.set(target);
	}
	// inverse: a double-click in the PDF opens the source at the matching line; selectText
	// lets the editor snap to the real text even if the line drifted
	async function onPdfDoubleClick(page: number, x: number, y: number, selectText?: string) {
		if (guest) {
			const res = await collabGuest.syncInverse(page, x, y);
			if (res && res.line >= 1) openFileAtLine(res.file, res.line, res.selectText ?? selectText);
			return;
		}
		const pdf = compiler.expectedPdfPath();
		if (!pdf) return;
		const res = await synctexInverse(pdf, page, x, y);
		console.debug('[synctex] inverse', { pdf, page, x, y, res, selectText });
		if (res.ok && res.input && res.line >= 1) openFileAtLine(normPath(res.input), res.line, selectText);
	}

	function openCompileModal() {
		compileDraft = compileCommand;
		const root = get(workspaceRoot);
		const ov = root ? savedCompileOutputs(root) : {};
		compileOutputsDraft = { pdf: ov.pdf ?? '', log: ov.log ?? '' };
		advancedOpen = !!(ov.pdf || ov.log); // start expanded only if overrides exist
		compileModalOpen = true;
	}
	function saveCompileCommand(thenRun: boolean) {
		compileCommand = compileDraft.trim();
		const root = get(workspaceRoot);
		if (root) {
			setFolderCompileCommand(root, compileCommand || null);
			setCompileOutputs(root, { pdf: compileOutputsDraft.pdf.trim(), log: compileOutputsDraft.log.trim() });
		}
		updateSettings({ compileCommand }); // also the starting default for folders without their own
		compileModalOpen = false;
		if (thenRun && compileCommand) compiler.runCompile();
	}
	function useDefaultCommand() {
		compileDraft = DEFAULT_COMPILE_COMMAND;
		saveCompileCommand(true);
	}

	function openFormatModal() {
		if (!loadedPath || kind !== 'tex') return;
		formatModalOpen = true;
	}
	// reindents via latexindent and swaps texSource for the result; both views re-derive from it
	// (source mode's value-sync effect, visual mode's rebuildVisualFromSource below). no backup
	// file - the confirm modal's warning is the only safety net, undo (Ctrl+Z) covers the rest.
	async function runFormat() {
		if (!loadedPath) return;
		formatModalOpen = false;
		formatting = true;
		try {
			await saver.flushAndWait(); // the formatter should see exactly what's on screen
			const formatted = toLf(await formatLatexDocument(loadedPath, fromLf(texSource, docEol)));
			texSource = formatted;
			isDirty.set(true);
			saver.schedule(loadedPath, texSource);
			if (viewMode === 'visual') rebuildVisualFromSource();
			toaster.success({ title: m.wsview_toast_formatted_title(), description: basename(loadedPath) });
		} catch (e) {
			toaster.error({ title: m.wsview_toast_format_failed_title(), description: e instanceof Error ? e.message : String(e) });
		} finally {
			formatting = false;
		}
	}

	// insert an \input of newFilePath at the cursor in the open visual doc: path relative to the
	// current file's dir, .tex dropped (the form \input takes). false when there's no editor to insert into.
	function insertIncludeAtCursor(newFilePath: string): boolean {
		if (!loadedPath || viewMode !== 'visual') return false;
		const v = get(editorViewStore);
		const type = v?.state.schema.nodes.includedoc;
		if (!v || !type) return false;
		const rel = relativeTo(dirname(loadedPath), newFilePath).replace(/\.tex$/i, '');
		v.dispatch(v.state.tr.replaceSelectionWith(type.create({ path: rel, command: 'input' })).scrollIntoView());
		v.focus();
		return true;
	}

	// keep referenceStore in sync with the folder's .bib plus any \bibitem entries in the current
	// doc, so citations resolve in BOTH modes. .bib wins on key clashes. EditorView re-syncs its
	// localReferences prop into referenceStore, so both writers must agree on the same merged list.
	let bibitemRefs = $state<BibLaTeXReference[]>([]);
	const allReferences = $derived.by(() => {
		const bib = $references;
		if (!bibitemRefs.length) return bib;
		const seen = new Set(bib.map((r) => r.key));
		return [...bib, ...bibitemRefs.filter((r) => !seen.has(r.key))];
	});
	$effect(() => {
		referenceStore.set(allReferences);
	});

	// flatten the file tree to root-relative paths for file-path autocompletion
	function flattenPaths(entries: TreeEntry[], root: string, out: string[] = []): string[] {
		for (const e of entries) {
			if (e.type === 'file') out.push(relFromRoot(e.path, root));
			if (e.children) flattenPaths(e.children, root, out);
		}
		return out;
	}
	$effect(() => {
		const tree = $fileTree;
		const root = $workspaceRoot;
		filePathStore.set(root ? flattenPaths(tree, root) : []);
	});

	// after a rename/move, find \includegraphics/\input across the project's .tex files
	// that pointed at the file (AST-based) and offer to repoint them
	let pendingRefUpdate = $state<RefUpdate | null>(null);

	async function afterRename(oldPath: string, newPath: string) {
		const root = get(workspaceRoot);
		if (!root) return;
		const oldRel = relFromRoot(oldPath, root);
		const newRel = relFromRoot(newPath, root);
		if (oldRel === newRel) return;
		const hits: { path: string; count: number }[] = [];
		let total = 0;
		for (const f of get(texFiles)) {
			try {
				const content = f.path === loadedPath ? texSource : await readTextFile(f.path);
				const count = countFileRefs(content, oldRel);
				if (count > 0) {
					hits.push({ path: f.path, count });
					total += count;
				}
			} catch {
				/* skip unreadable file */
			}
		}
		if (total > 0) pendingRefUpdate = { oldRel, newRel, hits, total };
	}

	async function applyRefUpdate() {
		const u = pendingRefUpdate;
		pendingRefUpdate = null;
		if (!u) return;
		for (const h of u.hits) {
			try {
				if (h.path === loadedPath) {
					texSource = replaceFileRefs(texSource, u.oldRel, u.newRel).text;
					if (viewMode === 'visual') rebuildVisualFromSource();
					isDirty.set(true);
					saver.schedule(loadedPath, texSource);
				} else {
					const content = await readTextFile(h.path);
					await writeTextFile(h.path, replaceFileRefs(content, u.oldRel, u.newRel).text);
				}
			} catch (e) {
				console.error('Failed to update references in', h.path, e);
			}
		}
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
	// rescan when the file list, main file, or active file changes â€” those are the only times the
	// non-active files' on-disk state can have moved under us (a switch flushes the previous save)
	$effect(() => {
		const files = $texFiles;
		const main = $mainFile;
		const active = $activeFilePath;
		const tree = $fileTree;
		const root = $workspaceRoot;
		const bibs = root
			? flattenPaths(tree, root)
					.filter((p) => /\.bib$/i.test(p))
					.map((p) => joinPath(root, p))
			: [];
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

	// publish the parsed compile products (aux label numbers + diagnostics) to guests: parse once
	// here, share small JSON via session meta, instead of syncing wholesale .aux/.log artifacts
	// (which rewrite per compile and would bloat the shared doc's history)
	function shareCompileState() {
		const root = get(workspaceRoot);
		if (guest || !root || !session.active) return;
		const intel = get(projectIntelStore);
		const log = get(compileLog);
		// share every error/warning/badbox, line-anchored or not: line-less warnings (undefined
		// \ref/\cite, package warnings) still belong in the guest's Problems panel
		const entries = (log?.entries ?? [])
			.filter((e) => e.level !== 'info')
			.map((e) => {
				const abs = e.file ? resolveLogPath(root, e.file) : null;
				return {
					file: abs ? relativeTo(root, abs).replace(/\\/g, '/') : '',
					line: e.line,
					lineEnd: e.lineEnd,
					level: e.level as 'error' | 'warning' | 'badbox',
					message: e.message,
					hint: e.hint,
					column: e.column,
					anchorText: e.anchorText,
					command: e.command
				};
			});
		session.shareCompileIntel({ auxNumbers: intel.auxNumbers, auxPages: intel.auxPages, log: entries });
	}

	// \includegraphics hover preview: candidate texfile:// URLs (current dir, root, and any
	// \graphicspath dirs, adding raster extensions when the path has none); the tooltip's img
	// advances past misses
	// the visual editor's shared-session machinery (remote patches, presence) lives in
	// VisualCollab; this api hands it doc-state access, the ref carries its editor hooks
	let visualCollab = $state<{ noteLocalEdit(): void; noteFreshParse(): void; publishCursor(): void } | null>(null);
	const visualCollabApi = {
		get texSource() {
			return texSource;
		},
		set texSource(v: string) {
			texSource = v;
		},
		get lastParsedSource() {
			return lastParsedSource;
		},
		set lastParsedSource(v: string) {
			lastParsedSource = v;
		},
		get docMeta() {
			return docMeta;
		},
		parse: async (text: string) => (await tryParseVisual(text)).parsed ?? null,
		adopt(parsed: ParsedLatexFile, liveDoc: PMNode) {
			docMeta = { preamble: parsed.preamble, postamble: parsed.postamble, hadDocumentEnv: parsed.hadDocumentEnv };
			// reference handshake: EditorView sees its own live doc and skips the state swap
			visualDoc = liveDoc;
			lastDoc = liveDoc;
		},
		commit(path: string, content: string) {
			isDirty.set(true);
			saver.schedule(path, content);
		}
	};

	// visual-editor file access (figure previews, image paste) resolves through the provider,
	// so a guest's images come from the session blob cache and uploads go through the session
	setEditorFileAccess(
		(p) => provider.fileUrl(p),
		(p, data) => provider.writeBinary(p, data)
	);
	setGraphicResolver((rel) => {
		const root = get(workspaceRoot);
		const base = loadedPath ? dirname(loadedPath) : null;
		const cand = rel.replace(/\\/g, '/');
		const names = /\.[a-z]+$/i.test(cand) ? [cand] : ['.png', '.jpg', '.jpeg', '.webp', '.gif'].map((e) => cand + e);
		const dirs: (string | null)[] = [base, root];
		const gp = texSource.match(/\\graphicspath\s*\{((?:\s*\{[^{}]*\}\s*)+)\}/);
		if (gp) {
			for (const d of gp[1].matchAll(/\{([^{}]*)\}/g)) {
				if (!d[1]) continue;
				for (const parent of [base, root]) if (parent) dirs.push(joinPath(parent, d[1]));
			}
		}
		const urls: string[] = [];
		for (const dir of dirs) if (dir) for (const n of names) urls.push(fileUrl(joinPath(dir, n)));
		return [...new Set(urls)];
	});
	onDestroy(() => {
		setGraphicResolver(null);
		setEditorFileAccess(null, null);
	});

	// shared session: guests can ask for a compile; leaving the workspace ends the session
	let shareModalOpen = $state(false);
	onMount(() => {
		session.onCompileRequest = () => {
			toaster.info({ title: m.wsview_toast_compile_requested_title(), duration: 3000 });
			void compiler.runCompile();
		};
		// a guest changed files on the host's disk (upload / rename / delete): refresh our own tree
		session.onFileOp = () => void refreshTree();
		// resolve a guest's SyncTeX request against our .synctex data and reply
		session.onSyncRequest = async (payload, from) => {
			const root = get(workspaceRoot);
			const pdf = compiler.expectedPdfPath();
			if (!root || !pdf) return;
			if (payload.kind === 'synctex-inverse') {
				const res = await synctexInverse(pdf, payload.page, payload.x, payload.y);
				if (res.ok && res.input && res.line >= 1) {
					const rel = relativeTo(root, normPath(res.input)).replace(/\\/g, '/');
					collabHost.replyControl({ kind: 'synctex-inverse-result', reqId: payload.reqId, file: rel, line: res.line }, from);
				}
			} else if (payload.kind === 'synctex-forward') {
				const res = await synctexForward(pdf, joinPath(root, payload.file), payload.line);
				if (res.ok) {
					collabHost.replyControl(
						{ kind: 'synctex-forward-result', reqId: payload.reqId, page: res.page, x: res.h, y: res.v, w: res.width, h: res.height },
						from
					);
				}
			}
		};
		return () => {
			session.onCompileRequest = null;
			session.onSyncRequest = null;
			session.onFileOp = null;
			void session.end();
		};
	});

	// F12 on an \input{...} target: resolve like LaTeX would (current dir, then root, .tex added)
	async function jumpToInclude(name: string) {
		const root = get(workspaceRoot);
		const base = loadedPath ? dirname(loadedPath) : null;
		const cand = name.trim().replace(/\\/g, '/');
		if (!cand) return;
		const names = /\.[a-z]+$/i.test(cand) ? [cand] : [cand + '.tex'];
		for (const dir of [base, root]) {
			if (!dir) continue;
			for (const n of names) {
				const path = joinPath(dir, n);
				if ((await statFile(path)).exists) {
					activeFilePath.set(path);
					return;
				}
			}
		}
	}

	// keep the \label registry, the embedded-\bibitem refs, and the cross-mode undo history fresh:
	// recompute from texSource, debounced. the AST parse runs in a worker (latest-wins; a null
	// result means superseded/failed and the previous registries stay).
	let labelTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		void texSource; // dependency: re-arm the debounce on every source change
		clearTimeout(labelTimer);
		labelTimer = setTimeout(() => {
			// read texSource LIVE (not the closed-over value): a file switch blanks it briefly and a
			// stale closure would push that transient '' into the label/citation/history state
			void extractDocRefsAsync(texSource).then((refs) => {
				if (!refs) return;
				labelStore.set(refs.labels);
				bibitemRefs = bibItemsToReferences(refs.bibitems);
			});
			sourceHistory.capture(texSource);
		}, 400);
		return () => clearTimeout(labelTimer);
	});

	// a switch held back by the save-before-switch dialog: the store reverts to the outgoing file
	// (tabs and tree stay visually on it) and this carries where the user was headed
	let heldSwitch: { target: string | null } | null = null;
	// the modal's outgoing snapshot; non-null while the save-before-switch dialog is up.
	// `resolve` marks a workspace-level guard (folder switch / close / window close): the choice
	// goes to the caller and the file-switch heldSwitch machinery is skipped.
	let saveSwitchPrompt = $state<{
		name: string;
		outgoing: { path: string; content: string };
		eol: Eol;
		resolve?: (choice: 'save' | 'discard' | 'cancel') => void;
	} | null>(null);

	// Save keeps the edit + switches, Discard drops it + switches, Cancel (X / backdrop / Escape)
	// aborts the whole switch and stays on the current file with the edit intact.
	function resolveSaveSwitch(choice: 'save' | 'discard' | 'cancel') {
		const prompt = saveSwitchPrompt;
		saveSwitchPrompt = null;
		if (!prompt) return;
		if (prompt.resolve) {
			prompt.resolve(choice);
			return;
		}
		if (choice === 'cancel') {
			saver.reattach(prompt.outgoing); // reattach so the edit is still tracked and re-guarded next time
			pendingTabClose = null; // a tab-close that triggered this switch is cancelled too
			heldSwitch = null;
			return;
		}
		if (choice === 'save') void saver.enqueueWithEol(prompt.outgoing.path, prompt.outgoing.content, false, prompt.eol);
		if (pendingTabClose) {
			tabs.close(pendingTabClose);
			pendingTabClose = null;
		}
		const target = heldSwitch?.target ?? null;
		heldSwitch = null;
		if (target !== get(activeFilePath)) activeFilePath.set(target);
	}

	// workspace-level unsaved-edit guard (folder switch, workspace close, window close): same
	// modal as the file-switch guard; resolves true to proceed (Save writes first), false on Cancel.
	function confirmLeaveUnsaved(): Promise<boolean> {
		if (autosaveActive() || !loadedPath || saver.pending?.path !== loadedPath) return Promise.resolve(true);
		const eol = docEol;
		const outgoing = saver.detach()!;
		return new Promise((resolve) => {
			saveSwitchPrompt = {
				name: basename(outgoing.path),
				outgoing,
				eol,
				resolve: (choice) => {
					if (choice === 'cancel') {
						saver.reattach(outgoing);
						resolve(false);
						return;
					}
					if (choice === 'save') void saver.enqueueWithEol(outgoing.path, outgoing.content, false, eol);
					resolve(true);
				}
			};
		});
	}

	// load the active file whenever it changes. Everything but the store read is untracked, so
	// this runs exactly once per path change (loadedPath updating mid-load must not re-fire it).
	$effect(() => {
		const path = $activeFilePath;
		untrack(() => {
			// a workspace-level prompt (folder switch / close / window close) detached the pending
			// edit, so the guard below can't see it: park ALL file switches until it resolves, or a
			// Ctrl+Tab under the modal reattaches the edit against the wrong file
			if (saveSwitchPrompt?.resolve) {
				if (path !== loadedPath) activeFilePath.set(loadedPath);
				return;
			}
			// while the dialog is up, keep the UI parked on the outgoing file; remember the newest
			// destination (Ctrl+Tab still works under the modal) and resolve it after the answer
			if (heldSwitch) {
				if (path !== loadedPath) {
					heldSwitch.target = path;
					activeFilePath.set(loadedPath);
				}
				return;
			}
			// autosave off: the outgoing file's edit wasn't auto-written, so ask BEFORE switching.
			// The modal (SaveBeforeSwitchModal) decides its fate: Save writes it, Discard drops it,
			// and Cancel aborts the switch entirely (see resolveSaveSwitch).
			if (!autosaveActive() && loadedPath && path !== loadedPath && saver.pending?.path === loadedPath) {
				const eol = docEol; // the outgoing file's EOL, before the switch changes docEol
				const outgoing = saver.detach()!; // so loadFile's teardown / the new file's queue can't touch it
				heldSwitch = { target: path };
				activeFilePath.set(loadedPath);
				saveSwitchPrompt = { name: basename(loadedPath), outgoing, eol };
				return;
			}
			saver.flush(); // persist the outgoing file's queued edit before tearing down its buffers
			loadError = null;
			// the outgoing file stays on screen until loadFile has the new one ready: clearing here
			// first is what made every switch blink through the "Openingâ€¦" placeholder
			if (path) loadFile(path);
			else closeOpenFile();
		});
	});

	/** drop the open file's buffers. per-file state (anchors, cross-mode history) must not leak. */
	function closeOpenFile() {
		texSource = '';
		docMeta = null;
		visualDoc = null;
		rawContent = '';
		loadedPath = null;
		sourceScrollAnchor = null;
		pendingVisualAnchor = null;
		sourceHistory.disable();
	}

	async function loadFile(path: string) {
		try {
			await saver.whenIdle(); // let any queued write (e.g. the file we just left) land before we read
			// shared session: assert the lock BEFORE reading disk, so a guest can't slip an edit in
			// between the flush and the reactive lock effect; then settle pending guest edits to disk
			if (session.active) session.setVisualLock(hostHoldsExclusively(fileKind(path), viewMode, path) ? path : null);
			await session.beforeOpen(path); // settle pending guest edits onto disk first
			if (get(activeFilePath) !== path) return; // a newer switch superseded us
			const k = fileKind(path);
			if (k === 'tex') {
				const raw = await readTextFile(path);
				if (get(activeFilePath) !== path) return; // raced past this file
				const text = toLf(raw); // editor works in LF
				// visual mode parses BEFORE the swap: publishing the new path with no doc yet is what
				// dropped the pane to "Openingâ€¦" for the length of a whole parse. source mode has
				// nothing to wait for.
				const mySeq = ++parseSequence;
				const outcome = viewMode === 'visual' ? await tryParseVisual(text) : null;
				if (get(activeFilePath) !== path || mySeq !== parseSequence) return; // superseded
				if (outcome?.failure) fallbackToSource(outcome.failure); // this file opens in source instead
				const parsed = outcome?.parsed ?? null;

				docEol = detectEol(raw); // remember CRLF/LF to re-apply on save
				texSource = text;
				docMeta = parsed && { preamble: parsed.preamble, postamble: parsed.postamble, hadDocumentEnv: parsed.hadDocumentEnv };
				visualDoc = parsed?.doc ?? null;
				lastDoc = parsed?.doc ?? null;
				lastParsedSource = parsed ? text : null;
				loadedPath = path;
				diskBaseline = text;
				isDirty.set(false);
				sourceHistory.reset(text); // the on-disk content is the floor of the cross-mode undo history
				sourceScrollAnchor = null;
				pendingVisualAnchor = null;
				if (viewMode === 'diff') void captureDiffSnapshot(); // re-diff the newly-opened file
			} else if (k === 'text' || k === 'bib') {
				const raw = await readTextFile(path);
				if (get(activeFilePath) !== path) return;
				docEol = detectEol(raw);
				const text = toLf(raw);
				rawContent = text;
				texSource = '';
				docMeta = null;
				visualDoc = null;
				loadedPath = path;
				diskBaseline = text;
				isDirty.set(false);
				sourceHistory.disable(); // no cross-mode history for these kinds
				sourceScrollAnchor = null;
				pendingVisualAnchor = null;
				if (viewMode === 'diff') void captureDiffSnapshot();
			} else {
				// image / binary: nothing to load, just display it
				if (get(activeFilePath) !== path) return;
				closeOpenFile();
				loadedPath = path;
				isDirty.set(false);
			}
		} catch (e) {
			if (get(activeFilePath) !== path) return;
			closeOpenFile(); // a half-open file must not stay on screen behind the error
			loadError = e instanceof Error ? e.message : m.wsview_load_error_fallback();
		}
	}

	// external-change detection: on window focus, re-read the open file. differs + unsaved
	// edits = prompt; no local edits = silently adopt the disk version.
	async function checkExternalChange() {
		const path = loadedPath;
		if (!path || (kind !== 'tex' && kind !== 'text' && kind !== 'bib') || conflict) return;
		await saver.whenIdle(); // let any in-flight autosave finish, so we don't read our own half-written file
		if (loadedPath !== path) return; // the file switched while we waited
		let raw: string;
		try {
			raw = await readTextFile(path);
		} catch {
			return;
		}
		const disk = toLf(raw); // compare in LF against our LF baseline/buffers
		if (get(activeFilePath) !== path || disk === diskBaseline) return; // unchanged on disk
		const eol = detectEol(raw); // the external writer may have changed the ending
		const buffer = kind === 'tex' ? texSource : rawContent;
		if (!get(isDirty) || buffer === disk) applyDiskReload(disk, eol);
		else conflict = { path, disk, eol };
	}

	// adopt the on-disk version into the editor, discarding local edits; disk is LF-normalized
	function applyDiskReload(disk: string, eol: Eol) {
		docEol = eol;
		diskBaseline = disk;
		if (kind === 'tex') {
			texSource = disk;
			rebuildVisualFromSource(); // re-derive docMeta + visualDoc and remount
		} else {
			rawContent = disk;
		}
		isDirty.set(false);
		// the buffer now matches disk: drop any queued autosave of the edits we just replaced, or a
		// later flush would clobber the version the user chose to keep
		saver.discard();
		// shared session: fold the adopted disk content into the shared doc so guests see it too
		// (the host materializer's lastWritten update prevents an echo write back to disk)
		if (loadedPath) session.edit(loadedPath, disk);
	}

	function resolveConflict(choice: 'reload' | 'keep') {
		const c = conflict;
		conflict = null;
		if (!c) return;
		if (choice === 'reload') applyDiskReload(c.disk, c.eol);
		else if (loadedPath === c.path) save(); // keep mine: overwrite disk now
	}

	// debounced autosave + serial write chain live in lib/workspace/savePipeline.svelte.ts
	const saver = new SavePipeline({
		sessionEdit: (path, content) => session.edit(path, content),
		isGuest: () => guest,
		autosaveActive,
		writeText: writeTextFile,
		getEol: () => docEol,
		getLoadedPath: () => loadedPath,
		getLiveContent: () => (kind === 'tex' ? texSource : rawContent),
		setDiskBaseline: (content) => (diskBaseline = content),
		setDirty: (dirty) => isDirty.set(dirty)
	});

	// a visual edit serializes straight into texSource (the single source of truth), then saves
	function onChange(doc: PMNode) {
		if (!docMeta) return;
		lastDoc = doc;
		texSource = serializeLatexFile(docMeta, doc);
		// nodeviews settling on load (or an edit undone back to the saved bytes) fire a docChanged
		// transaction that serializes right back to disk: that isn't an unsaved change, so don't
		// flag the pristine file dirty or queue a no-op save that would nag on the next switch
		if (texSource === diskBaseline) {
			if (get(isDirty)) isDirty.set(false);
			saver.discard();
			return;
		}
		isDirty.set(true);
		saver.schedule(loadedPath, texSource);
		// live session: the doc's orig stamps just went stale; VisualCollab re-stamps on the lull
		visualCollab?.noteLocalEdit();
		// the user is editing: a still-pending mode-switch scroll anchor is moot, and restoring
		// it later would yank the view away from where they're typing
		pendingVisualAnchor = null;
	}

	// inline preamble-frontmatter edit (\title/\author/\date): splice the new text into the
	// preamble verbatim and re-serialize. anything else in the preamble is Source-view territory.
	function editPreambleFrontmatter(kind: string, inner: string) {
		if (!docMeta || !lastDoc) return;
		docMeta = { ...docMeta, preamble: replacePreambleFrontmatter(docMeta.preamble, kind, inner) };
		texSource = serializeLatexFile(docMeta, lastDoc);
		isDirty.set(true);
		saver.schedule(loadedPath, texSource);
	}

	// a source edit IS texSource, write it verbatim
	function onTexInput(v: string) {
		texSource = v;
		isDirty.set(true);
		saver.schedule(loadedPath, v);
	}

	function onRawInput(v: string) {
		rawContent = v;
		isDirty.set(true);
		saver.schedule(loadedPath, v);
	}

	// mode-switch scroll + cursor sync (visual/source, .tex only): both directions carry two anchors
	// as texSource offsets, resolved positionally via the parse-time orig.start stamps (content
	// matching fails wholesale against an edited buffer; positions only drift). scroll = the
	// viewport-top block, cursor = the caret mapped proportionally within its block's orig.latex slice.
	let sourceScrollAnchor = $state<{ scroll: number | null; cursor: number | null } | null>(null); // consumed by SourceEditor at mount
	// $state so the consuming effect below re-fires when a new anchor is captured
	let pendingVisualAnchor = $state<{ scroll: number; cursor: number | null } | null>(null);

	// capture/resolve live in lib/editor/modeSwitchAnchors.ts.
	// orig.start stamps are body-relative; bodyOffsetOf knows where the body begins in the FILE
	// (fragments synthesize a preamble that is not in the file, so theirs starts at 0)
	const visualBodyOffset = () => (docMeta ? bodyOffsetOf(docMeta) : 0);
	const captureVisualAnchor = () => captureVisualAnchorAt(visualBodyOffset());

	// entering visual mode: consume the anchor once the PM view exists AND its doc matches the
	// current texSource. on the edited path EditorView first mounts with the STALE doc while the
	// worker re-parse runs; consuming then would resolve against the wrong document. the visualDoc
	// dep re-fires this effect when the parse lands.
	$effect(() => {
		const v = $editorViewStore; // set at EditorView mount
		void visualDoc; // re-fires when an async re-parse lands (the doc swap itself is untracked)
		const anchor = pendingVisualAnchor;
		const mode = viewMode;
		if (!v || anchor == null || mode !== 'visual') return;
		if (texSource !== lastParsedSource) return; // parse in flight; wait for the visualDoc re-fire
		pendingVisualAnchor = null;
		resolveVisualAnchor(v, anchor, visualBodyOffset());
	});

	// cross-mode undo/redo (lib/workspace/sourceHistory.ts): native undo/redo runs first; the
	// editors call workspaceHistoryStep only when their own history is exhausted.
	const sourceHistory = createSourceHistory();

	/** steps the workspace history; false at the stack edge lets the key fall through. */
	function workspaceHistoryStep(dir: 'undo' | 'redo'): boolean {
		if (kind !== 'tex' || !loadedPath) return false;
		const target = sourceHistory.step(dir, texSource);
		if (target == null) return false;
		texSource = target;
		isDirty.set(true);
		saver.schedule(loadedPath, texSource);
		// source mode: SourceEditor's value-sync effect replaces the CM doc. visual mode: re-parse.
		if (viewMode === 'visual') rebuildVisualFromSource();
		return true;
	}

	function setViewMode(mode: 'visual' | 'source' | 'diff') {
		if (mode === viewMode) return;
		// diff: a read-only third view (HEAD vs working copy), snapshotted on entry. not
		// persisted: a reload restores the last visual/source choice, never diff.
		if (mode === 'diff') {
			if (!loadedPath || !get(isGitRepo)) return;
			viewMode = 'diff';
			// a pending source->visual anchor must not survive a diff detour (exitDiff re-enters
			// visual without going through this function, so nothing else would clear it)
			pendingVisualAnchor = null;
			void captureDiffSnapshot();
			return;
		}
		if (kind !== 'tex' && kind !== 'bib') return;
		if (kind === 'tex') {
			sourceHistory.capture(texSource); // flush the pre-switch state into the cross-mode history
			// scroll sync: capture the outgoing view's anchor for the incoming one
			if (viewMode === 'visual' && mode === 'source') sourceScrollAnchor = captureVisualAnchor();
			else if (viewMode === 'source' && mode === 'visual') pendingVisualAnchor = captureSourceAnchor();
		}
		// switch optimistically; the async parse fills visualDoc when it returns. on failure
		// rebuildVisualFromSource drops back to source with a toast, so the user never gets
		// stuck on a blank pane. .bib uses rawContent for both views, so no rebuild needed.
		viewMode = mode;
		lastEditMode = mode;
		if (kind === 'tex' && mode === 'visual') rebuildVisualFromSource();
		if (browser) localStorage.setItem('texpile:viewMode', mode);
	}

	function exitDiff() {
		viewMode = lastEditMode;
		if (kind === 'tex' && lastEditMode === 'visual') rebuildVisualFromSource();
	}

	function toggleDiffLayout() {
		diffLayout = diffLayout === 'unified' ? 'split' : 'unified';
		if (browser) localStorage.setItem('texpile:diffLayout', diffLayout);
	}

	// snapshot the diff pair imperatively (entry / file switch / manual refresh), NOT from an
	// $effect, so it never becomes reactive on texSource and re-diffs per keystroke
	async function captureDiffSnapshot() {
		if (!loadedPath) return;
		const path = loadedPath;
		diffModified = kind === 'tex' ? texSource : rawContent;
		diffLoading = true;
		diffError = null;
		const res = await gitShowHead(path);
		if (loadedPath !== path) return; // a file switch superseded this snapshot
		diffLoading = false;
		if (!res.ok) {
			diffError = res.reason === 'no-git' ? m.wsview_diff_error_no_git() : (res.error ?? m.wsview_diff_error_default());
			diffOriginal = '';
			diffHasHead = false;
			return;
		}
		diffHasHead = res.hasHead;
		diffOriginal = res.content ?? '';
	}

	// source control ops live in lib/workspace/scmActions.svelte.ts; the panel is presentational.
	const scm = new ScmActions({
		getLoadedPath: () => loadedPath,
		discardPendingSave: () => saver.discard(),
		deleteEntry,
		refreshTree,
		loadFile,
		captureDiffSnapshot: () => void captureDiffSnapshot(),
		isDiffMode: () => viewMode === 'diff',
		enterDiffMode: () => (viewMode = 'diff')
	});

	// fire-and-forget off-main-thread parse of texSource into a fresh visual doc; the hard 3s
	// timeout terminates a runaway worker, snaps back to source mode, and toasts. the
	// parseSequence guard drops superseded results so a slow parse can't overwrite fresh state.
	let parseSequence = 0;
	// text we last successfully parsed; skip re-parsing when unchanged, a remount on identical content flashes
	let lastParsedSource: string | null = null;

	interface ParseFailure {
		timeout: boolean;
		message: string;
	}
	interface ParseOutcome {
		parsed?: ParsedLatexFile;
		failure?: ParseFailure;
	}

	// the failure is returned rather than handled here: only the caller knows whether its parse is
	// still the current one, and a superseded parse must not yank the user out of visual mode.
	// timeout scales with file size (parse time is ~linear): small files keep the snappy 3s
	// fallback, a 1MB paper gets long enough to actually finish instead of always dropping to source.
	async function tryParseVisual(text: string): Promise<ParseOutcome> {
		try {
			const timeoutMs = Math.min(15000, 3000 + Math.floor(text.length / 100));
			return { parsed: await parseLatexFileAsync(text, projectMacros, timeoutMs) };
		} catch (e) {
			const timeout = e instanceof Error && e.message === PARSE_TIMEOUT;
			return { failure: { timeout, message: e instanceof Error ? e.message : String(e) } };
		}
	}

	function fallbackToSource(failure: ParseFailure): void {
		viewMode = 'source';
		visualDoc = null;
		pendingVisualAnchor = null; // never re-anchor a later visual entry off this failed switch
		if (failure.timeout) {
			toaster.warning({ title: m.wsview_toast_file_too_large_title() });
		} else {
			toaster.error({ title: m.wsview_toast_parse_failed_title(), description: failure.message });
		}
	}

	function rebuildVisualFromSource(): void {
		// fast path: source unchanged since the last successful parse, keep the mounted PM view
		if (texSource === lastParsedSource && visualDoc) return;

		const mySeq = ++parseSequence;
		void tryParseVisual(texSource).then((o) => {
			if (mySeq !== parseSequence) return; // superseded
			if (o.failure) return fallbackToSource(o.failure);
			if (!o.parsed) return;
			docMeta = { preamble: o.parsed.preamble, postamble: o.parsed.postamble, hadDocumentEnv: o.parsed.hadDocumentEnv };
			visualDoc = o.parsed.doc;
			lastDoc = o.parsed.doc;
			// quirk: this records the CURRENT texSource, which may be post-edit text if the user
			// typed while the parse was in flight. harmless: onChange clears the anchor on edits.
			lastParsedSource = texSource;
			visualCollab?.noteFreshParse(); // a full re-parse stamped everything fresh
			// EditorView reacts to the new localValue and swaps state on the existing instance: no remount, no flicker
		});
	}

	// manual save (Ctrl/Cmd+S or the Save button); autosave handles the rest
	function save() {
		saver.discard(); // drop the queued debounce; we're writing the current content now
		if (kind === 'tex' && loadedPath) void saver.enqueue(loadedPath, texSource, true);
		else if ((kind === 'text' || kind === 'bib') && loadedPath) void saver.enqueue(loadedPath, rawContent, true);
		// image / binary: nothing to save
	}

	// return keyboard focus to whichever editor is showing (Esc from panels)
	function focusEditor() {
		if (viewMode === 'source') {
			const cm = get(sourceCmView);
			if (cm && cm.dom.isConnected) cm.focus();
		} else {
			get(editorViewStore)?.focus();
		}
	}
	// close Find in Files and hand focus back; tick first so the unmounting input
	// can't re-steal focus to body
	async function closeGlobalSearch() {
		sidebarView = 'explorer';
		await tick();
		focusEditor();
	}

	let globalSearchRef = $state<GlobalSearch | null>(null);
	// open Find in Files with the input focused; a single-line source selection seeds the query
	async function openGlobalSearch() {
		let seed: string | undefined;
		const cm = get(sourceCmView);
		if (cm && cm.dom.isConnected) {
			const { from, to } = cm.state.selection.main;
			if (to > from && to - from < 200) {
				const sel = cm.state.sliceDoc(from, to);
				if (!sel.includes('\n')) seed = sel;
			}
		}
		sidebarView = 'search';
		sidebarOpen = true;
		await tick(); // let the panel mount before focusing
		globalSearchRef?.focusInput(seed);
	}

	// Whole-window UI zoom (webContents.setZoomFactor scales the entire renderer: editor,
	// sidebar, toolbars, panels). Persisted in settings and adjusted from the View menu and
	// Ctrl/Cmd +/-/0. Distinct from the PDF / Live preview zoom, which only scales the preview.
	const UI_ZOOM_MIN = 0.5;
	const UI_ZOOM_MAX = 2.5;
	const UI_ZOOM_STEP = 0.1;
	const uiZoomPercent = $derived(Math.round(($settings.uiZoom ?? 1) * 100));
	function setUiZoom(factor: number) {
		const f = Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, Math.round(factor * 100) / 100));
		native()?.setZoomFactor?.(f);
		updateSettings({ uiZoom: f });
	}
	const uiZoomIn = () => setUiZoom(($settings.uiZoom ?? 1) + UI_ZOOM_STEP);
	const uiZoomOut = () => setUiZoom(($settings.uiZoom ?? 1) - UI_ZOOM_STEP);
	const uiZoomReset = () => setUiZoom(1);

	function onKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'w') {
			e.preventDefault();
			if (loadedPath) closeTab(loadedPath);
		} else if (e.ctrlKey && e.key === 'Tab') {
			e.preventDefault();
			const next = tabs.cycle(get(activeFilePath), e.shiftKey ? -1 : 1);
			if (next) activeFilePath.set(next);
		} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
			e.preventDefault(); // block the browser save dialog; guests have nothing to save (edits are live)
			if (!guest) save();
		} else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
			e.preventDefault();
			void openGlobalSearch();
		} else if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
			e.preventDefault(); // '=' is the unshifted '+' key, so this is Ctrl/Cmd+Plus
			uiZoomIn();
		} else if ((e.metaKey || e.ctrlKey) && e.key === '-') {
			e.preventDefault();
			uiZoomOut();
		} else if ((e.metaKey || e.ctrlKey) && e.key === '0') {
			e.preventDefault();
			uiZoomReset();
		} else if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === 'Enter' && terminalAvailable) {
			// was ctrl/cmd+alt+b (LaTeX Workshop's default build chord), but macOS treats
			// option+b as a dead key for a special character, so e.key never reliably comes
			// through as "b" there. Swapped the letter to Enter (not a dead-key character on
			// macOS) rather than dropping Alt entirely - bare ctrl/cmd+enter is already taken
			// by the Source Control panel's commit shortcut (SourceControlPanel.svelte).
			e.preventDefault();
			if (compiler.compiling) compiler.stopCompile();
			else compiler.runCompile();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />
<!-- file - folder - app (VS Code's order); the folder segment tells windows apart in the taskbar -->
<svelte:head
	><title>{$workspaceRoot ? `${loadedPath ? `${basename(loadedPath)} - ` : ''}${basename($workspaceRoot)} - Texpile` : 'Texpile'}</title
	></svelte:head
>

<div class="flex h-screen flex-col overflow-hidden">
	{#if guest}
		<GuestBar />
	{:else}
		<WorkspaceMenuBar
			disabled={!loadedPath}
			imageDir={loadedPath && kind === 'tex' ? dirname(loadedPath) : undefined}
			onNewFile={(ext) => newFileOfType(ext)}
			onOpenFolder={openFolderFromMenu}
			onCloseWorkspace={closeWorkspace}
			onSave={save}
			onShareSession={isDesktop() ? () => (shareModalOpen = true) : undefined}
			{terminalAvailable}
			{terminalVisible}
			onCompile={compiler.runCompile}
			onConfigureCompile={openCompileModal}
			onNewTerminal={newTerminalFromMenu}
			onToggleTerminal={toggleTerminal}
			onFormatDocument={openFormatModal}
			onOpenTutorial={() => (tutorialModalOpen = true)}
			{uiZoomPercent}
			onZoomIn={uiZoomIn}
			onZoomOut={uiZoomOut}
			onZoomReset={uiZoomReset}
		/>
	{/if}
	<div class="flex min-h-0 flex-1 overflow-hidden">
		{#if sidebarOpen}
			<WorkspaceSidebar
				width={sidebarWidth}
				{guest}
				{modLabel}
				bind:view={sidebarView}
				scmBusy={scm.busy}
				{showToc}
				{tocFraction}
				{viewMode}
				bind:fileTreeRef
				bind:globalSearchRef
				bind:splitEl
				onRefreshTree={refreshTree}
				onOpenGlobalSearch={() => void openGlobalSearch()}
				onCloseGlobalSearch={() => void closeGlobalSearch()}
				onOpenFileAt={openFileAtLine}
				onOpenEntry={openEntry}
				onCreate={treeOps.create}
				onRename={treeOps.rename}
				onDelete={treeOps.deleteMany}
				onMove={treeOps.moveMany}
				onImport={treeOps.import}
				onCopyIn={treeOps.copyIn}
				onSetMain={(entry) => applyMainFile(entry.path)}
				onStartTocResize={startTocResize}
				onResizeTocByKey={resizeTocByKey}
				onRefreshGit={() => refreshGitStatus($workspaceRoot)}
				scmInit={scm.init}
				scmStage={scm.stage}
				scmUnstage={scm.unstage}
				scmDiscard={scm.discard}
				scmCommit={scm.commit}
				scmOpenDiff={scm.openDiff}
			/>

			<!-- same WAI-ARIA window-splitter pattern as above; svelte's a11y rule doesn't special-case it -->
			<!-- eslint-disable-next-line svelte/valid-compile -->
			<div
				class="hover:bg-primary-500/40 active:bg-primary-500/60 relative z-20 -mx-[3px] w-1.5 shrink-0 cursor-col-resize bg-transparent transition-colors"
				onmousedown={startResize}
				onkeydown={resizeSidebarByKey}
				role="separator"
				aria-orientation="vertical"
				aria-label={m.wsview_resize_sidebar_aria()}
				tabindex="0"
			></div>
		{/if}

		<main
			class="grid min-h-0 min-w-0 flex-1"
			style="grid-template-columns: minmax(0, 1fr) auto auto; grid-template-rows: auto minmax(0, 1fr) auto auto"
		>
			<EditorTopbar
				{loadedPath}
				{kind}
				{viewMode}
				{guest}
				{terminalAvailable}
				compiling={compiler.compiling}
				{pdfPaneOpen}
				{draftPaused}
				saving={saver.saving}
				{sidebarOpen}
				{modLabel}
				onToggleSidebar={toggleSidebar}
				onSetViewMode={setViewMode}
				onSyncForward={syncForward}
				onStopCompile={compiler.stopCompile}
				onPauseDraft={pauseDraft}
				onResumeDraft={resumeDraft}
				onCompile={compiler.runCompile}
				onRequestCompile={() => {
					collabGuest.requestCompile();
					toaster.info({ title: m.session_compile_requested(), duration: 2500 });
				}}
				onConfigureCompile={openCompileModal}
				onShowProblems={() => {
					showTerminal();
					dockView = 'problems';
				}}
				onTogglePdf={togglePdfPane}
				onSave={save}
			/>

			<!-- editor column (toolbar + content) with the PDF pane beside it, so the PDF
			     skips the toolbar while the header (Compile) stays above it. the wrapper is
			     display:contents so editor/splitter/preview place themselves on main's grid -->
			<div class="contents">
				<EditorPane
					openTabs={tabs.list}
					onActivateTab={activateTab}
					onCloseTab={closeTab}
					{loadedPath}
					{kind}
					{nameOnly}
					{viewMode}
					{session}
					{folderEmpty}
					{loadError}
					{applyingStarter}
					{texSource}
					{rawContent}
					{visualDoc}
					{docMeta}
					{allReferences}
					{sourceGotoLine}
					{sourceScrollAnchor}
					{sourceDiagnostics}
					{diffOriginal}
					{diffModified}
					{diffLayout}
					{diffLoading}
					{diffError}
					{diffHasHead}
					{fileUrl}
					onPickStarter={pickStarter}
					onBlankStarter={newTexFile}
					onImportStarter={importStarterFiles}
					{onTexInput}
					{onRawInput}
					onVisualChange={onChange}
					onVisualSelection={() => visualCollab?.publishCursor()}
					onEditFrontmatter={editPreambleFrontmatter}
					onSyncToPdf={syncForwardLine}
					onHistoryBoundary={workspaceHistoryStep}
					onJumpToFile={jumpToInclude}
					onOpenFileAt={openFileAtLine}
					onToggleDiffLayout={toggleDiffLayout}
					onRefreshDiff={captureDiffSnapshot}
					onExitDiff={exitDiff}
				/>
				{#if pdfPaneOpen}
					<PreviewPane
						width={pdfPaneWidth}
						{dockShrunk}
						{guest}
						guestPdf={session.guestPdf}
						pdfFilename={compiler.pdfFilename}
						{draftRoot}
						{draftMainRel}
						{draftTrigger}
						bind:pdfPaneRef
						bind:draftRef
						onStartResize={startPdfResize}
						onResizeByKey={resizePdfByKey}
						onClose={togglePdfPane}
						onPageClick={onPdfDoubleClick}
						onInverseSync={(file, line, selectText) => openFileAtLine(normPath(file), line, selectText)}
						onSettled={runDraftDecision}
					/>
				{/if}
			</div>

			{#if terminalMounted && (terminalAvailable || guest)}
				<TerminalDock
					terminalEnabled={terminalAvailable}
					visible={terminalVisible}
					height={terminalHeight}
					shrink={terminalShrink}
					{dockShrunk}
					cwd={$workspaceRoot ?? ''}
					{pdfPaneOpen}
					bind:view={dockView}
					bind:dock
					onStartResize={startTerminalResize}
					onResizeByKey={resizeTerminalByKey}
					onToggleShrink={toggleTerminalShrink}
					onClose={toggleTerminal}
					onProblemJump={openFileAtLine}
				/>
			{/if}
		</main>
	</div>

	{#if mainConfirmOpen}
		<MainFileModal
			candidates={mainCandidates}
			bind:choice={mainChoice}
			detected={mainDetected}
			docRoots={mainDocRoots}
			onConfirm={confirmMainFile}
			onDismiss={dismissMainConfirm}
		/>
	{/if}

	<CompileCommandModal
		bind:open={compileModalOpen}
		bind:command={compileDraft}
		bind:outputs={compileOutputsDraft}
		bind:advancedOpen
		onSave={saveCompileCommand}
		onUseDefault={useDefaultCommand}
		onRun={compiler.runCompile}
	/>

	<FormatModal bind:open={formatModalOpen} {formatting} onFormat={runFormat} />

	<!-- file edited on disk while we held unsaved edits -->
	{#if conflict}
		<ConflictModal path={conflict.path} onResolve={resolveConflict} />
	{/if}

	<!-- autosave off, switching away from a file with unsaved edits -->
	{#if saveSwitchPrompt}
		<SaveBeforeSwitchModal name={saveSwitchPrompt.name} onResolve={resolveSaveSwitch} />
	{/if}

	{#if pendingRefUpdate}
		<RefUpdateModal update={pendingRefUpdate} onKeep={() => (pendingRefUpdate = null)} onApply={applyRefUpdate} />
	{/if}
</div>

<TutorialConfirmModal bind:open={tutorialModalOpen} onConfirm={openTutorial} />
{#if !guest}
	<SessionShareModal bind:open={shareModalOpen} root={$workspaceRoot} onBeforeStart={() => saver.flushAndWait()} />
{/if}
{#if session.active}
	<VisualCollab bind:this={visualCollab} {session} path={loadedPath} {kind} {viewMode} api={visualCollabApi} />
{/if}
