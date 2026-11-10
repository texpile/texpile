import { it, expect, afterEach } from 'vitest';
import { refreshTree } from '$lib/workspace/treeRefresh';
import { fileService } from '$lib/files/service/fileService';
import { workspaceRoot, fileTree, activeFilePath } from '$lib/workspace/workspaceStore';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import type { EditSession } from '$lib/collab/editSession';
import type { TreeEntry } from '$lib/workspace/fileSystem';

let listing: TreeEntry[] = [];
const provider = {
	caps: {
		manageTree: true,
		compile: false,
		git: false,
		format: false,
		search: false,
		terminal: false,
		share: false,
		comments: true,
		agent: false,
		project: true
	},
	scanTree: async () => listing,
	scanTexFiles: async () => [],
	owns: () => true
} as unknown as WorkspaceProvider;
const guest = { isGuest: true, syncTree: async () => {} } as unknown as EditSession;
const file = (path: string): TreeEntry => ({ name: path, path, type: 'file' });

let release: (() => void) | null = null;
afterEach(() => {
	release?.();
	workspaceRoot.current = null;
	activeFilePath.current = null;
	fileTree.current = [];
});

it("closes the guest's open file once the host's folder no longer has it", async () => {
	release = fileService.use(provider);
	workspaceRoot.current = 'session';
	const gone: string[] = [];
	const deps = { provider, session: guest, isEditingTree: () => false, detachGone: (p: string) => gone.push(p) };

	listing = [file('main.tex'), file('paper.typ')];
	await refreshTree(deps);
	// a file the guest just made reaches the folder after it opens: that is no deletion
	activeFilePath.current = 'new.tex';
	await refreshTree(deps);
	expect(gone).toEqual([]);

	activeFilePath.current = 'paper.typ';
	listing = [file('main.tex'), file('paper2.typ')];
	await refreshTree(deps);
	expect(gone).toEqual(['paper.typ']);
});
