// The filesystem seam a workspace edits through: the real folder on disk for the host, the shared
// CRDT for a guest. One implementation per data source; capability flags gate the host-only
// features (compile, git, format, find-in-files) so the same view can run in either mode.

import type { TexFile, TreeEntry, SearchFileResult } from './fileSystem';

export interface WorkspaceCapabilities {
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
}

export interface WorkspaceProvider {
	readonly caps: WorkspaceCapabilities;

	// reads (both host and guest)
	readText(path: string): Promise<string>;
	scanTree(root: string): Promise<TreeEntry[]>;
	scanTexFiles(root: string): Promise<TexFile[]>;
	stat(path: string): Promise<{ exists: boolean; mtimeMs: number; size: number }>;
	/** bytes URL for an image or the PDF: texfile:// on disk, blob: for a guest. */
	fileUrl(path: string): string;

	// writes / tree mutations (only meaningful when caps.manageTree)
	writeText(path: string, content: string): Promise<void>;
	writeBinary(path: string, data: Blob): Promise<void>;
	create(path: string, type: 'file' | 'dir', content?: string): Promise<void>;
	remove(path: string): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	copy(from: string, to: string): Promise<void>;

	// capability-gated extras
	search?(
		root: string,
		query: string,
		opts?: { regex?: boolean; caseSensitive?: boolean }
	): Promise<{ results: SearchFileResult[]; truncated: boolean; total?: number; error?: string }>;
	format?(path: string, text: string): Promise<string>;

	/** fires when files change underneath us (a guest's manifest observer); returns an unsubscribe. */
	watch?(onChange: () => void): () => void;
}
