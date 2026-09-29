// Unsaved work in the way of a Sync or a branch switch becomes a version, then the operation runs
// again. What goes in is what the panel has ticked, and what git named as in the way.
import { it, expect, vi, beforeEach } from 'vitest';

const promptAsk = vi.fn(async () => 'save' as string | null);
const gitChanges = { current: [] as { path: string; x: string; y: string; files?: number }[] };
vi.mock('$lib/modals/confirm.svelte', () => ({ promptAsk }));
// the refresh brings in what the caller just wrote: here, the file that was not listed before
const refreshGitStatus = vi.fn(async () => {
	gitChanges.current = [...gitChanges.current, { path: '/p/flushed.tex', x: ' ', y: 'M' }];
});
vi.mock('$lib/workspace/scm/gitStore', () => ({ gitChanges, refreshGitStatus }));
const workspaceRoot = { current: '/p' };
vi.mock('$lib/workspace/workspaceStore', () => ({ workspaceRoot }));

const { saveChangesFirst } = await import('$lib/workspace/scm/actions/scmSaveFirst');
const { scmDraftFor } = await import('$lib/workspace/scm/actions/scmDraft.svelte');
const ASK = { title: 't', message: 'm', confirm: 'Save a version and sync', version: 'Unsaved work, saved before syncing' };

beforeEach(() => {
	promptAsk.mockClear();
	workspaceRoot.current = '/p';
	scmDraftFor('/p').excluded = [];
});

it('saves what changed, not new build output or a whole new folder, and hands busy back', async () => {
	gitChanges.current = [
		{ path: '/p/main.tex', x: ' ', y: 'M' },
		{ path: '/p/notes.md', x: '?', y: '?' },
		{ path: '/p/main.aux', x: '?', y: '?' },
		{ path: '/p/venv', x: '?', y: '?', files: 400 }
	];
	const busy: boolean[] = [];
	const commit = vi.fn(async () => true);
	expect(await saveChangesFirst({ root: '/p', commit, setBusy: (on) => busy.push(on) }, ASK)).toBe(true);
	// read again, as the caller's own read while it is still busy, so the edit just flushed is in the version
	expect(refreshGitStatus).toHaveBeenCalledWith('/p', true);
	expect(commit).toHaveBeenCalledWith('Unsaved work, saved before syncing', ['/p/main.tex', '/p/notes.md', '/p/flushed.tex']);
	expect(busy).toEqual([false, true]);
});

it('does nothing when the author says no', async () => {
	promptAsk.mockResolvedValueOnce('cancel');
	const commit = vi.fn(async () => true);
	expect(await saveChangesFirst({ root: '/p', commit, setBusy: () => {} }, ASK)).toBe(false);
	expect(commit).not.toHaveBeenCalled();
});

// Commit & Sync committed every change, the files the author had unstaged to keep on this computer
// among them, and Sync then pushed them
it('leaves out what the author unstaged, unless git named it as in the way', async () => {
	gitChanges.current = [
		{ path: '/p/main.tex', x: ' ', y: 'M' },
		{ path: '/p/private.tex', x: '?', y: '?' },
		{ path: '/p/refs.bib', x: ' ', y: 'M' },
		{ path: '/p/main.pdf', x: '?', y: '?' }
	];
	scmDraftFor('/p').excluded = ['/p/private.tex', '/p/refs.bib'];
	scmDraftFor('/p').artifactsOptedIn = ['/p/main.pdf'];
	const commit = vi.fn(async (_message: string, _paths: string[]) => true);
	expect(await saveChangesFirst({ root: '/p', commit, setBusy: () => {} }, { ...ASK, blocking: ['/p/refs.bib'] })).toBe(true);
	expect(commit.mock.calls[0][1]).toEqual(['/p/main.tex', '/p/refs.bib', '/p/main.pdf', '/p/flushed.tex']);
});

// the list is the open folder's: committing it in the folder the Sync began in mixed the two
it('commits nothing once another folder is open', async () => {
	gitChanges.current = [{ path: '/q/main.tex', x: ' ', y: 'M' }];
	promptAsk.mockImplementationOnce(async () => {
		workspaceRoot.current = '/q';
		return 'save';
	});
	const commit = vi.fn(async () => true);
	expect(await saveChangesFirst({ root: '/p', commit, setBusy: () => {} }, ASK)).toBe(false);
	expect(commit).not.toHaveBeenCalled();
});
