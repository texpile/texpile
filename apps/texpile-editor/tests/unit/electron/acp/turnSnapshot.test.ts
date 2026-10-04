import { it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { changesBetween, takeSnapshot } from '../../../../../../electron/src/ai/acp/turnSnapshot';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'texpile snapshot '));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

it('reads a file the turn grew past the size it reads as changed, not as deleted', async () => {
	fs.writeFileSync(path.join(root, 'refs.bib'), '@misc{a}\n');
	fs.writeFileSync(path.join(root, 'huge.tex'), 'x'.repeat(2 * 1024 * 1024));
	const before = await takeSnapshot(root);
	fs.appendFileSync(path.join(root, 'refs.bib'), 'y'.repeat(2 * 1024 * 1024));
	fs.appendFileSync(path.join(root, 'huge.tex'), 'more');
	// huge.tex was too large to keep before, so the turn has no text of it to go back to
	expect(changesBetween(before, await takeSnapshot(root, before))).toEqual([{ path: 'refs.bib', kind: 'modified', before: '@misc{a}\n' }]);
});

it('keeps no text to go back to for a file that is not UTF-8, rather than its accents turned into U+FFFD', async () => {
	const dir = fs.mkdtempSync(path.join(root, 'latin1 '));
	fs.writeFileSync(path.join(dir, 'chapter.tex'), Buffer.from('Résumé de la thèse.\n', 'latin1'));
	const before = await takeSnapshot(dir);
	fs.writeFileSync(path.join(dir, 'chapter.tex'), 'Résumé réécrit.\n');
	expect(changesBetween(before, await takeSnapshot(dir, before))).toEqual([]);
});
