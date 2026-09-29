// The client half of electron/src/localHistory.ts: VS Code's Local History. Every save of a file
// keeps a copy in the app's data, and a copy is taken before anything overwrites unsaved or
// unversioned text. Opened from the File menu, a file's or tab's right-click menu and the palette
// (LocalHistoryDialog). Never throws: history is a safety net, and a save must not fail because the
// net did.
import { dirname, nativeBridge, toLf } from '../fileSystem';
import { settings } from '$lib/settings';
import { m } from '$lib/paraglide/messages';

export type LocalHistoryEntry = {
	id: string;
	/** the last save that went into it */
	timestamp: number;
	/** the first save that went into it: a copy gathers saves for up to 5 minutes */
	started?: number;
	/** 'restored', 'renamed', 'moved', 'before-discard', 'before-restore', 'before-reload', 'shared', or a
	 *  name the author gave it; absent for an ordinary save */
	source?: string;
	sourceDescription?: string;
};

/** Optional: an older preload predates it, and there is simply no local history. */
export type LocalHistoryBridge = {
	localHistoryAdd?: (path: string, content: string, source?: string) => Promise<LocalHistoryEntry | null>;
	localHistoryList?: (path: string) => Promise<LocalHistoryEntry[]>;
	localHistoryRead?: (path: string, id: string) => Promise<string | null>;
	localHistoryRemove?: (path: string, id: string) => Promise<boolean>;
	localHistoryRename?: (path: string, id: string, label: string) => Promise<boolean>;
	localHistoryRemoveAll?: () => Promise<void>;
	localHistoryMove?: (from: string, to: string) => Promise<string[]>;
	localHistoryAll?: (root: string) => Promise<LocalHistoryFile[]>;
	localHistoryUsage?: () => Promise<number>;
};

/** a file with Local History, for Find entry to restore; `exists` false for one since deleted */
export type LocalHistoryFile = { resource: string; count: number; newest: number; exists: boolean };

/** A comparison against an entry is a compare tab like any version's; its "hash" says where to read. */
export const LOCAL_REF = 'local:';

// bumped on every change, so the Timeline rereads without polling
let revision = $state(0);
export const localHistoryRevision = {
	get current(): number {
		return revision;
	}
};

export function canKeepLocalHistory(): boolean {
	return !!nativeBridge()?.localHistoryAdd;
}

async function attempt<T>(run: () => Promise<T> | undefined, fallback: T): Promise<T> {
	try {
		return (await run()) ?? fallback;
	} catch {
		return fallback;
	}
}

/** Keep local history, in Preferences: off records nothing, and what was kept stays until cleared */
export async function addLocalHistory(path: string, content: string, source?: string): Promise<LocalHistoryEntry | null> {
	if (settings.current.localHistory === false) return null;
	const entry = await attempt(() => nativeBridge()?.localHistoryAdd?.(path, content, source), null);
	if (entry) revision++;
	return entry;
}

/** newest first, the order the dialog shows */
export async function listLocalHistory(path: string): Promise<LocalHistoryEntry[]> {
	return (await attempt(() => nativeBridge()?.localHistoryList?.(path), [] as LocalHistoryEntry[])).slice().reverse();
}

/** the entry saved just before `id`, in a list newest first as listLocalHistory gives it */
export function entryBefore(newestFirst: LocalHistoryEntry[], id: string): LocalHistoryEntry | null {
	const at = newestFirst.findIndex((e) => e.id === id);
	return at >= 0 ? (newestFirst[at + 1] ?? null) : null;
}

export function readLocalHistory(path: string, id: string): Promise<string | null> {
	return attempt(() => nativeBridge()?.localHistoryRead?.(path, id), null);
}

export async function removeLocalHistory(path: string, id: string): Promise<boolean> {
	const done = await attempt(() => nativeBridge()?.localHistoryRemove?.(path, id), false);
	if (done) revision++;
	return done;
}

export async function renameLocalHistory(path: string, id: string, label: string): Promise<boolean> {
	const done = await attempt(() => nativeBridge()?.localHistoryRename?.(path, id, label), false);
	if (done) revision++;
	return done;
}

export async function removeAllLocalHistory(): Promise<void> {
	await attempt(() => nativeBridge()?.localHistoryRemoveAll?.(), undefined);
	revision++;
}

/** the space every copy together takes, in bytes; null where there is no desktop bridge */
export function localHistoryUsage(): Promise<number | null> {
	return attempt(() => nativeBridge()?.localHistoryUsage?.(), null);
}

/** every file under the project with history, newest first, deleted ones included */
export async function listAllLocalHistory(root: string): Promise<LocalHistoryFile[]> {
	return attempt(() => nativeBridge()?.localHistoryAll?.(root), [] as LocalHistoryFile[]);
}

/** A file or folder was renamed or moved: its entries go with it, and each file gets an entry
 *  saying so. That entry holds what the file holds now, as VS Code's does: the main process starts
 *  it as a copy of the newest entry, which is stale when the file changed outside the app since
 *  (a pull), and what is read here replaces it. */
export async function moveLocalHistory(from: string, to: string, readText?: (path: string) => Promise<string>): Promise<void> {
	const moved = await attempt(() => nativeBridge()?.localHistoryMove?.(from, to), [] as string[]);
	// turned off, the entries still go along, and nothing is read to add one
	if (readText && settings.current.localHistory !== false) {
		for (const target of moved) {
			const was = from + target.slice(to.length);
			const now = await readText(target).catch(() => null);
			// in LF, as saves are kept: a CRLF file's first unchanged save after the rename adds nothing
			if (now !== null) await addLocalHistory(target, toLf(now), dirname(target) === dirname(was) ? 'renamed' : 'moved');
		}
	}
	if (moved.length) revision++;
}

/** VS Code's labels: File Saved, File Restored, and so on; a name the author gave is its own label */
export function sourceLabel(source?: string): string {
	if (!source) return m.history_source_saved();
	if (source === 'restored') return m.history_source_restored();
	if (source === 'renamed') return m.history_source_renamed();
	if (source === 'moved') return m.history_source_moved();
	if (source === 'before-discard') return m.history_source_before_discard();
	if (source === 'before-restore') return m.history_source_before_restore();
	if (source === 'before-reload') return m.history_source_before_reload();
	if (source === 'shared') return m.history_source_shared();
	return source;
}
