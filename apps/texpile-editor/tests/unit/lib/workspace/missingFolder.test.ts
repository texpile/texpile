// @vitest-environment jsdom
//
// A recents entry for a folder that was moved or deleted (#39). Opening one did nothing from the
// start screen's native menu and swapped in an empty workspace from File > Open Recent, with no
// word either way. Every path now stops before the folder becomes this window's, and says so.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const promptAsk = vi.fn();
vi.mock('$lib/modals/confirm.svelte', () => ({ promptAsk: (...a: unknown[]) => promptAsk(...a) }));

const disk = new Set<string>();
const claimWorkspace = vi.fn(async (_root: string) => ({ ok: true }));
const releaseWorkspace = vi.fn();
vi.mock('$lib/workspace/fileSystem', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/workspace/fileSystem')>()),
	statFile: async (p: string) => ({ exists: disk.has(p), mtimeMs: 0, size: 0 }),
	claimWorkspace: (root: string) => claimWorkspace(root),
	releaseWorkspace: () => releaseWorkspace()
}));

import { warnMissingFolder } from '$lib/workspace/missingFolder';
import { FolderLifecycle, type FolderLifecycleDeps } from '$lib/workspace/folderLifecycle';
import { openFolderInWindow } from '$lib/workspace/openWorkspace';
import { fileMode } from '$lib/workspace/fileMode.svelte';
import { recentFolders, workspaceRoot } from '$lib/workspace/workspaceStore';
import { updateUserData } from '$lib/storage/userData';

const GONE = '/papers/thesis';

beforeEach(() => {
	promptAsk.mockReset();
	claimWorkspace.mockClear();
	releaseWorkspace.mockClear();
	disk.clear();
	updateUserData({ recentFolders: ['/papers/draft', GONE] });
	workspaceRoot.current = null;
	fileMode.current = false;
});

describe('warnMissingFolder', () => {
	it('offers to drop a listed folder, and drops it on Remove', async () => {
		promptAsk.mockResolvedValue('remove');
		await warnMissingFolder(GONE);
		const ask = promptAsk.mock.calls[0][0];
		expect(ask.detail).toBe(GONE); // the full path, since the name alone may not say which
		expect(ask.buttons.map((b: { id: string }) => b.id)).toEqual(['remove', 'keep']);
		expect(recentFolders.current).toEqual(['/papers/draft']);
	});

	it('keeps the entry when the user keeps it or dismisses: the drive may just be unplugged', async () => {
		for (const choice of ['keep', null]) {
			promptAsk.mockResolvedValue(choice);
			await warnMissingFolder(GONE);
			expect(recentFolders.current).toEqual(['/papers/draft', GONE]);
		}
	});

	it('has nothing to offer for a path that is not in the list', async () => {
		promptAsk.mockResolvedValue('keep');
		await warnMissingFolder('/elsewhere');
		expect(promptAsk.mock.calls[0][0].buttons.map((b: { id: string }) => b.id)).toEqual(['keep']);
	});
});

describe('File > Open Recent inside a workspace', () => {
	it('stops before claiming or swapping the workspace, and warns', async () => {
		promptAsk.mockResolvedValue('keep');
		workspaceRoot.current = '/papers/draft';
		// every dep throws: a missing folder must not reach any of them
		const deps = new Proxy({} as FolderLifecycleDeps, {
			get: (_t, key) => () => {
				throw new Error(`reached ${String(key)}`);
			}
		});
		await new FolderLifecycle(deps).open(GONE);
		expect(claimWorkspace).not.toHaveBeenCalled();
		expect(workspaceRoot.current).toBe('/papers/draft');
		expect(promptAsk).toHaveBeenCalledOnce();
	});
});

describe('opening from the start screen', () => {
	it('reports missing and hands back the claim it took', async () => {
		const outcome = await openFolderInWindow(GONE);
		expect(outcome).toBe('missing');
		expect(releaseWorkspace).toHaveBeenCalledOnce();
		expect(workspaceRoot.current).toBeNull();
		expect(recentFolders.current).toEqual(['/papers/draft', GONE]); // not bumped to the front
	});
});
