import { beforeEach, describe, expect, it, vi } from 'vitest';

const disk = { mtimeMs: 1000, size: 5, text: 'hello' as string | null };
vi.mock('$lib/workspace/fileSystem', () => ({
	statFile: async () => ({ exists: true, mtimeMs: disk.mtimeMs, size: disk.size }),
	readTextFile: async () => {
		if (disk.text === null) throw new Error('EBUSY');
		return disk.text;
	}
}));
const { fileModifiedSince, recordFileStamp, retargetFileStamp } = await import('$lib/files/service/fileStamp');

beforeEach(async () => {
	Object.assign(disk, { mtimeMs: 1000, size: 5, text: 'hello' });
	await recordFileStamp('/p/main.tex');
});

describe('fileModifiedSince', () => {
	it('catches a same-size rewrite that the vscode rule lets through', async () => {
		Object.assign(disk, { mtimeMs: 2000, text: 'jello' });
		expect(await fileModifiedSince('/p/main.tex')).toBe(true);
	});

	it('lets a write through when the disk already holds its bytes, and not when they cannot be read', async () => {
		Object.assign(disk, { mtimeMs: 2000, text: 'jello' });
		expect(await fileModifiedSince('/p/main.tex', 'jello')).toBe(false);
		disk.text = null;
		expect(await fileModifiedSince('/p/main.tex', 'jello')).toBe(true);
	});
});

describe('retargetFileStamp', () => {
	it('carries the stamps of the files inside a renamed folder', async () => {
		await recordFileStamp('/p/chapters/intro.tex');
		retargetFileStamp('/p/chapters', '/p/parts');
		Object.assign(disk, { mtimeMs: 2000, text: 'jello' });
		expect([await fileModifiedSince('/p/parts/intro.tex'), await fileModifiedSince('/p/chapters/intro.tex')]).toEqual([true, false]);
	});
});
