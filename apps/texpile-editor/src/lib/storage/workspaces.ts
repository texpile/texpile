// texpile:workspaces - everything this machine remembers about each folder, one versioned blob.
//
// The entry is deliberately NOT the project's build config: commands, outputs and the compile
// toggles live in the folder's own .texpile/config.json and are adopted into memory per open
// (see workspace/compileConfig.svelte.ts). What stays here is what cannot travel: which command
// this machine has APPROVED (trusted - a config that could mark itself trusted would be no
// protection at all), and session memory (last file, tabs, per-file caret/scroll).
//
// `positions` makes this the hottest-written key in the app (debounced caret moves), which is an
// accepted trade for having one key per concern; reads and writes are whole-blob and synchronous.

export type FolderEntry = {
	/** root-relative main file (compile target + macro-scan anchor); the sync-at-boot copy that
	 *  keeps the pick-a-main modal from flashing while .texpile/config.json is still being read */
	main?: string;
	/** root-relative last-open file, restored on reopening the folder */
	lastFile?: string;
	/** compile commands accepted for this folder, per format - THIS MACHINE's approval record */
	trusted?: { latex?: string; typst?: string };
	/** the project snippet file's regex triggers this machine allowed, as compileSnippets keys them */
	allowedSnippetPatterns?: string;
	/** open tabs, in order, root-relative: a file, or a file compared against one of its versions */
	tabs?: SavedTab[];
	/** the version lastFile was left compared against, when the focused tab was a comparison */
	lastCompare?: SavedCompare;
	/** the editor layout and its slots; the focused slot's tabs are `tabs` */
	groups?: SavedEditorLayout;
	/** per-file caret + scroll; shape owned and validated by workspace/docPositions.ts */
	positions?: Record<string, unknown>;
	/** left in Suggesting; a choice per project and per person, so not in the project's own config */
	suggesting?: boolean;
	/** the Typst export dialog's last choices and destination; shape owned and validated by
	 *  languages/typst/export/exportOptions.ts */
	typstExport?: Record<string, unknown>;
};

/** a tab as the entry keeps it: a root-relative file, or one compared against a version */
export type SavedTab = string | { path: string; compare: SavedCompare };

/** one editor slot: for each but the focused one, its tabs, open tab and mode */
export type SavedSlot =
	{ focused: true; mode: 'visual' | 'source' } | { focused?: false; tabs: SavedTab[]; active: number; mode: 'visual' | 'source' };

/** the column and row dividers as the first column's and first row's part */
export type SavedEditorLayout = { layout: string; split: { column: number; row: number }; slots: SavedSlot[] };

/** the saved version a comparison tab is against; `path` is the file's name in that version when it had another */
export type SavedCompare = { hash: string; subject: string; path?: string };

/** a stored comparison read back, or null when the value is not one */
export function savedCompare(v: unknown): SavedCompare | null {
	if (!v || typeof v !== 'object') return null;
	const { hash, subject, path } = v as Record<string, unknown>;
	if (typeof hash !== 'string' || !hash || typeof subject !== 'string') return null;
	return typeof path === 'string' && path ? { hash, subject, path } : { hash, subject };
}

type WorkspacesBlob = {
	v: 1;
	folders: Record<string, FolderEntry>;
};

const KEY = 'texpile:workspaces';

/** one normalized key per folder, or two casings of a Windows drive letter make two entries */
export function folderKey(root: string) {
	return root.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function read(): WorkspacesBlob {
	if (typeof localStorage === 'undefined') return { v: 1, folders: {} };
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as { v?: unknown; folders?: unknown } | null;
		if (raw && raw.v === 1 && typeof raw.folders === 'object' && raw.folders !== null) {
			return { v: 1, folders: raw.folders as Record<string, FolderEntry> };
		}
	} catch {
		/* corrupted: start fresh - everything here is machine memory, not the project's data */
	}
	return { v: 1, folders: {} };
}

function write(blob: WorkspacesBlob): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(KEY, JSON.stringify(blob));
	} catch {
		/* quota or storage disabled: the app still works, memory is just session-only */
	}
}

export function getFolder(root: string): FolderEntry {
	return read().folders[folderKey(root)] ?? {};
}

/** read-modify-write one folder's entry; `fn` mutates it in place. */
export function updateFolder(root: string, fn: (entry: FolderEntry) => void): void {
	const blob = read();
	const key = folderKey(root);
	const entry = blob.folders[key] ?? {};
	fn(entry);
	blob.folders[key] = entry;
	write(blob);
}
