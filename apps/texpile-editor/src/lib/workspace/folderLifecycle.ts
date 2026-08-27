// Opening, re-initialising and closing a workspace folder.
//
// The ordering here is load-bearing. The claim and the unsaved-edit guard both run BEFORE any
// store flips, so a folder already open in another window never prompts the user to discard, and
// a cancelled switch really cancels: no effect can record the old folder's file under the new root.
import { navigate } from '$lib/router.svelte';
import { tabs } from '$lib/workspace/tabs.svelte';
import { docPositions } from '$lib/workspace/docPositions';
import {
	workspaceRoot,
	texFiles,
	fileTree,
	activeFilePath,
	openFile,
	isDirty,
	mainFile,
	savedMainFile,
	setMainFile,
	addRecentFolder
} from '$lib/workspace/workspaceStore';
import { gatherProjectMacros } from '$lib/workspace/project';
import { claimWorkspace, releaseWorkspace, pickFolder, samePath, type TexFile } from '$lib/workspace/fileSystem';
import { openTutorialProject } from '$lib/workspace/starters';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export type FolderLifecycleDeps = {
	scanTexFiles(root: string): Promise<{ files: TexFile[] }>;
	/** false cancels the whole operation (the user chose Cancel at the unsaved prompt) */
	confirmLeaveUnsaved(): Promise<boolean>;
	flushSaves(): void;
	flushSavesAndWait(): Promise<void>;
	sessionActive(): boolean;
	endSession(): Promise<void>;
	hostMode(): boolean;
	refreshTree(): Promise<void>;
	loadRefs(root: string): void;
	/** synchronous storage check, before the stores flip */
	resolveMainConfirm(root: string | null): void;
	setMainConfirmed(v: boolean): void;
	loadExistingPdf(): void;
	setProjectMacros(macros: string): void;
	/** the open shells were spawned in the previous folder; respawn them in the new one */
	resetTerminals(): void;
};

export class FolderLifecycle {
	constructor(private deps: FolderLifecycleDeps) {}

	/** re-init the workspace in place: swap the root, rescan, re-derive the project, load its
	 * first file. Pass a path to skip the picker. */
	async open(path?: string): Promise<void> {
		const d = this.deps;
		const root = path ?? (await pickFolder());
		if (!root) return;
		const prevRoot = workspaceRoot.current;
		try {
			// already open in another window: that window was focused, this one stays put.
			// claim BEFORE the unsaved prompt so a doomed switch never asks the user to discard.
			if (!(await claimWorkspace(root)).ok) return;
			if (!(await d.confirmLeaveUnsaved())) {
				if (prevRoot) void claimWorkspace(prevRoot); // Cancel: restore this window's claim
				return;
			}
			// a shared session is tied to THIS folder's doc; swapping the root would leave it sharing
			// the old folder invisibly, so end it before the swap
			if (d.sessionActive() && root !== prevRoot) await d.endSession();
			d.resolveMainConfirm(root); // before the stores flip, so the modal effect can't see a stale state
			d.flushSaves(); // autosave-on: persist the outgoing folder's queued edit before the swap
			openFile(null); // detach the old file so nothing re-tabs it under the new root
			// Flip the shell NOW, before the scan: the new workspace renders immediately (empty
			// explorer, its saved tabs) and the slow parts backfill below. On a big folder the scan
			// takes seconds, and it used to run first, freezing the OLD workspace on screen.
			workspaceRoot.current = root;
			// the OLD main must not survive into the scan window: effects keyed on it (the existing-log
			// loader, lane detection) would compute the previous folder's paths under the new root
			mainFile.current = null;
			tabs.bind(root, d.hostMode()); // rebind before refreshTree's prune, so tabs persist under the NEW root
			docPositions.bind(root, d.hostMode());
			texFiles.current = [];
			fileTree.current = [];
			addRecentFolder(root);
			// old-folder shells and references must not serve the new root while the scan runs;
			// both do their own (fast, superseding) work against the new root right away
			if (root !== prevRoot) d.resetTerminals();
			d.loadRefs(root);
			// (no lastFolder write: the MAIN process maintains settings.openFolders for session restore)
			const { files } = await d.scanTexFiles(root);
			if (workspaceRoot.current !== root) return; // a newer switch took over mid-scan
			texFiles.current = files;
			await d.refreshTree();
			await this.initProject(root);
			if (workspaceRoot.current === root && !activeFilePath.current) openFile(files[0]?.path ?? null);
		} catch (e) {
			console.error('Failed to open folder:', e);
		}
	}

	/** clear the in-memory workspace and return to the Start screen. Deliberately does NOT touch
	 * the persisted `lastFolder`, so relaunching still reopens where you left off; this only
	 * affects the current session's view. */
	async close(): Promise<void> {
		const d = this.deps;
		if (!(await d.confirmLeaveUnsaved())) return; // autosave off: ask instead of silently force-writing
		await d.flushSavesAndWait();
		d.resolveMainConfirm(null);
		releaseWorkspace(); // frees the folder so another window may open it
		workspaceRoot.current = null;
		texFiles.current = [];
		fileTree.current = [];
		openFile(null);
		mainFile.current = null;
		isDirty.current = false;
		tabs.bind(null, false); // never leave the store bound persistable to a released root
		docPositions.bind(null, false);
		navigate('/');
	}

	/** TutorialConfirmModal has the user pick an empty folder and confirm first; this only runs after */
	async openTutorial(pickedRoot: string): Promise<void> {
		try {
			const { root, mainFile: main } = await openTutorialProject(pickedRoot);
			await this.open(root);
			setMainFile(root, main);
			this.deps.setMainConfirmed(true); // the starter picked the main; no first-compile question
			openFile(main); // open() opens files[0] (alphabetical), not the main file
		} catch (e) {
			toaster.error({ title: m.wsview_toast_tutorial_failed_title(), description: e instanceof Error ? e.message : String(e) });
		}
	}

	/**
	 * Resolve the main file and gather its cross-file macros. Runs once on folder open, before any
	 * file is loaded.
	 *
	 * The main file is a CHOICE, and the store holds only choices. It used to hold detectMainFile's
	 * GUESS whenever a folder had no saved one, which put a star on a file nobody picked while
	 * `confirmed` stayed false - so the tree said "this is your main file" and the first compile
	 * still opened the picker to ask. Two answers to one question, from the same open.
	 *
	 * Detection did not go away; it moved to where it is honest. MainFilePrompt runs it to preselect
	 * a radio button, which is a suggestion the user then confirms. Nothing is starred, persisted or
	 * compiled on the strength of it.
	 *
	 * One candidate is not a guess - there is nothing to choose between - so a lone file is adopted
	 * for the session. It is deliberately NOT persisted: storage records decisions, and the user has
	 * not made one.
	 */
	async initProject(root: string): Promise<void> {
		const d = this.deps;
		let files: TexFile[] = [];
		try {
			files = (await d.scanTexFiles(root)).files;
		} catch {
			/* leave files empty */
		}
		const saved = savedMainFile(root);
		const savedExists = !!(saved && files.some((f) => samePath(f.path, saved)));
		const main = savedExists ? saved : files.length === 1 ? files[0].path : null;
		if (workspaceRoot.current !== root) return; // folder changed under us
		// a folder whose main file was never explicitly chosen asks once before the first compile
		// (single-file folders have nothing to choose)
		d.setMainConfirmed(savedExists || files.length <= 1);
		mainFile.current = main;
		d.loadExistingPdf(); // show an already-compiled PDF for this folder without a recompile
		d.setProjectMacros(main ? await gatherProjectMacros(main, root) : '');
	}
}
