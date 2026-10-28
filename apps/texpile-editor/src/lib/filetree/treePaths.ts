// path arithmetic on tree entry paths, which keep whichever separator the OS handed us
import { samePath, type TreeEntry } from '$lib/workspace/fileSystem';

export function sepOf(p: string): string {
	return p.includes('\\') ? '\\' : '/';
}

export function parentOf(p: string): string {
	const i = p.lastIndexOf(sepOf(p));
	return i >= 0 ? p.slice(0, i) : '';
}

/** the directory a drop on this entry would land in */
export function dropDir(entry: TreeEntry): string {
	return entry.type === 'dir' ? entry.path : parentOf(entry.path);
}

export function isInside(path: string, ancestor: string): boolean {
	return path.startsWith(ancestor + sepOf(ancestor));
}

/** the entries directly inside `dir`; empty when the walk never reached it (depth cap, read error) */
export function childrenOf(tree: TreeEntry[], dir: string, root: string): TreeEntry[] {
	if (samePath(dir, root)) return tree;
	function find(list: TreeEntry[]): TreeEntry[] | null {
		for (const e of list) {
			if (e.type !== 'dir') continue;
			if (samePath(e.path, dir)) return e.children ?? [];
			if (isInside(dir, e.path) && e.children) {
				const inner = find(e.children);
				if (inner) return inner;
			}
		}
		return null;
	}
	return find(tree) ?? [];
}

/**
 * Is `name` already used inside `dir`? Case-insensitively, because the file systems we run on
 * mostly are, except for `selfPath`, so an entry can still be recased. A folder the tree scan
 * never reached reports nothing, and the operation falls back to failing at the file system.
 */
export function nameTaken(tree: TreeEntry[], dir: string, root: string, name: string, selfPath?: string | null): boolean {
	const wanted = name.trim().toLowerCase();
	if (!wanted) return false;
	return childrenOf(tree, dir, root).some((e) => e.name.toLowerCase() === wanted && !(selfPath && samePath(e.path, selfPath)));
}

/**
 * The name a New Include actually lands under: its extension follows the compile target, and
 * TreeOps.create appends it. The name inputs validate the same string the file system will see.
 */
export function includeFileName(name: string, typst: boolean): string {
	const ext = typst ? '.typ' : '.tex';
	return name.toLowerCase().endsWith(ext) ? name : name + ext;
}
