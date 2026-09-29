// Save a version and sync, when what is in the way is new build output: a main.bbl a co-author saved
// for arXiv, and one a build made here. New build output is left out of such a save, so nothing
// was saved and the button did nothing; the file git named goes in.
import { it, expect, vi } from 'vitest';

const gitChanges = { current: [{ path: '/p/main.bbl', x: '?', y: '?' }] as { path: string; x: string; y: string; files?: number }[] };
const promptAsk = vi.fn(async (_o: unknown) => 'save');
vi.mock('$lib/workspace/scm/gitStore', () => ({ gitChanges, refreshGitStatus: vi.fn(async () => ({})) }));
vi.mock('$lib/workspace/workspaceStore', () => ({ workspaceRoot: { current: '/p' } }));
vi.mock('$lib/modals/confirm.svelte', () => ({ promptAsk }));

const { saveChangesFirst } = await import('$lib/workspace/scm/actions/scmSaveFirst');

const ask = { title: 't', message: 'syncing would overwrite changes to main.bbl', confirm: 'Save a version and sync', version: 'v' };

it('saves the new build output git named as in the way', async () => {
	const commit = vi.fn(async (_message: string, _paths: string[]) => true);
	expect(await saveChangesFirst({ root: '/p', commit, setBusy: () => {} }, { ...ask, blocking: ['/p/main.bbl'] })).toBe(true);
	expect(commit.mock.calls[0][1]).toEqual(['/p/main.bbl']);
});

it('still leaves out build output nothing named', async () => {
	const commit = vi.fn(async () => true);
	expect(await saveChangesFirst({ root: '/p', commit, setBusy: () => {} }, ask)).toBe(false);
	expect(commit).not.toHaveBeenCalled();
});
