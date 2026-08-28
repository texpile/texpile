// the scan feeds a capped candidate list, so its order decides which files survive the cap
import { describe, it, expect } from 'vitest';
import { byScanOrder } from '../../../../../../electron/src/fs/scanOrder';

const order = (...rels: string[]) =>
	rels
		.map((relPath) => ({ relPath }))
		.sort(byScanOrder)
		.map((f) => f.relPath);

describe('scan order', () => {
	it('orders by depth before name, at every level', () => {
		expect(order('b/c/deep.tex', 'aaa/mid.tex', 'zzz.tex')).toEqual(['zzz.tex', 'aaa/mid.tex', 'b/c/deep.tex']);
	});

	// splitting on '/' alone makes every windows path depth 1, silently
	it('counts a windows separator as depth too', () => {
		expect(order('a\\b\\deep.tex', 'top.tex')).toEqual(['top.tex', 'a\\b\\deep.tex']);
	});
});
