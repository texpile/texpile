import { describe, expect, it } from 'vitest';
import { attachImageFiles, type ImageUse } from '../../../../../../electron/src/draft/draftImages';

// The decision under test: which FILE an image box shows. The engine numbers images per
// distinct file and the log names them in first-use order, so the index settles it -- where
// the requested size cannot, because two different figures are routinely included at the
// same size.
const uses = (...files: string[]): ImageUse[] => files.map((file) => ({ file, w: 100, h: 60, used: false }));
const rec = (over: Record<string, unknown>) => JSON.stringify({ t: 'image', x: 0, y: 0, w: 100, h: 60, d: 0, ...over });
const fileOf = (line: string) => JSON.parse(line).file;

describe('attachImageFiles', () => {
	it('names two same-sized figures apart by index', () => {
		const lines = [rec({ ix: 2 }), rec({ ix: 1 })];
		attachImageFiles(lines, uses('one.pdf', 'two.pdf'), '/proj');
		// deliberately out of page order: the index decides, not the order encountered
		expect(fileOf(lines[0])).toBe('/proj/two.pdf');
		expect(fileOf(lines[1])).toBe('/proj/one.pdf');
	});

	it('gives the same file to both inclusions when the engine reused its index', () => {
		const lines = [rec({ ix: 1 }), rec({ ix: 1, w: 60 })];
		attachImageFiles(lines, uses('one.pdf', 'two.pdf', 'one.pdf'), '/proj');
		expect(fileOf(lines[0])).toBe('/proj/one.pdf');
		expect(fileOf(lines[1])).toBe('/proj/one.pdf');
	});

	it('falls back to the size join for records with no index', () => {
		const lines = [rec({})];
		attachImageFiles(lines, uses('one.pdf'), '/proj');
		expect(fileOf(lines[0])).toBe('/proj/one.pdf');
	});

	it('leaves a record alone when the index names no known file', () => {
		const lines = [rec({ ix: 9 })];
		attachImageFiles(lines, uses('one.pdf'), '/proj');
		// the size join still answers here; what must not happen is inventing a file for 9
		expect(fileOf(lines[0])).toBe('/proj/one.pdf');
	});
});
