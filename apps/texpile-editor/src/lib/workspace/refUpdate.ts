// After a rename/move, find the \includegraphics / \input references across the project's .tex
// files that pointed at the old path (AST-based, not textual) and repoint them. The scan is
// offered to the user first; nothing is rewritten until they accept.
import { get } from 'svelte/store';
import { workspaceRoot, texFiles } from '$lib/workspace/workspaceStore';
import { countFileRefs, replaceFileRefs } from '$lib/latex-parser/filerefs';
import { relFromRoot } from '$lib/workspace/compilePipeline.svelte';
import type { RefUpdate } from '$lib/editor/comp/RefUpdateModal.svelte';
import type { TreeEntry } from '$lib/workspace/fileSystem';

export interface RefUpdateDeps {
	getLoadedPath(): string | null;
	/** the open file's live buffer, which is newer than its on-disk copy */
	getSourceText(): string;
	setSourceText(text: string): void;
	readText(path: string): Promise<string>;
	writeText(path: string, content: string): Promise<unknown>;
	/** the open file was rewritten in place: re-render, mark dirty, queue the save */
	onActiveFileEdited(): void;
}

/** scan for references to the renamed file; null when nothing points at it */
export async function scanRenamedRefs(oldPath: string, newPath: string, deps: RefUpdateDeps): Promise<RefUpdate | null> {
	const root = get(workspaceRoot);
	if (!root) return null;
	const oldRel = relFromRoot(oldPath, root);
	const newRel = relFromRoot(newPath, root);
	if (oldRel === newRel) return null;

	const loaded = deps.getLoadedPath();
	const hits: { path: string; count: number }[] = [];
	let total = 0;
	for (const f of get(texFiles)) {
		try {
			const content = f.path === loaded ? deps.getSourceText() : await deps.readText(f.path);
			const count = countFileRefs(content, oldRel);
			if (count > 0) {
				hits.push({ path: f.path, count });
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
			if (h.path === loaded) {
				deps.setSourceText(replaceFileRefs(deps.getSourceText(), u.oldRel, u.newRel).text);
				deps.onActiveFileEdited();
			} else {
				const content = await deps.readText(h.path);
				await deps.writeText(h.path, replaceFileRefs(content, u.oldRel, u.newRel).text);
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
