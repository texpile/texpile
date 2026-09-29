// A copy's name is four random characters, as VS Code's. On macOS's and Windows's disks "abcd" and
// "ABCD" are one file, so a new copy that drew the other's name, in either case, was written over it:
// the older text gone, and the new entry missing from the list. A name already taken is drawn again.
import { it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const draws: number[][] = [];
vi.mock('node:crypto', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:crypto')>();
	return {
		...actual,
		randomBytes: (size: number) => {
			const next = draws.shift();
			return next ? Buffer.from(next) : actual.randomBytes(size);
		}
	};
});

const { LocalHistory } = await import('../../../../../../electron/src/localHistory');

const homes: string[] = [];
afterEach(() => {
	for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true });
});

it('draws again rather than take a name another copy has in any case', async () => {
	const home = mkdtempSync(join(tmpdir(), 'texpile-history-ids-'));
	homes.push(home);
	const h = new LocalHistory(home, { maxEntries: 50, maxFileSize: 1024, mergeWindowMs: 10_000 });
	const file = join(tmpdir(), 'project', 'intro.tex');
	// the first copy is "abcd.tex" (then its listing's two writes); the second draws "ABCD.tex" first
	draws.push([0, 1, 2, 3], [9, 9, 9, 9], [8, 8, 8, 8], [26, 27, 28, 29]);
	await h.add(file, 'Monday draft', undefined, undefined, 1_000);
	await h.add(file, 'Tuesday draft', undefined, undefined, 100_000);

	const entries = await h.list(file);
	expect(entries[0].id).toBe('abcd.tex');
	expect(entries[1].id.toLowerCase()).not.toBe('abcd.tex');
	expect(await h.read(file, entries[0].id)).toBe('Monday draft');
	expect(await h.read(file, entries[1].id)).toBe('Tuesday draft');
});
