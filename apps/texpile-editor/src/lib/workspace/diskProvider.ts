// The host's workspace provider: reads and writes the real folder on disk via the Electron bridge.
// Every method is a thin adapter over fileSystem.ts, so routing the host through it is behavior-
// identical; a guest swaps in a CRDT-backed provider with the same shape.

import {
	readTextFile,
	writeTextFile,
	writeBinaryFile,
	scanTree,
	scanTexFiles,
	statFile,
	fileUrl,
	createEntry,
	deleteEntry,
	renameEntry,
	copyEntry,
	searchInFolder,
	formatLatexDocument
} from './fileSystem';
import type { WorkspaceProvider } from './workspaceProvider';

export const diskProvider: WorkspaceProvider = {
	caps: { manageTree: true, compile: true, git: true, format: true, search: true },
	readText: readTextFile,
	scanTree: (root) => scanTree(root).then((t) => t.children),
	scanTexFiles: (root) => scanTexFiles(root).then((r) => r.files),
	stat: statFile,
	fileUrl,
	writeText: writeTextFile,
	writeBinary: writeBinaryFile,
	create: createEntry,
	remove: deleteEntry,
	rename: renameEntry,
	copy: copyEntry,
	search: searchInFolder,
	format: formatLatexDocument
};
