// The workspace's file-management wiring: tree rescans, create/rename/delete/move ops,
// starter templates, the folder lifecycle, the main-file choice, and the repoint-references
// offer after a rename.
import { StarterActions } from '$lib/workspace/starterActions.svelte';
import { TreeOps } from '$lib/workspace/treeOps';
import { FolderLifecycle } from '$lib/workspace/folderLifecycle';
import { MainFilePrompt } from '$lib/workspace/mainFilePrompt.svelte';
import { refreshTree as refreshTreeState } from '$lib/workspace/treeRefresh';
import { scanRenamedRefs, applyRefUpdate } from '$lib/workspace/refUpdate';
import { type RefUpdate } from '$lib/modals/workspace/RefUpdateModal.svelte';
import { workspaceRoot, texFiles, mainFile, setMainFile, isDirty } from '$lib/workspace/workspaceStore';
import { projectConfigSync as projectConfig, compileConfig } from '$lib/workspace/projectConfigSync.svelte';
import { gatherProjectMacros } from '$lib/workspace/project';
import { loadReferences } from '$lib/workspace/citations';
import { insertIncludeAtCursor, insertTypstIncludeAtCursor } from '$lib/workspace/editorCommands';
import { retargetDiskStamp } from '$lib/workspace/diskStamp';
import { openFile } from '$lib/workspace/workspaceStore';
import { samePath, type TreeEntry } from '$lib/workspace/fileSystem';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import type { EditSession } from '$lib/collab/editSession';
import type { DocumentBuffer, FileKind } from '$lib/workspace/documentBuffer.svelte';
import type { ViewModeSwitch } from '$lib/workspace/viewModeSwitch.svelte';
import type { PaneLayout } from '$lib/workspace/paneLayout.svelte';
import type { CompilePipeline } from '$lib/workspace/compilePipeline.svelte';
import type { SavePipeline } from '$lib/workspace/savePipeline.svelte';

type FilesDeps = {
	provider: WorkspaceProvider;
	session: () => EditSession;
	doc: DocumentBuffer;
	modes: ViewModeSwitch;
	kind: () => FileKind;
	hostMode: () => boolean;
	canTrash: () => boolean;
	layout: () => PaneLayout;
	compiler: () => CompilePipeline;
	saver: () => SavePipeline;
	/** a held draft compile releases when the main-file prompt settles */
	releaseHeldDraftCompile: () => void;
	typstProject: () => boolean;
	commentsFileMoved: (from: string, to: string) => void;
	confirmLeaveUnsaved: () => Promise<boolean>;
	setProjectMacros: (macros: string) => void;
	rebuildVisual: () => void;
	resetTerminals: () => void;
};

export class WorkspaceFiles {
	// lets the header's New file/folder buttons trigger the tree's inline create input
	fileTreeRef = $state<{ newAtRoot: (type: 'file' | 'dir' | 'include', defaultName?: string) => void; isEditing: () => boolean }>();
	// after a rename/move, find \includegraphics/\input across the project's .tex files
	// that pointed at the file (AST-based) and offer to repoint them
	pendingRefUpdate = $state<RefUpdate | null>(null);

	// like the file tree's "Set as main file" (star badge included).
	// Tri-state: null = unresolved for the current folder; the modal never auto-opens on
	// null, so it can't flash while initProject is still scanning. Storage is consulted
	// SYNCHRONOUSLY on folder open (resolve) - a folder with a saved choice is confirmed
	// before the first render.
	readonly mainPrompt: MainFilePrompt;
	readonly starters: StarterActions;
	readonly treeOps: TreeOps;
	readonly folder: FolderLifecycle;

	// treeRoot is the root the tree on screen currently reflects; plain, not $state, so
	// recording it cannot retrigger the root-follow effect below.
	private treeRoot: string | null = null;

	constructor(private d: FilesDeps) {
		const { provider } = d;
		this.mainPrompt = new MainFilePrompt({
			loadExistingPdf: () => void d.compiler().loadExistingPdf(),
			setProjectMacros: d.setProjectMacros,
			releaseHeldDraftCompile: d.releaseHeldDraftCompile
		});
		// starter templates + file import live in lib/workspace/starterActions.svelte.ts
		this.starters = new StarterActions({
			loadRefs: (root) => this.loadRefs(root),
			refreshTree: () => this.refreshTree(),
			createEntry: (root, name, type) => this.treeOps.create(root, name, type)
		});
		// create/rename/delete/move/import/copy live in lib/workspace/treeOps.ts
		this.treeOps = new TreeOps({
			create: (p, type, content) => provider.create(p, type, content),
			remove: (p) => provider.remove(p),
			rename: (from, to) => provider.rename(from, to),
			copy: (from, to) => provider.copy(from, to),
			// only the disk provider can park a deleted entry somewhere it can be fetched back from; a
			// guest gets neither, and TreeOps then records no history rather than offering an undo it
			// cannot honour
			trash: (p, dir) => provider.trash!(p, dir),
			restore: (from, to) => provider.restore!(from, to),
			supportsTrash: d.canTrash,
			writeBinary: (p, blob) => provider.writeBinary(p, blob),
			stat: (p) => provider.stat(p),
			refreshTree: () => this.refreshTree(),
			loadRefs: (root) => this.loadRefs(root),
			// source-mode users write their own preamble (the editor's ghost offers the skeleton);
			// visual mode has no ghost and no way to write a preamble, so it gets one up front
			wantsStarter: () => d.modes.mode !== 'source',
			isTypstProject: d.typstProject,
			insertIncludeAtCursor: (path) => this.insertInclude(path),
			afterRename: (oldPath, newPath) => void this.afterRename(oldPath, newPath),
			// comment threads follow the file, on user gestures AND on undo/redo replays (which skip
			// afterRename because it prompts). Writes a `move` event to the log - see fileMoved.
			afterPathMoved: (from, to) => d.commentsFileMoved(from, to),
			retargetPendingSave: (from, to) => {
				d.saver().retarget(from, to);
				retargetDiskStamp(from, to); // the guard's stamp must follow the rename too
			},
			discardPendingSave: () => d.saver().discard(),
			// the full set-main flow (store + config.json + macros + visual re-derive), so a renamed
			// main behaves exactly as if the user had starred the new path themselves
			retargetMainFile: (next) => void this.applyMainFile(next)
		});
		this.folder = new FolderLifecycle({
			scanTexFiles: async (root) => ({ root, files: await provider.scanTexFiles(root) }),
			confirmLeaveUnsaved: () => d.confirmLeaveUnsaved(),
			flushSaves: () => d.saver().flush(),
			flushSavesAndWait: () => d.saver().flushAndWait(),
			sessionActive: () => d.session().active,
			endSession: () => d.session().end(),
			hostMode: d.hostMode,
			refreshTree: () => this.refreshTree(),
			loadRefs: (root) => this.loadRefs(root),
			resolveMainConfirm: (root) => this.mainPrompt.resolve(root),
			setMainConfirmed: (v) => (this.mainPrompt.confirmed = v),
			loadExistingPdf: () => void d.compiler().loadExistingPdf(),
			setProjectMacros: d.setProjectMacros,
			resetTerminals: d.resetTerminals
		});

		// The tree FOLLOWS the root. It used to be rescanned only where a folder was opened through
		// FolderLifecycle, but the root is also set straight from main's IPC handlers in App.svelte --
		// session restore, Open Folder in New Window, and an OS "open with" on a .tex file. Those set
		// texFiles and the active file but never the tree, so the explorer went on showing the folder
		// before it. Reacting to the root covers every route in and any route added later.
		// No double scan on the FolderLifecycle path: it awaits refreshTree itself, which records
		// treeRoot, so by the time this runs the root already matches and it stands down.
		$effect(() => {
			const root = workspaceRoot.current;
			if (!root || root === this.treeRoot) return;
			void this.refreshTree();
		});
		// the shared file set changes under a guest whenever the host adds, renames or deletes a file.
		// The provider exposes a watch hook for exactly this; without it the tree only ever reflected
		// what was there at join time.
		$effect(() => provider.watch?.(() => void this.refreshTree()));
		// A main file that IS set answers the question this prompt exists to ask, whoever set it - the
		// tree, .texpile/config.json, MCP, a starter. Tracking "confirmed" separately let the two drift:
		// config.json is adopted in its own effect, so on a project whose config names a main it could
		// land AFTER initProject had already recorded "not confirmed", leaving a starred main that still
		// opened the picker on the first compile. Same symptom as the detection bug, different cause.
		$effect(() => {
			if (mainFile.current) this.mainPrompt.confirmed = true;
		});
		// live mode compiles on its own as soon as the pane is open; surface the question then.
		// Strictly `=== false`: null means initProject is still resolving, never a modal.
		$effect(() => {
			const wants =
				compileConfig.current.latex.liveMode &&
				d.layout().pdfPaneOpen &&
				!this.draftPaused() &&
				!!workspaceRoot.current &&
				texFiles.current.length > 1;
			if (wants && this.mainPrompt.confirmed === false && !this.mainPrompt.open) void this.mainPrompt.prompt();
		});
	}

	// draft pause is read lazily so construction order stays free; set by the component
	draftPaused: () => boolean = () => false;

	// citations read through the provider too, so guest sessions resolve \cite keys from the shared doc
	loadRefs(root: string) {
		return loadReferences(root, { scan: (r, e) => this.d.provider.scanFiles(r, e), read: (p) => this.d.provider.readText(p) });
	}

	// tree rescan + manifest sync + git refresh live in lib/workspace/treeRefresh.ts
	async refreshTree(): Promise<void> {
		this.treeRoot = workspaceRoot.current;
		await refreshTreeState({
			provider: this.d.provider,
			session: this.d.session(),
			isEditingTree: () => !!this.fileTreeRef?.isEditing?.()
		});
	}

	openEntry(entry: TreeEntry): void {
		if (entry.type !== 'file') return;
		openFile(entry.path);
	}

	/** File menu "New": inline create in the tree, pre-named for the chosen type */
	newFileOfType(ext?: string): void {
		this.d.layout().sidebarOpen = true;
		this.fileTreeRef?.newAtRoot('file', this.starters.newFileName(ext));
	}

	/** the file tree's star: clicking the current main again clears it */
	toggleMainFile(path: string): Promise<void> {
		const main = mainFile.current;
		return this.applyMainFile(main && samePath(main, path) ? null : path);
	}

	// persist the new main file, re-gather macros, and re-derive the open visual doc from
	// doc.texSource so the newly resolved command signatures take effect immediately.
	// Takes the value to APPLY, not the file that was clicked: the toggle belongs to the click, and
	// an MCP caller naming the file that is already main must not have it cleared out from under them.
	async applyMainFile(next: string | null): Promise<void> {
		const root = workspaceRoot.current;
		if (!root) return;
		setMainFile(root, next);
		// the main file is the project's, not this machine's: out to .texpile/config.json
		void projectConfig.save(root);
		this.mainPrompt.confirmed = true; // an explicit choice (set or clear) settles the first-compile question
		void this.d.compiler().loadExistingPdf(); // the main file changed -> its expected PDF did too
		this.d.setProjectMacros(next ? await gatherProjectMacros(next, root) : '');
		if (workspaceRoot.current !== root) return;
		if (this.d.doc.path && this.d.kind() === 'tex' && this.d.modes.mode === 'visual') this.d.rebuildVisual();
	}

	insertInclude(newFilePath: string) {
		return this.d.typstProject()
			? insertTypstIncludeAtCursor(newFilePath, this.d.doc.path)
			: insertIncludeAtCursor(newFilePath, this.d.doc.path, this.d.modes.mode === 'visual');
	}

	private refUpdateDeps() {
		const { doc, modes, provider } = this.d;
		return {
			getLoadedPath: () => doc.path,
			getSourceText: () => doc.texSource,
			setSourceText: (t: string) => (doc.texSource = t),
			readText: (p: string) => provider.readText(p),
			scanFiles: async (exts: string[]) => (await provider.scanFiles(workspaceRoot.current ?? '', exts)).map((f) => f.path),
			writeText: (p: string, content: string) => provider.writeText(p, content),
			onActiveFileEdited: () => {
				if (modes.mode === 'visual') this.d.rebuildVisual();
				isDirty.current = true;
				this.d.saver().schedule(doc.path, doc.texSource);
			}
		};
	}

	async afterRename(oldPath: string, newPath: string): Promise<void> {
		this.pendingRefUpdate = await scanRenamedRefs(oldPath, newPath, this.refUpdateDeps());
	}

	async applyPendingRefUpdate(): Promise<void> {
		const u = this.pendingRefUpdate;
		this.pendingRefUpdate = null;
		if (u) await applyRefUpdate(u, this.refUpdateDeps());
	}
}
