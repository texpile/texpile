// The containment boundary for every path an MCP caller can name: resolved against the open tree,
// never the filesystem, so a tool can only ever reach a file this workspace already knows about
import { workspaceRoot, fileTree } from './workspaceStore';
import { joinPath, samePath, type TreeEntry } from './fileSystem';

/** a workspace-relative path as an absolute one inside the root, or null when it climbs out */
export function resolveInWorkspace(rel: string): string | null {
	const root = workspaceRoot.current;
	if (!root || !rel) return null;
	if (rel.includes('\0')) return null;
	const abs = joinPath(root, rel.replace(/\\/g, '/'));
	// reject anything that climbed out of the root via .. before it reaches an open
	if (!samePath(abs, root) && !abs.toLowerCase().startsWith(root.toLowerCase())) return null;
	// a file that does not exist is left to the opener's normal "cannot load" path rather than
	// checked here: this function's job is containment, not existence
	return abs;
}

/** whether the open tree contains this exact file */
export function inOpenTree(abs: string): boolean {
	function walk(nodes: TreeEntry[]): boolean {
		return nodes.some((n) => (n.type === 'file' && samePath(n.path, abs)) || (n.children ? walk(n.children) : false));
	}
	return walk(fileTree.current);
}
