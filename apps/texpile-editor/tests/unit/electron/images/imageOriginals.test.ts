import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { keepOriginal, moveOriginals, originalAt, restoreOriginal } from '../../../../../../electron/src/images/imageOriginals';

describe('imageOriginals', () => {
	it('follows a renamed folder, so Restore original still finds the copy', async () => {
		const root = await mkdtemp(join(tmpdir(), 'originals-'));
		const home = join(root, 'ImageOriginals');
		await mkdir(join(root, 'figs'));
		await writeFile(join(root, 'figs', 'loss.png'), 'before');
		await keepOriginal(home, join(root, 'figs', 'loss.png'));
		await writeFile(join(root, 'figs', 'loss.png'), 'edited');
		await rename(join(root, 'figs'), join(root, 'plots'));
		await moveOriginals(home, join(root, 'figs'), join(root, 'plots'));
		expect(await originalAt(home, join(root, 'figs', 'loss.png'))).toBeNull();
		await rename(join(root, 'plots', 'loss.png'), join(root, 'plots', 'curve.png'));
		await moveOriginals(home, join(root, 'plots', 'loss.png'), join(root, 'plots', 'curve.png'));
		await restoreOriginal(home, join(root, 'plots', 'curve.png'));
		expect(await readFile(join(root, 'plots', 'curve.png'), 'utf8')).toBe('before');
	});
});
