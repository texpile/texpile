// leaving a folder asks about edits held back by a change on disk in a file that is not open, which nothing else shows
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promptAsk } from '$lib/modals/confirm.svelte';
import { UnsavedGuard } from '$lib/workspace/unsavedGuard.svelte';
import { memoryFs, memoryStamps, openMemoryFolder } from './memoryFolder';

vi.mock('$lib/modals/confirm.svelte', () => ({ promptAsk: vi.fn() }));

async function strandedFolder() {
	const disk = { '/w/main.tex': 'main', '/w/ch.tex': 'base' };
	const { hooks } = memoryStamps(disk);
	const f = await openMemoryFolder('/w', memoryFs(disk), { open: ['/w/main.tex', '/w/ch.tex'], loaded: () => '/w/main.tex', hooks });
	await f.buffers.flushAll();
	for (const p of Object.keys(disk)) await hooks.recordStamp!(p);
	f.type('/w/ch.tex', 'mine');
	disk['/w/ch.tex'] = 'theirs';
	const guard = new UnsavedGuard({
		writer: f.writer,
		getLoadedPath: () => '/w/main.tex',
		autosaveActive: () => true,
		takePendingTabClose: () => null,
		clearPendingTabClose: () => {}
	});
	return { ...f, disk, guard };
}

describe('UnsavedGuard and files that are not open', () => {
	beforeEach(() => vi.mocked(promptAsk).mockReset());

	it('asks before leaving, and Discard puts the file back so the change on disk stands', async () => {
		vi.mocked(promptAsk).mockResolvedValue('discard');
		const { guard, textOf, writer, disk } = await strandedFolder();
		expect(await guard.confirmLeave()).toBe(true);
		expect(vi.mocked(promptAsk).mock.calls[0][0].message).toContain('ch.tex');
		expect([textOf('/w/ch.tex'), writer.stranded(), disk['/w/ch.tex']]).toEqual(['base', [], 'theirs']);
	});

	it('Cancel stays, with the edit kept', async () => {
		vi.mocked(promptAsk).mockResolvedValue('cancel');
		const { guard, textOf } = await strandedFolder();
		expect([await guard.confirmLeave(), textOf('/w/ch.tex')]).toEqual([false, 'mine']);
	});
});
