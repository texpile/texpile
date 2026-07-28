// Opening, re-initialising and closing a workspace folder.
//
// The ordering here is load-bearing. The claim and the unsaved-edit guard both run BEFORE any
// store flips, so a folder already open in another window never prompts the user to discard, and
// a cancelled switch really cancels: no effect can record the old folder's file under the new root.
import { get } from 'svelte/store';
import { navigate } from '$lib/router.svelte';
import { tabs } from '$lib/workspace/tabs.svelte';
import {
	workspaceRoot,
	texFiles,
	fileTree,
	activeFilePath,
	isDirty,
	mainFile,
	savedMainFile,
	setMainFile,
	addRecentFolder
} from '$lib/workspace/workspaceStore';
import { detectMainFile, gatherProjectMacros } from '$lib/workspace/project';
import { claimWorkspace, releaseWorkspace, pickFolder, samePath, type TexFile } from '$lib/workspace/fileSystem';
import { openTutorialProject } from '$lib/workspace/starters';
import { updateSettings } from '$lib/settings';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export interface FolderLifecycleDeps {
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
}

export class FolderLifecycle {
	constructor(private deps: FolderLifecycleDeps) {}

	/** re-init the workspace in place: swap the root, rescan, re-derive the project, load its
	 * first file. Pass a path to skip the picker. */
	async open(path?: string): Promise<void> {
		const d = this.deps;
		const root = path ?? (await pickFolder());
		if (!root) return;
		const prevRoot = get(workspaceRoot);
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
			const { files } = await d.scanTexFiles(root);
			d.resolveMainConfirm(root); // before the stores flip, so the modal effect can't see a stale state
			d.flushSaves(); // autosave-on: persist the outgoing folder's queued edit before the swap
			activeFilePath.set(null); // detach the old file so nothing re-tabs it under the new root
			workspaceRoot.set(root);
			tabs.bind(root, d.hostMode()); // rebind before refreshTree's prune, so tabs persist under the NEW root
			texFiles.set(files);
			addRecentFolder(root);
			updateSettings({ lastFolder: root });
			await d.refreshTree();
			await this.initProject(root);
			d.loadRefs(root);
			activeFilePath.set(files[0]?.path ?? null);
			if (root !== prevRoot) d.resetTerminals();
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
		workspaceRoot.set(null);
		texFiles.set([]);
		fileTree.set([]);
		activeFilePath.set(null);
		mainFile.set(null);
		isDirty.set(false);
		tabs.bind(null, false); // never leave the store bound persistable to a released root
		navigate('/');
	}

	/** TutorialConfirmModal has the user pick an empty folder and confirm first; this only runs after */
	async openTutorial(pickedRoot: string): Promise<void> {
		try {
			const { root, mainFile: main } = await openTutorialProject(pickedRoot);
			await this.open(root);
			setMainFile(root, main);
			this.deps.setMainConfirmed(true); // the starter picked the main; no first-compile question
			activeFilePath.set(main); // open() opens files[0] (alphabetical), not the main file
		} catch (e) {
			toaster.error({ title: m.wsview_toast_tutorial_failed_title(), description: e instanceof Error ? e.message : String(e) });
		}
	}

	/** resolve the main file (persisted choice if it still exists, else auto-detect) and gather its
	 * cross-file macros. Runs once on folder open, before any file is loaded. */
	async initProject(root: string): Promise<void> {
		const d = this.deps;
		let files: TexFile[] = [];
		try {
			files = (await d.scanTexFiles(root)).files;
		} catch {
			/* leave files empty */
		}
		const saved = savedMainFile(root);
		const main = saved && files.some((f) => samePath(f.path, saved)) ? saved : await detectMainFile(files);
		if (get(workspaceRoot) !== root) return; // folder changed under us
		// a folder whose main file was never explicitly chosen asks once before the first compile
		// (single-file folders have nothing to choose)
		d.setMainConfirmed(files.length <= 1 || !!(saved && files.some((f) => samePath(f.path, saved))));
		mainFile.set(main);
		d.loadExistingPdf(); // show an already-compiled PDF for this folder without a recompile
		d.setProjectMacros(main ? await gatherProjectMacros(main, root) : '');
	}
}
