// the one folder-open sequence: launch bootstrap, main's later pushes, and the start screen
import { mark } from '$lib/debug/startupDoctor';
import { fileMode } from './fileMode.svelte';
import { navigate } from '$lib/router.svelte';
import { claimWorkspace, dirname, joinPath, nativeBridge, samePath, scanTexFiles, statFile } from './fileSystem';
import { latexParserWorker } from './latexParserWorker';
import { openFile, addRecentFolder, savedLastFile, texFiles, workspaceRoot } from './workspaceStore';

export type BootOpen = { kind: 'file' | 'folder'; path: string };

/** 'elsewhere': another window already owns the folder and main focused it, so this one stays put. */
export type OpenOutcome = 'opened' | 'elsewhere' | 'missing';

/** what the main process handed this window at creation, or null for a plain start screen. */
export function bootOpen(): BootOpen | null {
	return nativeBridge()?.bootstrap?.open ?? null;
}

function show(root: string): void {
	workspaceRoot.current = root;
	texFiles.current = [];
	openFile(null);
	if (!fileMode.current) addRecentFolder(root);
	navigate('/workspace');
}

// together, not serially: which file to reopen comes from storage, so only its stat has to wait
async function fill(root: string, want: string | null): Promise<void> {
	const [scanned, wantExists] = await Promise.all([
		scanTexFiles(root),
		want ? statFile(want).then((s) => s.exists) : Promise.resolve(false)
	]);
	if (workspaceRoot.current !== root) return; // moved on while we scanned
	const files = scanned.files;
	// the scan's casing wins where it has the file: the tree matches paths as strings
	const landing = want && wantExists ? (files.find((f) => samePath(f.path, want))?.path ?? want) : null;
	texFiles.current = files;
	openFile(landing ?? files[0]?.path ?? null);
}

/** the launch path: main created this window for this folder, so it is shown without asking */
export function adoptBootOpen(open: BootOpen): void {
	const root = open.kind === 'file' ? dirname(open.path) : open.path;
	fileMode.current = open.kind === 'file';
	mark('folder-open');
	// a document is certain here, so warm the parser alongside the editor chunk
	latexParserWorker();
	show(root);
	void fill(root, open.kind === 'file' ? open.path : savedLastFile(root)).catch(() => {});
}

// Resolves once the workspace is on screen; the scan lands after it, as at launch. Waiting for the
// scan first put three round trips between the click and anything happening.
async function open(root: string, want: string | null): Promise<OpenOutcome> {
	mark('folder-open');
	// together, and both before navigating: claiming does not check the folder is still there, so a
	// recent-folders entry for a deleted one has to fail here rather than in an empty workspace
	const [claim, found] = await Promise.all([claimWorkspace(root), statFile(root)]);
	if (!claim.ok) return 'elsewhere';
	if (!found.exists) return 'missing';
	latexParserWorker();
	show(root);
	void fill(root, want).catch(() => {});
	return 'opened';
}

/** a folder picked on the start screen, or pushed at a window that is already running. `want` is
 *  the file to land on; omit it for whichever was open there last. */
export function openFolderInWindow(root: string, want?: string | null): Promise<OpenOutcome> {
	fileMode.current = false;
	return open(root, want === undefined ? savedLastFile(root) : want);
}

const ROOT_SEARCH_DEPTH = 5;

/** nearest ancestor with a marker, else the file's own folder. Nearest wins, .texpile first. */
export async function projectRootFor(filePath: string): Promise<string> {
	const first = dirname(filePath);
	let dir = first;
	for (let level = 0; level < ROOT_SEARCH_DEPTH; level++) {
		for (const marker of ['.texpile', '.git']) {
			if ((await statFile(joinPath(dir, marker))).exists) return dir;
		}
		const up = dirname(dir);
		if (!up || up === dir) break;
		dir = up;
	}
	return first;
}

/** re-root on the file's project, then show the chrome */
export async function openWorkspaceForFile(filePath: string): Promise<OpenOutcome> {
	const root = await projectRootFor(filePath);
	if (workspaceRoot.current && samePath(root, workspaceRoot.current)) {
		fileMode.current = false;
		return 'opened';
	}
	return openFolderInWindow(root, filePath);
}

/** OS "Open With": open the file's folder and land on the file itself */
export function openFileInWindow(filePath: string): Promise<OpenOutcome> {
	fileMode.current = true;
	return open(dirname(filePath), filePath);
}
