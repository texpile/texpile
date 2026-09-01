// A guest's workspace provider: the "filesystem" is the shared CRDT, not disk. Files are read from
// their Y.Text and the tree from the manifest; text edits flow through the CRDT and tree writes
// execute on the host, which owns the disk. Paths are the manifest's root-relative keys.

import { basename, fileUrl as diskFileUrl } from '$lib/workspace/fileSystem';
import type { TreeEntry, TexFile } from '$lib/workspace/fileSystem';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import { collabGuest } from './guestStore.svelte';

function buildTree(files: { rel: string; kind: 'text' | 'binary' }[], ghostDirs: string[] = []): TreeEntry[] {
	const roots: TreeEntry[] = [];
	const dirs = new Map<string, TreeEntry>();
	function childrenOf(dirPath: string): TreeEntry[] {
		if (!dirPath) return roots;
		let entry = dirs.get(dirPath);
		if (!entry) {
			const cut = dirPath.lastIndexOf('/');
			entry = { name: cut < 0 ? dirPath : dirPath.slice(cut + 1), path: dirPath, type: 'dir', children: [] };
			childrenOf(cut < 0 ? '' : dirPath.slice(0, cut)).push(entry);
			dirs.set(dirPath, entry);
		}
		return entry.children!;
	}
	for (const f of files) {
		const cut = f.rel.lastIndexOf('/');
		childrenOf(cut < 0 ? '' : f.rel.slice(0, cut)).push({ name: cut < 0 ? f.rel : f.rel.slice(cut + 1), path: f.rel, type: 'file' });
	}
	for (const g of ghostDirs) childrenOf(g); // materialize empty (guest-local) folders
	// match the host tree order (fsService): directories first, then files, each alphabetical.
	// Building from a flat rel-path list would otherwise interleave folders among files.
	function sortRec(nodes: TreeEntry[]) {
		nodes.sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name));
		for (const n of nodes) if (n.children) sortRec(n.children);
	}
	sortRec(roots);
	return roots;
}

// the guest's WorkspaceView runs on a synthetic root; strip it so paths are manifest-relative
export const GUEST_ROOT = 'session';
export function guestRelPath(p: string) {
	const s = p.replace(/\\/g, '/');
	if (s === GUEST_ROOT) return '';
	return s.startsWith(GUEST_ROOT + '/') ? s.slice(GUEST_ROOT.length + 1) : s;
}
const toRel = guestRelPath;

export const sessionProvider: WorkspaceProvider = {
	caps: { manageTree: true, compile: false, git: false, format: false, search: false },

	readText: async (path) => collabGuest.ytextFor(toRel(path))?.toString() ?? '',
	scanTree: async () => buildTree(collabGuest.files, collabGuest.ghostDirs),
	scanTexFiles: async () =>
		collabGuest.files
			.filter((f) => f.kind === 'text' && /\.tex$/i.test(f.rel))
			.map((f): TexFile => ({ name: basename(f.rel), path: f.rel, relPath: f.rel })),
	scanFiles: async (_root, exts) => {
		const re = new RegExp(`\\.(${exts.join('|')})$`, 'i');
		return collabGuest.files
			.filter((f) => f.kind === 'text' && re.test(f.rel))
			.map((f): TexFile => ({ name: basename(f.rel), path: f.rel, relPath: f.rel }));
	},
	stat: async (path) => ({ exists: collabGuest.files.some((f) => f.rel === toRel(path)), mtimeMs: 0, size: 0 }),
	// images are served on demand by the host over the blob channel
	fileUrl: (path) => collabGuest.fileUrl(toRel(path)),

	writeText: async () => {}, // a guest's text edits flow through the CRDT binding, never a file write
	// a guest CAN add files (drag / paste / upload); they're sent to the host, which writes them
	writeBinary: async (path, blob) => collabGuest.uploadFile(toRel(path), new Uint8Array(await blob.arrayBuffer())),
	create: async (path, type, content = '') => {
		if (type === 'file') collabGuest.uploadFile(toRel(path), new TextEncoder().encode(content));
		// a folder is guest-local until a file lands inside it (the git model: an empty dir is
		// nothing); the first upload into it makes it real on the host
		else collabGuest.addGhostDir(toRel(path));
	},
	// rename/delete are host-executed: the guest asks, the host mutates its disk, and the manifest
	// update carries the outcome back. Ghost folders resolve locally, they have no host side.
	remove: async (path) => {
		const rel = toRel(path);
		if (!collabGuest.dropGhostDir(rel)) collabGuest.requestFileOp('delete', rel);
	},
	rename: async (from, to) => {
		const f = toRel(from);
		const t = toRel(to);
		if (!collabGuest.renameGhostDir(f, t)) collabGuest.requestFileOp('rename', f, t);
	},
	// cross-window drag: the source is a path on the GUEST's machine, which the host can't read,
	// so this is a local byte read + upload, not a host-side copy
	copy: async (from, to) => {
		const res = await fetch(diskFileUrl(from));
		if (!res.ok) throw new Error(`could not read ${from}`);
		collabGuest.uploadFile(toRel(to), new Uint8Array(await res.arrayBuffer()));
	},

	watch: (onChange) => collabGuest.subscribe(onChange)
};
