// A guest's workspace provider: the "filesystem" is the shared CRDT, not disk. Files are read from
// their Y.Text and the tree from the manifest; writes and every host-only capability are off, so
// WorkspaceView runs read-only over the session. Paths are the manifest's root-relative keys.

import { basename } from '$lib/workspace/fileSystem';
import type { TreeEntry, TexFile } from '$lib/workspace/fileSystem';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import { collabGuest } from './guestStore.svelte';

function buildTree(files: { rel: string; kind: 'text' | 'binary' }[]): TreeEntry[] {
	const roots: TreeEntry[] = [];
	const dirs = new Map<string, TreeEntry>();
	const childrenOf = (dirPath: string): TreeEntry[] => {
		if (!dirPath) return roots;
		let entry = dirs.get(dirPath);
		if (!entry) {
			const cut = dirPath.lastIndexOf('/');
			entry = { name: cut < 0 ? dirPath : dirPath.slice(cut + 1), path: dirPath, type: 'dir', children: [] };
			childrenOf(cut < 0 ? '' : dirPath.slice(0, cut)).push(entry);
			dirs.set(dirPath, entry);
		}
		return entry.children!;
	};
	for (const f of files) {
		const cut = f.rel.lastIndexOf('/');
		childrenOf(cut < 0 ? '' : f.rel.slice(0, cut)).push({ name: cut < 0 ? f.rel : f.rel.slice(cut + 1), path: f.rel, type: 'file' });
	}
	return roots;
}

// the guest's WorkspaceView runs on a synthetic root; strip it so paths are manifest-relative
export const GUEST_ROOT = 'session';
const toRel = (p: string) => {
	const s = p.replace(/\\/g, '/');
	if (s === GUEST_ROOT) return '';
	return s.startsWith(GUEST_ROOT + '/') ? s.slice(GUEST_ROOT.length + 1) : s;
};

const readOnly = () => {
	throw new Error('This is a shared session; only the host can change files.');
};

export const sessionProvider: WorkspaceProvider = {
	caps: { manageTree: false, compile: false, git: false, format: false, search: false },

	readText: async (path) => collabGuest.ytextFor(toRel(path))?.toString() ?? '',
	scanTree: async () => buildTree(collabGuest.files),
	scanTexFiles: async () =>
		collabGuest.files
			.filter((f) => f.kind === 'text' && /\.tex$/i.test(f.rel))
			.map((f): TexFile => ({ name: basename(f.rel), path: f.rel, relPath: f.rel })),
	stat: async (path) => ({ exists: collabGuest.files.some((f) => f.rel === toRel(path)), mtimeMs: 0, size: 0 }),
	// images are served on demand by the host over the blob channel
	fileUrl: (path) => collabGuest.fileUrl(toRel(path)),

	writeText: async () => {}, // a guest's text edits flow through the CRDT binding, never a file write
	// a guest CAN add files (drag / paste / upload); they're sent to the host, which writes them
	writeBinary: async (path, data) => collabGuest.uploadFile(toRel(path), new Uint8Array(await data.arrayBuffer())),
	create: async (path, type, content = '') => {
		if (type === 'file') collabGuest.uploadFile(toRel(path), new TextEncoder().encode(content));
		// a bare directory can't be uploaded; it appears once a file lands inside it
	},
	remove: readOnly,
	rename: readOnly,
	copy: readOnly,

	watch: (onChange) => collabGuest.subscribe(onChange)
};
