<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
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
	import RefUpdateModal, { type RefUpdate } from '$lib/editor/comp/RefUpdateModal.svelte';
	import { compileLog, resolveLogPath } from '$lib/stores/compileLogStore';
	import { parseCompileDiagnosticsInWorker } from '$lib/latex-log/parseInWorker';
	import DraftView from '$lib/draft/DraftView.svelte';
	import GlobalSearch from '$lib/editor/comp/GlobalSearch.svelte';
	import TutorialConfirmModal from '$lib/editor/comp/TutorialConfirmModal.svelte';
	import { applyStarter, applyImportedFiles, openTutorialProject, type Starter, type ImportedFile } from '$lib/workspace/starters';
	import { pdfStore } from '$lib/stores/pdfStore';
	import { editorViewStore, sourceCmView, viewMode as viewModeStore } from '$lib/stores/editorStore';
	import { synctexForward, synctexInverse } from '$lib/workspace/synctex';
	import { sourceTocStore } from '$lib/editor/extensions/tableofcontents/tocStore';
	import { parseOutlineRaw, assembleProjectOutline } from '$lib/editor/extensions/tableofcontents/latexHeadings';
	import { refreshProjectIntel } from '$lib/workspace/projectIntel';
	import { projectIntelStore } from '$lib/stores/projectIntel';
	import { setGraphicResolver } from '$lib/editor/extensions/intellisense/hover';
	import { replacePreambleFrontmatter } from '$lib/editor/extensions/raw-latex/frontmatterView';
	import { initSpellcheckConfig } from '$lib/editor/extensions/spellcheck/spellcheckConfig';
	import WorkspaceMenuBar from '$lib/editor/comp/WorkspaceMenuBar.svelte';
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import type { EditSession } from '$lib/collab/editSession';
	import SessionShareModal from '$lib/collab/SessionShareModal.svelte';
	import GuestBar from '$lib/collab/GuestBar.svelte';
	import SessionBadge from '$lib/collab/SessionBadge.svelte';
	import * as cc from '$lib/workspace/compileCommand';
	import { references, loadReferences, bibItemsToReferences, type BibLaTeXReference } from '$lib/workspace/citations';
	import { labelStore, referenceStore, filePathStore } from '$lib/stores/editorStore';
	import { extractDocRefs } from '$lib/latex-parser/labels';
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
		savedCompileCommand,
		setFolderCompileCommand,
		savedCompileOutputs,
		setCompileOutputs
	} from '$lib/workspace/workspaceStore';
	import { addRecentFolder } from '$lib/workspace/workspaceStore';
	import { refreshGitStatus, isGitRepo, gitChanges, takeNoGitHint } from '$lib/workspace/gitStore';
	import { gitShowHead, gitInit, gitStage, gitUnstage, gitDiscard, gitCommit, type GitStatusEntry } from '$lib/workspace/git';
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
	// true for the disk-backed host; false for a read-only guest session. Gates the host-only
	// lifecycle (folder claim, terminal, main-file/macro scan, on-disk change checks) so this same
	// view can run over a shared session.
	const hostMode = $derived(provider.caps.manageTree);
	// a guest session: source-mode-only, host chrome (compile/terminal/git/file-ops/share) hidden
	const guest = $derived(session.isGuest);
	// guests never enter visual/diff (no local parse pipeline, no disk to diff against)
	$effect(() => {
		if (guest && viewMode !== 'source') viewMode = 'source';
	});
	import { modLabel } from '$lib/platform';
	import { serializeLatexFile, createStarterLatex, type ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
	import { parseLatexFileAsync, PARSE_TIMEOUT } from '$lib/workspace/latexParserClient';
	import type { Node as PMNode } from 'prosemirror-model';
	import { TextSelection } from 'prosemirror-state';
	import { flashNodeAt } from '$lib/editor/extensions/flash-plugin';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { m } from '$lib/paraglide/messages';

	let loadedPath = $state<string | null>(null);
	let loadError = $state<string | null>(null);
	let saving = $state(false);

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

	// shared session: a file the host holds in a NON-Y-bound editor is host-exclusive (guests go
	// read-only), else concurrent guest edits to that file's Y.Text would be clobbered. Source mode
	// (tex/bib/text) is Y-bound and co-edits freely; visual tex (ProseMirror) and bib in BibManager
	// are not, so they lock.
	function hostHoldsExclusively(k: string, mode: string, path: string | null): boolean {
		if (!path) return false;
		return (k === 'tex' && mode === 'visual') || (k === 'bib' && mode !== 'source');
	}
	$effect(() => {
		if (!session.active) return;
		session.setVisualLock(hostHoldsExclusively(kind, viewMode, loadedPath) ? loadedPath : null);
	});

	let applyingStarter = $state(false);
	async function pickStarter(s: Starter) {
		const root = get(workspaceRoot);
		if (!root || applyingStarter) return;
		applyingStarter = true;
		try {
			const mainPath = await applyStarter(root, s);
			setMainFile(root, mainPath);
			await loadReferences(root); // the starter may include references.bib; reload so its \cite keys resolve
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
			await loadReferences(root); // imported .bib -> resolve its \cite keys
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
		await createInTree(
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
		terminalAvailable = isDesktop() && hostMode; // client-only; set here so SSR/CSR agree
		if (guest) pdfPaneOpen = true; // guests land with the host's PDF visible
		loadReferences(root);
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
			if (root) void loadReferences(root);
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
		const onCompile = () => runCompile();
		// re-clamp the PDF pane when the window shrinks so it can't squeeze the editor out
		const onResize = () => {
			pdfPaneWidth = clampPdf(pdfPaneWidth);
		};
		window.addEventListener('focus', onFocus);
		window.addEventListener('texpile:fs-changed', onFsChanged);
		window.addEventListener('compile', onCompile);
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('focus', onFocus);
			window.removeEventListener('texpile:fs-changed', onFsChanged);
			window.removeEventListener('compile', onCompile);
			window.removeEventListener('resize', onResize);
			if (pdfWatchTimer) clearTimeout(pdfWatchTimer);
			if (logWatchTimer) clearTimeout(logWatchTimer);
		};
	});

	async function refreshTree() {
		const root = get(workspaceRoot);
		if (!root) return;
		// don't rebuild while the user is typing a name in the tree (a refresh would tear
		// the inline input down mid-edit); it re-scans after they commit
		if (fileTreeRef?.isEditing?.()) return;
		try {
			const { children } = await scanTree(root);
			fileTree.set(children);
		} catch (e) {
			console.error('Failed to read folder tree:', e);
		}
		try {
			const { files } = await scanTexFiles(root);
			texFiles.set(files);
		} catch {
			/* ignore */
		}
		// shared session: the manifest mirrors the tree, same single call-site trick
		void session.syncTree();
		// git refresh is non-blocking and never throws; this single call-site
		// covers every refreshTree() trigger for free
		void refreshGitStatus(root).then(({ missingGit }) => {
			if (missingGit && takeNoGitHint()) {
				toaster.warning({ title: m.wsview_toast_no_git_title(), description: m.wsview_toast_no_git_desc() });
			}
		});
	}

	function openEntry(entry: TreeEntry) {
		if (entry.type !== 'file') return;
		activeFilePath.set(entry.path);
	}

	// re-init the workspace in place: swap the root, rescan, re-derive the project, load its first
	// file. setting activeFilePath flushes the outgoing file's edits first (see the $effect).
	async function openFolderFromMenu(path?: string) {
		const root = path ?? (await pickFolder());
		if (!root) return;
		const prevRoot = get(workspaceRoot);
		try {
			// already open in another window: that window was focused, this one stays put
			if (!(await claimWorkspace(root)).ok) return;
			// a shared session is tied to THIS folder's doc; swapping the root would leave it sharing
			// the old folder invisibly, so end it before the swap
			if (session.active && root !== prevRoot) await session.end();
			const { files } = await scanTexFiles(root);
			resolveMainConfirm(root); // before the stores flip, so the modal effect can't see a stale state
			workspaceRoot.set(root);
			texFiles.set(files);
			addRecentFolder(root);
			updateSettings({ lastFolder: root });
			await refreshTree();
			await initProject(root);
			loadReferences(root);
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
		await flushSaveAndWait();
		resolveMainConfirm(null);
		releaseWorkspace(); // frees the folder so another window may open it
		workspaceRoot.set(null);
		texFiles.set([]);
		fileTree.set([]);
		activeFilePath.set(null);
		mainFile.set(null);
		isDirty.set(false);
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
		void loadExistingPdf(); // show an already-compiled PDF for this folder without a recompile
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
		void loadExistingPdf(); // the main file changed → its expected PDF did too
		projectMacros = next ? await gatherProjectMacros(next, root) : '';
		if (get(workspaceRoot) !== root) return;
		if (loadedPath && kind === 'tex' && viewMode === 'visual') rebuildVisualFromSource();
	}

	async function createInTree(parentDir: string, name: string, type: 'file' | 'dir' | 'include') {
		try {
			// an "include" is a .tex fragment: it gets \input into a host doc, so no \documentclass skeleton
			const isInclude = type === 'include';
			if (isInclude && !name.toLowerCase().endsWith('.tex')) name += '.tex';
			const fsType: 'file' | 'dir' = type === 'dir' ? 'dir' : 'file';
			const path = joinPath(parentDir, name);
			const isTex = fsType === 'file' && name.toLowerCase().endsWith('.tex');
			// source-mode users write their own preamble, so hand them an empty file and let the
			// editor's ghost offer the skeleton (Tab takes it). Visual mode has no ghost to show
			// and no way to write a preamble, so it still gets one up front.
			const wantsStarter = isTex && lastEditMode !== 'source';
			const content = !isInclude && wantsStarter ? createStarterLatex() : '';
			await createEntry(path, fsType, content);
			// insert the \input into the current doc BEFORE switching away (the switch flushes its save)
			if (isInclude && !insertIncludeAtCursor(path)) {
				toaster.error({
					title: m.wsview_toast_include_not_inserted_title(),
					description: m.wsview_toast_include_not_inserted_desc()
				});
			}
			await refreshTree();
			if (name.toLowerCase().endsWith('.bib')) await loadReferences(get(workspaceRoot) ?? parentDir); // new .bib -> refresh citation keys
			if (isTex) activeFilePath.set(path);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			toaster.error({
				title: m.wsview_toast_create_failed_title(),
				description: msg.includes('EEXIST') ? m.wsview_toast_already_exists({ name }) : msg
			});
		}
	}

	async function renameInTree(entry: TreeEntry, newName: string) {
		try {
			const to = joinPath(dirname(entry.path), newName);
			await renameEntry(entry.path, to);
			if (get(activeFilePath) === entry.path) activeFilePath.set(to);
			await refreshTree();
			void afterRename(entry.path, to);
		} catch (e) {
			toaster.error({ title: m.wsview_toast_rename_failed_title(), description: e instanceof Error ? e.message : String(e) });
		}
	}

	async function deleteInTree(entry: TreeEntry) {
		try {
			const active = get(activeFilePath);
			const sep = entry.path.includes('\\') ? '\\' : '/';
			// the open file is gone if it's the deleted entry, or lives inside a deleted folder
			const closesOpenFile = !!active && (samePath(active, entry.path) || active.startsWith(entry.path + sep));
			if (closesOpenFile) {
				discardPendingSave(); // don't let a queued autosave write the file back after we delete it
				activeFilePath.set(null); // clears the editor buffers via the load effect
			}
			await deleteEntry(entry.path);
			await refreshTree();
		} catch (e) {
			toaster.error({ title: m.wsview_toast_delete_failed_title(), description: e instanceof Error ? e.message : String(e) });
		}
	}

	// drag-and-drop move: a move is a rename to a new directory
	async function moveInTree(entry: TreeEntry, targetDir: string) {
		try {
			const sep = entry.path.includes('\\') ? '\\' : '/';
			const to = targetDir.replace(/[\\/]+$/, '') + sep + entry.name;
			if (to === entry.path) return; // already in this folder
			await renameEntry(entry.path, to);
			// keep the open file pointed at its new location if it (or its folder) moved
			const active = get(activeFilePath);
			if (active === entry.path) activeFilePath.set(to);
			else if (active && active.startsWith(entry.path + sep)) activeFilePath.set(to + active.slice(entry.path.length));
			await refreshTree();
			void afterRename(entry.path, to);
		} catch (e) {
			toaster.error({ title: m.wsview_toast_move_failed_title(), description: e instanceof Error ? e.message : String(e) });
		}
	}

	// multi-select fan-out: sequential so each move/delete sees the tree state the last one left
	async function deleteManyInTree(entries: TreeEntry[]) {
		for (const entry of entries) await deleteInTree(entry);
	}
	async function moveManyInTree(entries: TreeEntry[], targetDir: string) {
		for (const entry of entries) await moveInTree(entry, targetDir);
	}

	/** targetDir + name, numbered (name-1.ext, name-2.ext, ...) until it doesn't collide. */
	async function uniqueDest(targetDir: string, name: string): Promise<string> {
		const sep = targetDir.includes('\\') ? '\\' : '/';
		const base = targetDir.replace(/[\\/]+$/, '') + sep;
		let dest = base + name;
		let n = 0;
		while ((await statFile(dest)).exists) {
			n++;
			const dot = name.lastIndexOf('.');
			dest = base + (dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`);
		}
		return dest;
	}

	// files dropped from the OS file manager (or pasted from the clipboard) copy into the tree.
	// Bytes come from the drag/clipboard payload, so no OS paths are involved.
	async function importIntoTree(items: { relPath: string; file: File }[], targetDir: string) {
		let imported = 0;
		try {
			for (const item of items) {
				const sep = targetDir.includes('\\') ? '\\' : '/';
				const rel = item.relPath.split('/').join(sep);
				// a clashing top-level name gets a numbered variant instead of overwriting;
				// nested paths (folder drops) merge like an OS copy would
				const dest = rel.includes(sep) ? targetDir.replace(/[\\/]+$/, '') + sep + rel : await uniqueDest(targetDir, rel);
				await writeBinaryFile(dest, item.file);
				imported++;
			}
			toaster.success({
				title: imported === 1 ? m.wsview_toast_imported_one({ count: imported }) : m.wsview_toast_imported_other({ count: imported })
			});
		} catch (e) {
			toaster.error({ title: m.wsview_toast_import_failed_title(), description: e instanceof Error ? e.message : String(e) });
		} finally {
			await refreshTree();
		}
	}

	// a tree drag from another Texpile window: recursive fs-side copy (the source window's
	// workspace is left untouched; a cross-window MOVE would go stale under its feet)
	async function copyIntoTree(paths: string[], targetDir: string) {
		let copied = 0;
		try {
			for (const src of paths) {
				const dest = await uniqueDest(targetDir, basename(src));
				await copyEntry(src, dest);
				copied++;
			}
			toaster.success({
				title: copied === 1 ? m.wsview_toast_imported_one({ count: copied }) : m.wsview_toast_imported_other({ count: copied })
			});
		} catch (e) {
			toaster.error({ title: m.wsview_toast_import_failed_title(), description: e instanceof Error ? e.message : String(e) });
		} finally {
			await refreshTree();
		}
	}

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
	// .tex; \input fragments pre-scanned into projectIntel merge into one numbered project outline
	$effect(() => {
		const src = texSource;
		const intel = $projectIntelStore;
		if (kind === 'tex' && viewMode === 'source')
			sourceTocStore.set(
				assembleProjectOutline(
					parseOutlineRaw(src),
					loadedPath,
					loadedPath ? dirname(loadedPath) : null,
					get(workspaceRoot),
					intel.outlines
				)
			);
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
	// per-folder command wins over the global default (the last one saved anywhere)
	const resolveCompileCommand = (root: string | null, global: string) => (root && savedCompileCommand(root)) || global || '';
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
	let pdfFilename = $state('output.pdf');
	let pdfWatchTimer: ReturnType<typeof setTimeout> | null = null;
	let logWatchTimer: ReturnType<typeof setTimeout> | null = null;
	// bumped when a compile starts, ends, or the folder changes; pollers from a superseded run
	// check it and stand down (their timeout may already be in flight when the timers are cleared)
	let compileGen = 0;
	// bottom dock body: the terminal shells (always mounted) or the Problems list
	let dockView = $state<'terminal' | 'problems'>('terminal');
	// true from Compile until the run visibly ends (PDF landed, log settled, or timeout);
	// drives the Compile button's Stop toggle, and Stop sends Ctrl+C to the shell
	let compiling = $state(false);
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
		void loadExistingPdf();
		finishMainConfirm();
		projectMacros = await gatherProjectMacros(chosen, root);
	}
	// dismissed without confirming: compile with the detected file for this session, ask again next time
	function dismissMainConfirm() {
		finishMainConfirm();
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
		await flushSaveAndWait();
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
			await flushSaveAndWait();
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

	function stopCompile() {
		dock?.interrupt();
		compiling = false;
	}
	// a new folder's diagnostics start blank, the previous folder's log is meaningless here
	$effect(() => {
		const root = $workspaceRoot;
		compileLog.set(null);
		dockView = 'terminal';
		compiling = false;
		compileGen++; // any pollers still watching the previous folder's paths stand down
		compileCommand = resolveCompileCommand(root, get(settings).compileCommand);
	});
	// last compile's problems for the file open in source mode; badboxes ride along
	// as "info" so they underline without alarming colors
	const sourceDiagnostics = $derived.by(() => {
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
		terminalMounted = true; // mounts BottomDock, which creates its first shell
		terminalVisible = true;
		updateSettings({ terminalVisible: true });
		setTimeout(() => dock?.refit(), 0);
	}
	function toggleTerminal() {
		if (terminalVisible) {
			terminalVisible = false;
			updateSettings({ terminalVisible: false });
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

	// a TeX engine at its default errorstop interaction parks at the interactive ? prompt on the
	// first error. for known engine commands, inject -interaction=nonstopmode (plus -file-line-error
	// for exact error attribution); custom scripts/makefiles are left untouched.
	function withBatchFlags(cmd: string): string {
		const m = cmd.match(/^(\s*(?:latexmk|pdflatex|xelatex|lualatex)(?:\.exe)?)(?=\s|$)/i);
		if (!m) return cmd;
		const flags: string[] = [];
		if (!/-interaction[= ]/.test(cmd)) flags.push('-interaction=nonstopmode');
		if (!/-file-line-error\b/.test(cmd)) flags.push('-file-line-error');
		return flags.length > 0 ? cmd.replace(m[1], `${m[1]} ${flags.join(' ')}`) : cmd;
	}

	// expand {main} to the project's main file (relative to the folder root), else the open file
	function resolvedCompileCommand(cmd: string): string {
		const root = get(workspaceRoot);
		const target = get(mainFile) ?? loadedPath;
		const rel = root && target ? relFromRoot(target, root) : '';
		// quote a path containing spaces so the shell keeps it one argument;
		// a {main} the user already wrapped in quotes stays untouched
		const quoted = /\s/.test(rel) ? `"${rel}"` : rel;
		return cmd.replace(/(["']){main}\1/g, `$1${rel}$1`).replaceAll('{main}', quoted);
	}

	// show the terminal, wait for mount, then run (the shell queues the command until it has
	// spawned). onDone fires when the shell reports the line finished (Terminal.run's sentinel echo).
	function runInTerminal(cmd: string, onDone?: (output: string) => void, tries = 0) {
		if (dock) {
			dock.runCommand(cmd, onDone);
			return;
		}
		if (tries < 40) setTimeout(() => runInTerminal(cmd, onDone, tries + 1), 25); // ~1s for the dock to mount
	}
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
		await flushSaveAndWait();
		lastDraftSrc = texSource; // the live-edit effect won't redundantly recompile this same source
		lastDraftPath = loadedPath;
		setPdfPaneOpen(true);
		draftTrigger++;
	}

	async function runCompile() {
		// first compile in a folder with no explicitly chosen main file: confirm it first
		if (mainConfirmed !== true && get(texFiles).length > 1) {
			void openMainConfirm(() => void runCompile());
			return;
		}
		if (get(settings).draftMode) {
			await runDraftCompile();
			return;
		}
		if (!terminalAvailable) return;
		const cmd = compileCommand.trim();
		// no command yet: ask in the modal first
		if (!cmd) {
			openCompileModal();
			return;
		}
		// {main} with no main file: a truly empty folder has nothing to compile; otherwise the user
		// cleared the main file, so let them pick one (then compile). Dismissing leaves it unset.
		if (cmd.includes('{main}') && !get(mainFile)) {
			if (get(texFiles).length === 0) {
				toaster.error({ title: m.wsview_toast_nothing_to_compile_title(), description: m.wsview_toast_nothing_to_compile_desc() });
			} else {
				void openMainConfirm(() => {
					if (get(mainFile)) void runCompile();
				});
			}
			return;
		}
		// shared session: guests can inject LaTeX the host compiles, so shell escape stays off
		if (session.active && /(^|[^-\w])(-{1,2}shell-escape|-{1,2}enable-write18)\b/.test(cmd)) {
			toaster.error({ title: m.wsview_toast_shell_escape_blocked(), duration: 5000 });
			return;
		}
		// write the buffer to disk BEFORE compiling so SyncTeX indexes exactly what the editor
		// holds; otherwise reverse search maps PDF clicks into a stale, differently formatted .tex
		await flushSaveAndWait();
		const pdfPath = expectedPdfPath();
		const before = pdfPath ? (await statFile(pdfPath)).mtimeMs : 0; // baseline BEFORE compiling
		const logPath = expectedLogPath();
		const logBefore = logPath ? (await statFile(logPath)).mtimeMs : 0;
		await ensureOutputDir();
		refreshTree(); // the output/ folder may have just been created
		showTerminal();
		// marker off = no end signal from the shell; leave the button as Compile instead of a
		// Stop that would linger until the log/PDF pollers time out
		const track = get(settings).compileSentinel;
		compiling = track;
		const gen = ++compileGen;
		compileStdout = '';
		runInTerminal(
			withBatchFlags(resolvedCompileCommand(cmd)),
			track
				? (output) => {
						compileStdout = output ?? ''; // dvipdfmx/xdvipdfmx diagnostics only exist here
						finalizeCompile(gen, pdfPath, before, logPath, logBefore);
					}
				: undefined
		);
		if (pdfPath) watchPdf(gen, pdfPath, before);
		if (logPath) watchLog(gen, logPath, logBefore);
		// reload the explorer as the build writes its output (also covers builds that produce no PDF)
		[2000, 6000].forEach((d) => setTimeout(refreshTree, d));
	}

	// the output dir named in the command (-output-directory= / -outdir=), else the folder root.
	// takes an explicit command so callers that run before compileCommand hydrates can pass the settings value.
	// compile-command parsing/generation lives in compileCommand.ts; these thin wrappers supply the
	// reactive root / main-file / per-folder overrides the pure functions take as arguments
	function expectedPdfPath(cmd = compileCommand): string | null {
		const root = get(workspaceRoot);
		return cc.expectedPdfPath(cmd, root, get(mainFile) ?? loadedPath, root ? savedCompileOutputs(root).pdf : undefined);
	}
	function expectedLogPath(cmd = compileCommand): string | null {
		const root = get(workspaceRoot);
		return cc.expectedLogPath(cmd, root, get(mainFile) ?? loadedPath, root ? savedCompileOutputs(root) : undefined);
	}

	// dvipdfmx/xdvipdfmx write diagnostics to stdout, not the .log; captured per compile by the
	// terminal's sentinel tracking and cleared at the start of each run
	let compileStdout = '';

	// read the .log plus the sibling .blg (it reflects the LAST bib run, which stays valid
	// even on compiles where latexmk skips bibtex) and publish the parsed problems
	async function publishLogDiagnostics(logPath: string, mtimeMs: number) {
		const blgPath = logPath.replace(/\.log$/i, '.blg');
		const blgText = (await statFile(blgPath)).exists ? await readTextFile(blgPath) : null;
		const parsed = await parseCompileDiagnosticsInWorker(await readTextFile(logPath), blgText, compileStdout || null);
		// bib warnings name a key ("empty journal in Smith2020"); projectIntel knows every
		// entry's exact line, so point the row at it (LW resolves these via its citation cache)
		const bibEntries = get(projectIntelStore).bibEntries;
		for (const e of parsed.entries) {
			if (e.source !== 'bib' || e.line !== undefined) continue;
			const key = e.message.match(/\bin ['"]?([\w:.-]+)['"]?$/) ?? e.message.match(/\bentry '([^']+)'/);
			const hit = key ? bibEntries.find((b) => b.key === key[1]) : undefined;
			if (hit) {
				e.file = hit.file;
				e.line = hit.line;
			}
		}
		compileLog.set({ ...parsed, logPath, updatedAt: mtimeMs });
		// a failed build produces no fresh PDF, so nothing else tells the user: surface the
		// Problems list. clean/warning-only results never steal the dock.
		if (parsed.errors.length > 0) {
			dockView = 'problems';
			showTerminal();
		}
	}

	// poll the .log and parse once it settles: the engine rewrites the log during each pass, so
	// "newer than baseline AND unchanged across two polls" is the engine-agnostic completion signal
	// (a multi-pass latexmk run just re-parses after each later pass). also catches failed builds,
	// where no PDF ever appears but the log does.
	function watchLog(
		gen: number,
		logPath: string,
		before: number,
		elapsed = 0,
		prev: { mtimeMs: number; size: number } | null = null,
		lastParsed = 0
	) {
		if (logWatchTimer) clearTimeout(logWatchTimer);
		logWatchTimer = setTimeout(async () => {
			if (gen !== compileGen) return; // superseded: a newer compile, finalize, or folder switch
			const s = await statFile(logPath);
			const changedSinceCompile = s.exists && s.size > 0 && s.mtimeMs > before;
			const stable = prev !== null && s.mtimeMs === prev.mtimeMs && s.size === prev.size;
			if (changedSinceCompile && stable && s.mtimeMs !== lastParsed) {
				try {
					await publishLogDiagnostics(logPath, s.mtimeMs);
					compiling = false; // a settled log means the run (or its final pass) ended
					lastParsed = s.mtimeMs;
				} catch {
					/* transient read race with the engine; next poll retries */
				}
			}
			if (elapsed < 180000) {
				watchLog(gen, logPath, before, elapsed + 1200, { mtimeMs: s.mtimeMs, size: s.size }, lastParsed);
			} else {
				logWatchTimer = null;
				compiling = false;
			}
		}, 1200);
	}

	// the shell reported the command finished (sentinel echo). the pollers only notice runs that
	// WRITE something; a run that dies without touching the log or PDF would leave Stop showing
	// until their timeout. give trailing writes a beat, check both artifacts once, stand pollers down.
	function finalizeCompile(gen: number, pdfPath: string | null, pdfBefore: number, logPath: string | null, logBefore: number) {
		setTimeout(async () => {
			if (gen !== compileGen) return; // a newer compile or a folder switch took over
			compileGen++; // this run is over; its pollers stand down
			if (pdfWatchTimer) {
				clearTimeout(pdfWatchTimer);
				pdfWatchTimer = null;
			}
			if (logWatchTimer) {
				clearTimeout(logWatchTimer);
				logWatchTimer = null;
			}
			try {
				if (logPath) {
					const s = await statFile(logPath);
					if (s.exists && s.size > 0 && s.mtimeMs > logBefore) await publishLogDiagnostics(logPath, s.mtimeMs);
				}
				if (pdfPath) {
					const s = await statFile(pdfPath);
					if (s.exists && s.size > 0 && s.mtimeMs > pdfBefore) showCompiledPdf(pdfPath, s.mtimeMs);
				}
			} catch {
				/* fs hiccup: the run still ended, the button must still reset */
			}
			compiling = false;
			refreshTree();
		}, 400);
	}
	async function ensureOutputDir() {
		const root = get(workspaceRoot);
		const dir = cc.compileOutDir(compileCommand);
		if (root && dir !== '.') {
			try {
				await createEntry(joinPath(root, dir), 'dir'); // mkdir -p, idempotent
			} catch {
				/* already exists */
			}
		}
	}
	// load a freshly compiled PDF into the pane; no-op if this exact build is already
	// shown so the poller and finalizeCompile can't reload it twice
	function showCompiledPdf(pdfPath: string, mtimeMs: number) {
		void session.pushPdf(pdfPath); // shared session: guests get the fresh bytes
		const url = fileUrl(pdfPath) + '&t=' + Math.round(mtimeMs); // cache-bust so it reloads
		if (get(pdfStore) === url) return;
		pdfFilename = basename(pdfPath);
		pdfStore.set(url);
		setPdfPaneOpen(true);
		refreshTree(); // the compiled output landed; reload the file explorer
	}
	// poll the expected PDF after a compile; when it's newer than before, load it and open the pane
	function watchPdf(gen: number, pdfPath: string, before: number, elapsed = 0) {
		if (pdfWatchTimer) clearTimeout(pdfWatchTimer);
		pdfWatchTimer = setTimeout(async () => {
			if (gen !== compileGen) return; // superseded: a newer compile, finalize, or folder switch
			const s = await statFile(pdfPath);
			if (s.exists && s.size > 0 && s.mtimeMs > before) {
				showCompiledPdf(pdfPath, s.mtimeMs);
				pdfWatchTimer = null;
				compiling = false; // the PDF landed: the run succeeded
			} else if (elapsed < 180000) {
				watchPdf(gen, pdfPath, before, elapsed + 1200); // keep polling up to 3 min
			} else {
				pdfWatchTimer = null;
				compiling = false;
			}
		}, 1200);
	}

	// on load and main-file change, show the already-compiled PDF sitting on disk; clears the
	// preview when the expected PDF is absent so a stale one doesn't linger. runs only at
	// init/folder-open/main-change, never mid-compile, so it can't race watchPdf.
	async function loadExistingPdf() {
		// read the persisted command directly: on first mount this can run before the
		// reactive compileCommand is hydrated, and a stale '' would point at the wrong folder
		const s0 = await loadSettings();
		const pdfPath = expectedPdfPath(resolveCompileCommand(get(workspaceRoot), s0.compileCommand));
		if (!pdfPath) {
			pdfStore.set(null);
			return;
		}
		const s = await statFile(pdfPath);
		if (s.exists && s.size > 0) {
			pdfFilename = basename(pdfPath);
			pdfStore.set(fileUrl(pdfPath) + '&t=' + Math.round(s.mtimeMs)); // mtime cache-busts a stale load
			setPdfPaneOpen(true); // a compiled PDF is ready; open the preview so a reload shows it
		} else {
			pdfStore.set(null);
		}
	}

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
		const pdf = live ? draftRoot + '/_draft/draft.pdf' : expectedPdfPath();
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
		viewMode = 'source';
		localStorage.setItem('texpile:viewMode', 'source');
		sourceGotoLine = { line, token: ++gotoToken, selectText };
		if (!samePath(get(activeFilePath) ?? '', file)) activeFilePath.set(file);
	}
	// inverse: a double-click in the PDF opens the source at the matching line; selectText
	// lets the editor snap to the real text even if the line drifted
	async function onPdfDoubleClick(page: number, x: number, y: number, selectText?: string) {
		if (guest) {
			const res = await collabGuest.syncInverse(page, x, y);
			if (res && res.line >= 1) openFileAtLine(res.file, res.line, res.selectText ?? selectText);
			return;
		}
		const pdf = expectedPdfPath();
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
		if (thenRun && compileCommand) runCompile();
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
			await flushSaveAndWait(); // the formatter should see exactly what's on screen
			const formatted = toLf(await formatLatexDocument(loadedPath, fromLf(texSource, docEol)));
			texSource = formatted;
			isDirty.set(true);
			scheduleSave(loadedPath, texSource);
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

	// a root-relative, forward-slashed path (the form file references take in LaTeX)
	const relFromRoot = (p: string, root: string) =>
		p
			.slice(root.length)
			.replace(/^[\\/]+/, '')
			.replace(/\\/g, '/');

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
					scheduleSave(loadedPath, texSource);
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
	// rescan when the file list, main file, or active file changes — those are the only times the
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
		const aux = expectedLogPath()?.replace(/\.log$/i, '.aux') ?? (main ? main.replace(/\.tex$/i, '.aux') : null);
		void refreshProjectIntel(files, bibs, aux, active ?? null);
	});

	// \includegraphics hover preview: candidate texfile:// URLs (current dir, root, and any
	// \graphicspath dirs, adding raster extensions when the path has none); the tooltip's img
	// advances past misses
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
	onDestroy(() => setGraphicResolver(null));

	// shared session: guests can ask for a compile; leaving the workspace ends the session
	let shareModalOpen = $state(false);
	onMount(() => {
		session.onCompileRequest = () => {
			toaster.info({ title: m.wsview_toast_compile_requested_title(), duration: 3000 });
			void runCompile();
		};
		// resolve a guest's SyncTeX request against our .synctex data and reply
		session.onSyncRequest = async (payload, from) => {
			const root = get(workspaceRoot);
			const pdf = expectedPdfPath();
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
	// recompute from texSource, debounced. one extractDocRefs call = one AST parse for both.
	let labelTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		void texSource; // dependency: re-arm the debounce on every source change
		clearTimeout(labelTimer);
		labelTimer = setTimeout(() => {
			// read texSource LIVE (not the closed-over value): a file switch blanks it briefly and a
			// stale closure would push that transient '' into the label/citation/history state
			const refs = extractDocRefs(texSource);
			labelStore.set(refs.labels);
			bibitemRefs = bibItemsToReferences(refs.bibitems);
			histCapture(texSource);
		}, 400);
		return () => clearTimeout(labelTimer);
	});

	// load the active file whenever it changes
	$effect(() => {
		const path = $activeFilePath;
		// autosave off: the outgoing file's edit wasn't auto-written, so warn before tearing it down
		if (!autosaveActive() && loadedPath && path !== loadedPath && pendingSave?.path === loadedPath) {
			if (confirm(m.wsview_confirm_save_before_switch({ name: basename(loadedPath) }))) flushSave();
			else pendingSave = null; // discard the unsaved edit
		} else {
			flushSave(); // persist the outgoing file's queued edit before tearing down its buffers
		}
		loadError = null;
		// the outgoing file stays on screen until loadFile has the new one ready: clearing here
		// first is what made every switch blink through the "Opening…" placeholder
		if (path) loadFile(path);
		else closeOpenFile();
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
		hist = [];
		histIndex = -1;
	}

	async function loadFile(path: string) {
		try {
			await writeChain; // let any queued write (e.g. the file we just left) land before we read
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
				// dropped the pane to "Opening…" for the length of a whole parse. source mode has
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
				histReset(text); // the on-disk content is the floor of the cross-mode undo history
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
				hist = []; // no cross-mode history for these kinds (histCapture bails on histIndex < 0)
				histIndex = -1;
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
		// shared session: fold the adopted disk content into the shared doc so guests see it too
		// (hostEdit's own lastWritten update prevents an echo write back to disk)
		if (loadedPath) session.hostEdit(loadedPath, disk);
	}

	function resolveConflict(choice: 'reload' | 'keep') {
		const c = conflict;
		conflict = null;
		if (!c) return;
		if (choice === 'reload') applyDiskReload(c.disk, c.eol);
		else if (loadedPath === c.path) save(); // keep mine: overwrite disk now
	}

	// debounced autosave: write the file ~1.5s after the user stops typing
	let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
	// the one queued debounced write, tracked so a file switch can flush it instead of dropping it
	let pendingSave: { path: string; content: string } | null = null;
	// all writes run through this chain so they never overlap and apply in order; loadFile
	// awaits it before re-reading, so a re-opened file never reads stale (pre-flush) bytes
	let writeChain: Promise<void> = Promise.resolve();
	const AUTOSAVE_MS = 1500;

	// a visual edit serializes straight into texSource (the single source of truth), then saves
	function onChange(doc: PMNode) {
		if (!docMeta) return;
		lastDoc = doc;
		texSource = serializeLatexFile(docMeta, doc);
		isDirty.set(true);
		scheduleSave(loadedPath, texSource);
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
		scheduleSave(loadedPath, texSource);
	}

	// a source edit IS texSource, write it verbatim
	function onTexInput(v: string) {
		texSource = v;
		isDirty.set(true);
		scheduleSave(loadedPath, v);
	}

	function onRawInput(v: string) {
		rawContent = v;
		isDirty.set(true);
		scheduleSave(loadedPath, v);
	}

	// queue a debounced write; a save already queued for a DIFFERENT file flushes first
	// so switching files can never drop the previous file's edit
	function scheduleSave(path: string | null, content: string) {
		if (!path) return;
		// shared session: every host edit streams into the shared doc per keystroke (a no-op
		// splice when the source editor is already Y-bound)
		session.hostEdit(path, content);
		if (pendingSave && pendingSave.path !== path) flushSave();
		pendingSave = { path, content };
		// autosave off: track the edit (so Save / the switch-guard have it) but don't auto-write.
		// live mode and hosting a session force it on (see autosaveActive).
		if (!autosaveActive()) return;
		if (autosaveTimer) clearTimeout(autosaveTimer);
		autosaveTimer = setTimeout(flushSave, AUTOSAVE_MS);
	}

	function flushSave() {
		if (autosaveTimer) {
			clearTimeout(autosaveTimer);
			autosaveTimer = null;
		}
		if (!pendingSave) return;
		const { path, content } = pendingSave;
		pendingSave = null;
		void enqueueWrite(path, content, false);
	}
	// flush and wait for the write to land. used before compiling: SyncTeX line numbers come from
	// the compiled file, so a stale on-disk copy would put reverse search off by the whole
	// serializer reformatting delta.
	async function flushSaveAndWait() {
		flushSave();
		await writeChain;
	}
	/** drops any queued autosave without writing it (e.g. the open file is being deleted). */
	function discardPendingSave() {
		if (autosaveTimer) {
			clearTimeout(autosaveTimer);
			autosaveTimer = null;
		}
		pendingSave = null;
	}

	// append a write to the serial chain (never overlap, never reject: errors are toasted). snapshot
	// the line ending now so a queued write still applies the right one if the user switches files first.
	function enqueueWrite(path: string, content: string, notify: boolean): Promise<void> {
		const eol = docEol;
		writeChain = writeChain.then(() => doWrite(path, content, notify, eol));
		return writeChain;
	}

	async function doWrite(path: string, content: string, notify: boolean, eol: Eol) {
		saving = true;
		try {
			await writeTextFile(path, fromLf(content, eol)); // re-apply the file's CRLF/LF on disk
			// what we just wrote is now the on-disk baseline, so our own save isn't seen as a conflict
			if (loadedPath === path) diskBaseline = content;
			// clear "unsaved" only if what we wrote is still the live buffer;
			// otherwise a newer edit arrived mid-write and is still pending
			if (loadedPath === path) {
				const live = kind === 'tex' ? texSource : rawContent;
				if (content === live) isDirty.set(false);
			}
			if (notify) toaster.success({ title: m.wsview_toast_saved_title(), description: basename(path), duration: 1200 });
		} catch (e) {
			toaster.error({ title: m.wsview_toast_save_failed_title(), description: e instanceof Error ? e.message : m.wsview_error_unknown() });
		} finally {
			saving = false;
		}
	}

	// mode-switch scroll + cursor sync (visual/source, .tex only): both directions carry two anchors
	// as texSource offsets, resolved positionally via the parse-time orig.start stamps (content
	// matching fails wholesale against an edited buffer; positions only drift). scroll = the
	// viewport-top block, cursor = the caret mapped proportionally within its block's orig.latex slice.
	let sourceScrollAnchor = $state<{ scroll: number | null; cursor: number | null } | null>(null); // consumed by SourceEditor at mount
	// $state so the consuming effect below re-fires when a new anchor is captured
	let pendingVisualAnchor = $state<{ scroll: number; cursor: number | null } | null>(null);

	function findScrollParent(el: HTMLElement | null): HTMLElement | null {
		let cur = el?.parentElement ?? null;
		while (cur) {
			const oy = getComputedStyle(cur).overflowY;
			if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight) return cur;
			cur = cur.parentElement;
		}
		return null;
	}

	/**
	 * Leaving visual mode: viewport-top block offset (scroll) plus the PM caret's source offset
	 * (cursor), the exact inverse of the source-to-visual mapping. An off-screen caret is ignored:
	 * flashing a line the user wasn't looking at would read as a wrong jump.
	 */
	function captureVisualAnchor(): { scroll: number | null; cursor: number | null } | null {
		const v = get(editorViewStore);
		if (!v) return null;
		const bodyOffset = docMeta?.preamble.length ?? 0;
		const doc = v.state.doc;
		const scRect = findScrollParent(v.dom)?.getBoundingClientRect();
		const scTop = (scRect?.top ?? 0) + 4;
		const scBottom = scRect?.bottom ?? Number.POSITIVE_INFINITY;

		// per-block PM positions + parse-time source offsets (orig.start; null on editor-created blocks)
		const positions: number[] = [];
		const starts: (number | null)[] = [];
		for (let i = 0, pos = 0; i < doc.childCount; i++) {
			positions.push(pos);
			const start = (doc.child(i).attrs?.orig as { start?: number } | undefined)?.start;
			starts.push(typeof start === 'number' ? start : null);
			pos += doc.child(i).nodeSize;
		}
		// absolute source offset for a block, falling back to the nearest stamped block above
		const sourceAt = (index: number): number | null => {
			for (let i = index; i >= 0; i--) if (starts[i] != null) return bodyOffset + (starts[i] as number);
			return null;
		};

		// scroll anchor: the topmost visible block
		let topIndex = -1;
		for (let i = 0; i < doc.childCount; i++) {
			const dom = v.nodeDOM(positions[i]);
			if (dom instanceof HTMLElement && dom.getBoundingClientRect().bottom > scTop) {
				topIndex = i;
				break;
			}
		}
		const scroll = topIndex >= 0 ? sourceAt(topIndex) : null;

		// cursor anchor: the caret's block, proportional within its slice; only when on-screen
		let cursor: number | null = null;
		const head = v.state.selection.head;
		for (let i = 0; i < doc.childCount; i++) {
			if (head < positions[i] || head >= positions[i] + doc.child(i).nodeSize) continue;
			const dom = v.nodeDOM(positions[i]);
			const r = dom instanceof HTMLElement ? dom.getBoundingClientRect() : null;
			if (r && r.bottom > scTop && r.top < scBottom) {
				const block = doc.child(i);
				const orig = block.attrs?.orig as { start?: number; latex?: string } | undefined;
				if (typeof orig?.start === 'number' && orig.latex?.length) {
					const frac = Math.min(1, Math.max(0, (head - positions[i] - 1) / Math.max(1, block.content.size)));
					cursor = bodyOffset + orig.start + Math.round(frac * orig.latex.length);
				} else {
					cursor = sourceAt(i);
				}
			}
			break;
		}

		return scroll == null && cursor == null ? null : { scroll, cursor };
	}

	/** leaving source mode: viewport-top texSource offset (scroll) + the CM caret offset (cursor). */
	function captureSourceAnchor(): { scroll: number; cursor: number | null } | null {
		const cm = get(sourceCmView);
		if (!cm) return null;
		const rect = cm.scrollDOM.getBoundingClientRect();
		return {
			scroll: cm.posAtCoords({ x: rect.left + 10, y: rect.top + 10 }, false),
			cursor: cm.state.selection.main.head
		};
	}

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
		// double rAF: EditorView's doc-swap effect restores its saved scrollTop in a single rAF
		// registered in this same flush; ours must land after it or the anchor scroll gets overwritten
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				try {
					if (v.isDestroyed) return; // the view can be torn down between consume and resolve
					const doc = v.state.doc; // live doc (includes normalization blocks, which carry no orig)
					const bodyOffset = docMeta?.preamble.length ?? 0;
					// last block whose orig.start <= the given body-relative offset
					const blockAt = (bodyRel: number): { index: number; pos: number; start: number } | null => {
						let found: { index: number; pos: number; start: number } | null = null;
						for (let i = 0, pos = 0; i < doc.childCount; i++) {
							const start = (doc.child(i).attrs?.orig as { start?: number } | undefined)?.start;
							if (typeof start === 'number' && start <= bodyRel) found = { index: i, pos, start };
							pos += doc.child(i).nodeSize;
						}
						return found;
					};
					// scroll: restore the reading position (the block that topped the source viewport)
					const scrollHit = blockAt(anchor.scroll - bodyOffset);
					if (scrollHit) {
						const dom = v.nodeDOM(scrollHit.pos);
						if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'start' });
					}
					// caret: land in the block containing the source cursor, proportionally inside it
					// (markup and rendered text aren't 1:1); falls back to the scroll block. no
					// scrollIntoView on the tr: the scroll anchor owns the viewport.
					const caretHit = (anchor.cursor != null ? blockAt(anchor.cursor - bodyOffset) : null) ?? scrollHit;
					if (!caretHit) return; // everything resolved into the preamble, stay at the top
					const block = doc.child(caretHit.index);
					let inner = 1;
					const orig = block.attrs?.orig as { start?: number; latex?: string } | undefined;
					if (anchor.cursor != null && orig?.latex?.length) {
						const frac = Math.min(1, Math.max(0, (anchor.cursor - bodyOffset - caretHit.start) / orig.latex.length));
						inner = 1 + Math.round(frac * Math.max(0, block.content.size - 1));
					}
					const caretPos = Math.min(caretHit.pos + inner, caretHit.pos + Math.max(1, block.nodeSize - 1));
					v.dispatch(v.state.tr.setSelection(TextSelection.near(v.state.doc.resolve(caretPos))).setMeta('addToHistory', false));
					// reclaim DOM focus for PM: the mount-time selection can sit inside a CM-backed
					// nodeview that focuses its inner CodeMirror; PM then never syncs the DOM caret
					// and the next keystrokes would land in that nodeview instead of at the parked caret
					v.focus();
					// flash the caret's block, same amber as the SyncTeX flash. a node decoration
					// (flash-plugin) because a bare classList.add doesn't survive PM redraws.
					flashNodeAt(v, caretHit.pos);
				} catch {
					/* best-effort; never break the mode switch over a scroll */
				}
			})
		);
	});

	// cross-mode undo/redo: a snapshot history over texSource that lets an undo cross a mode switch
	// (the PM/CM histories die with their view). native undo/redo runs first; the editors call
	// workspaceHistoryStep only when their own history is exhausted. content equal to the
	// previous/next snapshot MOVES the index instead of pushing, so native undos don't pollute the stack.
	const HIST_MAX = 200;
	let hist: string[] = [];
	let histIndex = -1;
	let applyingHist = false;

	function histReset(content: string) {
		hist = [content];
		histIndex = 0;
	}

	function histCapture(content: string) {
		if (applyingHist || histIndex < 0) return;
		if (hist[histIndex] === content) return;
		if (histIndex > 0 && hist[histIndex - 1] === content) {
			histIndex--; // a native undo walked the buffer back, follow it
			return;
		}
		if (histIndex < hist.length - 1 && hist[histIndex + 1] === content) {
			histIndex++; // a native redo, follow forward
			return;
		}
		hist = [...hist.slice(0, histIndex + 1).slice(-(HIST_MAX - 1)), content];
		histIndex = hist.length - 1;
	}

	/** steps the workspace history; false at the stack edge lets the key fall through. */
	function workspaceHistoryStep(dir: 'undo' | 'redo'): boolean {
		if (kind !== 'tex' || !loadedPath) return false;
		histCapture(texSource); // flush a pending debounce so we never skip the newest state
		const target = histIndex + (dir === 'undo' ? -1 : 1);
		if (target < 0 || target >= hist.length) return false;
		histIndex = target;
		applyingHist = true;
		try {
			texSource = hist[target];
			isDirty.set(true);
			scheduleSave(loadedPath, texSource);
			// source mode: SourceEditor's value-sync effect replaces the CM doc. visual mode: re-parse.
			if (viewMode === 'visual') rebuildVisualFromSource();
		} finally {
			setTimeout(() => (applyingHist = false), 0);
		}
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
			histCapture(texSource); // flush the pre-switch state into the cross-mode history
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

	// source control ops: call the git client, refresh status, toast on failure. the panel is presentational.
	let scmBusy = $state(false);

	async function scmInit() {
		const root = get(workspaceRoot);
		if (!root) return;
		scmBusy = true;
		const res = await gitInit(root);
		scmBusy = false;
		if (!res.ok) {
			toaster.error({ title: m.wsview_toast_git_init_failed_title(), description: res.error });
			return;
		}
		await refreshGitStatus(root);
		toaster.success({ title: m.wsview_toast_git_init_success_title() });
	}

	async function scmStage(paths: string[]) {
		const root = get(workspaceRoot);
		if (!root) return;
		scmBusy = true;
		const res = await gitStage(root, paths);
		scmBusy = false;
		if (!res.ok) toaster.error({ title: m.wsview_toast_stage_failed_title(), description: res.error });
		await refreshGitStatus(root);
	}

	async function scmUnstage(paths: string[]) {
		const root = get(workspaceRoot);
		if (!root) return;
		scmBusy = true;
		const res = await gitUnstage(root, paths);
		scmBusy = false;
		if (!res.ok) toaster.error({ title: m.wsview_toast_unstage_failed_title(), description: res.error });
		await refreshGitStatus(root);
	}

	async function scmDiscard(changes: GitStatusEntry[]) {
		const root = get(workspaceRoot);
		if (!root || !changes.length) return;
		const confirmMsg =
			changes.length === 1
				? m.wsview_confirm_discard_one({ name: basename(changes[0].path) })
				: m.wsview_confirm_discard_other({ count: changes.length });
		if (!confirm(confirmMsg)) return;
		scmBusy = true;
		// untracked files are deleted; tracked files are reverted to their staged/committed state
		const untracked = changes.filter((c) => c.x === '?').map((c) => c.path);
		const tracked = changes.filter((c) => c.x !== '?').map((c) => c.path);
		let err: string | undefined;
		for (const p of untracked) {
			try {
				await deleteEntry(p);
			} catch (e) {
				err = e instanceof Error ? e.message : String(e);
			}
		}
		if (tracked.length) {
			const res = await gitDiscard(root, tracked);
			if (!res.ok) err = res.error;
		}
		scmBusy = false;
		if (err) toaster.error({ title: m.wsview_toast_discard_failed_title(), description: err });
		const openAffected = !!loadedPath && changes.some((c) => c.path === loadedPath);
		await refreshTree();
		await refreshGitStatus(root);
		if (openAffected && loadedPath) await loadFile(loadedPath); // its on-disk content changed
	}

	async function scmCommit(message: string): Promise<boolean> {
		const root = get(workspaceRoot);
		if (!root) return false;
		scmBusy = true;
		// if nothing is staged, stage everything first (the "Commit All" affordance)
		const hasStaged = get(gitChanges).some((c) => c.x !== ' ' && c.x !== '?');
		if (!hasStaged) {
			const s = await gitStage(root, []);
			if (!s.ok) {
				scmBusy = false;
				toaster.error({ title: m.wsview_toast_stage_failed_title(), description: s.error });
				return false;
			}
		}
		const res = await gitCommit(root, message);
		scmBusy = false;
		if (!res.ok) {
			toaster.error({ title: m.wsview_toast_commit_failed_title(), description: res.error });
			return false;
		}
		await refreshGitStatus(root);
		if (viewMode === 'diff') void captureDiffSnapshot(); // the open diff now compares against the new HEAD
		toaster.success({ title: m.wsview_toast_commit_created_title() });
		return true;
	}

	// open a changed file's diff from the Source Control panel (keeps the SC sidebar open)
	function scmOpenDiff(path: string) {
		if (!get(isGitRepo)) return;
		const already = loadedPath === path;
		activeFilePath.set(path);
		viewMode = 'diff';
		if (already) void captureDiffSnapshot();
	}

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
	async function tryParseVisual(text: string): Promise<ParseOutcome> {
		try {
			return { parsed: await parseLatexFileAsync(text, projectMacros, 3000) };
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
			// EditorView reacts to the new localValue and swaps state on the existing instance: no remount, no flicker
		});
	}

	// manual save (Ctrl/Cmd+S or the Save button); autosave handles the rest
	function save() {
		// drop the queued debounce; we're writing the current content now
		if (autosaveTimer) {
			clearTimeout(autosaveTimer);
			autosaveTimer = null;
		}
		pendingSave = null;
		if (kind === 'tex' && loadedPath) void enqueueWrite(loadedPath, texSource, true);
		else if ((kind === 'text' || kind === 'bib') && loadedPath) void enqueueWrite(loadedPath, rawContent, true);
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
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
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
			if (compiling) stopCompile();
			else runCompile();
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
		<GuestBar onTogglePdf={togglePdfPane} />
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
			onCompile={runCompile}
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
				{scmBusy}
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
				onCreate={createInTree}
				onRename={renameInTree}
				onDelete={deleteManyInTree}
				onMove={moveManyInTree}
				onImport={importIntoTree}
				onCopyIn={copyIntoTree}
				onSetMain={(entry) => applyMainFile(entry.path)}
				onStartTocResize={startTocResize}
				onResizeTocByKey={resizeTocByKey}
				onRefreshGit={() => refreshGitStatus($workspaceRoot)}
				{scmInit}
				{scmStage}
				{scmUnstage}
				{scmDiscard}
				{scmCommit}
				{scmOpenDiff}
			/>

			<!-- same WAI-ARIA window-splitter pattern as above; svelte's a11y rule doesn't special-case it -->
			<!-- eslint-disable-next-line svelte/valid-compile -->
			<div
				class="hover:bg-primary-500/40 active:bg-primary-500/60 w-1 shrink-0 cursor-col-resize bg-transparent transition-colors"
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
				{compiling}
				{pdfPaneOpen}
				{draftPaused}
				{saving}
				{sidebarOpen}
				{modLabel}
				onToggleSidebar={toggleSidebar}
				onSetViewMode={setViewMode}
				onSyncForward={syncForward}
				onStopCompile={stopCompile}
				onPauseDraft={pauseDraft}
				onResumeDraft={resumeDraft}
				onCompile={runCompile}
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
					{loadedPath}
					{kind}
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
						{pdfFilename}
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

			{#if terminalMounted && terminalAvailable}
				<TerminalDock
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
		onRun={runCompile}
	/>

	<FormatModal bind:open={formatModalOpen} {formatting} onFormat={runFormat} />

	<!-- file edited on disk while we held unsaved edits -->
	{#if conflict}
		<ConflictModal path={conflict.path} onResolve={resolveConflict} />
	{/if}

	{#if pendingRefUpdate}
		<RefUpdateModal update={pendingRefUpdate} onKeep={() => (pendingRefUpdate = null)} onApply={applyRefUpdate} />
	{/if}
</div>

<TutorialConfirmModal bind:open={tutorialModalOpen} onConfirm={openTutorial} />
{#if !guest}
	<SessionShareModal bind:open={shareModalOpen} root={$workspaceRoot} onBeforeStart={flushSaveAndWait} />
{/if}
{#if session.active && !guest}
	<SessionBadge count={session.guestCount()} onclick={() => (shareModalOpen = true)} />
{/if}
