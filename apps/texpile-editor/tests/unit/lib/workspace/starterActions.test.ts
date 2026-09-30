// @vitest-environment jsdom
// Filling an empty folder can take seconds (a clone, a Typst Universe download); the folder open
// when it lands may not be the one it was started in.
import { expect, it, vi } from 'vitest';

let land: (main: string | null) => void = () => undefined;
vi.mock('$lib/workspace/starters', async (original) => ({
	...(await original<typeof import('$lib/workspace/starters')>()),
	applyImportedFiles: () => new Promise<string | null>((resolve) => (land = resolve))
}));

const { StarterActions } = await import('$lib/workspace/starterActions.svelte');
const { workspaceRoot, activeFilePath, mainFile } = await import('$lib/workspace/workspaceStore');

it('leaves the folder open now alone when the one it started in was switched away from', async () => {
	const loadRefs = vi.fn();
	const actions = new StarterActions({ loadRefs, refreshTree: async () => undefined, createEntry: async () => undefined });
	workspaceRoot.current = '/old';
	const done = actions.importFiles([{ name: 'main.tex', content: '\\begin{document}\\end{document}' }]);
	workspaceRoot.current = '/new';
	land('/old/main.tex');
	await done;
	expect(loadRefs).not.toHaveBeenCalled();
	expect(activeFilePath.current).toBeNull();
	expect(mainFile.current).toBeNull();
	expect(actions.applying).toBe(false);
});
