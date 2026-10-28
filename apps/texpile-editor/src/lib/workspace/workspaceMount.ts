// Window-level wiring for an open workspace: the listeners that keep our snapshots fresh, and
// the close handshake with the main process.
import { nativeBridge } from '$lib/workspace/fileSystem';
import { fileService } from '$lib/files/service/fileService';
import { fileUriOf } from '$lib/files/identity/fileUris';
import { ResourceSet } from '$lib/files/identity/resourceMap';
import { fileAsStamped } from '$lib/files/service/fileStamp';
import type { FileOperationEvent } from '$lib/files/changes/fileOperations';
import { FileChangesEvent } from '$lib/files/changes/fileChanges';

export type WindowWiringDeps = {
	refreshTree(): void;
	/** Source Control's changes, which a save moves without touching the tree */
	refreshScm(): void;
	reloadReferences(): void;
	/** guests have no on-disk copy to diff against */
	isHost(): boolean;
	/** the other files the buffers hold catch up with their disk; all of them without `changed` */
	syncBuffers(changed?: (path: string) => boolean): void;
	runCompile(): void;
	onWindowResize(): void;
	/** re-read .texpile/ - the comment log and the compile config - after an outside write */
	reloadProjectState(): void;
	/** show a PDF something other than our Compile wrote (an agent, latexmk -pvc, another editor) */
	loadExternalPdf(): void;
};

// a replace across fifty files is one refresh
const OPERATIONS_QUIET_MS = 50;

async function withoutOwnSaves(e: FileChangesEvent): Promise<FileChangesEvent | null> {
	const own = await Promise.all(e.rawUpdated.map((uri) => fileAsStamped(uri.fsPath)));
	const updated = e.rawUpdated.filter((_, i) => !own[i]);
	if (updated.length === e.rawUpdated.length) return e;
	const changes = [
		...e.rawAdded.map((resource) => ({ type: 'added' as const, resource })),
		...updated.map((resource) => ({ type: 'updated' as const, resource })),
		...e.rawDeleted.map((resource) => ({ type: 'deleted' as const, resource }))
	];
	return changes.length ? new FileChangesEvent(changes) : null;
}

/** attach the workspace's window listeners; returns the detach function */
export function attachWindowListeners(deps: WindowWiringDeps): () => void {
	function onFocus() {
		deps.refreshTree();
		if (deps.isHost()) {
			deps.syncBuffers();
			deps.loadExternalPdf();
		}
		deps.reloadReferences();
		// also here, not only on the watch: a workspace on a filesystem that cannot be watched
		// degrades to focus, and that is exactly where a pull happens - in the terminal, elsewhere
		deps.reloadProjectState();
	}
	async function onFilesChanged(all: FileChangesEvent) {
		const e = await withoutOwnSaves(all);
		if (!e) return;
		// the tree shows names, so only an added or deleted entry changes it
		if (e.gotAdded() || e.gotDeleted()) deps.refreshTree();
		else deps.refreshScm();
		deps.reloadReferences();
		if (!deps.isHost()) return;
		deps.syncBuffers((path) => e.contains(fileUriOf(path)));
		deps.loadExternalPdf();
		deps.reloadProjectState();
	}
	const ran: FileOperationEvent[] = [];
	const offFiles = fileService.onDidFilesChange((e) => void onFilesChanged(e));
	let ranTimer: ReturnType<typeof setTimeout> | undefined;
	function onOperationsRan() {
		const events = ran.splice(0);
		const written = new ResourceSet(events.map((e) => e.resource));
		// a write to a file that is there leaves the tree as it was
		if (events.some((e) => !e.isOperation('write'))) deps.refreshTree();
		else deps.refreshScm();
		deps.reloadReferences();
		if (deps.isHost()) deps.syncBuffers((path) => written.has(fileUriOf(path)));
	}
	function onCompile() {
		return deps.runCompile();
	}
	function onResize() {
		return deps.onWindowResize();
	}

	const offOperations = fileService.onDidRunOperation((e) => {
		ran.push(e);
		clearTimeout(ranTimer);
		ranTimer = setTimeout(onOperationsRan, OPERATIONS_QUIET_MS);
	});
	window.addEventListener('focus', onFocus);
	window.addEventListener('compile', onCompile);
	window.addEventListener('resize', onResize);

	return () => {
		offFiles();
		offOperations();
		clearTimeout(ranTimer);
		window.removeEventListener('focus', onFocus);
		window.removeEventListener('compile', onCompile);
		window.removeEventListener('resize', onResize);
	};
}

export type CloseGuardDeps = {
	flushSaves(): Promise<void>;
	/** edits still not on disk: a failed write, or a File Cache Conflict */
	hasStranded(): boolean;
	confirmLeaveUnsaved(): Promise<boolean>;
};

/** The window close is HELD by the main process until we answer (with a 2s backstop for a hung
 * renderer); the question about stranded edits can outlive the hold, so the close is re-issued after it */
export function attachCloseGuard(deps: CloseGuardDeps): (() => void) | undefined {
	return nativeBridge()?.onBeforeClose?.(async () => {
		await deps.flushSaves();
		if (!deps.hasStranded()) {
			nativeBridge()?.closeDecision?.(true);
			return;
		}
		nativeBridge()?.closeDecision?.(false);
		if (await deps.confirmLeaveUnsaved()) {
			await deps.flushSaves();
			window.close();
		}
	});
}
