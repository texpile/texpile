// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { WorkspaceFiles } from '../../../../src/views/workspace/workspaceFiles.svelte';
import { workspaceRoot, fileTree } from '../../../../src/lib/workspace/workspaceStore';
import type { WorkspaceProvider } from '../../../../src/lib/workspace/workspaceProvider';
import type { TreeEntry } from '../../../../src/lib/workspace/fileSystem';

let stop: (() => void) | null = null;
afterEach(() => {
	stop?.();
	stop = null;
	workspaceRoot.current = null;
	fileTree.current = [];
});

const shared: TreeEntry[] = [{ name: 'main.tex', path: 'main.tex', type: 'file' }];
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
	scanTree: async () => shared,
	scanTexFiles: async () => [{ name: 'main.tex', path: 'main.tex', relPath: 'main.tex' }],
	owns: (path: string) => !/^([\\/]|[A-Za-z]:)/.test(path)
} as unknown as WorkspaceProvider;

it("a guest's first tree comes from the session, not the disk", async () => {
	workspaceRoot.current = 'session';
	stop = $effect.root(() => {
		new WorkspaceFiles({
			provider,
			session: () => ({ syncTree: async () => {} }) as never,
			layout: () => ({ pdfPaneOpen: false }) as never
		} as never);
	});
	flushSync();
	await new Promise((r) => setTimeout(r, 20));
	expect(fileTree.current).toEqual(shared);
});
