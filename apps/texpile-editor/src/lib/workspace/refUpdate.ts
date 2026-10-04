// After a rename/move, find the references across the project that pointed at the old path
// (AST-based in every dialect, not textual) and repoint them. The scan is offered to the user
// first; nothing is rewritten until they accept. Covers .tex, .typ and .md referrers alike - an
// image dragged to another folder is just as broken for the markdown file that links it.
import { workspaceRoot, texFiles } from '$lib/workspace/workspaceStore';
import { countFileRefs, replaceFileRefs, refDialectOf, REF_SCAN_EXTS, type RefDialect } from '$lib/workspace/fileRefs';
import { relFromRoot } from '$lib/workspace/compilePipeline.svelte';
import { sourceEncodingError, type SourceRead } from '$lib/workspace/sourceEncoding';
export type RefUpdate = {
	oldRel: string;
	newRel: string;
	/** the dialect decides how each hit is rewritten, so it travels with the hit */
	hits: { path: string; count: number; dialect: RefDialect }[];
	total: number;
};
import type { TreeEntry } from '$lib/workspace/fileSystem';

export type RefUpdateDeps = {
	getLoadedPath(): string | null;
	/** the open file's live buffer, which is newer than its on-disk copy */
	getSourceText(): string;
	/** the open file is not UTF-8, so it is shown read-only */
	loadedReadOnly(): boolean;
	setSourceText(text: string): void;
	readSource(path: string): Promise<SourceRead>;
	/** every file in the project with one of `exts` (no dots) - the provider's scan, injected so
	 *  this module stays free of the host/guest split */
	scanFiles(exts: string[]): Promise<string[]>;
	writeText(path: string, content: string): Promise<unknown>;
	/** the open file was rewritten in place: re-render, mark dirty, queue the save */
	onActiveFileEdited(): void;
};

/** every file that could hold a reference, whatever dialect it is written in. Falls back to the
 *  .tex-only store if the provider cannot scan by extension (it is optional on the interface). */
async function referrers(deps: RefUpdateDeps): Promise<string[]> {
	try {
		return await deps.scanFiles(REF_SCAN_EXTS);
	} catch {
		return texFiles.current.map((f) => f.path);
	}
}

/** the text to rewrite, or null for a file that would not be written back in its own encoding */
async function editableText(path: string, deps: RefUpdateDeps): Promise<string | null> {
	if (path === deps.getLoadedPath()) return deps.loadedReadOnly() ? null : deps.getSourceText();
	const { text, encoding } = await deps.readSource(path);
	return sourceEncodingError(encoding) ? null : text;
}

/** scan for references to the renamed file; null when nothing points at it */
export async function scanRenamedRefs(oldPath: string, newPath: string, deps: RefUpdateDeps): Promise<RefUpdate | null> {
	const root = workspaceRoot.current;
	if (!root) return null;
	const oldRel = relFromRoot(oldPath, root);
	const newRel = relFromRoot(newPath, root);
	if (oldRel === newRel) return null;

	const hits: { path: string; count: number; dialect: RefDialect }[] = [];
	let total = 0;
	for (const path of await referrers(deps)) {
		const dialect = refDialectOf(path);
		if (!dialect) continue;
		try {
			const content = await editableText(path, deps);
			if (content === null) continue;
			const count = countFileRefs(content, oldRel, dialect);
			if (count > 0) {
				hits.push({ path, count, dialect });
				total += count;
			}
		} catch {
			/* skip unreadable file */
		}
	}
	return total > 0 ? { oldRel, newRel, hits, total } : null;
}

/** rewrite every hit. The open file goes through the live buffer so the user sees it change and
 * the edit joins the normal save pipeline; the rest are written straight to disk. */
export async function applyRefUpdate(u: RefUpdate, deps: RefUpdateDeps): Promise<void> {
	const loaded = deps.getLoadedPath();
	for (const h of u.hits) {
		try {
			const content = await editableText(h.path, deps);
			if (content === null) continue;
			if (h.path === loaded) {
				deps.setSourceText(replaceFileRefs(content, u.oldRel, u.newRel, h.dialect).text);
				deps.onActiveFileEdited();
			} else {
				await deps.writeText(h.path, replaceFileRefs(content, u.oldRel, u.newRel, h.dialect).text);
			}
		} catch (e) {
			console.error('Failed to update references in', h.path, e);
		}
	}
}

/** flatten the file tree to root-relative paths (file-path autocompletion, .bib discovery) */
export function flattenPaths(entries: TreeEntry[], root: string, out: string[] = []): string[] {
	for (const e of entries) {
		if (e.type === 'file') out.push(relFromRoot(e.path, root));
		if (e.children) flattenPaths(e.children, root, out);
	}
	return out;
}
