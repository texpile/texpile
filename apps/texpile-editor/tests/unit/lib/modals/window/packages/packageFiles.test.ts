import { afterEach, describe, expect, it, vi } from 'vitest';
import { GUEST_ROOT } from '$lib/collab/sessionProvider';
import type { SnippetFileList } from '$lib/editor/snippets/file/snippetFiles';

const { trashEntry, confirmAsk } = vi.hoisted(() => ({ trashEntry: vi.fn(), confirmAsk: vi.fn(async () => true) }));
vi.mock('$lib/workspace/fileSystem', async (original) => ({ ...(await original<object>()), trashEntry }));
vi.mock('$lib/modals/confirm.svelte', () => ({ confirmAsk }));

const { packageFileRows } = await import('$lib/modals/window/packages/packageFileRows');
const { deletePackageFile } = await import('$lib/modals/window/packages/packageFileDelete');

const files: SnippetFileList = {
	global: '/data/snippets.json',
	globalPackages: '/data/packages',
	packages: { project: ['review'], global: ['zzz', 'algo'] }
};

afterEach(() => vi.clearAllMocks());

describe('the package file lists', () => {
	it('read the folder layer and the global layer apart, with what went wrong in each file', () => {
		const problems = [{ layer: 'global' as const, name: '', reason: 'Not JSON', file: 'packages/algo.json', whole: true }];
		const global = packageFileRows('global', files, '/work', problems);
		expect(global.map((r) => r.name)).toEqual(['algo', 'zzz']);
		expect(global[0].summary).toContain('Not JSON');
		expect(global[1].summary).toBe('');
		expect(packageFileRows('project', files, '/work', []).map((r) => r.path)).toEqual(['/work/.texpile/packages/review.json']);
	});
});

describe('deleting a package file as a guest', () => {
	it('leaves the host folder alone', async () => {
		const [row] = packageFileRows('project', files, GUEST_ROOT, []);
		await deletePackageFile(row, GUEST_ROOT);
		expect(confirmAsk).not.toHaveBeenCalled();
		expect(trashEntry).not.toHaveBeenCalled();
	});

	it('is allowed for the global files', async () => {
		trashEntry.mockResolvedValue({ backup: null, recycled: true });
		const [row] = packageFileRows('global', files, GUEST_ROOT, []);
		await deletePackageFile(row, GUEST_ROOT);
		expect(trashEntry).toHaveBeenCalledOnce();
	});
});
