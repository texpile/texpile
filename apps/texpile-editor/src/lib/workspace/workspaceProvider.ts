// The filesystem seam a workspace edits through: the real folder on disk for the host, the shared
// CRDT for a guest. One implementation per data source; capability flags gate the host-only
// features (compile, git, format, find-in-files) so the same view can run in either mode.

import type { TexFile, TreeEntry, SearchFileResult } from './fileSystem';

export type WorkspaceCapabilities = {
	/** create / rename / delete / move / import files (host only). */
	manageTree: boolean;
	/** terminal compile + live/draft preview (host only). */
	compile: boolean;
	/** source-control panel (host only). */
	git: boolean;
	/** reformat with latexindent (host only). */
	format: boolean;
	/** find-in-files across the folder (host only). */
	search: boolean;
	/** the shell dock (host only, desktop only). */
	terminal: boolean;
};

export type WorkspaceProvider = {
	readonly caps: WorkspaceCapabilities;

	// reads (both host and guest)
	readText(path: string): Promise<string>;
	/** the first bytes: whether the file looks binary, and its size (host only; a guest's files are text). */
	probe?(path: string): Promise<{ size: number; binary: boolean } | null>;
	scanTree(root: string): Promise<TreeEntry[]>;
	scanTexFiles(root: string): Promise<TexFile[]>;
	/** tree + flat .tex list from one traversal, when the backend can (the disk walk is IO-bound). */
	scanTreeAndFiles?(root: string): Promise<{ children: TreeEntry[]; files: TexFile[] }>;
	/** files by extension (no dots), for the .bib scan behind citation completion. */
	scanFiles(root: string, exts: string[]): Promise<TexFile[]>;
	stat(path: string): Promise<{ exists: boolean; mtimeMs: number; size: number }>;
	/** bytes URL for an image or the PDF: texfile:// on disk, blob: for a guest. */
	fileUrl(path: string): string;

	// writes / tree mutations (only meaningful when caps.manageTree)
	writeText(path: string, content: string): Promise<void>;
	writeBinary(path: string, blob: Blob): Promise<void>;
	create(path: string, type: 'file' | 'dir', content?: string): Promise<void>;
	remove(path: string): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	copy(from: string, to: string): Promise<void>;
	/**
	 * Undoable delete: back the entry up outside the workspace, then send the original to the OS
	 * recycle bin. `backup` is null when it was too large to copy; `recycled` is false when the OS
	 * had no trash and it was unlinked instead. Deleted either way - the two flags say what, if
	 * anything, it can still be recovered from.
	 *
	 * Optional because it is what makes tree undo possible, and a backend that cannot offer it
	 * should degrade to a plain remove rather than pretend. TreeOps checks for it and skips
	 * recording history when it is absent, so undo is never offered for something it cannot reverse.
	 */
	trash?(path: string, root: string): Promise<{ backup: string | null; recycled: boolean }>;
	/** copy a backed-up entry back to `to`; must refuse rather than overwrite. */
	restore?(from: string, to: string): Promise<void>;

	// capability-gated extras
	search?(
		root: string,
		query: string,
		opts?: { regex?: boolean; caseSensitive?: boolean }
	): Promise<{ results: SearchFileResult[]; truncated: boolean; total?: number; error?: string }>;
	format?(path: string, text: string): Promise<string>;

	/** fires when files change underneath us (a guest's manifest observer); returns an unsubscribe. */
	watch?(onChange: () => void): () => void;
};
