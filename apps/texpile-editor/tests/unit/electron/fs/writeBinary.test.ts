import { describe, expect, it } from 'vitest';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeBinary } from '../../../../../../electron/src/fs/fsService';

describe('writeBinary', () => {
	it('replaces the file whole and leaves nothing beside it', async () => {
		const root = await mkdtemp(join(tmpdir(), 'write-binary-'));
		const file = join(root, 'a.png');
		await writeFile(file, 'old');
		await writeBinary(file, new TextEncoder().encode('new'));
		expect(await readFile(file, 'utf8')).toBe('new');
		expect(await readdir(root)).toEqual(['a.png']);
	});

	it('keeps the old file when the new one cannot be put in its place', async () => {
		const root = await mkdtemp(join(tmpdir(), 'write-binary-'));
		await expect(writeBinary(root, new TextEncoder().encode('new'))).rejects.toThrow();
		expect(await readdir(root)).toEqual([]);
	});
});
