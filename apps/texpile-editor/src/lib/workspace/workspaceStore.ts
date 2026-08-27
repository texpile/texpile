// reactive state for the open workspace; the file path is the identity, no doc ids
//
// Persistence lives in the versioned texpile:workspaces blob (lib/storage/workspaces): the main
// file, the last-open file, and the trust record. The compile lanes that used to sit beside them
// moved out entirely - commands/outputs/toggles are the project's own, in .texpile/config.json,
// adopted per open through compileConfig - so what remains here is exactly what cannot travel:
// session memory and this machine's approvals.
import { untrack } from 'svelte';
import { box } from '$lib/runes/box.svelte';
import { getFolder, updateFolder } from '$lib/storage/workspaces';
import { userData } from '$lib/storage/userData';
import type { TexFile, TreeEntry } from './fileSystem';
import type { CompareRef } from './tabs.svelte';

export const workspaceRoot = box<string | null>(null);

export const texFiles = box<TexFile[]>([]);

export const fileTree = box<TreeEntry[]>([]);

/**
 * The open file's path, with a synchronous write hook on top of the plain box.
 *
 * The hook is the runes stand-in for the store subscription the caret save relied on: it fires
 * INSIDE the assignment, before whatever the writer does next. A deferred $effect is not
 * equivalent - folder switches rebind docPositions, deletes forget() the entry, and openDiff
 * flips the mode, all synchronously after the write, and a save that flushes later reads that
 * mutated world (wrong root, resurrected entry, failed mode guard).
 */
type ActiveFileWriteHook = () => void;
const activeFileWriteHooks = new Set<ActiveFileWriteHook>();
const activeFileBox = box<string | null>(null);
export const activeFilePath = {
	get current(): string | null {
		return activeFileBox.current;
	},
	set current(next: string | null) {
		// untracked for the same reason as box's setter: the changed-check reads the box, and a
		// writer inside an effect must not adopt it as a dependency
		const changed = untrack(() => next !== activeFileBox.current);
		activeFileBox.current = next;
		if (changed) for (const hook of activeFileWriteHooks) hook();
	},
	/** fires synchronously inside every value-changing write; returns an unregister. */
	onWrite(hook: ActiveFileWriteHook): () => void {
		activeFileWriteHooks.add(hook);
		return () => activeFileWriteHooks.delete(hook);
	}
};

/**
 * The version the active tab compares against, or null when it is a plain file tab.
 *
 * Kept BESIDE activeFilePath rather than folded into it: compile, the PDF preview, intellisense
 * and SyncTeX all read the active path and must keep seeing a real file. Only the editor pane
 * consults this, to decide whether it renders the document or a comparison of it.
 */
export const activeCompare = box<CompareRef | null>(null);

/** open a file by name, leaving any comparison on screen. Only tab activation carries one. */
export function openFile(path: string | null): void {
	activeCompare.current = null;
	activeFilePath.current = path;
}

/** the main entry .tex, anchors cross-file macro resolution. auto-detected, user-overridable, persisted per folder. */
export const mainFile = box<string | null>(null);

export const isDirty = box<boolean>(false);

/** most-recent first; lives in texpile:users (an MRU is the user's history, not folder config). */
export const recentFolders = {
	get current(): string[] {
		return userData.current.recentFolders;
	}
};
export { addRecentFolder } from '$lib/storage/userData';

function norm(p: string) {
	return p.replace(/\\/g, '/').replace(/\/+$/, '');
}
/** path of abs relative to root (forward slashes), or abs unchanged if not under root. */
function relInRoot(root: string, abs: string): string {
	const r = norm(root) + '/';
	const a = norm(abs);
	// case-insensitive prefix (Windows varies the drive-letter case); a case-sensitive check would
	// store the whole absolute path as the "rel" and it would never round-trip
	return a.toLowerCase().startsWith(r.toLowerCase()) ? a.slice(r.length) : a;
}
/** joins a folder + a stored relative path back into an absolute path (native-ish separators). */
function absInRoot(root: string, rel: string): string {
	const sep = root.includes('\\') ? '\\' : '/';
	// join the WHOLE path in the root's own separator. norm() forward-slashes the root, so
	// appending a backslash-joined tail to it produced "C:/dir\sub\file.tex" -- fine for the fs,
	// which accepts either, but it matches nothing when compared against the tree's own
	// all-backslash paths, so a restored file never highlighted as the open one.
	return norm(root).split('/').join(sep) + sep + rel.split('/').join(sep);
}

/** manual overrides for where the compile writes its PDF/log, when auto-detection guesses wrong. */
export type CompileOutputs = {
	/** path to the compiled PDF (relative to root, or absolute); blank = auto-detect from command. */
	pdf?: string;
	/** path to the .log (relative to root, or absolute); blank = auto-detect (next to the PDF). */
	log?: string;
};

/** the persisted main-file path for a folder (absolute), or null if none was saved. */
export function savedMainFile(root: string): string | null {
	const rel = getFolder(root).main;
	return rel ? absInRoot(root, rel) : null;
}

/**
 * The same value ROOT-RELATIVE, exactly as stored, for writing into .texpile/config.json.
 *
 * Not savedMainFile() put back through a relativiser: fileSystem's relativeTo compares
 * case-sensitively, and Windows hands us the drive letter in either case - which is why relInRoot
 * above lowercases before comparing. It silently returned the absolute path instead, and an
 * absolute path in a file meant to travel between machines is worse than no file at all.
 */
export function savedMainFileRel(root: string): string | null {
	return getFolder(root).main ?? null;
}

/** remembers (or clears) the chosen main file for a folder, and updates the live store. */
export function setMainFile(root: string, path: string | null): void {
	mainFile.current = path;
	updateFolder(root, (draft) => {
		if (path) draft.main = relInRoot(root, path);
		else delete draft.main;
	});
}

/** the last file that was open in a folder (absolute), or null if none was recorded. */
export function savedLastFile(root: string): string | null {
	const rel = getFolder(root).lastFile;
	return rel ? absInRoot(root, rel) : null;
}

/** records the file currently open in a folder (called on every active-file change). */
export function setLastFile(root: string, path: string): void {
	const rel = relInRoot(root, path);
	if (rel === norm(path)) return; // not under this root (mid folder-switch): never record cross-root
	updateFolder(root, (draft) => {
		draft.lastFile = rel;
	});
}

/**
 * Which typesetter Compile drives, decided by the main file and nothing else.
 *
 * There used to be a switch beside this that could override it, and it could only ever be wrong:
 * typst cannot read a .tex and latex cannot read a .typ, so an answer disagreeing with the
 * extension names a build that does not exist. The extension IS the choice - changing it is how
 * you change typesetter - and one source of truth is what stops the dialog offering a lane the
 * pipeline will not run.
 *
 * No main file falls to latex, which is a guess. It is only ever used to decide what the compile
 * dialog SHOWS, since nothing can compile without a main file; callers that display a lane should
 * say "pick a main file" instead of rendering this.
 */
export function effectiveCompileFormat(main: string | null): 'latex' | 'typst' {
	return main && /\.typ$/i.test(main) ? 'typst' : 'latex';
}

/**
 * Has this exact command been accepted for this folder?
 *
 * Exact string equality, deliberately. Anything looser - a prefix, the leading binary - would let
 * an accepted command be extended into something else without asking again, which is the whole
 * thing this guards against.
 *
 * Texpile executes the compile command, so one arriving in .texpile/config.json from a cloned
 * repository is not run until the user has said yes to it. That decision belongs to THIS MACHINE,
 * never to the project file - a config that could mark itself trusted would be no protection at
 * all - which is why trust is the one compile-adjacent thing still stored per folder here.
 */
export function isCommandTrusted(root: string, format: 'latex' | 'typst', command: string): boolean {
	return getFolder(root).trusted?.[format] === command;
}

/** record a command as accepted: the user typed it here, or pressed Use it on the project bar. */
export function trustCommand(root: string, format: 'latex' | 'typst', command: string): void {
	updateFolder(root, (draft) => {
		draft.trusted = { ...draft.trusted, [format]: command };
	});
}
