// The host's workspace provider: reads and writes the real folder on disk via the Electron bridge.
// Every method is a thin adapter over fileSystem.ts, so routing the host through it is behavior-
// identical; a guest swaps in a CRDT-backed provider with the same shape.

import {
	readTextFile,
	readSourceFile,
	resolveRealRelative,
	probeFile,
	writeTextFile,
	writeBinaryFile,
	scanTree,
	scanTexFiles,
	scanTreeAndFiles,
	scanFiles,
	statFile,
	fileUrl,
	createEntry,
	deleteEntry,
	renameEntry,
	copyEntry,
	trashEntry,
	restoreEntry,
	searchInFolder,
	formatLatexDocument,
	nativeBridge,
	relativeInside
} from './fileSystem';
import { fileUriOf } from '$lib/files/identity/fileUris';
import type { WorkspaceProvider } from './workspaceProvider';

// texfile:// serves only the open folders, so a file outside `root` comes through the bridge, UTF-8 only
async function readFileBytes(path: string, root: string): Promise<Uint8Array> {
	if (!relativeInside(root, path)) {
		const { text, encoding } = await readSourceFile(path);
		if (encoding !== 'utf8' && encoding !== 'utf8bom') throw new Error(`not UTF-8: ${path}`);
		return new TextEncoder().encode(text);
	}
	const res = await fetch(fileUrl(path), { cache: 'no-store' });
	if (!res.ok) throw new Error(`could not read ${path}`);
	return new Uint8Array(await res.arrayBuffer());
}

export const diskProvider: WorkspaceProvider = {
	caps: {
		manageTree: true,
		compile: true,
		git: true,
		format: true,
		search: true,
		terminal: true,
		share: true,
		comments: true,
		agent: true,
		project: true
	},
	readText: (path) => readTextFile(path),
	readSource: (path) => readSourceFile(path),
	readBytes: (path, root) => readFileBytes(path, root),
	realRelative: (root, rel) => resolveRealRelative(root, rel),
	probe: (path) => probeFile(path),
	scanTree: (root) => scanTree(root).then((t) => t.children),
	scanTexFiles: (root) => scanTexFiles(root).then((r) => r.files),
	scanTreeAndFiles: (root) => scanTreeAndFiles(root).then((r) => ({ children: r.children, files: r.files })),
	scanFiles: (root, exts) => scanFiles(root, exts).then((r) => r.files),
	stat: (path) => statFile(path),
	fileUrl: (path) => fileUrl(path),
	writeText: (path, content) => writeTextFile(path, content),
	writeBinary: (path, blob) => writeBinaryFile(path, blob),
	create: (path, type, content) => createEntry(path, type, content),
	remove: (path) => deleteEntry(path),
	rename: (from, to) => renameEntry(from, to),
	copy: (from, to) => copyEntry(from, to),
	trash: (path, root, keep) => trashEntry(path, root, keep),
	restore: (from, to) => restoreEntry(from, to),
	search: (root, query, opts) => searchInFolder(root, query, opts),
	format: (path, text) => formatLatexDocument(path, text),
	watch: (onChange) =>
		nativeBridge()?.onWorkspaceFsChanged?.((changes) => onChange(changes.map((c) => ({ type: c.type, resource: fileUriOf(c.path) })))) ??
		(() => {})
};
