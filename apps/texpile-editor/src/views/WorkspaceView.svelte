<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { get } from 'svelte/store';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { browser } from '$lib/runtime';
	import { navigate } from '$lib/router.svelte';
	// prettier-ignore
	import { Save, FileText, Loader2, CircleAlert, TriangleAlert, FilePlus, FolderPlus, RefreshCw, PanelLeft, PanelRight, Eye, Code, GitCompare, GitBranch, Play, Square, SquareTerminal, X, ChevronDown, Check, Plus, Trash2, LocateFixed, Search, Settings2 } from '@lucide/svelte';
	import EditorView from '$lib/editor/EditorView.svelte';
	import Terminal from '$lib/editor/comp/Terminal.svelte';
	import ProblemsPanel from '$lib/editor/comp/ProblemsPanel.svelte';
	import { compileLog, resolveLogPath } from '$lib/stores/compileLogStore';
	import { parseCompileDiagnostics } from '$lib/latex-log';
	import PDFViewer from '$lib/editor/comp/PDFViewer.svelte';
	import DraftView from '$lib/draft/DraftView.svelte';
	import GlobalSearch from '$lib/editor/comp/GlobalSearch.svelte';
	import StarterPicker from '$lib/editor/comp/StarterPicker.svelte';
	import TutorialConfirmModal from '$lib/editor/comp/TutorialConfirmModal.svelte';
	import WordCount from '$lib/editor/comp/WordCount.svelte';
	import { applyStarter, applyImportedFiles, openTutorialProject, type Starter, type ImportedFile } from '$lib/workspace/starters';
	import { pdfStore } from '$lib/stores/pdfStore';
	import { editorViewStore, sourceCmView, viewMode as viewModeStore } from '$lib/stores/editorStore';
	import { synctexForward, synctexInverse } from '$lib/workspace/synctex';
	import SourceEditor from '$lib/editor/comp/SourceEditor.svelte';
	import DiffPanel from '$lib/editor/comp/DiffPanel.svelte';
	import SourceControlPanel from '$lib/editor/comp/SourceControlPanel.svelte';
	import SearchBar from '$lib/editor/comp/SearchBar.svelte';
	import TableOfContents from '$lib/editor/comp/TableOfContents.svelte';
	import { sourceTocStore } from '$lib/editor/extensions/tableofcontents/tocStore';
	import { latexHeadings } from '$lib/editor/extensions/tableofcontents/latexHeadings';
	import BibManager from '$lib/editor/comp/BibManager.svelte';
	import PreambleFrontmatter from '$lib/editor/comp/PreambleFrontmatter.svelte';
	import { replacePreambleFrontmatter } from '$lib/editor/extensions/raw-latex/frontmatterView';
	import { initSpellcheckConfig } from '$lib/editor/extensions/spellcheck/spellcheckConfig';
	import Toolbar from '$lib/editor/comp/toolbar/Toolbar.svelte';
	import SourceToolbar from '$lib/editor/comp/toolbar/SourceToolbar.svelte';
	import WorkspaceMenuBar from '$lib/editor/comp/WorkspaceMenuBar.svelte';
	import FileTree from '$lib/editor/comp/FileTree.svelte';
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
		savedCompileCommand,
		setFolderCompileCommand,
		savedCompileOutputs,
		setCompileOutputs
	} from '$lib/workspace/workspaceStore';
	import { addRecentFolder } from '$lib/workspace/workspaceStore';
	import { refreshGitStatus, isGitRepo, gitStatusMap, gitChanges, gitBranch, takeNoGitHint } from '$lib/workspace/gitStore';
	import { gitShowHead, gitInit, gitStage, gitUnstage, gitDiscard, gitCommit, type GitStatusEntry } from '$lib/workspace/git';
	import { settings, loadSettings, updateSettings, DEFAULT_COMPILE_COMMAND } from '$lib/settings';
	import { detectMainFile, findDocRoots, gatherProjectMacros } from '$lib/workspace/project';
	import {
		readTextFile,
		writeTextFile,
		basename,
		dirname,
		fileUrl,
		joinPath,
		scanTexFiles,
		scanTree,
		createEntry,
		deleteEntry,
		renameEntry,
		pickFolder,
		relativeTo,
		isDesktop,
		statFile,
		detectEol,
		toLf,
		fromLf,
		formatLatexDocument,
		native,
		type Eol,
		type TreeEntry,
		type TexFile
	} from '$lib/workspace/fileSystem';
	import { modLabel } from '$lib/platform';
	import { serializeLatexFile, createStarterLatex, type ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
	import { parseLatexFileAsync, PARSE_TIMEOUT } from '$lib/workspace/latexParserClient';
	import type { Node as PMNode } from 'prosemirror-model';
	import { TextSelection } from 'prosemirror-state';
	import { flashNodeAt } from '$lib/editor/extensions/flash-plugin';
	import { toaster } from '$lib/modals/toaster-svelte';

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
			toaster.error({ title: 'Could not create from template', description: e instanceof Error ? e.message : String(e) });
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
			toaster.error({ title: 'Could not import the files', description: e instanceof Error ? e.message : String(e) });
		} finally {
			applyingStarter = false;
		}
	}

	// File menu "New": inline create in the tree, pre-named for the chosen type
	function newFileOfType(ext?: string) {
		const names: Record<string, string> = { tex: 'untitled.tex', bib: 'references.bib', cls: 'untitled.cls', sty: 'mystyle.sty' };
		const defaultName = ext ? (names[ext] ?? `untitled.${ext}`) : '';
		sidebarOpen = true;
		fileTreeRef?.newAtRoot('file', defaultName);
	}

	async function newTexFile() {
		const root = get(workspaceRoot);
		if (!root) return;
		const existing = new Set(get(texFiles).map((f) => f.relPath.toLowerCase()));
		let name = 'main.tex';
		let i = 1;
		while (existing.has(name.toLowerCase())) name = `main${i++}.tex`;
		await createInTree(root, name, 'file');
	}

	// no folder open (e.g. hard navigation): send the user back to the start screen
	onMount(() => {
		const root = get(workspaceRoot);
		if (!root) {
			navigate('/');
			return;
		}
		terminalAvailable = isDesktop(); // client-only; set here so SSR/CSR agree
		resolveMainConfirm(root); // storage first, before anything can want a compile
		loadReferences(root);
		refreshTree();
		void initProject(root);
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
				terminalMounted = true;
				terminalVisible = true;
				ensureTerminal();
			}
		});
		if (localStorage.getItem('texpile:viewMode') === 'source') {
			viewMode = 'source';
			lastEditMode = 'source';
		}
		if (localStorage.getItem('texpile:diffLayout') === 'split') diffLayout = 'split';

		// the tree is a snapshot: rescan on window focus and on the fs-changed event dispatched by
		// internal writes. any on-disk change also rescans references so \cite autocompletion and
		// the citation nodes see fresh keys immediately.
		const reloadReferences = () => {
			const root = get(workspaceRoot);
			if (root) void loadReferences(root);
		};
		const onFocus = () => {
			refreshTree();
			void checkExternalChange();
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
		// git refresh is non-blocking and never throws; this single call-site
		// covers every refreshTree() trigger for free
		void refreshGitStatus(root).then(({ missingGit }) => {
			if (missingGit && takeNoGitHint()) {
				toaster.warning({ title: 'Git not found', description: 'Install Git and reopen the folder to see status badges and diffs.' });
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
			toaster.error({ title: 'Could not open tutorial', description: e instanceof Error ? e.message : String(e) });
		}
	}
	let tutorialModalOpen = $state(false);

	const samePath = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();

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
			const content = isInclude ? '' : isTex ? createStarterLatex() : '';
			await createEntry(path, fsType, content);
			// insert the \input into the current doc BEFORE switching away (the switch flushes its save)
			if (isInclude && !insertIncludeAtCursor(path)) {
				toaster.error({
					title: 'Created, but no \\input added',
					description: 'Switch to the visual editor to insert an include at the cursor.'
				});
			}
			await refreshTree();
			if (name.toLowerCase().endsWith('.bib')) await loadReferences(get(workspaceRoot) ?? parentDir); // new .bib -> refresh citation keys
			if (isTex) activeFilePath.set(path);
		} catch (e) {
			toaster.error({ title: 'Could not create', description: e instanceof Error ? e.message : String(e) });
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
			toaster.error({ title: 'Could not rename', description: e instanceof Error ? e.message : String(e) });
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
			toaster.error({ title: 'Could not delete', description: e instanceof Error ? e.message : String(e) });
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
			toaster.error({ title: 'Could not move', description: e instanceof Error ? e.message : String(e) });
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
	// source mode has no ProseMirror plugin to feed the outline, so parse headings from the raw .tex
	$effect(() => {
		const src = texSource;
		if (kind === 'tex' && viewMode === 'source') sourceTocStore.set(latexHeadings(src));
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
	let terminalMounted = $state(false); // stay mounted after first open so shells persist across toggles
	// VSCode-style multi-terminal: one active (shown), the rest kept mounted (hidden)
	type TermRef =
		| { run: (cmd: string, onDone?: () => void) => void; focus: () => void; refit: () => void; interrupt: () => void }
		| undefined;
	let terminals = $state<{ id: number; title: string }[]>([]);
	let activeTermId = $state<number | null>(null);
	let termMenuOpen = $state(false);
	let termSeq = 0;
	const termRefs: Record<number, TermRef> = {};
	const activeRef = (): TermRef => (activeTermId != null ? termRefs[activeTermId] : undefined);
	let compileCommand = $state(''); // the compile command; {main} expands to the main file's path
	let compileModalOpen = $state(false);
	let compileMenuOpen = $state(false); // the small caret dropdown next to the Compile button
	let compileDraft = $state('');
	// Advanced (per-folder) output-path overrides, edited in the compile modal
	let compileOutputsDraft = $state<{ pdf: string; log: string }>({ pdf: '', log: '' });
	let advancedOpen = $state(false);
	// quick-setup chip highlight state, reflected live from the draft (null engine = unrecognized)
	const draftEngine = $derived(detectEngine(compileDraft));
	const draftLatexmk = $derived(usesLatexmk(compileDraft));
	// per-folder command wins over the global default (the last one saved anywhere)
	const resolveCompileCommand = (root: string | null, global: string) => (root && savedCompileCommand(root)) || global || '';
	let formatModalOpen = $state(false);
	let formatting = $state(false);
	// PDF preview pane; opens automatically once a compile writes a fresh PDF
	let pdfPaneOpen = $state(false);
	let pdfPaneWidth = $state(480);
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

	// Split a .tex buffer into prose paragraphs (line-numbered), treating blank lines,
	// comment-only lines, and block-level command lines (\section, \begin, \item, ...) as
	// boundaries -- so the header line above a body paragraph isn't glued onto it.
	const BLOCK_CMD =
		/^\s*\\(section|subsection|subsubsection|paragraph|subparagraph|chapter|begin|end|item|maketitle|caption|label|title|author|date|bibliography|printbibliography|tableofcontents|input|include)\b/;
	const isBoundary = (ln: string) => ln.trim() === '' || /^\s*%/.test(ln) || BLOCK_CMD.test(ln);
	const BEGIN_LIST = /^\s*\\begin\{(itemize|enumerate|description)\}/;
	const END_LIST = /^\s*\\end\{(itemize|enumerate|description)\}/;
	const ITEM = /^\s*\\item\b[ \t]*(.*)$/;
	// Split a buffer into editable paragraphs. A \item body is captured as a paragraph too,
	// tagged with its enclosing list env so the fast path can re-typeset it INSIDE that list
	// (correct width + label), not as full-width prose.
	type Para = { text: string; startLine: number; wrap?: string; idx?: number; env?: string };
	// environments captured WHOLE (\begin..\end as one block): the daemon can typeset a complete
	// env (display math, tabular, quote), never a bare body -- so an edit inside one becomes a
	// single-block change the instant path can locate and splice. Lists keep per-item capture;
	// document would swallow everything.
	const BEGIN_ENV = /^\s*\\begin\{([a-zA-Z*]+)\}/;
	const NON_BLOCK_ENVS = new Set(['document', 'itemize', 'enumerate', 'description']);
	function splitParas(src: string): Para[] {
		const out: Para[] = [];
		const lines = src.split('\n');
		let cur: string[] = [];
		let start = 0;
		let wrap = '';
		let idx = 0;
		const listStack: { env: string; n: number }[] = [];
		const flush = () => {
			if (cur.length) out.push({ text: cur.join('\n'), startLine: start + 1, wrap: wrap || undefined, idx });
			cur = [];
		};
		for (let i = 0; i < lines.length; i++) {
			const ln = lines[i];
			const be = ln.match(BEGIN_ENV);
			if (be && !NON_BLOCK_ENVS.has(be[1]) && !listStack.length) {
				flush();
				// nesting-aware: accumulate until the matching \end (blank lines included)
				const s0 = i;
				let depth = 0;
				const blk: string[] = [];
				for (; i < lines.length; i++) {
					depth += (lines[i].match(/\\begin\{[a-zA-Z*]+\}/g) || []).length;
					depth -= (lines[i].match(/\\end\{[a-zA-Z*]+\}/g) || []).length;
					blk.push(lines[i]);
					if (depth <= 0) break;
				}
				out.push({ text: blk.join('\n'), startLine: s0 + 1, env: be[1] });
				continue;
			}
			const bl = ln.match(BEGIN_LIST),
				el = ln.match(END_LIST),
				im = ln.match(ITEM);
			if (bl) {
				flush();
				listStack.push({ env: bl[1], n: 0 });
				continue;
			}
			if (el) {
				flush();
				listStack.pop();
				continue;
			}
			if (im) {
				flush();
				const top = listStack[listStack.length - 1];
				if (top) top.n++;
				if (im[1].trim()) {
					start = i;
					cur = [im[1]];
					wrap = top ? top.env : '';
					idx = top ? top.n : 0;
				}
				continue;
			}
			if (isBoundary(ln)) {
				flush();
				continue;
			}
			if (!cur.length) {
				start = i;
				wrap = '';
				idx = 0;
			}
			cur.push(ln);
		}
		flush();
		return out;
	}
	// wrap a captured \item body back in its list env for the daemon (correct width + label).
	// For a numbered list, set the counter so the label shows the item's real number, not 1.
	const wrapItem = (t: string, w?: string, idx?: number) => {
		if (!w) return t;
		const setc = w === 'enumerate' && idx && idx > 1 ? `\\setcounter{enumi}{${idx - 1}}` : '';
		return `\\begin{${w}}${setc}\\item ${t}\\end{${w}}`;
	};
	// strip TeX comments: the daemon single-lines the block, so a trailing % would
	// otherwise swallow the rest of the paragraph
	const stripTexComments = (s: string) => s.replace(/([^\\]|^)%.*$/gm, '$1');
	// While typing you pass through unbalanced states (\textbf{ before the }, $ before its
	// close). An unclosed brace group has no paragraph terminator, so the daemon's typeset
	// never finishes -- it blocks the full 6s timeout, then SIGKILLs and cold-respawns the
	// engine. So only fire the instant patch once groups and inline math are balanced;
	// while they aren't, keep the last preview and wait for the keystroke that closes them.
	const daemonReady = (t: string): boolean => {
		let depth = 0;
		let dollars = 0;
		for (let i = 0; i < t.length; i++) {
			const c = t[i];
			if (c === '\\')
				i++; // skip the escaped char: \{ \} \$ \\ aren't grouping
			else if (c === '{') depth++;
			else if (c === '}') {
				if (--depth < 0) return false;
			} else if (c === '$') dollars++;
		}
		return depth === 0 && dollars % 2 === 0;
	};
	// Mid-typing repair: close still-open math/braces IN NESTING ORDER so the daemon can render
	// the partial result instantly ($x + y -> $x + y$; \textbf{par -> \textbf{par}). The closers
	// exist only in this transient render, never in the buffer. Null = not repairable (stray
	// closers) -> hold the last preview.
	function repairForPreview(t: string): string | null {
		const stack: string[] = [];
		for (let i = 0; i < t.length; i++) {
			const c = t[i];
			if (c === '\\') {
				const n = t[i + 1];
				if (n === '(') stack.push('\\)');
				else if (n === '[') stack.push('\\]');
				else if (n === ')') {
					if (stack.pop() !== '\\)') return null;
				} else if (n === ']') {
					if (stack.pop() !== '\\]') return null;
				}
				i++;
			} else if (c === '{') stack.push('}');
			else if (c === '}') {
				if (stack.pop() !== '}') return null;
			} else if (c === '$') {
				if (stack[stack.length - 1] === '$') stack.pop();
				else stack.push('$');
			}
		}
		return stack.length ? t + stack.reverse().join('') : t;
	}
	const dev = (kind: string, detail?: unknown) => {
		const w = window as unknown as { __draftEvents?: unknown[] };
		(w.__draftEvents ||= []).push({ kind, detail });
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

	$effect(() => {
		const src = texSource; // re-run on every edit
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
		const oldP = splitParas(lastDraftSrc);
		const newP = splitParas(src);
		let single = -1;
		if (oldP.length === newP.length) {
			const changed: number[] = [];
			for (let i = 0; i < newP.length; i++) if (newP[i].text !== oldP[i].text) changed.push(i);
			// whitespace/comment-only edit (pressing Enter makes a blank line, etc.): every
			// paragraph is identical, so the render is identical -- no compile, no patch, just
			// advance the baseline. Without this, every Enter cost a full recompile.
			if (changed.length === 0) {
				lastDraftSrc = src;
				lastDraftPath = loadedPath;
				dev('ws-noop-whitespace', {});
				return;
			}
			if (changed.length === 1) single = changed[0];
		}
		if (single < 0) {
			// structural / multi-paragraph edit: heavier, so wait for a pause before recompiling
			dev('ws-recompile', { reason: oldP.length !== newP.length ? 'para-count' : 'multi-para' });
			// a structural edit has no patch to follow: register the first diverging paragraph so
			// the preview jumps to (and highlights) it once the recompile lands
			const fr = get(workspaceRoot);
			let fi = 0;
			{
				const minLen = Math.min(oldP.length, newP.length);
				while (fi < minLen && oldP[fi].text === newP[fi].text) fi++;
			}
			if (fr && loadedPath) {
				const t = newP[Math.min(fi, newP.length - 1)];
				if (t)
					draftRef?.focusAfterCompile({
						file: relFromRoot(loadedPath, fr),
						line: t.startLine,
						endLine: t.startLine + t.text.split('\n').length - 1,
						text: wrapItem(stripTexComments(t.text), t.wrap, t.idx),
						listItem: !!t.wrap || !!t.env
					});
			}
			draftEditTimer = setTimeout(() => fullRecompile(src), 500);
			// PURE single-paragraph insert/delete: splice provisionally instead of leaving the
			// user staring at a stale preview until the pass lands. Best-effort -- on success the
			// full-pass debounce is cancelled (the provisional path schedules its own reconcile);
			// on failure the debounce above still runs.
			const tailMatches = (o: Para[], nn: Para[], at: number, shift: number) => {
				for (let j = at; j < o.length; j++) if (o[j].text !== nn[j + shift]?.text) return false;
				return true;
			};
			const onRec = async () => {
				await flushSaveAndWait();
				lastDraftSrc = src;
				lastDraftPath = loadedPath;
			};
			if (fr && loadedPath) {
				const file = relFromRoot(loadedPath, fr);
				if (newP.length === oldP.length + 1 && fi > 0 && tailMatches(oldP, newP, fi, 1)) {
					const t = newP[fi];
					if (!t.env && !t.wrap && daemonReady(stripTexComments(t.text)))
						void (async () => {
							// walk back up to 3 anchors: the immediate predecessor can be an odd
							// fragment (e.g. a list tail) that no tier locates; any earlier
							// locatable paragraph works because the insert lands below the
							// contiguous flow, not directly below the anchor band
							for (let k = fi - 1; k >= 0 && k >= fi - 3; k--) {
								const a = oldP[k];
								const ok = await draftRef?.provisionalInsert({
									file,
									afterLine: a.startLine,
									afterEnd: a.startLine + a.text.split('\n').length - 1,
									anchorOrig: wrapItem(stripTexComments(a.text), a.wrap, a.idx),
									anchorListItem: !!a.wrap || !!a.env,
									text: stripTexComments(t.text),
									onRecompile: onRec
								});
								if (ok) {
									if (draftEditTimer) {
										clearTimeout(draftEditTimer);
										draftEditTimer = null;
									}
									return;
								}
							}
						})();
				} else if (newP.length === oldP.length - 1 && tailMatches(newP, oldP, fi, 1)) {
					const d = oldP[fi];
					if (d && !d.env)
						void draftRef
							?.provisionalDelete({
								file,
								line: d.startLine,
								endLine: d.startLine + d.text.split('\n').length - 1,
								orig: wrapItem(stripTexComments(d.text), d.wrap, d.idx),
								listItem: !!d.wrap || !!d.env,
								onRecompile: onRec
							})
							.then((ok) => {
								if (ok && draftEditTimer) {
									clearTimeout(draftEditTimer);
									draftEditTimer = null;
								}
							});
				}
			}
			return;
		}
		const newText = stripTexComments(newP[single].text);
		// Mid-command (unbalanced braces / open math): raw dispatch would hang the daemon (an
		// open group swallows the paragraph terminator). Instead of holding the preview, REPAIR
		// the transient text (auto-close the open math/groups) so partial math renders live
		// while typing; the repaired edit is transient (may patch or hold, never compile).
		let sendText = newText;
		let transient = false;
		if (!daemonReady(newText)) {
			const rep = repairForPreview(newText);
			if (rep === null || !daemonReady(rep)) {
				dev('ws-skip-unbalanced', { line: oldP[single].startLine });
				return;
			}
			sendText = rep;
			transient = true;
			dev('ws-repaired', { line: oldP[single].startLine });
		}
		// A paragraph that is the BODY of a non-list environment (equation, tabular, align,
		// quote...) is not a standalone typeset unit: the daemon error-recovers it into
		// something with the same glyphs but the wrong layout (a table becomes plain text, a
		// display equation becomes inline math), which could pass a content match and splice
		// garbage. Lists are fine (wrapItem re-wraps them); everything else takes the full pass.
		{
			const baseLines = lastDraftSrc.split('\n');
			let pl = oldP[single].startLine - 2; // line above the paragraph, 0-based
			while (pl >= 0 && baseLines[pl].trim() === '') pl--;
			// document is exempt: text after \begin{document} is ordinary prose, not an env body
			const env = pl >= 0 ? baseLines[pl].match(/^\s*\\begin\{([a-zA-Z*]+)\}/) : null;
			if (env && !['itemize', 'enumerate', 'description', 'document'].includes(env[1])) {
				dev('ws-recompile', { reason: 'env-body:' + env[1] });
				draftEditTimer = setTimeout(() => fullRecompile(src), 500);
				return;
			}
		}
		const root = get(workspaceRoot);
		if (!root || !loadedPath) return;
		dev('ws-dispatch', { file: relFromRoot(loadedPath, root), line: oldP[single].startLine });
		// One prose paragraph changed: patch IMMEDIATELY. The daemon typesets the text IN
		// MEMORY (no save needed -- saving here would let a recompile beat the patch), and
		// instantPatch's in-flight guard coalesces bursts, so the preview updates as you type.
		// Only an abandon needs the file on disk -- onRecompile saves lazily then advances the
		// baseline; a successful patch keeps the last full compile as the baseline so
		// successive keystrokes keep measuring against real geometry.
		const wrap = newP[single].wrap;
		// A cell edit inside a FLOATED table can't typeset the whole float (the daemon discards
		// float material), but the inner tabular alone typesets fine and the float's position is
		// untouched by content edits: dispatch just the tabular when the change is confined to it.
		// Caption/placement edits (outside the tabular) keep the whole-block dispatch, which
		// cal-empties into the full pass.
		let dispatchText = wrapItem(sendText, wrap, newP[single].idx);
		let dispatchOrig = wrapItem(stripTexComments(oldP[single].text), oldP[single].wrap, oldP[single].idx);
		let floatInner = false;
		if (newP[single].env && /^(table|figure)\*?$/.test(newP[single].env)) {
			const TAB = /\\begin\{(tabular\*?|tabularx|array)\}[\s\S]*?\\end\{\1\}/;
			const oSub = dispatchOrig.match(TAB)?.[0] ?? null;
			const nSub = dispatchText.match(TAB)?.[0] ?? null;
			if (oSub && nSub && dispatchOrig.replace(oSub, ' ') === dispatchText.replace(nSub, ' ')) {
				dispatchText = nSub;
				dispatchOrig = oSub;
				floatInner = true;
			}
		}
		draftRef?.instantPatch({
			file: relFromRoot(loadedPath, root),
			line: oldP[single].startLine,
			// last source line of the (baseline) paragraph. Its typeset line boxes are often tagged
			// by synctex to the \par line (blank line / \end{document}), not line 1, so locate's
			// inverse-mapping fallback needs the range to find the paragraph (esp. the last one).
			endLine: oldP[single].startLine + oldP[single].text.split('\n').length - 1,
			text: dispatchText,
			orig: dispatchOrig,
			transient,
			floatInner,
			// env blocks ride the listItem pathway: paraLeft = column left (their records carry
			// their own centering/indent) and no \parindent calibration variant
			listItem: !!wrap || !!newP[single].env,
			onRecompile: async () => {
				await flushSaveAndWait();
				lastDraftSrc = src;
				lastDraftPath = loadedPath;
			}
		});
	});
	// Draft mode leans on the on-disk file staying current: the full compile reads from disk,
	// and a successful instant patch is in-memory only (nothing is written until the next
	// recompile or an autosave). So force autosave on while draft mode is enabled -- the
	// Preferences toggle is disabled to match.
	$effect(() => {
		if ($settings.draftMode && !$settings.autosave) updateSettings({ autosave: true });
	});

	function stopCompile() {
		activeRef()?.interrupt();
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
				message: e.hint ? `${e.message}\n\n${e.hint}` : e.message
			}));
	});
	// ref to the compile-pane PDF viewer, for SyncTeX forward search
	let pdfPaneRef = $state<{ scrollToPosition: (page: number, x: number, y: number, w?: number, h?: number) => void }>();
	// a SyncTeX-inverse / Find-in-Files jump. the token distinguishes repeat jumps to the same line
	// so the editor re-fires; selectText is the word double-clicked in the PDF, anchored on to
	// correct for line drift (see SourceEditor's gotoLine effect)
	let sourceGotoLine = $state<{ line: number; token: number; selectText?: string } | undefined>(undefined);
	let gotoToken = 0;

	function ensureTerminal() {
		if (terminals.length === 0) {
			const id = ++termSeq;
			terminals = [{ id, title: `Terminal ${id}` }];
			activeTermId = id;
		}
	}
	function showTerminal() {
		terminalMounted = true;
		ensureTerminal();
		terminalVisible = true;
		updateSettings({ terminalVisible: true });
		setTimeout(() => activeRef()?.refit(), 0);
	}
	function toggleTerminal() {
		if (terminalVisible) {
			terminalVisible = false;
			updateSettings({ terminalVisible: false });
		} else {
			showTerminal();
			setTimeout(() => activeRef()?.focus(), 40);
		}
	}
	function addTerminal() {
		const id = ++termSeq;
		terminals = [...terminals, { id, title: `Terminal ${id}` }];
		activeTermId = id;
		terminalMounted = true;
		terminalVisible = true;
		termMenuOpen = false;
		updateSettings({ terminalVisible: true });
		setTimeout(() => activeRef()?.focus(), 50);
	}
	// replace every open shell with one fresh shell in the current workspace: removing the old
	// Terminal components kills their shells, and the new one mounts with the new cwd
	function resetTerminalsForWorkspace() {
		if (terminals.length === 0) return; // none open; the next one opened will spawn in the new folder
		const id = ++termSeq;
		terminals = [{ id, title: `Terminal ${id}` }];
		activeTermId = id;
		if (terminalVisible) setTimeout(() => activeRef()?.refit(), 0);
	}
	function selectTerminal(id: number) {
		activeTermId = id;
		termMenuOpen = false;
		setTimeout(() => {
			activeRef()?.refit();
			activeRef()?.focus();
		}, 0);
	}
	function killTerminal(id: number) {
		terminals = terminals.filter((t) => t.id !== id);
		termRefs[id] = undefined;
		if (activeTermId === id) activeTermId = terminals.at(-1)?.id ?? null;
		if (terminals.length === 0) {
			terminalVisible = false;
			updateSettings({ terminalVisible: false });
		} else {
			setTimeout(() => activeRef()?.refit(), 0);
		}
	}
	function startTerminalResize(e: MouseEvent) {
		e.preventDefault();
		const startY = e.clientY;
		const startH = terminalHeight;
		const onMove = (ev: MouseEvent) => {
			terminalHeight = Math.min(700, Math.max(120, startH + (startY - ev.clientY))); // drag up = taller
			activeRef()?.refit();
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
		activeRef()?.refit();
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
	function runInTerminal(cmd: string, onDone?: () => void, tries = 0) {
		const ref = activeRef();
		if (ref) {
			ref.run(cmd, onDone);
			return;
		}
		if (tries < 40) setTimeout(() => runInTerminal(cmd, onDone, tries + 1), 25); // ~1s for first mount
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
				toaster.error({ title: 'Nothing to compile', description: 'No .tex file found in this folder.' });
			} else {
				void openMainConfirm(() => {
					if (get(mainFile)) void runCompile();
				});
			}
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
		runInTerminal(
			withBatchFlags(resolvedCompileCommand(cmd)),
			track ? () => finalizeCompile(gen, pdfPath, before, logPath, logBefore) : undefined
		);
		if (pdfPath) watchPdf(gen, pdfPath, before);
		if (logPath) watchLog(gen, logPath, logBefore);
		// reload the explorer as the build writes its output (also covers builds that produce no PDF)
		[2000, 6000].forEach((d) => setTimeout(refreshTree, d));
	}

	// the output dir named in the command (-output-directory= / -outdir=), else the folder root.
	// takes an explicit command so callers that run before compileCommand hydrates can pass the settings value.
	function compileOutDir(cmd = compileCommand): string {
		const m = cmd.match(/-(?:output-directory|outdir)[=\s]+("[^"]*"|'[^']*'|\S+)/);
		return m && m[1] ? m[1].replace(/^["']|["']$/g, '') : '.';
	}

	// Quick-setup chips are a best-effort REFLECTION of the command text and a one-way GENERATOR
	// on click - never a silent two-way binding. detectEngine returns null for anything we don't
	// recognize (make, arara, tectonic, a script, multi-engine), so no chip lights up rather than
	// mislabeling it; clicking a chip regenerates the whole command (visible, Cancel-able as a draft).
	type Engine = 'pdflatex' | 'lualatex' | 'xelatex';
	const ENGINE_FLAG: Record<Engine, string> = { pdflatex: '-pdf', lualatex: '-lualatex', xelatex: '-xelatex' };
	function detectEngine(cmd: string): Engine | null {
		if (/\b(lualatex|pdflua)\b/.test(cmd)) return 'lualatex';
		if (/\b(xelatex|pdfxe)\b/.test(cmd)) return 'xelatex';
		if (/\bpdflatex\b/.test(cmd)) return 'pdflatex';
		if (/\blatexmk\b/.test(cmd) && /\bpdf\b/.test(cmd)) return 'pdflatex'; // latexmk -pdf defaults to pdflatex
		return null;
	}
	function usesLatexmk(cmd: string) {
		return /\blatexmk\b/.test(cmd);
	}
	// regenerate a standard command, carrying over the current output dir (default 'output')
	function buildCompileCommand(engine: Engine, latexmk: boolean, cmd: string): string {
		const cur = compileOutDir(cmd);
		const out = `-output-directory=${cur === '.' ? 'output' : cur}`;
		const flags = `-interaction=nonstopmode -file-line-error -synctex=1 ${out}`;
		return latexmk ? `latexmk ${ENGINE_FLAG[engine]} ${flags} {main}` : `${engine} ${flags} {main}`;
	}
	function applyEngine(engine: Engine) {
		compileDraft = buildCompileCommand(engine, usesLatexmk(compileDraft), compileDraft);
	}
	function applyLatexmk(on: boolean) {
		compileDraft = buildCompileCommand(detectEngine(compileDraft) ?? 'pdflatex', on, compileDraft);
	}
	// a Windows drive (C:\), or a POSIX/UNC leading separator
	const isAbsolutePath = (p: string) => /^([a-zA-Z]:[\\/]|[\\/])/.test(p);
	// a user-entered override: absolute stays as-is, else it's relative to the folder root
	function resolveOutputPath(root: string, p: string): string {
		return isAbsolutePath(p) ? p : joinPath(root, p);
	}

	// DETECTED (not overridden) PDF path, purely from the command + main file: shown as the
	// placeholder. <root>/<outdir>/<main-basename>.pdf
	function detectedPdfPath(cmd = compileCommand): string | null {
		const root = get(workspaceRoot);
		const main = get(mainFile) ?? loadedPath;
		if (!root || !main) return null;
		const pdf = basename(main).replace(/\.tex$/i, '') + '.pdf';
		const dir = compileOutDir(cmd);
		return dir === '.' ? joinPath(root, pdf) : joinPath(joinPath(root, dir), pdf);
	}
	// DETECTED log: <jobname>.log next to the (actual, possibly-overridden) PDF, unless an aux
	// directory (latexmk -auxdir / MiKTeX -aux-directory) redirects it
	function detectedLogPath(cmd = compileCommand): string | null {
		const pdf = expectedPdfPath(cmd);
		if (!pdf) return null;
		const aux = cmd.match(/-(?:aux-directory|auxdir)[=\s]+("[^"]*"|'[^']*'|\S+)/);
		const log = basename(pdf).replace(/\.pdf$/i, '.log');
		if (aux && aux[1]) {
			const root = get(workspaceRoot);
			if (!root) return null;
			return joinPath(joinPath(root, aux[1].replace(/^["']|["']$/g, '')), log);
		}
		return pdf.replace(/\.pdf$/i, '.log');
	}
	// ACTUAL PDF/log the preview, log parser, and SyncTeX all use: the folder's manual override
	// wins (Advanced options in the compile modal), else the detected path
	function expectedPdfPath(cmd = compileCommand): string | null {
		const root = get(workspaceRoot);
		const ov = root ? savedCompileOutputs(root).pdf : undefined;
		return root && ov ? resolveOutputPath(root, ov) : detectedPdfPath(cmd);
	}
	function expectedLogPath(cmd = compileCommand): string | null {
		const root = get(workspaceRoot);
		const ov = root ? savedCompileOutputs(root).log : undefined;
		return root && ov ? resolveOutputPath(root, ov) : detectedLogPath(cmd);
	}
	// root-relative detected paths, shown as the Advanced inputs' placeholders; re-derive live as
	// the user edits the command draft or switches main file
	// The Advanced output paths are LITERAL file paths, one file each: the command's {main} is
	// NOT expanded here, and each must be an actual .pdf / .log. Blank = auto-detect. Warn on
	// either mistake; the Auto button clears the field back to auto-detect.
	function outputPathWarning(v: string, ext: '.pdf' | '.log'): string | null {
		if (!v.trim()) return null;
		if (/\{[^}]*\}/.test(v)) return 'No {main} here, type the actual file path';
		if (!v.trim().toLowerCase().endsWith(ext)) return `Should end in ${ext}`;
		return null;
	}
	const pdfPathWarning = $derived(outputPathWarning(compileOutputsDraft.pdf, '.pdf'));
	const logPathWarning = $derived(outputPathWarning(compileOutputsDraft.log, '.log'));

	// read the .log plus the sibling .blg (it reflects the LAST bib run, which stays valid
	// even on compiles where latexmk skips bibtex) and publish the parsed problems
	async function publishLogDiagnostics(logPath: string, mtimeMs: number) {
		const blgPath = logPath.replace(/\.log$/i, '.blg');
		const blgText = (await statFile(blgPath)).exists ? await readTextFile(blgPath) : null;
		const parsed = parseCompileDiagnostics(await readTextFile(logPath), blgText);
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
		const dir = compileOutDir();
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
		const live = get(settings).draftMode;
		const pdf = live ? draftRoot + '/_draft/draft.pdf' : expectedPdfPath();
		if (!loadedPath || kind !== 'tex' || !pdf) return;
		const res = await synctexForward(pdf, loadedPath, line);
		console.debug('[synctex] forward', { tex: loadedPath, line, pdf, res });
		if (!res.ok) {
			toaster.error({ title: 'SyncTeX', description: res.error ?? 'No match.' });
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
			toaster.success({ title: 'Formatted', description: basename(loadedPath) });
		} catch (e) {
			toaster.error({ title: 'Format failed', description: e instanceof Error ? e.message : String(e) });
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
	let pendingRefUpdate = $state<{ oldRel: string; newRel: string; hits: { path: string; count: number }[]; total: number } | null>(null);

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
		if (get(settings).autosave === false && loadedPath && path !== loadedPath && pendingSave?.path === loadedPath) {
			if (confirm(`Save changes to ${basename(loadedPath)} before switching?`)) flushSave();
			else pendingSave = null; // discard the unsaved edit
		} else {
			flushSave(); // persist the outgoing file's queued edit before tearing down its buffers
		}
		texSource = '';
		docMeta = null;
		visualDoc = null;
		rawContent = '';
		loadedPath = null;
		loadError = null;
		// per-file state: scroll-sync anchors and the cross-mode history must not leak across files
		sourceScrollAnchor = null;
		pendingVisualAnchor = null;
		hist = [];
		histIndex = -1;
		if (path) loadFile(path);
	});

	async function loadFile(path: string) {
		try {
			await writeChain; // let any queued write (e.g. the file we just left) land before we read
			if (get(activeFilePath) !== path) return; // a newer switch superseded us
			const k = fileKind(path);
			if (k === 'tex') {
				const raw = await readTextFile(path);
				if (get(activeFilePath) !== path) return; // raced past this file
				docEol = detectEol(raw); // remember CRLF/LF to re-apply on save
				const text = toLf(raw); // editor works in LF
				// set source text up front so the file loads immediately in source view even if the
				// visual-mode parse is slow or times out; the async parse fills visualDoc if it succeeds
				texSource = text;
				visualDoc = null; // clear last file's doc while we wait for the new parse
				loadedPath = path;
				diskBaseline = text;
				isDirty.set(false);
				histReset(text); // the on-disk content is the floor of the cross-mode undo history
				if (viewMode === 'visual') rebuildVisualFromSource();
				else if (viewMode === 'diff') void captureDiffSnapshot(); // re-diff the newly-opened file
			} else if (k === 'text' || k === 'bib') {
				const raw = await readTextFile(path);
				if (get(activeFilePath) !== path) return;
				docEol = detectEol(raw);
				const text = toLf(raw);
				rawContent = text;
				loadedPath = path;
				diskBaseline = text;
				isDirty.set(false);
				if (viewMode === 'diff') void captureDiffSnapshot();
			} else {
				// image / binary: nothing to load, just display it
				if (get(activeFilePath) !== path) return;
				loadedPath = path;
				isDirty.set(false);
			}
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Failed to open file';
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
		if (pendingSave && pendingSave.path !== path) flushSave();
		pendingSave = { path, content };
		// autosave off: track the edit (so Save / the switch-guard have it) but don't auto-write
		if (get(settings).autosave === false) return;
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
			if (notify) toaster.success({ title: 'Saved', description: basename(path), duration: 1200 });
		} catch (e) {
			toaster.error({ title: 'Save failed', description: e instanceof Error ? e.message : 'Unknown error' });
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
			diffError = res.reason === 'no-git' ? 'Git is not installed.' : (res.error ?? 'Could not read the committed version.');
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
			toaster.error({ title: 'Could not initialize repository', description: res.error });
			return;
		}
		await refreshGitStatus(root);
		toaster.success({ title: 'Initialized empty Git repository' });
	}

	async function scmStage(paths: string[]) {
		const root = get(workspaceRoot);
		if (!root) return;
		scmBusy = true;
		const res = await gitStage(root, paths);
		scmBusy = false;
		if (!res.ok) toaster.error({ title: 'Stage failed', description: res.error });
		await refreshGitStatus(root);
	}

	async function scmUnstage(paths: string[]) {
		const root = get(workspaceRoot);
		if (!root) return;
		scmBusy = true;
		const res = await gitUnstage(root, paths);
		scmBusy = false;
		if (!res.ok) toaster.error({ title: 'Unstage failed', description: res.error });
		await refreshGitStatus(root);
	}

	async function scmDiscard(changes: GitStatusEntry[]) {
		const root = get(workspaceRoot);
		if (!root || !changes.length) return;
		const label = changes.length === 1 ? `"${basename(changes[0].path)}"` : `${changes.length} files`;
		if (!confirm(`Discard changes to ${label}? This cannot be undone.`)) return;
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
		if (err) toaster.error({ title: 'Discard failed', description: err });
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
				toaster.error({ title: 'Stage failed', description: s.error });
				return false;
			}
		}
		const res = await gitCommit(root, message);
		scmBusy = false;
		if (!res.ok) {
			toaster.error({ title: 'Commit failed', description: res.error });
			return false;
		}
		await refreshGitStatus(root);
		if (viewMode === 'diff') void captureDiffSnapshot(); // the open diff now compares against the new HEAD
		toaster.success({ title: 'Commit created' });
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

	function rebuildVisualFromSource(): void {
		// fast path: source unchanged since the last successful parse, keep the mounted PM view
		if (texSource === lastParsedSource && visualDoc) return;

		const mySeq = ++parseSequence;
		parseLatexFileAsync(texSource, projectMacros, 3000)
			.then((p) => {
				if (mySeq !== parseSequence) return; // superseded
				docMeta = { preamble: p.preamble, postamble: p.postamble, hadDocumentEnv: p.hadDocumentEnv };
				visualDoc = p.doc;
				lastDoc = p.doc;
				// quirk: this records the CURRENT texSource, which may be post-edit text if the user
				// typed while the parse was in flight. harmless: onChange clears the anchor on edits.
				lastParsedSource = texSource;
				// EditorView reacts to the new localValue and swaps state on the existing instance: no remount, no flicker
			})
			.catch((e: unknown) => {
				if (mySeq !== parseSequence) return;
				const isTimeout = e instanceof Error && e.message === PARSE_TIMEOUT;
				viewMode = 'source';
				visualDoc = null;
				pendingVisualAnchor = null; // never re-anchor a later visual entry off this failed switch
				if (isTimeout) {
					toaster.warning({ title: 'File too large to open in visual mode' });
				} else {
					toaster.error({ title: 'Could not parse source', description: e instanceof Error ? e.message : String(e) });
				}
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
			e.preventDefault();
			save();
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
<svelte:head><title>{loadedPath ? `Texpile: ${basename(loadedPath)}` : 'Texpile'}</title></svelte:head>

<div class="flex h-screen flex-col overflow-hidden">
	<WorkspaceMenuBar
		disabled={!loadedPath}
		imageDir={loadedPath && kind === 'tex' ? dirname(loadedPath) : undefined}
		onNewFile={(ext) => newFileOfType(ext)}
		onOpenFolder={openFolderFromMenu}
		onCloseWorkspace={closeWorkspace}
		onSave={save}
		{terminalAvailable}
		{terminalVisible}
		onCompile={runCompile}
		onConfigureCompile={openCompileModal}
		onNewTerminal={addTerminal}
		onToggleTerminal={toggleTerminal}
		onFormatDocument={openFormatModal}
		onOpenTutorial={() => (tutorialModalOpen = true)}
		{uiZoomPercent}
		onZoomIn={uiZoomIn}
		onZoomOut={uiZoomOut}
		onZoomReset={uiZoomReset}
	/>
	<div class="flex min-h-0 flex-1 overflow-hidden">
		{#if sidebarOpen}
			<aside class="border-surface-200-800 bg-surface-50-950 flex shrink-0 flex-col border-r" style="width: {sidebarWidth}px">
				<div class="border-surface-200-800 flex h-12 items-center justify-between gap-2 border-b px-3">
					<span class="truncate text-sm font-semibold" title={$workspaceRoot ?? ''}>
						{$workspaceRoot ? basename($workspaceRoot) : 'No folder'}
					</span>
					<div class="flex items-center gap-1">
						<button class="btn-icon btn-icon-sm hover:preset-tonal" title="New file" onclick={() => fileTreeRef?.newAtRoot('file')}>
							<FilePlus class="size-4" />
						</button>
						<button class="btn-icon btn-icon-sm hover:preset-tonal" title="New folder" onclick={() => fileTreeRef?.newAtRoot('dir')}>
							<FolderPlus class="size-4" />
						</button>
						<button class="btn-icon btn-icon-sm hover:preset-tonal" title="Refresh file tree" onclick={refreshTree}>
							<RefreshCw class="size-4" />
						</button>
						<button
							class="btn-icon btn-icon-sm {sidebarView === 'scm' ? 'text-primary-500' : 'hover:preset-tonal'}"
							title="Source Control"
							aria-label="Source Control"
							onclick={() => (sidebarView = sidebarView === 'scm' ? 'explorer' : 'scm')}
						>
							<GitBranch class="size-4" />
						</button>
						<button
							class="btn-icon btn-icon-sm {sidebarView === 'search' ? 'text-primary-500' : 'hover:preset-tonal'}"
							title={`Find in files (${modLabel}+Shift+F)`}
							aria-label="Find in files"
							onclick={() => (sidebarView === 'search' ? (sidebarView = 'explorer') : void openGlobalSearch())}
						>
							<Search class="size-4" />
						</button>
					</div>
				</div>
				{#if sidebarView === 'search'}
					<GlobalSearch
						bind:this={globalSearchRef}
						root={$workspaceRoot ?? ''}
						onOpen={openFileAtLine}
						onClose={() => void closeGlobalSearch()}
					/>
				{:else if sidebarView === 'scm'}
					<div class="min-h-0 flex-1 overflow-y-auto">
						<SourceControlPanel
							root={$workspaceRoot ?? ''}
							isRepo={$isGitRepo}
							branch={$gitBranch}
							changes={$gitChanges}
							busy={scmBusy}
							onInit={scmInit}
							onStage={scmStage}
							onUnstage={scmUnstage}
							onDiscard={scmDiscard}
							onCommit={scmCommit}
							onOpenDiff={scmOpenDiff}
							onRefresh={() => refreshGitStatus($workspaceRoot)}
						/>
					</div>
				{:else}
					<div class="flex min-h-0 flex-1 flex-col" bind:this={splitEl}>
						<div class="min-h-0 overflow-y-auto p-1.5" style={showToc ? `flex: ${1 - tocFraction} 1 0%` : 'flex: 1 1 0%'}>
							<FileTree
								bind:this={fileTreeRef}
								tree={$fileTree}
								rootPath={$workspaceRoot ?? ''}
								activePath={$activeFilePath}
								mainPath={$mainFile}
								gitStatus={$gitStatusMap}
								onOpen={openEntry}
								onCreate={createInTree}
								onRename={renameInTree}
								onDelete={deleteInTree}
								onMove={moveInTree}
								onSetMain={(entry) => applyMainFile(entry.path)}
							/>
						</div>
						{#if showToc}
							<!-- arrow keys resize when focused: the WAI-ARIA window-splitter pattern
							     (role=separator + tabindex), which svelte's a11y rule doesn't special-case -->
							<!-- eslint-disable-next-line svelte/valid-compile -->
							<div
								class="hover:bg-primary-500/40 active:bg-primary-500/60 h-1 shrink-0 cursor-row-resize bg-transparent transition-colors"
								onmousedown={startTocResize}
								onkeydown={resizeTocByKey}
								role="separator"
								aria-orientation="horizontal"
								aria-label="Resize table of contents"
								tabindex="0"
							></div>
							<div class="border-surface-200-800 min-h-0 overflow-y-auto border-t p-2" style="flex: {tocFraction} 1 0%">
								<TableOfContents mode={viewMode === 'source' ? 'source' : 'visual'} />
							</div>
						{/if}
					</div>
				{/if}
			</aside>

			<!-- same WAI-ARIA window-splitter pattern as above; svelte's a11y rule doesn't special-case it -->
			<!-- eslint-disable-next-line svelte/valid-compile -->
			<div
				class="hover:bg-primary-500/40 active:bg-primary-500/60 w-1 shrink-0 cursor-col-resize bg-transparent transition-colors"
				onmousedown={startResize}
				onkeydown={resizeSidebarByKey}
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize sidebar"
				tabindex="0"
			></div>
		{/if}

		<main class="flex min-w-0 flex-1 flex-col">
			<header class="border-surface-200-800 flex h-12 items-center justify-between gap-3 border-b px-4">
				<div class="flex min-w-0 items-center gap-2">
					<button
						class="btn-icon btn-icon-sm hover:preset-tonal shrink-0"
						onclick={toggleSidebar}
						title={sidebarOpen ? 'Hide file explorer' : 'Show file explorer'}
						aria-label="Toggle file explorer"
					>
						<PanelLeft class="size-4" />
					</button>
					<FileText class="text-surface-400 size-4 shrink-0" />
					<span class="truncate text-sm font-medium">{loadedPath ? basename(loadedPath) : 'No file'}</span>
					{#if $isDirty}<span class="bg-warning-500 size-2 shrink-0 rounded-full" title="Unsaved changes"></span>{/if}
					{#if loadedPath && kind === 'tex' && (viewMode === 'visual' || viewMode === 'source')}
						<span class="border-surface-300-700 ml-2 shrink-0 border-l pl-3"><WordCount /></span>
					{/if}
				</div>
				<div class="flex items-center gap-2">
					{#if loadedPath && (kind === 'tex' || kind === 'bib')}
						<!-- visual/source toggle; for .bib it's the reference editor vs raw BibTeX -->
						<div class="border-surface-300-700 inline-flex shrink-0 overflow-hidden rounded-md border text-xs">
							<button
								class="flex items-center gap-1 px-2.5 py-1 {viewMode === 'visual' ? 'preset-filled-primary-500' : 'hover:preset-tonal'}"
								onclick={() => setViewMode('visual')}
								title="Visual editor"
							>
								<Eye class="size-3.5" /> Visual
							</button>
							<button
								class="flex items-center gap-1 px-2.5 py-1 {viewMode === 'source' ? 'preset-filled-primary-500' : 'hover:preset-tonal'}"
								onclick={() => setViewMode('source')}
								title="LaTeX source"
							>
								<Code class="size-3.5" /> Source
							</button>
						</div>
					{/if}
					{#if terminalAvailable}
						{#if viewMode === 'source' && kind === 'tex'}
							<button
								class="btn-icon btn-icon-sm hover:preset-tonal"
								onclick={syncForward}
								title="Sync to PDF (SyncTeX forward search)"
								aria-label="Sync to PDF"
							>
								<LocateFixed class="size-4" />
							</button>
						{/if}
						<!-- Compile / Stop with an attached options caret (Overleaf-style) -->
						<div class="relative flex items-center">
							{#if compiling}
								<button
									class="btn btn-sm preset-tonal-error w-20 justify-center gap-1.5 rounded-r-none"
									onclick={stopCompile}
									title={`Stop the running compile (${modLabel}+Alt+Enter)`}
								>
									<Square class="size-4" /> Stop
								</button>
							{:else if $settings.draftMode && pdfPaneOpen && !draftPaused}
								<button
									class="btn btn-sm preset-tonal-success min-w-24 justify-center gap-1.5 rounded-r-none whitespace-nowrap"
									onclick={pauseDraft}
									title="Live preview is running. Click to stop the engine"
								>
									<span class="bg-success-500 size-2 animate-pulse rounded-full"></span> Live
								</button>
							{:else if $settings.draftMode && pdfPaneOpen && draftPaused}
								<button
									class="btn btn-sm preset-tonal-warning min-w-24 justify-center gap-1.5 rounded-r-none whitespace-nowrap"
									onclick={resumeDraft}
									title="Engine stopped. Click to resume the live preview"
								>
									<Play class="size-4" /> Paused
								</button>
							{:else}
								<button
									class="btn btn-sm preset-tonal-primary w-24 justify-center gap-1.5 rounded-r-none"
									onclick={runCompile}
									title={$settings.draftMode ? 'Open the live preview' : `Compile (${modLabel}+Alt+Enter)`}
								>
									<Play class="size-4" />
									{$settings.draftMode ? 'Preview' : 'Compile'}
								</button>
							{/if}
							<button
								class="btn btn-sm {compiling
									? 'preset-tonal-error'
									: $settings.draftMode && pdfPaneOpen
										? draftPaused
											? 'preset-tonal-warning'
											: 'preset-tonal-success'
										: 'preset-tonal-primary'} rounded-l-none border-l border-black/10 px-1"
								onclick={() => (compileMenuOpen = !compileMenuOpen)}
								title="Compile options"
								aria-label="Compile options"
								aria-haspopup="menu"
								aria-expanded={compileMenuOpen}
							>
								<ChevronDown class="size-3.5 transition-transform {compileMenuOpen ? 'rotate-180' : ''}" />
							</button>
							{#if compileMenuOpen}
								<!-- click-away layer -->
								<button
									class="fixed inset-0 z-1200 cursor-default"
									onclick={() => (compileMenuOpen = false)}
									tabindex="-1"
									aria-hidden="true"
								></button>
								<div class="card bg-surface-50-950 border-surface-300-700 absolute top-full right-0 z-1300 mt-1 w-max border p-1 shadow-xl">
									<button
										class="hover:preset-tonal flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm whitespace-nowrap"
										onclick={() => {
											compileMenuOpen = false;
											openCompileModal();
										}}
									>
										<Settings2 class="size-4 shrink-0" /> Configure compile command…
									</button>
								</div>
							{/if}
						</div>
						{#if $compileLog && ($compileLog.errors.length > 0 || $compileLog.warnings.length > 0)}
							<button
								class="btn btn-sm gap-1 {$compileLog.errors.length > 0 ? 'preset-tonal-error' : 'preset-tonal-warning'}"
								onclick={() => {
									showTerminal();
									dockView = 'problems';
								}}
								title="Show problems from the last compile"
							>
								{#if $compileLog.errors.length > 0}
									<CircleAlert class="size-3.5" /> {$compileLog.errors.length}
								{/if}
								{#if $compileLog.warnings.length > 0}
									<TriangleAlert class="size-3.5" /> {$compileLog.warnings.length}
								{/if}
							</button>
						{/if}
						<button
							class="btn-icon btn-icon-sm hover:preset-tonal {pdfPaneOpen ? 'text-primary-500' : ''}"
							onclick={togglePdfPane}
							title="Toggle PDF preview"
							aria-label="Toggle PDF preview"
						>
							<PanelRight class="size-4" />
						</button>
					{/if}
					<button class="btn btn-sm preset-filled-primary-500 gap-1.5" onclick={save} disabled={!loadedPath || saving || !$isDirty}>
						{#if saving}<Loader2 class="size-4 animate-spin" />{:else}<Save class="size-4" />{/if}
						Save
					</button>
				</div>
			</header>

			<!-- editor column (toolbar + content) with the PDF pane beside it, so the PDF
			     skips the toolbar while the header (Compile) stays above it -->
			<div class="flex min-h-0 flex-1">
				<div class="flex min-h-0 min-w-0 flex-1 flex-col">
					{#if visualDoc && loadedPath && kind === 'tex' && viewMode === 'visual'}
						<div class="border-surface-200-800 toolbar-hscroll overflow-x-auto border-b">
							<Toolbar minimal />
						</div>
					{:else if loadedPath && kind === 'tex' && viewMode === 'source'}
						<div class="border-surface-200-800 toolbar-hscroll overflow-x-auto border-b px-2 py-1.5">
							<SourceToolbar />
						</div>
					{/if}
					<!-- relative anchors the floating find bar; it sits outside the scroller so it doesn't scroll away -->
					<div class="relative min-h-0 min-w-0 flex-1">
						{#if loadedPath && kind === 'tex' && viewMode === 'visual' && visualDoc}
							<SearchBar />
						{/if}
						<div class="h-full w-full overflow-auto">
							{#if folderEmpty && !$activeFilePath}
								<div class="mx-auto mt-16 max-w-xl px-6">
									<div class="text-center">
										<h2 class="text-lg font-semibold">Start a new document</h2>
										<p class="text-surface-500 mt-1 text-sm">This folder has no <code>.tex</code> files yet. Pick a template to begin.</p>
									</div>
									<div class="mt-6">
										<StarterPicker onPick={pickStarter} onBlank={newTexFile} onImport={importStarterFiles} busy={applyingStarter} />
									</div>
								</div>
							{:else if loadError}
								<div class="text-error-600 mx-auto mt-12 flex max-w-md flex-col items-center gap-2 text-center">
									<CircleAlert class="size-8" />
									<p class="text-sm">{loadError}</p>
								</div>
							{:else if loadedPath && viewMode === 'diff' && (kind === 'tex' || kind === 'bib' || kind === 'text')}
								<div class="flex h-full flex-col">
									<div
										class="bg-surface-100-900 text-surface-600-300 border-surface-200-800 flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs"
									>
										<GitCompare class="size-3.5 shrink-0" />
										<span class="font-medium">Changes since last commit</span>
										{#if diffLoading}<span class="text-surface-500">· loading…</span>
										{:else if diffError}<span class="text-error-500 truncate">· {diffError}</span>
										{:else if !diffHasHead}<span class="text-surface-500">· new file (nothing committed yet)</span>{/if}
										<div class="ml-auto flex shrink-0 items-center gap-1">
											<button
												class="hover:preset-tonal rounded px-1.5 py-0.5"
												onclick={toggleDiffLayout}
												title={diffLayout === 'unified' ? 'Switch to side-by-side' : 'Switch to inline'}
											>
												{diffLayout === 'unified' ? 'Side-by-side' : 'Inline'}
											</button>
											<button
												class="hover:preset-tonal rounded p-0.5"
												onclick={captureDiffSnapshot}
												title="Refresh diff"
												aria-label="Refresh diff"
											>
												<RefreshCw class="size-3.5" />
											</button>
											<button
												class="hover:preset-tonal-primary flex items-center gap-1 rounded px-1.5 py-0.5 font-medium"
												onclick={exitDiff}
												title="Back to the editor"
											>
												<X class="size-3.5" /> Close
											</button>
										</div>
									</div>
									<div class="min-h-0 flex-1 overflow-auto">
										{#key loadedPath}
											<DiffPanel filename={loadedPath} original={diffOriginal} modified={diffModified} layout={diffLayout} />
										{/key}
									</div>
								</div>
							{:else if loadedPath && kind === 'tex' && viewMode === 'source'}
								{#key loadedPath}
									<SourceEditor
										value={texSource}
										onInput={onTexInput}
										gotoLine={sourceGotoLine}
										onSyncToPdf={syncForwardLine}
										initialScrollPos={sourceScrollAnchor}
										onHistoryBoundary={workspaceHistoryStep}
										diagnostics={sourceDiagnostics}
									/>
								{/key}
							{:else if loadedPath && kind === 'tex' && visualDoc}
								{#key loadedPath}
									<!-- texpile-main-editor scopes the editor's right-click context menu (ContextMenu.svelte) -->
									<!-- px-12 reserves room for the block-handle gutters (~48px left / ~30px right); on narrow
							     windows the mx-auto centering margin collapses and this padding keeps them from clipping -->
									<div class="px-12 py-8">
										<div class="texpile-main-editor mx-auto w-full max-w-3xl min-w-0">
											{#if docMeta?.hadDocumentEnv}
												<PreambleFrontmatter preamble={docMeta.preamble} onEdit={editPreambleFrontmatter} />
											{/if}
											<EditorView
												localValue={visualDoc}
												localReferences={allReferences}
												imageDir={loadedPath ? dirname(loadedPath) : undefined}
												onLocalChange={onChange}
												placeholder="Start writing…"
												onHistoryBoundary={workspaceHistoryStep}
											/>
										</div>
									</div>
								{/key}
							{:else if loadedPath && kind === 'bib' && viewMode === 'source'}
								{#key loadedPath}
									<SourceEditor value={rawContent} onInput={onRawInput} filename={loadedPath} gotoLine={sourceGotoLine} />
								{/key}
							{:else if loadedPath && kind === 'bib'}
								{#key loadedPath}
									<BibManager value={rawContent} onInput={onRawInput} />
								{/key}
							{:else if loadedPath && kind === 'text'}
								{#key loadedPath}
									<SourceEditor value={rawContent} onInput={onRawInput} filename={loadedPath} gotoLine={sourceGotoLine} />
								{/key}
							{:else if loadedPath && kind === 'pdf'}
								<!-- a .pdf opened directly: its own src, independent of the compile-output pane -->
								<div class="h-full w-full">
									<PDFViewer src={fileUrl(loadedPath)} filename={basename(loadedPath)} />
								</div>
							{:else if loadedPath && kind === 'image'}
								<div class="flex h-full items-center justify-center p-8">
									<img src={fileUrl(loadedPath)} alt={basename(loadedPath)} class="max-h-full max-w-full object-contain" />
								</div>
							{:else if loadedPath && kind === 'binary'}
								<div class="text-surface-500 mt-12 text-center text-sm">{basename(loadedPath)} (binary file, not editable here)</div>
							{:else if $activeFilePath}
								<div class="text-surface-500 mt-12 flex items-center justify-center gap-2 text-sm">
									<Loader2 class="size-4 animate-spin" /> Opening…
								</div>
							{:else}
								<div class="text-surface-500 mt-12 text-center text-sm">Select a file to edit.</div>
							{/if}
						</div>
					</div>
				</div>
				{#if pdfPaneOpen}
					<!-- same WAI-ARIA window-splitter pattern as above; svelte's a11y rule doesn't special-case it -->
					<!-- eslint-disable-next-line svelte/valid-compile -->
					<div
						class="hover:bg-primary-500/40 active:bg-primary-500/60 w-1 shrink-0 cursor-col-resize bg-transparent transition-colors"
						onmousedown={startPdfResize}
						onkeydown={resizePdfByKey}
						role="separator"
						aria-orientation="vertical"
						aria-label="Resize PDF preview"
						tabindex="0"
					></div>
					<aside class="border-surface-200-800 flex shrink-0 flex-col border-l" style="width: {pdfPaneWidth}px">
						<div class="bg-surface-100-900 text-surface-600-300 flex h-8 shrink-0 items-center justify-between border-b px-3 text-xs">
							<span class="font-medium">{$settings.draftMode ? 'Live preview' : 'PDF preview'}</span>
							<button class="hover:preset-tonal rounded p-0.5" onclick={togglePdfPane} title="Close preview" aria-label="Close preview">
								<X class="size-3.5" />
							</button>
						</div>
						<div class="min-h-0 flex-1">
							{#if $settings.draftMode}
								<DraftView
									bind:this={draftRef}
									root={draftRoot}
									mainFile={draftMainRel}
									trigger={draftTrigger}
									onInverseSync={(file, line, selectText) => openFileAtLine(normPath(file), line, selectText)}
								/>
							{:else}
								<PDFViewer bind:this={pdfPaneRef} filename={pdfFilename} onPageClick={onPdfDoubleClick} />
							{/if}
						</div>
					</aside>
				{/if}
			</div>

			<!-- terminal dock sits under the editor only; the file explorer keeps full height -->
			{#if terminalMounted && terminalAvailable}
				{#if terminalVisible}
					<!-- same WAI-ARIA window-splitter pattern as above; svelte's a11y rule doesn't special-case it -->
					<!-- eslint-disable-next-line svelte/valid-compile -->
					<div
						class="hover:bg-primary-500/40 active:bg-primary-500/60 h-1 shrink-0 cursor-row-resize bg-transparent transition-colors"
						onmousedown={startTerminalResize}
						onkeydown={resizeTerminalByKey}
						role="separator"
						aria-orientation="horizontal"
						aria-label="Resize terminal"
						tabindex="0"
					></div>
				{/if}
				<!-- kept mounted so shells persist; hidden via display:none -->
				<section
					class="border-surface-200-800 flex shrink-0 flex-col border-t"
					style={terminalVisible ? `height: ${terminalHeight}px` : 'display: none'}
				>
					<div class="bg-surface-100-900 text-surface-600-300 flex h-8 shrink-0 items-center justify-between gap-2 px-2 text-xs">
						<div class="flex min-w-0 items-center gap-1">
							<button
								class="rounded px-2 py-1 {dockView === 'terminal' ? 'preset-tonal font-medium' : 'hover:preset-tonal'}"
								onclick={() => (dockView = 'terminal')}
							>
								Terminal
							</button>
							<button
								class="flex items-center gap-1 rounded px-2 py-1 {dockView === 'problems'
									? 'preset-tonal font-medium'
									: 'hover:preset-tonal'}"
								onclick={() => (dockView = 'problems')}
							>
								Problems
								{#if $compileLog && $compileLog.errors.length > 0}
									<span class="text-error-500 font-semibold">{$compileLog.errors.length}</span>
								{:else if $compileLog && $compileLog.warnings.length > 0}
									<span class="text-warning-600-400 font-semibold">{$compileLog.warnings.length}</span>
								{/if}
							</button>
						</div>
						<div class="flex items-center gap-0.5">
							{#if dockView === 'terminal'}
								<div class="relative">
									<button
										class="hover:preset-tonal flex items-center gap-1.5 rounded px-2 py-1"
										onclick={() => (termMenuOpen = !termMenuOpen)}
									>
										<SquareTerminal class="size-3.5" />
										<span class="font-medium">{terminals.find((t) => t.id === activeTermId)?.title ?? 'Terminal'}</span>
										<ChevronDown class="size-3" />
									</button>
									{#if termMenuOpen}
										<button class="fixed inset-0 z-40 cursor-default" aria-label="Close menu" onclick={() => (termMenuOpen = false)}
										></button>
										<div
											class="bg-surface-50-950 border-surface-300-700 absolute right-0 bottom-full z-50 mb-1 min-w-52 overflow-hidden rounded border py-1 shadow-lg"
										>
											{#each terminals as t (t.id)}
												<div class="hover:preset-tonal-surface flex items-center">
													<button class="flex flex-1 items-center gap-2 px-2.5 py-1.5 text-left" onclick={() => selectTerminal(t.id)}>
														<Check class="size-3.5 {t.id === activeTermId ? '' : 'invisible'}" />
														<span class="truncate">{t.title}</span>
													</button>
													<button
														class="hover:preset-tonal-error mr-1 rounded p-1"
														title="Kill terminal"
														aria-label="Kill terminal"
														onclick={() => killTerminal(t.id)}
													>
														<Trash2 class="size-3.5" />
													</button>
												</div>
											{/each}
											<button
												class="hover:preset-tonal-primary border-surface-200-800 mt-1 flex w-full items-center gap-2 border-t px-2.5 py-1.5 text-left"
												onclick={addTerminal}
											>
												<Plus class="size-3.5" /> New terminal
											</button>
										</div>
									{/if}
								</div>
								<button class="hover:preset-tonal rounded p-1" title="New terminal" aria-label="New terminal" onclick={addTerminal}>
									<Plus class="size-3.5" />
								</button>
								<button
									class="hover:preset-tonal-error rounded p-1"
									title="Kill terminal"
									aria-label="Kill terminal"
									onclick={() => activeTermId != null && killTerminal(activeTermId)}
								>
									<Trash2 class="size-3.5" />
								</button>
							{/if}
							<button class="hover:preset-tonal rounded p-1" title="Hide panel" aria-label="Hide panel" onclick={toggleTerminal}>
								<X class="size-3.5" />
							</button>
						</div>
					</div>
					<!-- all terminals stay mounted (shells persist); only the active one is shown -->
					<div class="relative min-h-0 flex-1">
						{#if dockView === 'problems'}
							<div class="bg-surface-50-950 absolute inset-0 z-10 overflow-hidden">
								<ProblemsPanel root={$workspaceRoot ?? ''} onJump={openFileAtLine} />
							</div>
						{/if}
						{#each terminals as t (t.id)}
							<div class="absolute inset-0" style={t.id === activeTermId ? '' : 'display: none'}>
								<Terminal bind:this={termRefs[t.id]} cwd={$workspaceRoot ?? ''} />
							</div>
						{/each}
					</div>
				</section>
			{/if}
		</main>
	</div>

	{#if mainConfirmOpen}
		<div
			class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4"
			role="presentation"
			onmousedown={(e) => e.target === e.currentTarget && dismissMainConfirm()}
		>
			<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-lg border p-5 shadow-2xl">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-base font-semibold">Choose the main file</h2>
					<button class="btn-icon btn-icon-sm hover:preset-tonal" onclick={dismissMainConfirm} aria-label="Close">
						<X class="size-4" />
					</button>
				</div>
				<p class="text-surface-600-300 mb-3 text-sm">
					A project compiles from one main .tex file; the other files are pulled in from it. Texpile picked the most likely one below. You
					can change it later by right-clicking a file in the explorer and choosing "Set as main file".
				</p>
				<div class="border-surface-300-700 mb-4 max-h-64 overflow-y-auto rounded border">
					{#each mainCandidates as f (f.path)}
						<label
							class="hover:preset-tonal-surface flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm {mainChoice &&
							samePath(mainChoice, f.path)
								? 'preset-tonal-primary'
								: ''}"
						>
							<input
								type="radio"
								class="radio"
								name="main-file-choice"
								value={f.path}
								checked={!!mainChoice && samePath(mainChoice, f.path)}
								onchange={() => (mainChoice = f.path)}
							/>
							<span class="truncate">{f.relPath}</span>
							{#if mainDetected && samePath(f.path, mainDetected)}
								<span class="badge preset-tonal-primary ml-auto shrink-0 text-[10px]">detected</span>
							{:else if mainDocRoots.has(f.path)}
								<span class="badge preset-tonal-surface ml-auto shrink-0 text-[10px]">document</span>
							{/if}
						</label>
					{/each}
				</div>
				<div class="flex justify-end">
					<button class="btn btn-sm preset-filled-primary-500" onclick={confirmMainFile} disabled={!mainChoice}>Use this file</button>
				</div>
			</div>
		</div>
	{/if}

	{#if compileModalOpen}
		<div
			class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4"
			role="presentation"
			onmousedown={(e) => e.target === e.currentTarget && (compileModalOpen = false)}
		>
			<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-lg border p-5 shadow-2xl">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-base font-semibold">Compile command</h2>
					<button class="btn-icon btn-icon-sm hover:preset-tonal" onclick={() => (compileModalOpen = false)} aria-label="Close">
						<X class="size-4" />
					</button>
				</div>
				<!-- (main-file selection lives in the first-compile confirm modal and the file
				     tree's "Set as main file" - not here; this modal is only about the command) -->

				<!-- Live mode has its own lualatex pipeline; when on, the shell command is inert -->
				<div class="mb-1 flex items-center justify-between gap-4">
					<span class="text-sm">Live mode <span class="text-surface-500">(experimental)</span></span>
					<Switch checked={$settings.draftMode} onCheckedChange={(d) => updateSettings({ draftMode: d.checked })}>
						<Switch.Control><Switch.Thumb /></Switch.Control>
						<Switch.HiddenInput />
					</Switch>
				</div>

				{#if $settings.draftMode}
					<p class="text-surface-500 mt-1 mb-1 text-xs">
						Live per-page preview: compiles the whole project with the real engine and re-typesets only what you change. Live mode runs its
						own <strong>lualatex</strong> pipeline, so the compile command and engine below cannot be customized. Only lualatex is supported.
					</p>
					<div class="border-surface-300-700 text-surface-500 mt-3 rounded border border-dashed px-3 py-2 text-xs">
						Compile command &middot; disabled in live mode
						<code class="bg-surface-200-800 ml-1 rounded px-1 opacity-70">lualatex (built-in)</code>
					</div>
				{:else}
					<p class="text-surface-600-300 mt-2 mb-3 text-sm">
						Runs in a shell at the folder root. <code class="bg-surface-200-800 rounded px-1">{'{main}'}</code> expands to your main file. Saved
						for this folder.
					</p>

					<!-- quick setup: chips reflect the command when recognizable, and regenerate it on click -->
					<div class="mb-2 flex flex-wrap items-center gap-2 text-sm">
						<span class="text-surface-500 text-xs">Engine</span>
						{#each ['pdflatex', 'lualatex', 'xelatex'] as const as eng (eng)}
							<button
								type="button"
								class="rounded-base border px-2 py-0.5 text-xs {draftEngine === eng
									? 'border-primary-500 bg-primary-500/10 text-primary-600-400 font-medium'
									: 'border-surface-300-700 text-surface-600-300 hover:preset-tonal'}"
								onclick={() => applyEngine(eng)}
							>
								{eng}
							</button>
						{/each}
						{#if draftEngine === null && compileDraft.trim()}
							<span class="text-surface-400 text-xs italic">custom</span>
						{/if}
						<label class="text-surface-600-300 ml-auto inline-flex items-center gap-1.5 text-xs">
							<input type="checkbox" class="checkbox" checked={draftLatexmk} onchange={(e) => applyLatexmk(e.currentTarget.checked)} />
							use latexmk
						</label>
					</div>

					<!-- svelte-ignore a11y_autofocus -->
					<input
						class="input w-full font-mono text-sm"
						bind:value={compileDraft}
						placeholder={DEFAULT_COMPILE_COMMAND}
						spellcheck="false"
						autofocus
						onkeydown={(e) => {
							if (e.key === 'Enter' && !(compileDraft.includes('{main}') && !$mainFile)) saveCompileCommand(true);
							else if (e.key === 'Escape') compileModalOpen = false;
						}}
					/>
					<div class="mt-4 flex items-center justify-between gap-4">
						<span class="text-sm">Compile completion marker</span>
						<Switch checked={$settings.compileSentinel} onCheckedChange={(d) => updateSettings({ compileSentinel: d.checked })}>
							<Switch.Control><Switch.Thumb /></Switch.Control>
							<Switch.HiddenInput />
						</Switch>
					</div>
					<p class="text-surface-500 mt-1 text-xs">
						Appends a marker echo after the compile command so the editor knows when it finishes. Turn off if it interferes with your shell
						or compile command.
					</p>
				{/if}

				{#if !$settings.draftMode}
					<button
						type="button"
						class="text-surface-500 hover:text-surface-950-50 mt-4 inline-flex items-center gap-1 text-xs"
						onclick={() => (advancedOpen = !advancedOpen)}
					>
						<ChevronDown class="size-3.5 transition-transform {advancedOpen ? '' : '-rotate-90'}" /> Advanced: output paths
					</button>
					{#if advancedOpen}
						<div class="mt-2 space-y-3">
							<p class="text-surface-500 text-xs">
								The exact file your command produces, one each. Override only if auto-detection guesses wrong (a custom
								<code class="bg-surface-200-800 rounded px-1">-jobname</code> or unusual output layout). SyncTeX follows the PDF. Paths are relative
								to the folder root.
							</p>
							<div>
								<div class="mb-1 flex items-center justify-between gap-2">
									<span class="text-surface-600-300 text-xs font-medium">Compiled PDF file</span>
									{#if pdfPathWarning}<span class="text-warning-600-400 text-xs">{pdfPathWarning}</span>{/if}
								</div>
								<div class="flex gap-2">
									<input
										class="input flex-1 font-mono text-sm"
										bind:value={compileOutputsDraft.pdf}
										placeholder="Auto detected from command"
										spellcheck="false"
									/>
									<button
										type="button"
										class="btn btn-sm hover:preset-tonal shrink-0"
										onclick={() => (compileOutputsDraft.pdf = '')}
										disabled={!compileOutputsDraft.pdf}
										title="Clear and auto-detect from the command"
									>
										Auto
									</button>
								</div>
							</div>
							<div>
								<div class="mb-1 flex items-center justify-between gap-2">
									<span class="text-surface-600-300 text-xs font-medium">Log file</span>
									{#if logPathWarning}<span class="text-warning-600-400 text-xs">{logPathWarning}</span>{/if}
								</div>
								<div class="flex gap-2">
									<input
										class="input flex-1 font-mono text-sm"
										bind:value={compileOutputsDraft.log}
										placeholder="Auto detected from command"
										spellcheck="false"
									/>
									<button
										type="button"
										class="btn btn-sm hover:preset-tonal shrink-0"
										onclick={() => (compileOutputsDraft.log = '')}
										disabled={!compileOutputsDraft.log}
										title="Clear and auto-detect from the command"
									>
										Auto
									</button>
								</div>
							</div>
						</div>
					{/if}
				{/if}

				<div class="mt-4 flex items-center justify-between gap-3">
					<span class="text-surface-500 text-xs">
						{#if !$mainFile}Pick a main file to run.{/if}
					</span>
					<div class="flex gap-2">
						<button class="btn btn-sm hover:preset-tonal" onclick={() => (compileModalOpen = false)}>Cancel</button>
						{#if $settings.draftMode}
							<button
								class="btn btn-sm preset-filled-primary-500 gap-1.5"
								onclick={() => {
									compileModalOpen = false;
									runCompile();
								}}
								disabled={!$mainFile}
							>
								<Play class="size-4" /> Run preview
							</button>
						{:else}
							<button class="btn btn-sm hover:preset-tonal" onclick={() => saveCompileCommand(false)}>Save</button>
							<button
								class="btn btn-sm preset-tonal-primary gap-1.5"
								onclick={useDefaultCommand}
								disabled={DEFAULT_COMPILE_COMMAND.includes('{main}') && !$mainFile}
								title="Use the default command and run"
							>
								<Play class="size-4" /> Use default
							</button>
							<button
								class="btn btn-sm preset-filled-primary-500 gap-1.5"
								onclick={() => saveCompileCommand(true)}
								disabled={compileDraft.includes('{main}') && !$mainFile}
							>
								<Play class="size-4" /> Save &amp; run
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}

	{#if formatModalOpen}
		<div
			class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4"
			role="presentation"
			onmousedown={(e) => e.target === e.currentTarget && (formatModalOpen = false)}
		>
			<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-md border p-5 shadow-2xl">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="flex items-center gap-2 text-base font-semibold">
						<TriangleAlert class="text-warning-500 size-5" /> Format document
					</h2>
					<button class="btn-icon btn-icon-sm hover:preset-tonal" onclick={() => (formatModalOpen = false)} aria-label="Close">
						<X class="size-4" />
					</button>
				</div>
				<p class="text-surface-600-300 mb-4 text-sm">
					This reindents your LaTeX source with <code class="bg-surface-200-800 rounded px-1">latexindent</code>. It only touches
					whitespace, but in rare cases (unusual verbatim-like environments, whitespace-sensitive macros) that can still change what
					renders. Undo (Ctrl+Z) reverts it if something looks off.
				</p>
				<div class="flex justify-end gap-2">
					<button class="btn btn-sm hover:preset-tonal" onclick={() => (formatModalOpen = false)}>Cancel</button>
					<button class="btn btn-sm preset-filled-primary-500 gap-1.5" onclick={runFormat} disabled={formatting}>
						{#if formatting}<Loader2 class="size-4 animate-spin" />{/if} Format
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- file edited on disk while we held unsaved edits -->
	{#if conflict}
		<div class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4">
			<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-md border p-5 shadow-2xl">
				<h2 class="text-lg font-semibold">File changed on disk</h2>
				<p class="text-surface-600-300 mt-2 text-sm">
					<span class="font-medium">{basename(conflict.path)}</span> was modified outside the editor while you had unsaved changes. Which version
					do you want to keep?
				</p>
				<div class="mt-5 flex justify-end gap-2">
					<button class="btn hover:preset-tonal" onclick={() => resolveConflict('reload')}>Reload from disk</button>
					<button class="btn preset-filled-primary-500" onclick={() => resolveConflict('keep')}>Keep my version</button>
				</div>
			</div>
		</div>
	{/if}

	{#if pendingRefUpdate}
		<div
			class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4"
			role="presentation"
			onmousedown={(e) => e.target === e.currentTarget && (pendingRefUpdate = null)}
		>
			<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-md border p-5 shadow-2xl">
				<h2 class="text-lg font-semibold">Update file references?</h2>
				<p class="text-surface-600-300 mt-2 text-sm">
					{pendingRefUpdate.total} reference{pendingRefUpdate.total === 1 ? '' : 's'} in {pendingRefUpdate.hits.length} file{pendingRefUpdate
						.hits.length === 1
						? ''
						: 's'} point to <code class="text-xs break-all">{pendingRefUpdate.oldRel}</code>. Repoint
					{pendingRefUpdate.total === 1 ? 'it' : 'them'} to <code class="text-xs break-all">{pendingRefUpdate.newRel}</code>?
				</p>
				<div class="mt-5 flex justify-end gap-2">
					<button class="btn hover:preset-tonal" onclick={() => (pendingRefUpdate = null)}>Keep as-is</button>
					<button class="btn preset-filled-primary-500" onclick={applyRefUpdate}>Update all</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<TutorialConfirmModal bind:open={tutorialModalOpen} onConfirm={openTutorial} />
